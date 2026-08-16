export type SheetAccess = {
  userId: string;
  role: "admin" | "manager" | "superiormanager" | "supervisor";
  isAdmin: boolean;
  officeId: string | null;
};

type AuthenticatedContext = {
  userId: string;
};

type SheetSyncIdentity = {
  id: string;
  office_id: string | null;
};

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as any;
}

// Sheet server functions use the service-role client after this check. Keeping
// the authorization decision here makes that boundary consistent even if a
// database policy is accidentally loosened later.
export async function requireSheetAccess(context: AuthenticatedContext): Promise<SheetAccess> {
  const admin = await adminClient();
  const [{ data: roleRows, error: rolesError }, { data: profile, error: profileError }] =
    await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", context.userId),
      admin
        .from("profiles")
        .select("office_id, status")
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);

  if (rolesError) throw new Error(rolesError.message);
  if (profileError) throw new Error(profileError.message);
  if (!profile || profile.status !== "active") throw new Error("Your account is not active");

  const roles = new Set<string>(
    ((roleRows ?? []) as Array<{ role: string }>).map((row) => String(row.role)),
  );
  const role: SheetAccess["role"] | null = roles.has("admin")
    ? "admin"
    : roles.has("superiormanager")
      ? "superiormanager"
      : roles.has("supervisor")
        ? "supervisor"
        : roles.has("manager")
          ? "manager"
          : null;

  if (!role) throw new Error("Google Sheets access is restricted to administrators and managers");

  const officeId = (profile.office_id as string | null) ?? null;
  if (role !== "admin" && !officeId) {
    throw new Error("Your manager account is not assigned to an office");
  }

  return {
    userId: context.userId,
    role,
    isAdmin: role === "admin",
    officeId,
  };
}

export function canAccessSheetOffice(access: SheetAccess, officeId: string | null): boolean {
  return access.isAdmin || (!!access.officeId && officeId === access.officeId);
}

export async function requireAccessibleSheetSync<T extends SheetSyncIdentity = SheetSyncIdentity>(
  context: AuthenticatedContext,
  syncId: string,
  columns = "id, office_id",
): Promise<{ access: SheetAccess; sync: T }> {
  const access = await requireSheetAccess(context);
  const admin = await adminClient();
  const { data, error } = await admin
    .from("sheet_syncs")
    .select(columns)
    .eq("id", syncId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const sync = data as T | null;
  // Use the same response for a missing and a forbidden id so callers cannot
  // probe whether another office has a particular sheet link.
  if (!sync || !canAccessSheetOffice(access, sync.office_id)) {
    throw new Error("Sheet link not found");
  }
  return { access, sync };
}

export async function validateSheetTarget(
  access: SheetAccess,
  requestedOfficeId: string | null,
  assignedUserId: string | null,
): Promise<{ officeId: string | null; assignedUserId: string | null }> {
  const officeId = access.isAdmin ? requestedOfficeId : access.officeId;
  if (!access.isAdmin && !officeId)
    throw new Error("Your manager account is not assigned to an office");
  if (!officeId && assignedUserId) throw new Error("Select an office before assigning a user");
  if (!assignedUserId) return { officeId, assignedUserId: null };

  const admin = await adminClient();
  const { data: assignee, error } = await admin
    .from("profiles")
    .select("office_id, status")
    .eq("user_id", assignedUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!assignee || assignee.status !== "active") throw new Error("The selected user is not active");
  if (assignee.office_id !== officeId)
    throw new Error("The selected user is not assigned to that office");

  return { officeId, assignedUserId };
}
