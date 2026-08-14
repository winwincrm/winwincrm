// Public affiliate intake endpoint. Verifies bearer API key against
// affiliate_api_keys (sha256 hex), then inserts the lead into the
// global inbox (office_id = NULL, source = 'affiliate'). Logs every call.
import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";


const MAX_BODY_BYTES = 64 * 1024;

const BodySchema = z.object({
  first_name: z.string().max(255).optional(),
  last_name: z.string().max(255).optional(),
  full_name: z.string().max(255).optional(),
  email: z.string().max(320).optional(),
  phone: z.string().max(60).optional(),
  amount: z.union([z.number(), z.string()]).optional(),
  percentage: z.union([z.number(), z.string()]).optional(),
  timeframe: z.string().max(120).optional(),
  platform: z.string().max(120).optional(),
  external_lead_id: z.string().max(255).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const Route = createFileRoute("/api/public/affiliate/leads/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = request.headers.get("cf-connecting-ip")
          ?? request.headers.get("x-real-ip")
          ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
          ?? null;

        // 1. Auth FIRST — before reading body.
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
        if (!token) return Response.json({ error: "missing_api_key" }, { status: 401 });

        const keyHash = createHash("sha256").update(token).digest("hex");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const admin = supabaseAdmin as any;

        const { data: keyRow } = await admin
          .from("affiliate_api_keys")
          .select("id, affiliate_id, status, affiliates(id, name, status)")
          .eq("key_hash", keyHash)
          .maybeSingle();

        if (!keyRow || keyRow.status !== "active" || keyRow.affiliates?.status !== "active") {
          await admin.from("api_logs").insert({
            ip_address: ip, status: "failed", payload: null, error_message: "invalid_api_key",
          });
          return Response.json({ error: "invalid_api_key" }, { status: 401 });
        }

        const affiliateId: string = keyRow.affiliate_id;
        const affiliateName: string = keyRow.affiliates?.name ?? "Affiliate";

        // 2. Body.
        const lengthHeader = Number(request.headers.get("content-length") ?? "0");
        if (lengthHeader > MAX_BODY_BYTES) {
          return Response.json({ error: "payload_too_large" }, { status: 413 });
        }

        let bodyText = "";
        let raw: unknown = {};
        try {
          bodyText = await request.text();
          if (bodyText.length > MAX_BODY_BYTES) {
            return Response.json({ error: "payload_too_large" }, { status: 413 });
          }
          raw = bodyText ? JSON.parse(bodyText) : {};
        } catch {
          await admin.from("api_logs").insert({
            ip_address: ip, status: "failed", payload: null, error_message: "invalid_json",
          });
          return Response.json({ error: "invalid_json" }, { status: 400 });
        }

        const parsed = BodySchema.safeParse(raw);
        if (!parsed.success) {
          await admin.from("api_logs").insert({
            ip_address: ip, status: "failed", payload: raw as object,
            error_message: "validation_failed: " + parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; "),
          });
          return Response.json({ error: "validation_failed", issues: parsed.error.issues }, { status: 400 });
        }
        const body = parsed.data;

        const fullName = (body.full_name
          ?? `${body.first_name ?? ""} ${body.last_name ?? ""}`.trim()) || "Unknown";
        const phone = body.phone ?? null;
        const email = body.email ?? null;

        const toNum = (v: unknown): number | null => {
          if (v === undefined || v === null || v === "") return null;
          const n = Number(String(v).replace(",", "."));
          return Number.isFinite(n) ? n : null;
        };
        const percentage = toNum(body.percentage);
        const clampedPct = percentage === null ? null : Math.max(0, Math.min(100, percentage));

        // Idempotency on external_lead_id (per affiliate, in the inbox)
        if (body.external_lead_id) {
          const { data: existing } = await admin
            .from("leads")
            .select("id")
            .is("office_id", null)
            .eq("source", "affiliate")
            .eq("external_lead_id", body.external_lead_id)
            .contains("payload", { affiliate_id: affiliateId })
            .limit(1)
            .maybeSingle();
          if (existing?.id) {
            return Response.json(
              { ok: true, duplicate: true, lead_id: existing.id },
              { status: 200 },
            );
          }
        }

        // No duplicate blocking at ingest — affiliate leads always land in
        // the inbox. Duplicate warnings happen at the distribution step.


        const mergedPayload = {
          ...(body.payload ?? {}),
          ...(raw && typeof raw === "object" ? raw : {}),
          affiliate_id: affiliateId,
          affiliate_name: affiliateName,
        };

        const insertRow = {
          office_id: null,
          assigned_user_id: null,
          full_name: fullName,
          first_name: body.first_name ?? null,
          last_name: body.last_name ?? null,
          phone,
          email,
          source: "affiliate",
          platform: body.platform ?? null,
          amount: toNum(body.amount),
          percentage: clampedPct,
          timeframe: body.timeframe ?? null,
          external_lead_id: body.external_lead_id ?? null,
          status: "new" as const,
          payload: mergedPayload,
        };

        const { data: lead, error } = await admin
          .from("leads").insert(insertRow).select("id").single();
        if (error || !lead) {
          await admin.from("api_logs").insert({
            ip_address: ip, status: "failed", payload: raw as object,
            error_message: "insert_failed: " + (error?.message ?? "unknown"),
          });
          return Response.json({ error: "insert_failed" }, { status: 500 });
        }

        await admin.from("api_logs").insert({
          ip_address: ip, status: "success", payload: raw as object,
        });
        await admin.from("affiliate_api_keys")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", keyRow.id);

        return Response.json({ ok: true, lead_id: lead.id }, { status: 201 });
      },
    },
  },
});
