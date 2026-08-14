import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

export type SheetSyncRow = {
  id: string;
  name: string;
  sheet_url: string;
  office_id: string | null;
  assigned_user_id: string | null;
  source: string | null;
  list_name: string | null;
  mapping: Record<string, string> | null;
  interval_seconds: number;
  enabled: boolean;
  update_existing: boolean;
  last_run_at: string | null;
  next_run_at: string;
  last_status: string | null;
  last_error: string | null;
  consecutive_failures: number;
  created_at: string;
};

const saveSchema = z.object({
  id: uuid.optional(),
  name: z.string().max(120).default(""),
  sheet_url: z.string().url().max(2000),
  office_id: uuid.nullable().default(null),
  assigned_user_id: uuid.nullable().default(null),
  source: z.string().max(120).nullable().default(null),
  list_name: z.string().max(120).nullable().default(null),
  mapping: z.record(z.string(), z.string()).default({}),
  interval_seconds: z.number().int().min(5).max(86400).default(60),
  update_existing: z.boolean().default(true),
  enabled: z.boolean().default(true),
});

export const listSheetSyncs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sheet_syncs" as never)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as SheetSyncRow[];
  });

export const saveSheetSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => saveSchema.parse(i))
  .handler(async ({ data, context }) => {
    const row = {
      name: data.name || "Google Sheet",
      sheet_url: data.sheet_url,
      office_id: data.office_id,
      assigned_user_id: data.assigned_user_id,
      source: data.source,
      list_name: data.list_name,
      mapping: data.mapping,
      interval_seconds: data.interval_seconds,
      update_existing: data.update_existing,
      enabled: data.enabled,
      next_run_at: new Date().toISOString(),
      last_error: null,
      consecutive_failures: 0,
      created_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    const query = data.id
      ? context.supabase.from("sheet_syncs" as never).update(row as never).eq("id", data.id).select("*").single()
      : context.supabase.from("sheet_syncs" as never).insert(row as never).select("*").single();
    const { data: saved, error } = await query;
    if (error) throw new Error(error.message);
    return saved as unknown as SheetSyncRow;
  });

export const setSheetSyncEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: uuid, enabled: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sheet_syncs" as never)
      .update({ enabled: data.enabled, next_run_at: new Date().toISOString(), consecutive_failures: 0 } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Removes the saved sheet link. By default the leads it imported stay in the
 * CRM untouched — we just drop the row-tracking rows that tie sheet rows to
 * those leads, then the sync itself. With `delete_leads: true` the leads that
 * are still linked to this sheet (and only those) are deleted too, using the
 * same permission checks as a normal lead deletion.
 */
export const deleteSheetSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: uuid, delete_leads: z.boolean().default(false) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: visible, error: visErr } = await context.supabase
      .from("sheet_syncs" as never).select("id").eq("id", data.id).maybeSingle();
    if (visErr) throw new Error(visErr.message);
    if (!visible) throw new Error("Sync not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;

    let deletedLeads = 0;
    if (data.delete_leads) {
      const { data: linked, error: linkErr } = await admin
        .from("sheet_sync_rows").select("lead_id").eq("sync_id", data.id).not("lead_id", "is", null);
      if (linkErr) throw new Error(linkErr.message);
      const ids = [...new Set(((linked ?? []) as Array<{ lead_id: string | null }>)
        .map((r) => r.lead_id).filter((v): v is string => !!v))];
      if (ids.length) {
        const { handleLeadDeletion } = await import("@/lib/lead-deletion.server");
        const res = await handleLeadDeletion(ids, context, { allowMissing: true });
        deletedLeads = res.deleted;
      }
    }

    // Unlink sheet rows from their leads — removing the link must never touch
    // leads that were not explicitly requested for deletion.
    await admin.from("sheet_sync_rows").delete().eq("sync_id", data.id);
    const { error } = await admin.from("sheet_syncs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, deletedLeads };
  });


/** Per-sync counters + full breakdown (source / office / agent / status) for the Google Sheets page. */
export const sheetSyncStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: visible, error: visErr } = await context.supabase
      .from("sheet_syncs" as never).select("*").eq("id", data.id).maybeSingle();
    if (visErr) throw new Error(visErr.message);
    if (!visible) throw new Error("Sync not found");
    const sync = visible as unknown as SheetSyncRow;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    const [rows, events] = await Promise.all([
      admin.from("sheet_sync_rows").select("lead_id", { count: "exact", head: false }).eq("sync_id", data.id),
      admin.from("sheet_sync_events").select("kind").eq("sync_id", data.id).limit(2000),
    ]);
    const tracked = (rows.data ?? []) as Array<{ lead_id: string | null }>;
    const kinds = (events.data ?? []) as Array<{ kind: string }>;
    const count = (k: string) => kinds.filter((e) => e.kind === k).length;

    const leadIds = tracked.map((r) => r.lead_id).filter(Boolean) as string[];
    type LeadRow = {
      id: string; source: string | null; platform: string | null; status: string | null;
      office_id: string | null; assigned_user_id: string | null;
    };
    let leads: LeadRow[] = [];
    for (let i = 0; i < leadIds.length; i += 500) {
      const chunk = leadIds.slice(i, i + 500);
      const { data: got } = await admin
        .from("leads").select("id, source, platform, status, office_id, assigned_user_id").in("id", chunk);
      leads = leads.concat((got ?? []) as LeadRow[]);
    }

    const officeIds = new Set<string>();
    const userIds = new Set<string>();
    for (const l of leads) {
      if (l.office_id) officeIds.add(l.office_id);
      if (l.assigned_user_id) userIds.add(l.assigned_user_id);
    }
    if (sync.office_id) officeIds.add(sync.office_id);
    if (sync.assigned_user_id) userIds.add(sync.assigned_user_id);

    const [officesRes, profilesRes] = await Promise.all([
      officeIds.size ? admin.from("offices").select("id, name").in("id", [...officeIds]) : Promise.resolve({ data: [] }),
      userIds.size ? admin.from("profiles").select("user_id, full_name, email").in("user_id", [...userIds]) : Promise.resolve({ data: [] }),
    ]);
    const officeName = new Map<string, string>(
      ((officesRes.data ?? []) as Array<{ id: string; name: string }>).map((o) => [o.id, o.name]),
    );
    const userName = new Map<string, string>(
      ((profilesRes.data ?? []) as Array<{ user_id: string; full_name: string | null; email: string | null }>)
        .map((p) => [p.user_id, p.full_name || p.email || "Unknown"]),
    );

    const tally = (pick: (l: LeadRow) => string) => {
      const m = new Map<string, number>();
      for (const l of leads) m.set(pick(l), (m.get(pick(l)) ?? 0) + 1);
      return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    };

    return {
      trackedRows: tracked.length,
      linkedLeads: leads.length,
      // Imported-but-not-yet-handed-out leads. Drops to 0 once every lead from
      // this sheet is assigned to an agent.
      pendingLeads: leads.filter((l) => !l.assigned_user_id).length,
      inserted: count("inserted"),
      updated: count("updated"),
      duplicates: count("duplicate"),
      errors: count("error"),
      target: {
        officeName: sync.office_id ? (officeName.get(sync.office_id) ?? "Unknown office") : "Admin inbox (unassigned)",
        agentName: sync.assigned_user_id ? (userName.get(sync.assigned_user_id) ?? "Unknown agent") : "Unassigned",
        source: sync.source || "—",
        listName: sync.list_name || sync.name || "—",
        intervalSeconds: sync.interval_seconds,
        updateExisting: sync.update_existing,
      },
      bySource: tally((l) => l.source || "No source"),
      byOffice: tally((l) => (l.office_id ? (officeName.get(l.office_id) ?? "Unknown office") : "Admin inbox")),
      byAgent: tally((l) => (l.assigned_user_id ? (userName.get(l.assigned_user_id) ?? "Unknown agent") : "Unassigned")),
      byStatus: tally((l) => l.status || "No status"),
      byList: tally((l) => l.platform || "No list"),
    };
  });



/** Run one saved sync immediately (used by the dialog's fast polling and "Sync now"). */
export const runSheetSyncNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    // The caller must be able to see the sync under RLS before we run it as admin.
    const { data: visible, error } = await context.supabase
      .from("sheet_syncs" as never).select("id").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!visible) throw new Error("Sync not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: full, error: fullErr } = await (supabaseAdmin as any)
      .from("sheet_syncs").select("*").eq("id", data.id).single();
    if (fullErr) throw new Error(fullErr.message);
    const { runSheetSyncAndRecord } = await import("@/lib/sheet-sync.server");
    return await runSheetSyncAndRecord(full);
  });
