// Public Madara intake endpoint. Verifies bearer API key against
// office_api_keys (sha256 hex) BEFORE consuming the request body, then
// inserts the lead and logs the request. HMAC, dedup, and outbound
// webhooks are intentionally out of scope.
import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { findLiveDuplicates, computeLeadKind } from "@/lib/live-duplicate-check.server";

const MAX_BODY_BYTES = 64 * 1024;

const admin = supabaseAdmin as unknown as {
  from: (t: string) => {
    insert: (rows: unknown) => Promise<{ data: unknown; error: { message: string } | null }> & {
      select: (cols: string) => { single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> };
    };
    select: (cols: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { office_id: string; status: string } | null }> } };
  };
};

export const Route = createFileRoute("/api/public/leads/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = request.headers.get("cf-connecting-ip")
          ?? request.headers.get("x-real-ip")
          ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
          ?? null;

        // 1. Auth FIRST — before reading the body.
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
        if (!token) {
          return Response.json({ error: "missing_api_key" }, { status: 401 });
        }

        const keyHash = createHash("sha256").update(token).digest("hex");
        const { data: keyRow } = await admin
          .from("office_api_keys").select("office_id, status").eq("key_hash", keyHash).maybeSingle();

        if (!keyRow || keyRow.status !== "active") {
          // Log auth failures WITHOUT the payload to avoid log pollution / amplification.
          await admin.from("api_logs").insert({
            ip_address: ip, status: "failed", payload: null, error_message: "invalid_api_key",
          });
          return Response.json({ error: "invalid_api_key" }, { status: 401 });
        }

        // 2. Body — bounded size.
        const lengthHeader = Number(request.headers.get("content-length") ?? "0");
        if (lengthHeader > MAX_BODY_BYTES) {
          return Response.json({ error: "payload_too_large" }, { status: 413 });
        }

        let bodyText = "";
        let payload: Record<string, unknown> = {};
        try {
          bodyText = await request.text();
          if (bodyText.length > MAX_BODY_BYTES) {
            return Response.json({ error: "payload_too_large" }, { status: 413 });
          }
          payload = bodyText ? JSON.parse(bodyText) : {};
        } catch {
          await admin.from("api_logs").insert({
            ip_address: ip, status: "failed", office_id: keyRow.office_id,
            payload: null, error_message: "invalid_json",
          });
          return Response.json({ error: "invalid_json" }, { status: 400 });
        }

        const fullName = ((payload.full_name ?? `${payload.first_name ?? ""} ${payload.last_name ?? ""}`.trim()) as string) || "Unknown";
        const phone = (payload.phone as string | undefined) ?? null;
        const email = (payload.email as string | undefined) ?? null;

        const inHouse = payload.in_house === true || payload.in_house === "true";

        const insertRow = {
          office_id: keyRow.office_id,
          full_name: fullName,
          first_name: (payload.first_name as string | undefined) ?? null,
          last_name: (payload.last_name as string | undefined) ?? null,
          phone,
          email,
          source: ((payload.source ?? payload.platform) as string) ?? null,
          platform: (payload.platform as string | undefined) ?? null,
          amount: (payload.amount as number | string | undefined) ?? null,
          percentage: (payload.percentage as number | string | undefined) ?? null,
          timeframe: (payload.timeframe as string | undefined) ?? null,
          madara_lead_id: (payload.madara_lead_id as string | undefined) ?? null,
          external_lead_id: (payload.external_lead_id as string | undefined) ?? null,
          is_in_house: inHouse,
          origin_office_id: inHouse ? keyRow.office_id : null,
          payload,
        };

        // Same-office duplicate guard (email or phone)
        if (email || phone) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let dupQuery: any = (supabaseAdmin as any)
            .from("leads").select("id").eq("office_id", keyRow.office_id).limit(1);
          if (email && phone) {
            dupQuery = dupQuery.or(`email.eq.${email},phone.eq.${phone}`);
          } else if (email) {
            dupQuery = dupQuery.eq("email", email);
          } else if (phone) {
            dupQuery = dupQuery.eq("phone", phone);
          }
          const { data: existing } = await dupQuery.maybeSingle();
          if (existing?.id) {
            await admin.from("api_logs").insert({
              ip_address: ip, status: "failed", payload, office_id: keyRow.office_id,
              error_message: "duplicate",
            });
            return Response.json(
              { ok: false, reason: "duplicate", existing_lead_id: existing.id as string },
              { status: 200 },
            );
          }
        }

        // Cold-only system-wide block: if the incoming lead would be classified
        // as cold AND its phone/email matches an existing LIVE lead anywhere,
        // refuse it. Live ingests are unaffected.
        const incomingKind = computeLeadKind(
          fullName,
          (payload.first_name as string | undefined) ?? null,
          (payload.last_name as string | undefined) ?? null,
        );
        if (incomingKind === "cold" && (phone || email)) {
          const dupes = await findLiveDuplicates([{ phone, email }]);
          const match = dupes.get(0);
          if (match) {
            await admin.from("api_logs").insert({
              ip_address: ip, status: "failed", payload, office_id: keyRow.office_id,
              error_message: `duplicate_of_live_${match.matched_by}`,
            });
            return Response.json(
              { ok: false, reason: "duplicate_of_live", matched_by: match.matched_by, existing_live_lead_id: match.live_id },
              { status: 200 },
            );
          }
        }

        const { data: lead, error } = await admin.from("leads").insert(insertRow).select("id").single();

        if (error || !lead) {
          console.error("[ingest] insert_failed", error?.message);
          await admin.from("api_logs").insert({
            ip_address: ip, status: "failed", payload, office_id: keyRow.office_id,
            error_message: "insert_failed",
          });
          return Response.json({ error: "insert_failed" }, { status: 500 });
        }

        await admin.from("api_logs").insert({
          ip_address: ip, status: "success", payload, office_id: keyRow.office_id,
        });

        return Response.json({ ok: true, lead_id: lead.id }, { status: 201 });
      },
    },
  },
});
