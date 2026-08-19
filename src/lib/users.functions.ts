import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  canManageRole,
  highestRole,
  requiredParentRole,
  rolesCreatableBy,
  type AppRole,
} from "@/lib/hierarchy";

type SimpleResult = { ok: true } | { ok: false; message: string };
type CreateUserResult = { ok: true; user_id: string } | { ok: false; message: string };
type AdminClient = NonNullable<ReturnType<typeof getAdminClient>>;

type UserSnapshot = {
  user_id: string;
  email: string | null;
  office_id: string | null;
  manager_id: string | null;
  status: string;
  role: AppRole;
};

const RoleSchema = z.enum(["admin", "manager", "superiormanager", "agent"]);

function getAdminClient() {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.SB_URL ?? import.meta.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SB_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function loadUser(admin: AdminClient, userId: string): Promise<UserSnapshot | null> {
  const [{ data: profile, error: profileError }, { data: rows, error: rolesError }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("user_id, email, office_id, manager_id, status")
        .eq("user_id", userId)
        .maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", userId),
    ]);
  if (profileError) throw profileError;
  if (rolesError) throw rolesError;
  const role = highestRole((rows ?? []).map((row) => String(row.role)));
  if (!profile || !role) return null;
  return { ...profile, role } as UserSnapshot;
}

async function requireActiveActor(admin: AdminClient, userId: string): Promise<UserSnapshot> {
  const actor = await loadUser(admin, userId);
  if (!actor || actor.status !== "active")
    throw new Error("Your account is not allowed to manage users.");
  return actor;
}

async function isInManagedTree(
  admin: AdminClient,
  actor: UserSnapshot,
  target: UserSnapshot,
): Promise<boolean> {
  if (actor.role === "admin") return true;
  if (!canManageRole(actor.role, target.role)) return false;
  if (!actor.office_id || target.office_id !== actor.office_id) return false;
  if (actor.role === "manager") {
    return target.role === "agent" && target.manager_id === actor.user_id;
  }
  if (actor.role === "superiormanager") {
    if (target.role === "manager") return target.manager_id === actor.user_id;
    if (target.role !== "agent" || !target.manager_id) return false;
    const parent = await loadUser(admin, target.manager_id);
    return (
      !!parent &&
      parent.role === "manager" &&
      parent.manager_id === actor.user_id &&
      parent.office_id === actor.office_id
    );
  }
  return false;
}

async function ensureCanManage(admin: AdminClient, actor: UserSnapshot, targetId: string) {
  const target = await loadUser(admin, targetId);
  if (!target) throw new Error("User not found.");
  if (actor.user_id === targetId) {
    if (actor.role !== "admin")
      throw new Error("Use your profile settings to edit your own account.");
    return target;
  }
  if (!(await isInManagedTree(admin, actor, target))) {
    throw new Error("This user is outside your hierarchy.");
  }
  return target;
}

async function validatePlacement(
  admin: AdminClient,
  role: AppRole,
  officeId: string | null,
  managerId: string | null,
  userId?: string,
) {
  if (role === "admin") {
    if (officeId || managerId)
      throw new Error("Admin accounts cannot belong to an office hierarchy.");
    return;
  }
  if (!officeId) throw new Error("An office is required for every non-admin account.");

  const { data: office, error: officeError } = await admin
    .from("offices")
    .select("id, status")
    .eq("id", officeId)
    .maybeSingle();
  if (officeError) throw officeError;
  if (!office || office.status !== "active") throw new Error("Select an active office.");

  const parentRole = requiredParentRole(role);
  if (!parentRole) {
    if (managerId) throw new Error("Superior managers do not report to another CRM user.");
    return;
  }
  if (!managerId) {
    throw new Error(
      role === "manager"
        ? "Select the superior manager this manager reports to."
        : "Select the manager this agent reports to.",
    );
  }
  if (managerId === userId) throw new Error("A user cannot report to themselves.");
  const parent = await loadUser(admin, managerId);
  if (!parent || parent.role !== parentRole) {
    throw new Error(
      `${role === "manager" ? "Managers" : "Agents"} must report to an active ${parentRole === "superiormanager" ? "superior manager" : "manager"}.`,
    );
  }
  if (parent.status !== "active") throw new Error("The selected parent account is inactive.");
  if (parent.office_id !== officeId)
    throw new Error("The selected parent belongs to a different office.");
}

async function countDirectReports(
  admin: AdminClient,
  userId: string,
  activeOnly = false,
): Promise<number> {
  let query = admin
    .from("profiles")
    .select("user_id", { count: "exact", head: true })
    .eq("manager_id", userId);
  if (activeOnly) query = query.eq("status", "active");
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function replaceRole(admin: AdminClient, userId: string, role: AppRole) {
  const { error: deleteError } = await admin.from("user_roles").delete().eq("user_id", userId);
  if (deleteError) throw deleteError;
  const { error: insertError } = await admin.from("user_roles").insert({ user_id: userId, role });
  if (insertError) throw insertError;
}

const CreateSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(200),
  full_name: z.string().max(200).optional().nullable(),
  role: RoleSchema,
  office_id: z.string().uuid().nullable().optional(),
  manager_id: z.string().uuid().nullable().optional(),
});

export const createUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateSchema.parse(input))
  .handler(async ({ data, context }): Promise<CreateUserResult> => {
    const admin = getAdminClient();
    if (!admin)
      return {
        ok: false,
        message:
          "Server is not configured. Add SUPABASE_SERVICE_ROLE_KEY to the deployment environment.",
      };
    try {
      const actor = await requireActiveActor(admin, context.userId);
      if (!rolesCreatableBy(actor.role).includes(data.role)) {
        return { ok: false, message: "You cannot create that role." };
      }

      let officeId = data.office_id ?? null;
      let managerId = data.manager_id ?? null;
      if (actor.role !== "admin") officeId = actor.office_id;
      if (actor.role === "manager") managerId = actor.user_id;
      if (actor.role === "superiormanager" && data.role === "manager") managerId = actor.user_id;
      if (data.role === "admin") {
        officeId = null;
        managerId = null;
      }
      if (data.role === "superiormanager") managerId = null;

      await validatePlacement(admin, data.role, officeId, managerId);
      if (actor.role === "superiormanager" && data.role === "agent") {
        const manager = managerId ? await loadUser(admin, managerId) : null;
        if (!manager || manager.manager_id !== actor.user_id) {
          return { ok: false, message: "Select one of your managers for this agent." };
        }
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.full_name ?? null },
      });
      if (createError || !created.user) {
        const message = createError?.message ?? "Could not create user.";
        return {
          ok: false,
          message: /already|exists|registered|password|email/i.test(message)
            ? message
            : "Could not create user.",
        };
      }

      const newUserId = created.user.id;
      const rollback = async () => {
        const { error } = await admin.auth.admin.deleteUser(newUserId);
        if (error) console.error("[createUserFn] rollback failed", error);
      };
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .update({
          full_name: data.full_name ?? null,
          email: data.email,
          office_id: officeId,
          manager_id: managerId,
          must_change_password: false,
          status: "active",
        })
        .eq("user_id", newUserId)
        .select("user_id")
        .maybeSingle();
      if (profileError || !profile) {
        await rollback();
        return { ok: false, message: "User profile setup failed. No account was created." };
      }

      try {
        // The signup trigger inserts Agent by default. Replace it so every account has exactly one role.
        await replaceRole(admin, newUserId, data.role);
      } catch (error) {
        console.error("[createUserFn] role setup failed", error);
        await rollback();
        return { ok: false, message: "User role setup failed. No account was created." };
      }
      return { ok: true, user_id: newUserId };
    } catch (error) {
      console.error("[createUserFn]", error);
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to create user.",
      };
    }
  });

type ImpersonateResult =
  | { ok: true; token_hash: string; email: string }
  | { ok: false; message: string };

const ImpersonateSchema = z.object({ user_id: z.string().uuid() });

export const impersonateUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ImpersonateSchema.parse(input))
  .handler(async ({ data, context }): Promise<ImpersonateResult> => {
    const admin = getAdminClient();
    if (!admin) return { ok: false, message: "Server is not configured." };
    try {
      const actor = await requireActiveActor(admin, context.userId);
      if (actor.role !== "admin")
        return { ok: false, message: "Only admins can impersonate users." };
      const target = await loadUser(admin, data.user_id);
      if (!target || target.status !== "active")
        return { ok: false, message: "Target account is not active." };
      const { data: authUser, error: targetError } = await admin.auth.admin.getUserById(
        data.user_id,
      );
      if (targetError || !authUser.user?.email)
        return { ok: false, message: "Target user not found." };
      const { data: link, error: linkError } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: authUser.user.email,
      });
      const tokenHash = (link?.properties as { hashed_token?: string } | undefined)?.hashed_token;
      if (linkError || !tokenHash) return { ok: false, message: "Failed to generate login link." };
      console.warn(`[impersonate] admin=${context.userId} -> target=${data.user_id}`);
      return { ok: true, token_hash: tokenHash, email: authUser.user.email };
    } catch (error) {
      console.error("[impersonateUserFn]", error);
      return { ok: false, message: "Failed to impersonate user." };
    }
  });

const DeleteSchema = z.object({ user_id: z.string().uuid() });

export const deleteUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteSchema.parse(input))
  .handler(async ({ data, context }): Promise<SimpleResult> => {
    const admin = getAdminClient();
    if (!admin) return { ok: false, message: "Server is not configured." };
    if (data.user_id === context.userId)
      return { ok: false, message: "You cannot delete your own account." };
    try {
      const actor = await requireActiveActor(admin, context.userId);
      await ensureCanManage(admin, actor, data.user_id);
      if (await countDirectReports(admin, data.user_id)) {
        return {
          ok: false,
          message: "Reassign this user's direct reports before deleting the account.",
        };
      }
      const { error } = await admin.auth.admin.deleteUser(data.user_id);
      if (error) return { ok: false, message: error.message || "Failed to delete user." };
      return { ok: true };
    } catch (error) {
      console.error("[deleteUserFn]", error);
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to delete user.",
      };
    }
  });

const UpdateSchema = z.object({
  user_id: z.string().uuid(),
  full_name: z.string().max(200).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  role: RoleSchema.optional(),
  office_id: z.string().uuid().nullable().optional(),
  manager_id: z.string().uuid().nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const updateUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateSchema.parse(input))
  .handler(async ({ data, context }): Promise<SimpleResult> => {
    const admin = getAdminClient();
    if (!admin) return { ok: false, message: "Server is not configured." };
    try {
      const actor = await requireActiveActor(admin, context.userId);
      const target = await ensureCanManage(admin, actor, data.user_id);
      if (
        actor.user_id === target.user_id &&
        (data.role !== undefined ||
          data.office_id !== undefined ||
          data.manager_id !== undefined ||
          data.status !== undefined)
      ) {
        return {
          ok: false,
          message: "You cannot change your own role, office, manager, or status.",
        };
      }
      if (
        actor.role !== "admin" &&
        (data.role !== undefined || data.office_id !== undefined || data.manager_id !== undefined)
      ) {
        return { ok: false, message: "Only an admin can change hierarchy placement." };
      }

      const finalRole = actor.role === "admin" && data.role ? data.role : target.role;
      let finalOffice =
        actor.role === "admin" && data.office_id !== undefined ? data.office_id : target.office_id;
      let finalManager =
        actor.role === "admin" && data.manager_id !== undefined
          ? data.manager_id
          : target.manager_id;
      if (finalRole === "admin") {
        finalOffice = null;
        finalManager = null;
      }
      if (finalRole === "superiormanager") finalManager = null;
      await validatePlacement(admin, finalRole, finalOffice, finalManager, target.user_id);

      const hierarchyChanged =
        finalRole !== target.role ||
        finalOffice !== target.office_id ||
        finalManager !== target.manager_id;
      const deactivating = data.status === "inactive" && target.status === "active";
      if (
        (hierarchyChanged || deactivating) &&
        (await countDirectReports(admin, target.user_id, !hierarchyChanged && deactivating))
      ) {
        return {
          ok: false,
          message: "Reassign this account's direct reports before changing it.",
        };
      }

      const oldEmail = target.email;
      let emailChanged = false;
      if (data.email && data.email !== oldEmail) {
        const { error } = await admin.auth.admin.updateUserById(target.user_id, {
          email: data.email,
          email_confirm: true,
        });
        if (error) return { ok: false, message: error.message || "Failed to update email." };
        emailChanged = true;
      }

      let roleChanged = false;
      if (actor.role === "admin" && data.role !== undefined) {
        try {
          await replaceRole(admin, target.user_id, finalRole);
          roleChanged = true;
        } catch (error) {
          console.error("[updateUserFn] role update failed", error);
          await replaceRole(admin, target.user_id, target.role).catch((restoreError) =>
            console.error("[updateUserFn] role rollback failed", restoreError),
          );
          if (emailChanged && oldEmail)
            await admin.auth.admin.updateUserById(target.user_id, {
              email: oldEmail,
              email_confirm: true,
            });
          return { ok: false, message: "Failed to update role." };
        }
      }

      const profileUpdate: Record<string, unknown> = {};
      if (data.full_name !== undefined) profileUpdate.full_name = data.full_name;
      if (data.email) profileUpdate.email = data.email;
      if (data.status !== undefined) profileUpdate.status = data.status;
      if (actor.role === "admin") {
        profileUpdate.office_id = finalOffice;
        profileUpdate.manager_id = finalManager;
      }
      if (Object.keys(profileUpdate).length > 0) {
        const { error } = await admin
          .from("profiles")
          .update(profileUpdate as never)
          .eq("user_id", target.user_id);
        if (error) {
          if (roleChanged)
            await replaceRole(admin, target.user_id, target.role).catch(() => undefined);
          if (emailChanged && oldEmail)
            await admin.auth.admin.updateUserById(target.user_id, {
              email: oldEmail,
              email_confirm: true,
            });
          return { ok: false, message: error.message || "Failed to update profile." };
        }
      }
      return { ok: true };
    } catch (error) {
      console.error("[updateUserFn]", error);
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to update user.",
      };
    }
  });

const ResetSchema = z.object({
  user_id: z.string().uuid(),
  password: z.string().min(8).max(200),
});

export const resetUserPasswordFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ResetSchema.parse(input))
  .handler(async ({ data, context }): Promise<SimpleResult> => {
    const admin = getAdminClient();
    if (!admin) return { ok: false, message: "Server is not configured." };
    try {
      const actor = await requireActiveActor(admin, context.userId);
      await ensureCanManage(admin, actor, data.user_id);
      const { error } = await admin.auth.admin.updateUserById(data.user_id, {
        password: data.password,
      });
      if (error) return { ok: false, message: error.message || "Failed to reset password." };
      const { error: profileError } = await admin
        .from("profiles")
        .update({ must_change_password: false })
        .eq("user_id", data.user_id);
      if (profileError) console.error("[resetUserPasswordFn] reset flag", profileError);
      return { ok: true };
    } catch (error) {
      console.error("[resetUserPasswordFn]", error);
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to reset password.",
      };
    }
  });
