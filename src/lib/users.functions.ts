import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type CreateUserResult = { ok: true; user_id: string } | { ok: false; message: string };

const InputSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(200),
  full_name: z.string().max(200).optional().nullable(),
  role: z.enum(["admin", "manager", "superiormanager", "agent"]),
  office_id: z.string().uuid().nullable().optional(),
  manager_id: z.string().uuid().nullable().optional(),
});


export const createUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<CreateUserResult> => {
    const { userId } = context;
    const fail = (message: string, err?: unknown): CreateUserResult => {
      if (err) console.error("[createUserFn]", message, err);
      return { ok: false, message };
    };
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.SB_URL ?? import.meta.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SB_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[createUserFn] Missing Supabase server env vars");
      return { ok: false, message: "Server is not configured. Contact your administrator." };
    }

    const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    try {
      const [{ data: callerRoles, error: rolesErr }, { data: callerProfile, error: profileErr }] =
        await Promise.all([
          supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
          supabaseAdmin.from("profiles").select("office_id").eq("user_id", userId).maybeSingle(),
        ]);

      if (rolesErr) return fail("Failed to verify your permissions.", rolesErr);
      if (profileErr) return fail("Failed to load your profile.", profileErr);

      const roleList = (callerRoles ?? []).map((r) => r.role as string);
      const rankOf: Record<string, number> = { admin: 4, superiormanager: 3, manager: 2, agent: 1 };
      const callerRole: "admin" | "superiormanager" | "manager" | "agent" | null =
        roleList.includes("admin") ? "admin"
        : roleList.includes("superiormanager") ? "superiormanager"
        : roleList.includes("manager") ? "manager"
        : roleList.includes("agent") ? "agent"
        : null;

      if (!callerRole || callerRole === "agent") {
        return fail("You are not allowed to create users.");
      }

      let targetRole = data.role;
      let targetOffice: string | null = data.office_id ?? null;
      let targetManager: string | null = data.manager_id ?? null;

      if (callerRole !== "admin") {
        // Non-admin: force office to their own; force manager to self unless provided.
        targetOffice = callerProfile?.office_id ?? null;
        if (!targetManager) targetManager = userId;
        // Target must be strictly below caller in rank.
        if ((rankOf[targetRole] ?? 0) >= (rankOf[callerRole] ?? 0)) {
          targetRole = "agent";
        }
      }

      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.full_name ?? null },
      });

      if (createErr || !created.user) {
        const msg = createErr?.message ?? "";
        const safe = /already|exists|registered|password|email/i.test(msg)
          ? msg
          : "Could not create user.";
        return fail(safe, createErr);
      }

      const newUserId = created.user.id;

      const rollbackCreatedUser = async () => {
        const { error: rollbackError } = await supabaseAdmin.auth.admin.deleteUser(newUserId);
        if (rollbackError) {
          console.error("[createUserFn] Failed to roll back partially created user", rollbackError);
        }
      };

      const profileUpdate = {
        full_name: data.full_name ?? null,
        office_id: targetOffice,
        manager_id: targetManager,
        must_change_password: true,
      } as unknown as Record<string, unknown>;
      const { error: profErr } = await supabaseAdmin
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(profileUpdate as any)
        .eq("user_id", newUserId);

      if (profErr) {
        await rollbackCreatedUser();
        return fail("User profile setup failed. No account was created.", profErr);
      }


      const { data: existingRoles, error: existingRolesErr } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", newUserId);
      if (existingRolesErr) {
        await rollbackCreatedUser();
        return fail("User role setup failed. No account was created.", existingRolesErr);
      }

      const has = (existingRoles ?? []).some((r) => r.role === targetRole);
      if (!has) {
        const { error: roleErr } = await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: newUserId, role: targetRole });
        if (roleErr) {
          await rollbackCreatedUser();
          return fail("User role setup failed. No account was created.", roleErr);
        }
      }

      return { ok: true, user_id: newUserId };
    } catch (error) {
      return fail("Failed to create user.", error);
    }
  });

type ImpersonateResult =
  | { ok: true; token_hash: string; email: string }
  | { ok: false; message: string };

const ImpersonateSchema = z.object({
  user_id: z.string().uuid(),
});

export const impersonateUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ImpersonateSchema.parse(input))
  .handler(async ({ data, context }): Promise<ImpersonateResult> => {
    const { userId } = context;
    const fail = (message: string, err?: unknown): ImpersonateResult => {
      if (err) console.error("[impersonateUserFn]", message, err);
      return { ok: false, message };
    };
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.SB_URL ?? import.meta.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SB_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return fail("Server is not configured.");
    }

    const admin = createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    try {
      try {
        const { setResponseHeader } = await import("@tanstack/react-start/server");
        setResponseHeader("cache-control", "no-store, no-cache, must-revalidate, private");
      } catch { /* SSR helper unavailable — ignore */ }

      const { data: callerRoles, error: rolesErr } = await admin
        .from("user_roles").select("role").eq("user_id", userId);
      if (rolesErr) return fail("Permission check failed.", rolesErr);
      const isAdmin = (callerRoles ?? []).some((r) => r.role === "admin");
      if (!isAdmin) return fail("Only admins can impersonate users.");

      const { data: target, error: targetErr } = await admin.auth.admin.getUserById(data.user_id);
      if (targetErr || !target.user?.email) return fail("Target user not found.", targetErr);

      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: target.user.email,
      });
      // `hashed_token` is the raw token we can verify client-side via
      // supabase.auth.verifyOtp — avoids the Supabase Site URL redirect
      // (which was bouncing to localhost:3000).
      const hashed = (link?.properties as { hashed_token?: string } | undefined)?.hashed_token;
      if (linkErr || !hashed) {
        return fail("Failed to generate login link.", linkErr);
      }

      console.warn(`[impersonate] admin=${userId} -> target=${data.user_id}`);
      return { ok: true, token_hash: hashed, email: target.user.email };
    } catch (error) {
      return fail("Failed to impersonate user.", error);
    }
  });


// -------------------- Shared admin client helper --------------------
function getAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.SB_URL ?? import.meta.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SB_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function getCallerRole(admin: ReturnType<typeof getAdminClient>, userId: string) {
  if (!admin) return null;
  const { data } = await admin.from("user_roles").select("role").eq("user_id", userId);
  const list = (data ?? []).map((r) => r.role as string);
  if (list.includes("admin")) return "admin" as const;
  if (list.includes("superiormanager")) return "superiormanager" as const;
  if (list.includes("manager")) return "manager" as const;
  if (list.includes("agent")) return "agent" as const;
  return null;
}

const rankOf: Record<string, number> = { admin: 4, superiormanager: 3, manager: 2, agent: 1 };

type SimpleResult = { ok: true } | { ok: false; message: string };

// -------------------- Delete user --------------------
const DeleteSchema = z.object({ user_id: z.string().uuid() });

export const deleteUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => DeleteSchema.parse(i))
  .handler(async ({ data, context }): Promise<SimpleResult> => {
    const admin = getAdminClient();
    if (!admin) return { ok: false, message: "Server is not configured." };
    if (data.user_id === context.userId) return { ok: false, message: "You cannot delete your own account." };
    const callerRole = await getCallerRole(admin, context.userId);
    if (!callerRole || callerRole === "agent") return { ok: false, message: "Not allowed." };

    const targetRole = await getCallerRole(admin, data.user_id);
    if (targetRole && (rankOf[targetRole] ?? 0) >= (rankOf[callerRole] ?? 0)) {
      return { ok: false, message: "You cannot delete a user at or above your rank." };
    }

    const { error } = await admin.auth.admin.deleteUser(data.user_id);
    if (error) {
      console.error("[deleteUserFn]", error);
      return { ok: false, message: error.message || "Failed to delete user." };
    }
    return { ok: true };
  });

// -------------------- Update user --------------------
const UpdateSchema = z.object({
  user_id: z.string().uuid(),
  full_name: z.string().max(200).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  role: z.enum(["admin", "manager", "superiormanager", "agent"]).optional(),
  office_id: z.string().uuid().nullable().optional(),
  manager_id: z.string().uuid().nullable().optional(),
});

export const updateUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpdateSchema.parse(i))
  .handler(async ({ data, context }): Promise<SimpleResult> => {
    const admin = getAdminClient();
    if (!admin) return { ok: false, message: "Server is not configured." };
    const callerRole = await getCallerRole(admin, context.userId);
    if (!callerRole || callerRole === "agent") return { ok: false, message: "Not allowed." };

    const targetRole = await getCallerRole(admin, data.user_id);
    if (
      data.user_id !== context.userId &&
      targetRole &&
      (rankOf[targetRole] ?? 0) >= (rankOf[callerRole] ?? 0)
    ) {
      return { ok: false, message: "You cannot edit a user at or above your rank." };
    }

    // Auth updates (email)
    if (data.email) {
      const { error } = await admin.auth.admin.updateUserById(data.user_id, {
        email: data.email,
        email_confirm: true,
      });
      if (error) return { ok: false, message: error.message || "Failed to update email." };
    }

    // Profile updates
    const profileUpdate: Record<string, unknown> = {};
    if (data.full_name !== undefined) profileUpdate.full_name = data.full_name;
    if (data.email !== undefined && data.email) profileUpdate.email = data.email;
    if (callerRole === "admin" && data.office_id !== undefined) profileUpdate.office_id = data.office_id;
    if (callerRole === "admin" && data.manager_id !== undefined) profileUpdate.manager_id = data.manager_id;
    if (Object.keys(profileUpdate).length > 0) {
      const { error } = await admin
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(profileUpdate as any)
        .eq("user_id", data.user_id);
      if (error) return { ok: false, message: error.message || "Failed to update profile." };
    }

    // Role change (admin only)
    if (data.role && callerRole === "admin") {
      const { error: delErr } = await admin.from("user_roles").delete().eq("user_id", data.user_id);
      if (delErr) return { ok: false, message: delErr.message };
      const { error: insErr } = await admin
        .from("user_roles")
        .insert({ user_id: data.user_id, role: data.role });
      if (insErr) return { ok: false, message: insErr.message };
    }

    return { ok: true };
  });

// -------------------- Reset password --------------------
const ResetSchema = z.object({
  user_id: z.string().uuid(),
  password: z.string().min(8).max(200),
});

export const resetUserPasswordFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ResetSchema.parse(i))
  .handler(async ({ data, context }): Promise<SimpleResult> => {
    const admin = getAdminClient();
    if (!admin) return { ok: false, message: "Server is not configured." };
    const callerRole = await getCallerRole(admin, context.userId);
    if (!callerRole || callerRole === "agent") return { ok: false, message: "Not allowed." };

    const targetRole = await getCallerRole(admin, data.user_id);
    if (
      data.user_id !== context.userId &&
      targetRole &&
      (rankOf[targetRole] ?? 0) >= (rankOf[callerRole] ?? 0)
    ) {
      return { ok: false, message: "You cannot reset password for this user." };
    }

    const { error } = await admin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
    });
    if (error) return { ok: false, message: error.message || "Failed to reset password." };

    // Force password change on next login
    await admin
      .from("profiles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ must_change_password: true } as any)
      .eq("user_id", data.user_id);

    return { ok: true };
  });
