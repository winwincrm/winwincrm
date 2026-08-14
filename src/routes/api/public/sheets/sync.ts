import { createFileRoute } from "@tanstack/react-router";

// Background worker endpoint: runs every saved Google Sheet sync that is due.
// Called by pg_cron (every minute) with the shared secret header.
export const Route = createFileRoute("/api/public/sheets/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => run(request),
      GET: async ({ request }) => run(request),
    },
  },
});

async function run(request: Request) {
  const url = new URL(request.url);
  const provided = request.headers.get("x-sync-secret") ?? url.searchParams.get("secret") ?? "";
  if (!provided) return new Response("Unauthorized", { status: 401 });

  let allowed = provided === process.env["SHEET_SYNC_SECRET"];
  if (!allowed) {
    // The scheduler stores its token in the database (the env secret's value is
    // write-only), so accept that one too.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabaseAdmin as any)
      .from("app_secrets").select("value").eq("key", "sheet_sync_cron_token").maybeSingle();
    allowed = !!data?.value && data.value === provided;
  }
  if (!allowed) return new Response("Unauthorized", { status: 401 });


  try {
    const { runDueSheetSyncs } = await import("@/lib/sheet-sync.server");
    const results = await runDueSheetSyncs();
    return Response.json({ ok: true, ran: results.length, results });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[sheets/sync]", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
