// Server-only helper: find which incoming leads collide with an existing LIVE lead.
// Match rule (matches the index in the migration):
//   - phone_k9 (last 9 digits of digits-only phone), OR
//   - lower(email)
// Uses the admin client so it works in public ingest routes too.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type DupeInput = { phone?: string | null; email?: string | null };
export type DupeMatch = { live_id: string; matched_by: "phone" | "email" };

export function phoneK9(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : null;
}

export function normEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return e || null;
}

/**
 * Returns a Map keyed by the index of the input array → matching live lead id.
 * Inputs missing both phone and email are simply not present in the map.
 */
export async function findLiveDuplicates(inputs: DupeInput[]): Promise<Map<number, DupeMatch>> {
  const result = new Map<number, DupeMatch>();
  if (inputs.length === 0) return result;

  const k9s = new Set<string>();
  const emails = new Set<string>();
  const perRow: Array<{ k9: string | null; email: string | null }> = [];
  for (const r of inputs) {
    const k = phoneK9(r.phone);
    const e = normEmail(r.email);
    perRow.push({ k9: k, email: e });
    if (k) k9s.add(k);
    if (e) emails.add(e);
  }
  if (k9s.size === 0 && emails.size === 0) return result;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = supabaseAdmin as any;
  const byK9 = new Map<string, string>();
  const byEmail = new Map<string, string>();

  if (k9s.size > 0) {
    const arr = [...k9s];
    for (let i = 0; i < arr.length; i += 500) {
      const slice = arr.slice(i, i + 500);
      const { data, error } = await admin.from("leads")
        .select("id, phone_k9")
        .eq("lead_kind", "live")
        .in("phone_k9", slice);
      if (error) throw new Error(error.message);
      for (const r of (data ?? []) as Array<{ id: string; phone_k9: string }>) {
        if (!byK9.has(r.phone_k9)) byK9.set(r.phone_k9, r.id);
      }
    }
  }

  if (emails.size > 0) {
    const arr = [...emails];
    for (let i = 0; i < arr.length; i += 500) {
      const slice = arr.slice(i, i + 500);
      // case-insensitive: store original lowercase from DB, then we'll lowercase when comparing
      const { data, error } = await admin.from("leads")
        .select("id, email")
        .eq("lead_kind", "live")
        .in("email", slice);
      if (error) throw new Error(error.message);
      for (const r of (data ?? []) as Array<{ id: string; email: string }>) {
        const key = (r.email ?? "").toLowerCase();
        if (key && !byEmail.has(key)) byEmail.set(key, r.id);
      }
      // Also try with original case mismatch: do a second lookup via ilike for safety on small batches
      if (slice.length <= 50) {
        for (const e of slice) {
          if (byEmail.has(e)) continue;
          const { data: d2 } = await admin.from("leads")
            .select("id, email").eq("lead_kind", "live").ilike("email", e).limit(1).maybeSingle();
          if (d2?.id) byEmail.set(e, d2.id as string);
        }
      }
    }
  }

  perRow.forEach((r, idx) => {
    if (r.k9 && byK9.has(r.k9)) {
      result.set(idx, { live_id: byK9.get(r.k9)!, matched_by: "phone" });
      return;
    }
    if (r.email && byEmail.has(r.email)) {
      result.set(idx, { live_id: byEmail.get(r.email)!, matched_by: "email" });
    }
  });
  return result;
}

/** Replicates public.compute_lead_kind for ingest endpoints that don't know kind yet. */
export function computeLeadKind(fullName: string | null | undefined, firstName?: string | null, lastName?: string | null): "live" | "cold" {
  const candidate = (fullName?.trim() || `${firstName ?? ""} ${lastName ?? ""}`.trim()) || "";
  if (!candidate) return "cold";
  const lc = candidate.toLowerCase().trim();
  if (lc === "unknown" || lc.startsWith("unknown ") || lc.startsWith("unknown_") || lc.startsWith("unknown-")) return "cold";
  if (!/[A-Za-zÀ-ÿ]/.test(candidate)) return "cold";
  if (/^\+?\d[\d\s().-]{5,}$/.test(candidate)) return "cold";
  return "live";
}
