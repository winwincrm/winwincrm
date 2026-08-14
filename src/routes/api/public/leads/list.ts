// Public read endpoint for leads, scoped to the office that owns the API key.
// Auth: Bearer <office_api_keys.key> (sha256 hex matched against key_hash).
// Query params:
//   limit       (1..200, default 50)
//   offset      (>=0, default 0)
//   status      (lead_status enum, optional)
//   kind        ('crm' | 'cold', optional — matches leads.lead_kind)
//   since       (ISO timestamp, optional — created_at >= since)
//   updated_since (ISO timestamp, optional — updated_at >= updated_since)
//   q           (search in full_name / phone / email, optional)
//   order       ('created_at' | 'updated_at', default 'created_at') DESC
import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

const LEAD_COLS =
  "id, office_id, assigned_user_id, full_name, first_name, last_name, phone, email, " +
  "source, platform, status, lead_kind, amount, percentage, timeframe, " +
  "madara_lead_id, external_lead_id, last_contacted_at, created_at, updated_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

function clampInt(v: string | null, def: number, min: number, max: number): number {
  const n = v == null ? def : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

function isIsoTs(v: string): boolean {
  return !Number.isNaN(Date.parse(v));
}

export const Route = createFileRoute("/api/public/leads/list")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = request.headers.get("cf-connecting-ip")
          ?? request.headers.get("x-real-ip")
          ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
          ?? null;

        // 1. Auth
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
        if (!token) {
          return Response.json({ error: "missing_api_key" }, { status: 401 });
        }

        const keyHash = createHash("sha256").update(token).digest("hex");
        const { data: keyRow } = await admin
          .from("office_api_keys")
          .select("office_id, status")
          .eq("key_hash", keyHash)
          .maybeSingle();

        if (!keyRow || keyRow.status !== "active" || !keyRow.office_id) {
          await admin.from("api_logs").insert({
            ip_address: ip, status: "failed", payload: null, error_message: "invalid_api_key",
          });
          return Response.json({ error: "invalid_api_key" }, { status: 401 });
        }

        // 2. Parse query
        const url = new URL(request.url);
        const limit = clampInt(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
        const offset = clampInt(url.searchParams.get("offset"), 0, 0, 1_000_000);
        const status = url.searchParams.get("status");
        const kind = url.searchParams.get("kind");
        const since = url.searchParams.get("since");
        const updatedSince = url.searchParams.get("updated_since");
        const q = url.searchParams.get("q");
        const order = url.searchParams.get("order") === "updated_at" ? "updated_at" : "created_at";

        if (kind && kind !== "crm" && kind !== "cold") {
          return Response.json({ error: "invalid_kind" }, { status: 400 });
        }
        if (since && !isIsoTs(since)) {
          return Response.json({ error: "invalid_since" }, { status: 400 });
        }
        if (updatedSince && !isIsoTs(updatedSince)) {
          return Response.json({ error: "invalid_updated_since" }, { status: 400 });
        }

        // 3. Query — RLS bypassed by service role, so we MUST scope by office.
        let query = admin
          .from("leads")
          .select(LEAD_COLS, { count: "exact" })
          .eq("office_id", keyRow.office_id)
          .order(order, { ascending: false })
          .range(offset, offset + limit - 1);

        if (status) query = query.eq("status", status);
        if (kind) query = query.eq("lead_kind", kind);
        if (since) query = query.gte("created_at", since);
        if (updatedSince) query = query.gte("updated_at", updatedSince);
        if (q && q.trim()) {
          const safe = q.trim().replace(/[%,()]/g, " ");
          query = query.or(
            `full_name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`,
          );
        }

        const { data, error, count } = await query;

        if (error) {
          console.error("[leads/list] query_failed", error.message);
          await admin.from("api_logs").insert({
            ip_address: ip, status: "failed", office_id: keyRow.office_id,
            payload: { query: url.search }, error_message: "query_failed",
          });
          return Response.json({ error: "query_failed" }, { status: 500 });
        }

        await admin.from("api_logs").insert({
          ip_address: ip, status: "success", office_id: keyRow.office_id,
          payload: { op: "list", query: url.search, returned: data?.length ?? 0 },
        });

        return Response.json({
          ok: true,
          office_id: keyRow.office_id,
          count: count ?? null,
          limit,
          offset,
          leads: data ?? [],
        });
      },
    },
  },
});
