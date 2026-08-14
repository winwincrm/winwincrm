import type { ParsedLead } from "./parseLeadText";

export interface NormalizeResult {
  lead: ParsedLead;
  fixes: string[];
}

const SALUTATIONS = /^(?:herr|frau|hr\.?|fr\.?|mr\.?|mrs\.?|ms\.?|dr\.?|prof\.?)\s+/i;

export function normalizePhone(raw: string | undefined, defaultCc = "+49"): { value?: string; changed: boolean } {
  if (!raw) return { changed: false };
  const trimmed = raw.trim();
  if (!trimmed) return { changed: false };
  let digits = trimmed.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = "+" + digits.slice(2);
  if (!digits.startsWith("+")) {
    if (digits.startsWith("0")) digits = defaultCc + digits.slice(1);
    else if (/^\d{8,}$/.test(digits)) digits = defaultCc + digits;
  }
  digits = digits.replace(/^\++/, "+");
  if (digits.replace(/\D/g, "").length < 5) return { value: trimmed, changed: false };
  return { value: digits, changed: digits !== trimmed };
}

const EMAIL_TYPOS: Array<[RegExp, string]> = [
  [/@gmial\./i, "@gmail."],
  [/@gnail\./i, "@gmail."],
  [/@gmai\./i, "@gmail."],
  [/@gmal\./i, "@gmail."],
  [/@hotnail\./i, "@hotmail."],
  [/@hotmial\./i, "@hotmail."],
  [/@yaho\./i, "@yahoo."],
  [/\.con$/i, ".com"],
  [/\.cmo$/i, ".com"],
  [/\.col$/i, ".com"],
];

export function normalizeEmail(raw: string | undefined): { value?: string; changed: boolean } {
  if (!raw) return { changed: false };
  let v = raw.trim().replace(/^[<"']+|[>"']+$/g, "").toLowerCase();
  if (!v) return { changed: false };
  for (const [re, rep] of EMAIL_TYPOS) v = v.replace(re, rep);
  return { value: v, changed: v !== raw };
}

export function normalizeName(raw: string | undefined): { value?: string; changed: boolean } {
  if (!raw) return { changed: false };
  let v = raw.replace(/\s+/g, " ").trim();
  while (SALUTATIONS.test(v)) v = v.replace(SALUTATIONS, "");
  v = v.trim();
  if (!v) return { value: raw.trim(), changed: false };
  if (v === v.toLowerCase() || v === v.toUpperCase()) {
    v = v.split(" ").map((w) => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w).join(" ");
  }
  return { value: v, changed: v !== raw };
}

export function normalizeAmount(raw: string | number | undefined): { value?: number; changed: boolean } {
  if (raw === undefined || raw === null || raw === "") return { changed: false };
  if (typeof raw === "number") return { value: raw, changed: false };
  const s = String(raw).trim();
  const suffixMatch = s.match(/^([\d.,\s]+)\s*([kKmM])\s*€?$/);
  if (suffixMatch) {
    const base = parseAmountCore(suffixMatch[1]);
    if (base !== undefined) {
      const mul = suffixMatch[2].toLowerCase() === "k" ? 1_000 : 1_000_000;
      return { value: base * mul, changed: true };
    }
  }
  const n = parseAmountCore(s);
  if (n === undefined) return { changed: false };
  return { value: n, changed: String(n) !== s };
}

function parseAmountCore(raw: string): number | undefined {
  const cleaned = raw.replace(/[^\d.,-]/g, "");
  if (!cleaned) return undefined;
  const n = cleaned.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const num = Number(n);
  return Number.isFinite(num) ? num : undefined;
}

export function normalizeTimeframe(raw: string | undefined): { value?: string; changed: boolean } {
  if (!raw) return { changed: false };
  const s = raw.trim();
  if (!s) return { changed: false };
  const m = s.match(/^(\d+)\s*(monate|monat|months|month|m|jahre|jahr|years|year|y)\b/i);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    const isYear = /^(jahre|jahr|years|year|y)$/.test(unit);
    const months = isYear ? n * 12 : n;
    const out = `${months} months`;
    return { value: out, changed: out !== s };
  }
  // Bare digits or "24mon" / "24 mo" — assume months
  const bare = s.match(/^(\d+)\s*(?:mon|mo)?$/i);
  if (bare) {
    const out = `${parseInt(bare[1], 10)} months`;
    return { value: out, changed: out !== s };
  }
  return { value: s, changed: false };
}

export function normalizeLead(lead: ParsedLead): NormalizeResult {
  const fixes: string[] = [];
  const out: ParsedLead = { ...lead, payload: { ...(lead.payload ?? {}) } };

  const fn = normalizeName(out.first_name);
  if (fn.value !== undefined) { out.first_name = fn.value; if (fn.changed) fixes.push("name cleaned"); }
  const ln = normalizeName(out.last_name);
  if (ln.value !== undefined) { out.last_name = ln.value; if (ln.changed && !fixes.includes("name cleaned")) fixes.push("name cleaned"); }
  const full = normalizeName(out.full_name);
  if (full.value !== undefined) { out.full_name = full.value; if (full.changed && !fixes.includes("name cleaned")) fixes.push("name cleaned"); }
  if (!out.full_name && (out.first_name || out.last_name)) {
    out.full_name = [out.first_name, out.last_name].filter(Boolean).join(" ");
  }

  const email = normalizeEmail(out.email);
  if (email.value !== undefined) { out.email = email.value; if (email.changed) fixes.push("email cleaned"); }

  const phone = normalizePhone(out.phone);
  if (phone.value !== undefined) { out.phone = phone.value; if (phone.changed) fixes.push("phone formatted"); }

  if (typeof out.amount !== "number" && out.payload?.amount_raw) {
    const a = normalizeAmount(out.payload.amount_raw);
    if (a.value !== undefined) { out.amount = a.value; if (a.changed) fixes.push("amount parsed"); }
  }

  const tf = normalizeTimeframe(out.timeframe);
  if (tf.value !== undefined) { out.timeframe = tf.value; if (tf.changed) fixes.push("timeframe normalized"); }

  return { lead: out, fixes };
}
