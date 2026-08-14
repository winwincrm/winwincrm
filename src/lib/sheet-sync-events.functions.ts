import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SheetSyncEventLead = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  list_name: string | null;
  status: string | null;
  office_name: string | null;
  assigned_user_id: string | null;
  agent_name: string | null;
};

export type SheetSyncEvent = {
  id: string;
  sync_id: string;
  sync_name: string | null;
  sheet_url: string | null;
  office_id: string | null;
  kind: "inserted" | "updated" | "duplicate" | "deleted" | "restored" | "error";
  lead_id: string | null;
  lead_name: string | null;
  detail: string | null;
  created_at: string;
  lead?: SheetSyncEventLead | null;
};

/** Recent Google Sheet changes, newest first — feeds the notification bell and the Sheets page. */
export const listSheetSyncEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      since: z.string().datetime().optional(),
      sync_id: z.string().uuid().optional(),
      sheet_url: z.string().max(2000).optional(),
      limit: z.number().int().min(1).max(300).default(30),
      with_lead_details: z.boolean().default(false),
    }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    let rows: unknown[] | null = null;
    try {
      let query = context.supabase
        .from("sheet_sync_events" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(data.limit);
      if (data.since) query = query.gt("created_at", data.since);
      if (data.sync_id) query = query.eq("sync_id", data.sync_id);
      if (data.sheet_url) query = query.eq("sheet_url", data.sheet_url);
      const res = await query;
      // Backend unreachable / transient outage: degrade to an empty feed instead
      // of throwing, which would blank the whole page.
      if (res.error) {
        console.error("[listSheetSyncEvents]", res.error.message);
        return [] as SheetSyncEvent[];
      }
      rows = res.data as unknown[] | null;
    } catch (e) {
      console.error("[listSheetSyncEvents]", e instanceof Error ? e.message : String(e));
      return [] as SheetSyncEvent[];
    }
    const events = (rows ?? []) as unknown as SheetSyncEvent[];
    if (!data.with_lead_details || events.length === 0) return events;

    const leadIds = [...new Set(events.map((e) => e.lead_id).filter(Boolean) as string[])];
    if (leadIds.length === 0) return events;

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admin = supabaseAdmin as any;
      type LeadRow = {
        id: string; full_name: string | null; email: string | null; phone: string | null;
        source: string | null; platform: string | null; status: string | null;
        office_id: string | null; assigned_user_id: string | null;
      };
      const { data: leadRows } = await admin
        .from("leads")
        .select("id, full_name, email, phone, source, platform, status, office_id, assigned_user_id")
        .in("id", leadIds);
      const leads = (leadRows ?? []) as LeadRow[];

      const officeIds = [...new Set(leads.map((l) => l.office_id).filter(Boolean) as string[])];
      const userIds = [...new Set(leads.map((l) => l.assigned_user_id).filter(Boolean) as string[])];
      const [officesRes, profilesRes] = await Promise.all([
        officeIds.length ? admin.from("offices").select("id, name").in("id", officeIds) : Promise.resolve({ data: [] }),
        userIds.length
          ? admin.from("profiles").select("user_id, full_name, email").in("user_id", userIds)
          : Promise.resolve({ data: [] }),
      ]);
      const officeName = new Map<string, string>(
        ((officesRes.data ?? []) as Array<{ id: string; name: string }>).map((o) => [o.id, o.name]),
      );
      const userName = new Map<string, string>(
        ((profilesRes.data ?? []) as Array<{ user_id: string; full_name: string | null; email: string | null }>)
          .map((p) => [p.user_id, p.full_name || p.email || "Unknown"]),
      );

      const byId = new Map<string, SheetSyncEventLead>(
        leads.map((l) => [l.id, {
          id: l.id,
          full_name: l.full_name,
          email: l.email,
          phone: l.phone,
          source: l.source,
          list_name: l.platform,
          status: l.status,
          office_name: l.office_id ? (officeName.get(l.office_id) ?? "Unknown office") : "Admin inbox",
          assigned_user_id: l.assigned_user_id,
          agent_name: l.assigned_user_id ? (userName.get(l.assigned_user_id) ?? "Unknown agent") : "Unassigned",
        }]),
      );

      return events.map((e) => ({ ...e, lead: e.lead_id ? (byId.get(e.lead_id) ?? null) : null }));
    } catch (e) {
      console.error("[listSheetSyncEvents:details]", e instanceof Error ? e.message : String(e));
      return events;
    }
  });
