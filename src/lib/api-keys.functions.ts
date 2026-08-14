// Admin-only API key management. Tokens are generated server-side, hashed
// with SHA-256, and only the hash is stored. Raw token returned ONCE on create.
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type Fail = { ok: false; message: string };

function getAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.SB_URL ?? import.meta.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SB_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server is not configured");
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function assertAdmin(userId: string) {
  const admin = getAdmin();
  const { data, error } = await admin.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error("Permission check failed");
  if (!(data ?? []).some((r) => r.role === "admin")) throw new Error("Admins only");
  return admin;
}

type ApiKeyRow = {
  id: string;
  office_id: string;
  label: string | null;
  status: string;
  created_at: string;
  last_used_at: string | null;
  office_name: string | null;
};

export const listApiKeysFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true; keys: ApiKeyRow[] } | Fail> => {
    try {
      const admin = await assertAdmin(context.userId);
      const { data, error } = await admin
        .from("office_api_keys")
        .select("id, office_id, label, status, created_at, last_used_at, offices(name)")
        .order("created_at", { ascending: false });
      if (error) return { ok: false, message: error.message };
      const keys: ApiKeyRow[] = (data ?? []).map((r: any) => ({
        id: r.id,
        office_id: r.office_id,
        label: r.label,
        status: r.status,
        created_at: r.created_at,
        last_used_at: r.last_used_at,
        office_name: r.offices?.name ?? null,
      }));
      return { ok: true, keys };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Failed" };
    }
  });

export const createApiKeyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      office_id: z.string().uuid(),
      label: z.string().min(1).max(100),
    }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; id: string; raw_token: string } | Fail> => {
    try {
      const admin = await assertAdmin(context.userId);
      // Don't cache the raw token anywhere downstream.
      try {
        const { setResponseHeader } = await import("@tanstack/react-start/server");
        setResponseHeader("cache-control", "no-store, no-cache, must-revalidate, private");
      } catch { /* noop in tests */ }

      const raw = "psk_" + randomBytes(32).toString("base64url");
      const keyHash = createHash("sha256").update(raw).digest("hex");

      const { data: row, error } = await admin
        .from("office_api_keys")
        .insert({
          office_id: data.office_id,
          label: data.label,
          key_hash: keyHash,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (error || !row) return { ok: false, message: error?.message ?? "Insert failed" };
      console.warn(`[api-keys] created key=${row.id} office=${data.office_id} by=${context.userId}`);
      return { ok: true, id: row.id, raw_token: raw };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Failed" };
    }
  });

export const revokeApiKeyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true } | Fail> => {
    try {
      const admin = await assertAdmin(context.userId);
      const { error } = await admin
        .from("office_api_keys")
        .update({ status: "inactive" })
        .eq("id", data.id);
      if (error) return { ok: false, message: error.message };
      console.warn(`[api-keys] revoked key=${data.id} by=${context.userId}`);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Failed" };
    }
  });
