import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAccessibleSheetSync } from "@/lib/sheet-access.server";

/**
 * Given a batch of lead ids, returns the subset that is tracked by a Google
 * Sheet sync (i.e. the lead originated from / is linked to a sheet row).
 * Used by the leads table to only show the "Live" badge for sheet leads.
 */
export const sheetLinkedLeadIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).max(5000) }).parse(i ?? {}),
  )
  .handler(async ({ data }) => {
    if (data.ids.length === 0) return [] as string[];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const out = new Set<string>();
    for (let i = 0; i < data.ids.length; i += 500) {
      const chunk = data.ids.slice(i, i + 500);
      const { data: rows, error } = await supabaseAdmin
        .from("sheet_sync_rows" as never)
        .select("lead_id")
        .in("lead_id", chunk);
      if (error) throw new Error(error.message);
      for (const r of (rows ?? []) as Array<{ lead_id: string | null }>) {
        if (r.lead_id) out.add(r.lead_id);
      }
    }
    return [...out];
  });

/**
 * All lead ids currently linked to one Google Sheet sync, split into the ones
 * that are still unassigned ("pending") and the full set. Used by the leads
 * page to show exactly the leads that came from a given sheet.
 */
export const leadIdsForSheetSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ syncId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { access } = await requireAccessibleSheetSync(context, data.syncId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    const { data: rows, error } = await admin
      .from("sheet_sync_rows").select("lead_id").eq("sync_id", data.syncId);
    if (error) throw new Error(error.message);
    const ids = [...new Set(((rows ?? []) as Array<{ lead_id: string | null }>)
      .map((r) => r.lead_id).filter(Boolean) as string[])];
    if (ids.length === 0) return { ids: [] as string[], pendingIds: [] as string[] };

    const pending: string[] = [];
    const alive: string[] = [];
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      let leadQuery = admin.from("leads").select("id, assigned_user_id").in("id", chunk);
      if (!access.isAdmin) leadQuery = leadQuery.eq("office_id", access.officeId);
      const { data: leads, error: lErr } = await leadQuery;
      if (lErr) throw new Error(lErr.message);
      for (const l of (leads ?? []) as Array<{ id: string; assigned_user_id: string | null }>) {
        alive.push(l.id);
        if (!l.assigned_user_id) pending.push(l.id);
      }
    }
    return { ids: alive, pendingIds: pending };
  });
