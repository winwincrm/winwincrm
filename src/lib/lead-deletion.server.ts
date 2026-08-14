import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

type AuthContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export async function handleLeadDeletion(
  ids: string[],
  context: AuthContext,
  options: { allowMissing?: boolean } = {},
) {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return { deleted: 0 };

  const [{ data: roleRows, error: rolesError }, { data: profile, error: profileError }] = await Promise.all([
    context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    context.supabase.from("profiles").select("office_id").eq("user_id", context.userId).maybeSingle(),
  ]);
  if (rolesError) throw new Error(rolesError.message);
  if (profileError) throw new Error(profileError.message);

  const roles = new Set((roleRows ?? []).map((row) => String(row.role)));
  const isAdmin = roles.has("admin");
  const canDeleteOfficeLeads = roles.has("manager") || roles.has("supervisor") || roles.has("superiormanager");
  if (!isAdmin && !canDeleteOfficeLeads) throw new Error("Not allowed");

  const { data: leads, error: leadsError } = await supabaseAdmin
    .from("leads")
    .select("id, office_id")
    .in("id", uniqueIds);
  if (leadsError) throw new Error(leadsError.message);
  if (!options.allowMissing && (leads ?? []).length !== uniqueIds.length) {
    throw new Error("One or more leads were not found");
  }
  if (!isAdmin && (!profile?.office_id || (leads ?? []).some((lead) => lead.office_id !== profile.office_id))) {
    throw new Error("Not allowed");
  }

  // A null tracking link is a tombstone: the sheet row still exists, but the
  // user deliberately deleted its CRM lead. This prevents the next sync tick
  // from recreating it. Removing the row from the sheet clears the tombstone.
  const { error: trackingError } = await supabaseAdmin
    .from("sheet_sync_rows" as never)
    .update({ lead_id: null } as never)
    .in("lead_id", uniqueIds);
  if (trackingError) throw new Error(trackingError.message);

  const { data: deletedRows, error: deleteError } = await supabaseAdmin
    .from("leads")
    .delete()
    .in("id", uniqueIds)
    .select("id");
  if (deleteError) throw new Error(deleteError.message);

  return { deleted: deletedRows?.length ?? 0 };
}