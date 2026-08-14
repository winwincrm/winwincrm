// Admin-only office-to-office transfers. Records each transfer in
// `lead_transfers` and stamps the lead with is_in_house + origin_office_id.
// Agents and office managers cannot read transfer history — they only see
// the resulting "Live in House" badge via leads.is_in_house.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

async function assertAdmin(ctx: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data, error } = await ctx.supabase
    .from("user_roles").select("role").eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r) => r.role);
  if (!roles.includes("admin")) throw new Error("Forbidden");
}

const TransferSchema = z.object({
  lead_ids: z.array(z.string().uuid()).min(1).max(500),
  to_office_id: z.string().uuid(),
  to_assigned_user_id: z.string().uuid().nullable().optional(),
  note: z.string().max(500).optional(),
  lead_kind: z.enum(["live", "live_in_house", "cold"]).optional(),
});

export const transferLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => TransferSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    // Validate target agent (if any) belongs to target office
    if (data.to_assigned_user_id) {
      const { data: prof } = await supabaseAdmin
        .from("profiles").select("office_id").eq("user_id", data.to_assigned_user_id).maybeSingle();
      if (!prof?.office_id || prof.office_id !== data.to_office_id) {
        throw new Error("Agent does not belong to selected office");
      }
    }

    // Load current state
    const { data: rows, error } = await supabaseAdmin
      .from("leads")
      .select("id, office_id, origin_office_id, transfer_count, assigned_user_id, origin_agent_id, origin_agent_name")
      .in("id", data.lead_ids);
    if (error) throw new Error(error.message);

    // Resolve names for any prior assignees we'll stamp as origin
    const priorAssigneeIds = new Set<string>();
    for (const r of (rows ?? []) as Array<{ assigned_user_id: string | null; origin_agent_id: string | null }>) {
      if (!r.origin_agent_id && r.assigned_user_id) priorAssigneeIds.add(r.assigned_user_id);
    }
    const nameById = new Map<string, string>();
    if (priorAssigneeIds.size) {
      const { data: profs } = await supabaseAdmin
        .from("profiles").select("user_id, full_name, email").in("user_id", [...priorAssigneeIds]);
      for (const p of profs ?? []) {
        nameById.set(p.user_id, p.full_name || p.email || p.user_id.slice(0, 8));
      }
    }

    let transferred = 0;
    const skipped: string[] = [];

    for (const lead of (rows ?? []) as Array<{
      id: string; office_id: string | null;
      origin_office_id: string | null; transfer_count: number;
      assigned_user_id: string | null;
      origin_agent_id: string | null; origin_agent_name: string | null;
    }>) {
      if (lead.office_id === data.to_office_id) {
        skipped.push(lead.id);
        continue;
      }

      const originOfficeId = lead.origin_office_id ?? lead.office_id ?? null;
      const stampOriginAgentId = lead.origin_agent_id ?? lead.assigned_user_id ?? null;
      const stampOriginAgentName = lead.origin_agent_name
        ?? (lead.assigned_user_id ? nameById.get(lead.assigned_user_id) ?? null : null);

      const update: Record<string, unknown> = {
        office_id: data.to_office_id,
        assigned_user_id: data.to_assigned_user_id ?? null,
        is_in_house: true,
        origin_office_id: originOfficeId,
        origin_agent_id: stampOriginAgentId,
        origin_agent_name: stampOriginAgentName,
        transfer_count: (lead.transfer_count ?? 0) + 1,
      };
      if (data.lead_kind === "live") {
        update.lead_kind = "live";
        update.is_in_house = false;
      } else if (data.lead_kind === "live_in_house") {
        update.lead_kind = "live";
        update.is_in_house = true;
      } else if (data.lead_kind === "cold") {
        update.lead_kind = "cold";
        update.is_in_house = false;
      }

      const { error: upErr } = await supabaseAdmin
        .from("leads")
        .update(update as never)
        .eq("id", lead.id);
      if (upErr) throw new Error(upErr.message);

      const { error: tErr } = await supabaseAdmin
        .from("lead_transfers")
        .insert({
          lead_id: lead.id,
          from_office_id: lead.office_id,
          to_office_id: data.to_office_id,
          transferred_by: context.userId,
          note: data.note ?? null,
        } as never);
      if (tErr) throw new Error(tErr.message);

      transferred++;
    }

    return { transferred, skipped };
  });

export type TransferRow = {
  id: string;
  from_office_id: string | null;
  from_office_name: string | null;
  to_office_id: string;
  to_office_name: string | null;
  transferred_by: string | null;
  transferred_by_name: string | null;
  transferred_at: string;
  note: string | null;
};

export const listTransfers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ lead_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<TransferRow[]> => {
    await assertAdmin(context);
    const { data: rows, error } = await supabaseAdmin
      .from("lead_transfers")
      .select("id, from_office_id, to_office_id, transferred_by, transferred_at, note")
      .eq("lead_id", data.lead_id)
      .order("transferred_at", { ascending: false });
    if (error) throw new Error(error.message);

    const officeIds = new Set<string>();
    const userIds = new Set<string>();
    for (const r of rows ?? []) {
      if (r.from_office_id) officeIds.add(r.from_office_id);
      if (r.to_office_id) officeIds.add(r.to_office_id);
      if (r.transferred_by) userIds.add(r.transferred_by);
    }
    const [{ data: offices }, { data: profs }] = await Promise.all([
      officeIds.size
        ? supabaseAdmin.from("offices").select("id, name").in("id", [...officeIds])
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      userIds.size
        ? supabaseAdmin.from("profiles").select("user_id, full_name, email").in("user_id", [...userIds])
        : Promise.resolve({ data: [] as Array<{ user_id: string; full_name: string | null; email: string | null }> }),
    ]);
    const officeName = new Map((offices ?? []).map((o) => [o.id, o.name]));
    const userName = new Map((profs ?? []).map((p) => [p.user_id, p.full_name || p.email || p.user_id.slice(0, 8)]));

    return (rows ?? []).map((r) => ({
      id: r.id as string,
      from_office_id: r.from_office_id,
      from_office_name: r.from_office_id ? officeName.get(r.from_office_id) ?? null : null,
      to_office_id: r.to_office_id as string,
      to_office_name: r.to_office_id ? officeName.get(r.to_office_id) ?? null : null,
      transferred_by: r.transferred_by,
      transferred_by_name: r.transferred_by ? userName.get(r.transferred_by) ?? null : null,
      transferred_at: r.transferred_at as string,
      note: r.note,
    }));
  });

// ---- bulk transfer pool ----
export type TransferPoolRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  lead_kind: string | null;
  is_in_house: boolean;
  office_id: string | null;
  office_name: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  assigned_at: string | null;
  created_at: string;
};

const PoolSchema = z.object({
  office_id: z.string().uuid().optional(),
  exclude_office_id: z.string().uuid().optional(),
  kind: z.enum(["all", "live", "live_in_house", "cold"]).optional(),
  statuses: z.array(z.string().min(1).max(64)).max(40).optional(),
  assigned_user_id: z.string().uuid().optional(),
  unassigned: z.boolean().optional(),
  q: z.string().max(120).optional(),
  limit: z.number().int().min(1).max(5000).optional(),
});

export const listTransferablePool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => PoolSchema.parse(i))
  .handler(async ({ data, context }): Promise<TransferPoolRow[]> => {
    await assertAdmin(context);

    let q = supabaseAdmin
      .from("leads")
      .select("id, full_name, email, phone, status, lead_kind, is_in_house, office_id, assigned_user_id, assigned_at, created_at")
      .order("assigned_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 2000);

    if (data.office_id) q = q.eq("office_id", data.office_id);
    if (data.exclude_office_id) q = q.neq("office_id", data.exclude_office_id);
    if (data.kind === "live") q = q.eq("lead_kind", "live").eq("is_in_house", false);
    else if (data.kind === "live_in_house") q = q.eq("lead_kind", "live").eq("is_in_house", true);
    else if (data.kind === "cold") q = q.eq("lead_kind", "cold");
    if (data.statuses && data.statuses.length) q = q.in("status", data.statuses as never);
    if (data.assigned_user_id) q = q.eq("assigned_user_id", data.assigned_user_id);
    else if (data.unassigned) q = q.is("assigned_user_id", null);
    if (data.q && data.q.trim()) {
      const t = data.q.trim().replace(/[,()]/g, " ");
      const like = `%${t}%`;
      q = q.or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`);
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const officeIds = new Set<string>();
    const userIds = new Set<string>();
    for (const r of rows ?? []) {
      if (r.office_id) officeIds.add(r.office_id as string);
      if (r.assigned_user_id) userIds.add(r.assigned_user_id as string);
    }
    const [{ data: offices }, { data: profs }] = await Promise.all([
      officeIds.size
        ? supabaseAdmin.from("offices").select("id, name").in("id", [...officeIds])
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      userIds.size
        ? supabaseAdmin.from("profiles").select("user_id, full_name, email").in("user_id", [...userIds])
        : Promise.resolve({ data: [] as Array<{ user_id: string; full_name: string | null; email: string | null }> }),
    ]);
    const officeName = new Map((offices ?? []).map((o) => [o.id, o.name]));
    const userName = new Map((profs ?? []).map((p) => [p.user_id, p.full_name || p.email || p.user_id.slice(0, 8)]));

    return (rows ?? []).map((r) => ({
      id: r.id as string,
      full_name: r.full_name as string | null,
      email: r.email as string | null,
      phone: r.phone as string | null,
      status: r.status as string,
      lead_kind: r.lead_kind as string | null,
      is_in_house: !!r.is_in_house,
      office_id: r.office_id as string | null,
      office_name: r.office_id ? officeName.get(r.office_id as string) ?? null : null,
      assigned_user_id: r.assigned_user_id as string | null,
      assigned_user_name: r.assigned_user_id ? userName.get(r.assigned_user_id as string) ?? null : null,
      assigned_at: r.assigned_at as string | null,
      created_at: r.created_at as string,
    }));
  });
