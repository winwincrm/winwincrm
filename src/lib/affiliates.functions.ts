// Admin-only management of affiliates and their ingest API keys.
// Tokens are generated server-side, hashed with SHA-256, and only the
// hash is stored. Raw token returned ONCE on create.
import { createServerFn } from "@tanstack/react-start";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

async function assertAdmin(ctx: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data, error } = await ctx.supabase
    .from("user_roles").select("role").eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  if (!(data ?? []).some((r) => r.role === "admin")) throw new Error("Admins only");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

export type Affiliate = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
  key_count: number;
};

export const listAffiliates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Affiliate[]> => {
    await assertAdmin(context);
    const { data, error } = await admin
      .from("affiliates")
      .select("id, name, status, created_at, updated_at, affiliate_api_keys(id)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: { id: string; name: string; status: string; created_at: string; updated_at: string; affiliate_api_keys: unknown[] }) => ({
      id: r.id, name: r.name, status: r.status,
      created_at: r.created_at, updated_at: r.updated_at,
      key_count: Array.isArray(r.affiliate_api_keys) ? r.affiliate_api_keys.length : 0,
    }));
  });

export const createAffiliate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    name: z.string().min(1).max(120),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await admin.from("affiliates")
      .insert({ name: data.name, created_by: context.userId })
      .select("id").single();
    if (error || !row) throw new Error(error?.message ?? "Insert failed");
    return { id: row.id as string };
  });

export const setAffiliateStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    id: z.string().uuid(),
    status: z.enum(["active", "inactive"]),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await admin.from("affiliates")
      .update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type AffiliateKey = {
  id: string;
  affiliate_id: string;
  label: string | null;
  status: string;
  created_at: string;
  last_used_at: string | null;
};

export const listAffiliateApiKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ affiliate_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<AffiliateKey[]> => {
    await assertAdmin(context);
    const { data: rows, error } = await admin.from("affiliate_api_keys")
      .select("id, affiliate_id, label, status, created_at, last_used_at")
      .eq("affiliate_id", data.affiliate_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as AffiliateKey[];
  });

export const createAffiliateApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    affiliate_id: z.string().uuid(),
    label: z.string().min(1).max(100),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    try {
      const { setResponseHeader } = await import("@tanstack/react-start/server");
      setResponseHeader("cache-control", "no-store, no-cache, must-revalidate, private");
    } catch { /* noop */ }
    const raw = "aff_" + randomBytes(32).toString("base64url");
    const keyHash = createHash("sha256").update(raw).digest("hex");
    const { data: row, error } = await admin.from("affiliate_api_keys")
      .insert({
        affiliate_id: data.affiliate_id,
        label: data.label,
        key_hash: keyHash,
        created_by: context.userId,
      })
      .select("id").single();
    if (error || !row) throw new Error(error?.message ?? "Insert failed");
    return { id: row.id as string, raw_token: raw };
  });

export const revokeAffiliateApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await admin.from("affiliate_api_keys")
      .update({ status: "inactive" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
