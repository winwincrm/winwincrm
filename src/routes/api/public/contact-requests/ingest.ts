// Public webhook endpoint for external contact / callback forms.
// Auth: shared secret passed either as `Authorization: Bearer <secret>`
// or as a `?token=<secret>` query param (so simple form integrations can use
// the URL directly). The secret lives in CONTACT_REQUESTS_WEBHOOK_SECRET.
//
// Default target office: KS (crlm.purpleskies.pro). Callers MAY override by
// sending `office: "ks" | "kla" | "bla"` or a raw `office_id` UUID.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MAX_BODY_BYTES = 32 * 1024;

const OFFICE_KS = "4cb70020-cabf-4ab6-bc06-58f55e7e0220";
const OFFICE_DB = "e960656f-7111-4258-86f7-f20569f4a0a1";
const OFFICE_BLACK = "a2d7b652-902d-4b5d-9665-54d83b528847";

const OFFICE_ALIAS: Record<string, string> = {
  ks: OFFICE_KS,
  crlm: OFFICE_KS,
  kla: OFFICE_DB,
  db: OFFICE_DB,
  bla: OFFICE_BLACK,
  black: OFFICE_BLACK,
};

const Schema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(3).max(50),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  preferred_time: z.string().trim().max(100).optional().or(z.literal("")),
  topic: z.string().trim().max(200).optional().or(z.literal("")),
  message: z.string().trim().max(5000).optional().or(z.literal("")),
  source: z.string().trim().max(200).optional(),
  office: z.string().trim().max(64).optional(),
  office_id: z.string().uuid().optional(),
});

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export const Route = createFileRoute("/api/public/contact-requests/ingest")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: corsHeaders() }),

      POST: async ({ request }) => {
        const secret = process.env.CONTACT_REQUESTS_WEBHOOK_SECRET;
        if (!secret) {
          return Response.json(
            { error: "server_misconfigured" },
            { status: 500, headers: corsHeaders() },
          );
        }

        // Token via header OR query string.
        const url = new URL(request.url);
        const auth = request.headers.get("authorization") ?? "";
        const headerToken = auth.toLowerCase().startsWith("bearer ")
          ? auth.slice(7).trim()
          : "";
        const queryToken = url.searchParams.get("token") ?? "";
        const provided = headerToken || queryToken;

        if (!provided || provided !== secret) {
          return Response.json(
            { error: "unauthorized" },
            { status: 401, headers: corsHeaders() },
          );
        }

        const lengthHeader = Number(request.headers.get("content-length") ?? "0");
        if (lengthHeader > MAX_BODY_BYTES) {
          return Response.json(
            { error: "payload_too_large" },
            { status: 413, headers: corsHeaders() },
          );
        }

        let raw: unknown;
        try {
          const text = await request.text();
          if (text.length > MAX_BODY_BYTES) {
            return Response.json(
              { error: "payload_too_large" },
              { status: 413, headers: corsHeaders() },
            );
          }
          raw = text ? JSON.parse(text) : {};
        } catch {
          return Response.json(
            { error: "invalid_json" },
            { status: 400, headers: corsHeaders() },
          );
        }

        const parsed = Schema.safeParse(raw);
        if (!parsed.success) {
          return Response.json(
            { error: "validation_failed", issues: parsed.error.issues },
            { status: 400, headers: corsHeaders() },
          );
        }
        const data = parsed.data;

        // Resolve office: explicit office_id → alias → default KS.
        let officeId = OFFICE_KS;
        if (data.office_id) officeId = data.office_id;
        else if (data.office) {
          const key = data.office.toLowerCase();
          if (OFFICE_ALIAS[key]) officeId = OFFICE_ALIAS[key];
        }

        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-real-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          null;
        const userAgent = request.headers.get("user-agent");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const admin = supabaseAdmin as any;
        const { data: inserted, error } = await admin
          .from("contact_requests")
          .insert({
            office_id: officeId,
            name: data.name,
            phone: data.phone,
            email: data.email || null,
            preferred_time: data.preferred_time || null,
            topic: data.topic || null,
            message: data.message || null,
            source: data.source || null,
            ip,
            user_agent: userAgent,
            raw: raw as Record<string, unknown>,
          })
          .select("id")
          .single();

        if (error || !inserted) {
          console.error("[contact-requests/ingest] insert_failed", error?.message);
          return Response.json(
            { error: "insert_failed" },
            { status: 500, headers: corsHeaders() },
          );
        }

        return Response.json(
          { ok: true, id: inserted.id as string },
          { status: 201, headers: corsHeaders() },
        );
      },
    },
  },
});
