import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

const ALEX_ID = "9e0a659f-d2dd-4901-ac88-079d6de6461c";
const BYRAZA_ID = "c03ac0e8-7cbc-4d5b-898a-562b4919e97b";

type AuthContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

type ReassignLeadInput = {
  leadId: string;
  assignedUserId: string | null;
  keepComments: boolean;
  keepDescriptions?: boolean;
};

function hasAnyRole(roles: Set<string>, allowed: string[]) {
  return allowed.some((role) => roles.has(role));
}

export async function handleLeadReassignment(input: ReassignLeadInput, context: AuthContext) {
  const { data: roleRows, error: rolesError } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (rolesError) throw new Error(rolesError.message);

  const roles = new Set<string>((roleRows ?? []).map((row) => String(row.role)));
  const isAdmin = roles.has("admin");
  const isManager = hasAnyRole(roles, ["manager", "superiormanager"]);
  const isAlexSpecialCase = roles.has("agent") && context.userId === ALEX_ID;

  if (!isAdmin && !isManager && !isAlexSpecialCase) {
    throw new Error("Not allowed");
  }

  const { data: callerProfile, error: callerError } = await context.supabase
    .from("profiles")
    .select("office_id")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (callerError) throw new Error(callerError.message);

  const { data: lead, error: leadError } = await supabaseAdmin
    .from("leads")
    .select("id, office_id")
    .eq("id", input.leadId)
    .maybeSingle();
  if (leadError) throw new Error(leadError.message);
  if (!lead) throw new Error("Lead not found");

  if (isManager && lead.office_id !== callerProfile?.office_id) {
    throw new Error("Not allowed");
  }
  if (isAlexSpecialCase && lead.office_id !== callerProfile?.office_id) {
    throw new Error("Lead is not in your office");
  }

  let moveToOfficeId: string | null = null;

  if (input.assignedUserId) {
    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from("profiles")
      .select("office_id, status")
      .eq("user_id", input.assignedUserId)
      .maybeSingle();
    if (targetError) throw new Error(targetError.message);
    if (!targetProfile) throw new Error("Agent not found");

    if (targetProfile.status && targetProfile.status !== "active") {
      throw new Error("Agent must be active");
    }
    if (isAdmin && targetProfile.office_id && targetProfile.office_id !== lead.office_id) {
      // Admins may assign across offices: the lead follows the agent's office.
      moveToOfficeId = targetProfile.office_id;
    } else if (!targetProfile.office_id || targetProfile.office_id !== lead.office_id) {
      throw new Error("Agent does not belong to this office");
    }
    if (isAlexSpecialCase && input.assignedUserId !== ALEX_ID && input.assignedUserId !== BYRAZA_ID) {
      throw new Error("Not allowed");
    }
  }

  if (isAlexSpecialCase && !input.assignedUserId) {
    throw new Error("Not allowed");
  }

  if (!input.keepComments) {
    const { error: deleteError } = await supabaseAdmin
      .from("lead_comments")
      .delete()
      .eq("lead_id", input.leadId);
    if (deleteError) throw new Error(deleteError.message);
  }

  const leadClient = isAlexSpecialCase ? supabaseAdmin : context.supabase;
  const updatePatch: Record<string, unknown> = { assigned_user_id: input.assignedUserId };
  if (moveToOfficeId) updatePatch.office_id = moveToOfficeId;
  if (input.keepDescriptions === false) {
    updatePatch.description_1 = null;
    updatePatch.description_2 = null;
    updatePatch.description_3 = null;
    updatePatch.description_4 = null;
  }
  const { error: updateError } = await leadClient
    .from("leads")
    .update(updatePatch as never)
    .eq("id", input.leadId);
  if (updateError) throw new Error(updateError.message);

  return { assigned_user_id: input.assignedUserId };
}