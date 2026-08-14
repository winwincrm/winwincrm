import { parseGermanNumberWord } from "./germanNumerals";

// ---------- Regexes & aliases (shared with classifier and field cleaners) ----------
const SALUTATION_RE = /^(?:herr|frau|hr\.?|fr\.?|mr\.?|mrs\.?|ms\.?|dr\.?|prof\.?)\s+/i;
const PHONE_RE = /^[+\d][\d\s\-()/]{4,}$/;
const EMAIL_LOOSE_RE = /[\w._%+\-]+@[\w.\-]+\.[a-z]{2,}/i;
const NAME_LOOSE_RE = /^[A-Za-zÀ-ÿ.'-]+(?:\s+[A-Za-zÀ-ÿ.'-]+){0,3}$/;
const AMOUNT_LOOSE_RE = /^(?:€\s*)?\d[\d.,\s]*\s*(?:€|eur|euro|k|m)?$/i;
const TIMEFRAME_RE = /^\d+\s*(?:monate?|months?|mo|m|jahre?|years?|jr|y|tage?|days?|d|wochen?|weeks?|w)$/i;
const SEPARATOR_RE = /^(?:[-=_*#~+•·]{2,}|lead\s*\d+[:.)]?|kunde\s*\d+[:.)]?|#\s*\d+|\d+[).:]\s*$|(?:lead|kunde|customer|client)\s+(?:details?|info|infos|data|daten)\s*:?$)$/i;
const NOISE_RE = /^(?:kontaktdaten|guten tag[,.!]?|es ist gerade ein neuer lead\b.*|hallo[,.!]?|sehr geehrte[rs]?\b.*|beste gr(?:ü|ue)(?:ss|ß)e[,.!]?|mit freundlichen gr(?:ü|ue)(?:ss|ß)en[,.!]?|viele gr(?:ü|ue)(?:ss|ß)e[,.!]?|liebe gr(?:ü|ue)(?:ss|ß)e[,.!]?|ihr\s+.{1,40}\s+team[.!]?|copyright\b.*|©.*|impressum(?:\s*\|\s*datenschutz)?|datenschutz)$/i;
const NUM_PREFIX_RE = /^(?:#\s*)?\d+\s*[).:-]\s+/;

export const KEY_ALIASES: Record<string, string> = {
  name: "name", kunde: "name", customer: "name", client: "name", lead: "name",
  vorname: "first_name", "first name": "first_name", firstname: "first_name", first: "first_name",
  nachname: "last_name", "last name": "last_name", lastname: "last_name", surname: "last_name", familienname: "last_name",
  kontakt: "contact", contact: "contact",
  email: "email", "e-mail": "email", mail: "email", "email address": "email",
  phone: "phone", telefon: "phone", tel: "phone", mobile: "phone", handy: "phone", mobil: "phone", whatsapp: "phone",
  anlagebetrag: "amount", betrag: "amount", amount: "amount", investment: "amount", kapital: "amount", anlage: "amount", summe: "amount",
  laufzeit: "timeframe", timeframe: "timeframe", duration: "timeframe", dauer: "timeframe", zeitraum: "timeframe",
  prozent: "percentage", percent: "percentage", percentage: "percentage", zins: "percentage", zinssatz: "percentage", rate: "percentage", "%": "percentage",
  plz: "postal_code", postleitzahl: "postal_code", zip: "postal_code", postcode: "postal_code",
  stadt: "city", ort: "city", city: "city",
  "straße": "street", strasse: "street", street: "street", adresse: "street", address: "street",
};
const ALIAS_KEYS = Object.keys(KEY_ALIASES);
const NAME_FIELDS = new Set(["name", "first_name", "last_name"]);

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr.push(a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]));
    }
    prev = curr;
  }
  return prev[n];
}
function resolveKey(key: string): string | undefined {
  const k = key.toLowerCase().trim();
  if (KEY_ALIASES[k]) return k;
  for (const a of ALIAS_KEYS) {
    if (Math.abs(a.length - k.length) > 1) continue;
    if (levenshtein(a, k) <= 1) return a;
  }
  if (k.length >= 3 && k.length <= 10) {
    const sk = k.split("").sort().join("");
    for (const a of ALIAS_KEYS) {
      if (a.length !== k.length) continue;
      if (a.split("").sort().join("") === sk) return a;
    }
  }
  return undefined;
}

// ---------- Field cleaners ----------
export function repairEmail(raw: string): { email?: string; fixed: boolean } {
  let s = raw.trim().replace(/^[:=>\-\s]+/, "").replace(/[.,;]+$/, "");
  let fixed = false;
  if (/\s+@|@\s+/.test(s)) { s = s.replace(/\s*@\s*/g, "@"); fixed = true; }
  if (/@{2,}/.test(s)) { s = s.replace(/@+/g, "@"); fixed = true; }
  if (s.includes("@")) {
    const [lp, dp = ""] = s.split("@");
    const lp2 = lp.replace(/\s+/g, "");
    const dp2 = dp.replace(/\s+/g, "");
    if (lp2 !== lp || dp2 !== dp) { s = `${lp2}@${dp2}`; fixed = true; }
  }
  if (/,[a-z]{2,6}$/i.test(s)) { s = s.replace(/,(?=[a-z]{2,6}$)/i, "."); fixed = true; }
  if (!s.includes("@")) {
    const m = s.match(/^(\S+)\s+(\S+\.[a-z]{2,})$/i);
    if (m) { s = `${m[1]}@${m[2]}`; fixed = true; }
  }
  s = s.toLowerCase();
  if (EMAIL_LOOSE_RE.test(s)) return { email: s, fixed };
  return { email: undefined, fixed };
}

function parseAmount(raw: string): number | undefined {
  const wordy = parseGermanNumberWord(raw);
  if (wordy != null) return wordy;
  const cleaned = raw.replace(/[^\d.,-]/g, "");
  if (!cleaned) return undefined;
  let normalized: string;
  if (/^-?\d{1,3},\d{3}$/.test(cleaned)) {
    normalized = cleaned.replace(",", "");
  } else {
    normalized = cleaned.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  }
  // strip leading zeros that aren't decimals
  normalized = normalized.replace(/^0+(?=\d)/, "");
  const suffix = raw.match(/([kKmM])\s*€?\s*$/);
  let n = Number(normalized);
  if (!Number.isFinite(n)) return undefined;
  if (suffix) n *= suffix[1].toLowerCase() === "k" ? 1_000 : 1_000_000;
  return n;
}

const PERCENT_RE = /^(\d{1,3}(?:[.,]\d{1,3})?)\s*%$/;
function parsePercent(raw: string): number | undefined {
  const s = raw.trim().replace(/^[:=>\-\s]+/, "").replace(/[.,;]+$/, "");
  const cleaned = s.replace(/\s+/g, "");
  // Strip a trailing % if present.
  const withoutPct = cleaned.endsWith("%") ? cleaned.slice(0, -1) : cleaned;
  if (!/^\d{1,3}([.,]\d{1,3})?$/.test(withoutPct)) return undefined;
  const n = Number(withoutPct.replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 100) return undefined;
  return n;
}

function splitName(raw: string): { full_name: string; first_name?: string; last_name?: string } {
  let cleaned = raw.trim();
  while (SALUTATION_RE.test(cleaned)) cleaned = cleaned.replace(SALUTATION_RE, "");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  if (!cleaned) return { full_name: raw.trim() };
  const tokens = cleaned.split(/\s+/);
  if (tokens.length === 1) return { full_name: cleaned, first_name: tokens[0] };
  return { full_name: cleaned, first_name: tokens.slice(0, -1).join(" "), last_name: tokens[tokens.length - 1] };
}

// ---------- Classifier ----------
export type LineKind =
  | "email" | "phone" | "amount" | "timeframe" | "percentage" | "name"
  | "kv" | "separator" | "noise";

export interface Classified {
  raw: string;
  kind: LineKind;
  value: string;       // cleaned candidate value
  mapped?: string;     // for kv lines: resolved field name (or unknown key)
  knownKey?: boolean;  // for kv lines: true if alias resolved
  score: number;       // 0..1 confidence of the classification
}

function isPhoneLike(line: string): boolean {
  if (!PHONE_RE.test(line)) return false;
  const digits = line.replace(/\D/g, "");
  if (digits.length < 8) return false;
  return /^\+/.test(line) || /^00/.test(digits) || /^0/.test(digits) || digits.length >= 9;
}

function classifyKV(line: string): Classified | null {
  // explicit separator (":", "::", "=", "=>", "->", tab, 2+ spaces)
  let m = line.match(/^([A-Za-zÄÖÜäöüß ._-]{2,30})\s*(?:::+|:+|=+>?|->)\s*(.+)$/)
    || line.match(/^([A-Za-zÄÖÜäöüß ._-]{2,30})\t+(.+)$/)
    || line.match(/^([A-Za-zÄÖÜäöüß ._-]{2,30})\s{2,}(.+)$/);
  let bare = false;
  if (!m) {
    // bare key word + value, no separator (e.g. "Name Maria Hoffmann", "E-Mail x@y.de")
    m = line.match(/^([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß.\-]{2,19})[-_.:=]*\s+(.+)$/);
    bare = true;
  }
  if (!m) {
    // Key with no value at all (e.g. "PLZ-", "Stadt -", "Straße:")
    const empty = line.match(/^([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß.\-]{2,19})\s*[-–—_:.]+\s*$/);
    if (empty) {
      const rawKey = empty[1].trim().toLowerCase().replace(/[-_.\s]+$/, "");
      const resolved = resolveKey(rawKey);
      if (resolved) {
        return { raw: line, kind: "kv", mapped: KEY_ALIASES[resolved] ?? resolved, value: "", knownKey: true, score: 0.85 };
      }
    }
    return null;
  }
  const rawKey = m[1].trim().toLowerCase().replace(/[-_.\s]+$/, "");
  let value = m[2].trim().replace(/^[:=>\-\s]+/, "");
  // Treat dash-only or empty placeholder values as "field present, value blank".
  if (/^[-–—_]+$/.test(m[2].trim()) || value === "") value = "";
  const resolved = resolveKey(rawKey);
  if (resolved) {
    return { raw: line, kind: "kv", mapped: KEY_ALIASES[resolved] ?? resolved, value, knownKey: true, score: bare ? 0.8 : 0.95 };
  }
  // Unknown key — only treat as KV when explicit separator was used (avoid swallowing names like "Lukas Schneider").
  if (bare) return null;
  return { raw: line, kind: "kv", mapped: rawKey.replace(/\s+/g, "_"), value, knownKey: false, score: 0.6 };
}

export function classifyLine(raw: string): Classified {
  const line = raw.trim();
  if (!line) return { raw, kind: "noise", value: "", score: 1 };
  if (SEPARATOR_RE.test(line)) return { raw, kind: "separator", value: line, score: 1 };
  if (NOISE_RE.test(line)) return { raw, kind: "noise", value: line, score: 1 };

  const kv = classifyKV(line);
  if (kv) return kv;

  // email — even broken ones
  const em = line.match(EMAIL_LOOSE_RE);
  if (em && line.replace(em[0], "").trim().length === 0) {
    return { raw, kind: "email", value: em[0], score: 0.98 };
  }
  if (/@/.test(line) || /\S+\.[a-z]{2,}$/i.test(line)) {
    const { email } = repairEmail(line);
    if (email) return { raw, kind: "email", value: line, score: 0.9 };
  }

  if (TIMEFRAME_RE.test(line)) return { raw, kind: "timeframe", value: line, score: 0.95 };

  // Percentage — matches `8%`, `8,5 %`, `0.5%`. Must come BEFORE the amount branch.
  if (PERCENT_RE.test(line.replace(/\s+/g, ""))) {
    return { raw, kind: "percentage", value: line, score: 0.95 };
  }

  if (isPhoneLike(line)) return { raw, kind: "phone", value: line, score: 0.9 };

  if (AMOUNT_LOOSE_RE.test(line) && /\d/.test(line)) {
    const hasCurrency = /[€]|eur|euro|k|m/i.test(line);
    const hasSep = /[.,]/.test(line);
    const compactDigits = line.replace(/\D/g, "");
    if (hasCurrency) return { raw, kind: "amount", value: line, score: 0.95 };
    if (hasSep && compactDigits.length >= 3) return { raw, kind: "amount", value: line, score: 0.85 };
    if (!/\s/.test(line) && compactDigits.length >= 4 && compactDigits.length <= 9) {
      return { raw, kind: "amount", value: line, score: 0.7 };
    }
  }

  // pure bare number → ambiguous (amount vs timeframe). Defer to context in grouping.
  if (/^\d{1,4}$/.test(line)) {
    return { raw, kind: "amount", value: line, score: 0.4 };
  }

  // German worded amount?
  if (parseGermanNumberWord(line) !== undefined) {
    return { raw, kind: "amount", value: line, score: 0.85 };
  }

  const stripped = line.replace(SALUTATION_RE, "").trim();
  if (stripped && NAME_LOOSE_RE.test(stripped)) {
    // Accept lowercase/uppercase too; normalizeLead will Title-Case.
    const score = /[A-ZÄÖÜ]/.test(stripped[0]) ? 0.8 : (stripped === stripped.toUpperCase() ? 0.7 : 0.6);
    return { raw, kind: "name", value: stripped, score };
  }

  return { raw, kind: "noise", value: line, score: 0.2 };
}

// ---------- Structure detection ----------
export type Mode = "keyed" | "paragraph" | "anchor-email" | "anchor-name";

interface StructureScore { mode: Mode; score: number; }

function scoreStructures(rawLines: string[], classified: Classified[]): StructureScore[] {
  const nonBlank = classified.filter((c) => c.kind !== "noise" || c.raw.trim().length > 0);
  const total = nonBlank.length || 1;
  const kvKnown = classified.filter((c) => c.kind === "kv" && c.knownKey).length;
  const emails = classified.filter((c) => c.kind === "email").length;
  const names = classified.filter((c) => c.kind === "name").length;
  const phones = classified.filter((c) => c.kind === "phone").length;
  const amounts = classified.filter((c) => c.kind === "amount").length;

  // paragraph mode: split on blank lines and require each block to have at least 1 field signal
  let paragraphScore = 0;
  const blocks: Classified[][] = [];
  let cur: Classified[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) {
      if (cur.length) blocks.push(cur);
      cur = [];
    } else {
      cur.push(classified[i]);
    }
  }
  if (cur.length) blocks.push(cur);
  if (blocks.length >= 2) {
    const meaningful = blocks.filter((b) =>
      b.some((c) => c.kind === "name" || c.kind === "email" || (c.kind === "kv" && c.knownKey && NAME_FIELDS.has(c.mapped!)))
    );
    paragraphScore = meaningful.length / blocks.length;
  }

  const keyedScore = kvKnown / total;
  const anchorEmailScore = emails > 0 ? Math.min(emails, Math.max(names, phones, amounts, 1)) / Math.max(emails, names, phones, amounts) : 0;
  const anchorNameScore = names > 0 ? Math.min(names, Math.max(emails, phones, amounts, 1)) / Math.max(emails, names, phones, amounts) : 0;

  return [
    { mode: "keyed", score: keyedScore },
    { mode: "paragraph", score: paragraphScore },
    { mode: "anchor-email", score: anchorEmailScore * (emails >= 2 ? 1 : 0.5) },
    { mode: "anchor-name", score: anchorNameScore * (names >= 2 ? 1 : 0.5) },
  ];
}

// ---------- Grouping ----------
function groupKeyed(rawLines: string[], cls: Classified[]): Classified[][] {
  const groups: Classified[][] = [];
  let cur: Classified[] = [];
  const filled = new Set<string>();
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue;
    const c = cls[i];
    if (c.kind === "separator") {
      if (cur.length) { groups.push(cur); cur = []; filled.clear(); }
      continue;
    }
    const isNameKv = c.kind === "kv" && c.knownKey && NAME_FIELDS.has(c.mapped!);
    // Split only when the same name field is filled again (e.g. two "Vorname" lines = two leads).
    // A first_name followed by a last_name should stay in one lead.
    if (isNameKv && filled.has(c.mapped!)) {
      groups.push(cur); cur = []; filled.clear();
    }
    cur.push(c);
    if (isNameKv) filled.add(c.mapped!);
    if (c.kind === "name") filled.add("name");
  }
  if (cur.length) groups.push(cur);
  return groups;
}

function groupParagraph(rawLines: string[], cls: Classified[]): Classified[][] {
  const groups: Classified[][] = [];
  let cur: Classified[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) {
      if (cur.length) { groups.push(cur); cur = []; }
      continue;
    }
    const c = cls[i];
    if (c.kind === "separator") {
      if (cur.length) { groups.push(cur); cur = []; }
      continue;
    }
    cur.push(c);
  }
  if (cur.length) groups.push(cur);
  return groups;
}

function groupByAnchor(rawLines: string[], cls: Classified[], anchorKind: "email" | "name"): Classified[][] {
  const groups: Classified[][] = [];
  let cur: Classified[] = [];
  let started = false;
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue;
    const c = cls[i];
    if (c.kind === "separator") {
      if (cur.length) { groups.push(cur); cur = []; started = false; }
      continue;
    }
    if (c.kind === anchorKind) {
      if (started) { groups.push(cur); cur = []; }
      started = true;
    }
    cur.push(c);
  }
  if (cur.length) groups.push(cur);
  return groups;
}

function groupLines(rawLines: string[], cls: Classified[], mode: Mode): Classified[][] {
  switch (mode) {
    case "keyed": return groupKeyed(rawLines, cls);
    case "paragraph": return groupParagraph(rawLines, cls);
    case "anchor-email": return groupByAnchor(rawLines, cls, "email");
    case "anchor-name": return groupByAnchor(rawLines, cls, "name");
  }
}

// ---------- Lead assembly ----------
export interface ParsedLead {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  amount?: number;
  percentage?: number;
  timeframe?: string;
  payload: Record<string, string>;
  _fixes?: string[];
}

function applyKv(lead: ParsedLead, mapped: string, value: string) {
  if (!value) return; // skip blank/placeholder values (e.g. "PLZ -")
  switch (mapped) {
    case "name": {
      if (lead.full_name) { (lead.payload.name_alt ??= value); return; }
      const n = splitName(value);
      lead.full_name = n.full_name;
      if (n.first_name) lead.first_name = n.first_name;
      if (n.last_name) lead.last_name = n.last_name;
      return;
    }
    case "first_name":
      if (!lead.first_name) lead.first_name = value; return;
    case "last_name":
      if (!lead.last_name) lead.last_name = value; return;
    case "contact": {
      const expanded = value.replace(/(\S+@\S+\.[a-z]{2,})\s+(?=[+\d])/gi, "$1|");
      for (const tok of expanded.split(/\|+|;+|\s{2,}/)) {
        const t = tok.trim().replace(/[.,;]+$/, "");
        if (!t) continue;
        if ((t.includes("@") || /\s+\S+\.[a-z]{2,}$/i.test(t)) && !lead.email) {
          const { email, fixed } = repairEmail(t);
          if (email) {
            lead.email = email;
            if (fixed) (lead._fixes ??= []).push(`email auto-repaired: "${t}" → ${email}`);
          }
          continue;
        }
        if (isPhoneLike(t) && !lead.phone) lead.phone = t.replace(/\s+/g, "");
      }
      return;
    }
    case "email": {
      if (lead.email) return;
      const { email, fixed } = repairEmail(value);
      if (email) {
        lead.email = email;
        if (fixed) (lead._fixes ??= []).push(`email auto-repaired: "${value}" → ${email}`);
      } else (lead._fixes ??= []).push(`could not parse email: "${value}"`);
      return;
    }
    case "phone":
      if (!lead.phone) lead.phone = value.replace(/^[:=>\-\s]+/, "").replace(/[.,;]+$/, "").replace(/\s+/g, "");
      return;
    case "amount": {
      if (lead.amount !== undefined) { lead.payload.amount_alt = value; return; }
      const n = parseAmount(value);
      if (n !== undefined) lead.amount = n;
      lead.payload.amount_raw = value;
      return;
    }
    case "timeframe":
      if (!lead.timeframe) lead.timeframe = value.replace(/^[:=>\-\s]+/, "").trim();
      return;
    case "percentage": {
      if (lead.percentage !== undefined) return;
      const p = parsePercent(value);
      if (p !== undefined) lead.percentage = p;
      return;
    }
    default:
      // unknown key — preserve in payload (self-learning: caller sees these and can promote)
      lead.payload[mapped] = value;
      return;
  }
}

function assembleLead(group: Classified[]): ParsedLead {
  const lead: ParsedLead = { payload: {} };
  // Pass A: explicit KV first (highest signal)
  for (const c of group) {
    if (c.kind === "kv") applyKv(lead, c.mapped!, c.value);
  }
  // Pass B: bare fields fill remaining slots
  for (const c of group) {
    if (c.kind === "kv") continue;
    switch (c.kind) {
      case "email":
        if (!lead.email) {
          const { email, fixed } = repairEmail(c.value);
          if (email) {
            lead.email = email;
            if (fixed) (lead._fixes ??= []).push(`email auto-repaired: "${c.value}" → ${email}`);
          } else (lead._fixes ??= []).push(`could not parse email: "${c.value}"`);
        }
        break;
      case "phone":
        if (!lead.phone) lead.phone = c.value.replace(/\s+/g, "");
        break;
      case "amount": {
        // Ambiguity: a bare 1–4 digit number with no separator/currency.
        // If amount already set and timeframe missing → it's a timeframe.
        const isBareSmall = /^\d{1,4}$/.test(c.value.replace(/\s+/g, ""));
        if (isBareSmall && lead.amount !== undefined && !lead.timeframe) {
          lead.timeframe = `${c.value.trim()} months`;
        } else if (isBareSmall && lead.amount === undefined && !lead.timeframe) {
          // No amount yet — treat large-ish bare number as amount, tiny as timeframe.
          const n = Number(c.value.replace(/\s+/g, ""));
          if (n >= 1000) lead.amount = n;
          else lead.timeframe = `${n} months`;
        } else if (lead.amount === undefined) {
          const n = parseAmount(c.value);
          if (n !== undefined) lead.amount = n;
          lead.payload.amount_raw = c.value;
        }
        break;
      }
      case "timeframe":
        if (!lead.timeframe) lead.timeframe = c.value;
        break;
      case "percentage": {
        if (lead.percentage === undefined) {
          const p = parsePercent(c.value);
          if (p !== undefined) lead.percentage = p;
        }
        break;
      }
      case "name":
        if (!lead.full_name) {
          const n = splitName(c.value);
          lead.full_name = n.full_name;
          if (n.first_name) lead.first_name = n.first_name;
          if (n.last_name) lead.last_name = n.last_name;
        } else {
          (lead.payload.name_alt ??= c.value);
        }
        break;
      case "noise":
        if (c.value && c.value.length < 200) {
          const k = `note_${Object.keys(lead.payload).filter((x) => x.startsWith("note_")).length + 1}`;
          lead.payload[k] = c.value;
        }
        break;
    }
  }
  return lead;
}

function isComplete(lead: ParsedLead): boolean {
  return !!(lead.full_name || lead.email || lead.phone);
}

function scoreResult(leads: ParsedLead[]): number {
  if (!leads.length) return 0;
  let score = 0;
  for (const l of leads) {
    if (l.full_name) score += 1;
    if (l.email) score += 1;
    if (l.phone) score += 1;
    if (l.amount !== undefined) score += 0.5;
    if (l.timeframe) score += 0.5;
  }
  return score / leads.length;
}

// Re-import here to keep one top-level surface
import { normalizeLead } from "./normalizeLead";

export interface ParseDetail {
  leads: ParsedLead[];
  mode: Mode | "none";
  confidence: number;
  warnings: string[];
}

export function parseLeadBlocksDetailed(text: string): ParseDetail {
  const normalized = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return { leads: [], mode: "none", confidence: 0, warnings: [] };

  // Strip line-level prefixes (bullets, numbered list markers) before classifying.
  const rawLines = normalized.split(/\n/).map((l) => {
    const t = l.replace(/^[-*•·]\s+/, "").replace(NUM_PREFIX_RE, "");
    return t;
  });
  const cls = rawLines.map((l) => classifyLine(l));

  // Phone-only fast path: paste of bare phone numbers (one per line), no names/emails/kv.
  // Each phone becomes its own lead so you can dump a number list into a folder.
  const meaningful = cls.filter((c) => c.kind !== "noise" && c.kind !== "separator");
  if (meaningful.length > 0 && meaningful.every((c) => c.kind === "phone")) {
    const phoneLeads = meaningful.map<ParsedLead>((c) => ({
      phone: c.value.replace(/\s+/g, ""),
      payload: {},
    }));
    const finalPhoneLeads = phoneLeads.map((l) => {
      const { lead, fixes } = normalizeLead(l);
      lead._fixes = fixes;
      return lead;
    });
    return { leads: finalPhoneLeads, mode: "paragraph", confidence: 0.9, warnings: [] };
  }

  const scores = scoreStructures(rawLines, cls).sort((a, b) => b.score - a.score);
  const warnings: string[] = [];

  // Try each viable mode and pick the result with most complete leads
  const candidates = scores.filter((s) => s.score > 0.2).slice(0, 3);
  if (candidates.length === 0) candidates.push({ mode: "paragraph", score: 0.1 });

  let best: { mode: Mode; leads: ParsedLead[]; quality: number } | null = null;
  for (const cand of candidates) {
    const groups = groupLines(rawLines, cls, cand.mode);
    const leads = groups.map(assembleLead).filter(isComplete);
    const quality = scoreResult(leads) * Math.log(1 + leads.length);
    if (!best || quality > best.quality) best = { mode: cand.mode, leads, quality };
  }

  if (!best) return { leads: [], mode: "none", confidence: 0, warnings: ["could not detect structure"] };

  // Self-learning: collect unknown KV keys that recur across leads, surface as warning.
  const unknownKeys = new Map<string, number>();
  for (const l of best.leads) {
    for (const k of Object.keys(l.payload)) {
      if (k === "amount_raw" || k.startsWith("note_") || k === "amount_alt" || k === "name_alt") continue;
      unknownKeys.set(k, (unknownKeys.get(k) ?? 0) + 1);
    }
  }
  for (const [k, n] of unknownKeys) {
    if (n >= 2) warnings.push(`saw unknown field "${k}" in ${n} leads (kept in payload)`);
  }

  const finalLeads = best.leads.map((l) => {
    const fixesBefore = l._fixes ?? [];
    const { lead, fixes } = normalizeLead(l);
    lead._fixes = [...fixesBefore, ...fixes];
    return lead;
  });

  const topScore = scores[0]?.score ?? 0;
  return { leads: finalLeads, mode: best.mode, confidence: topScore, warnings };
}

export function parseLeadBlocks(text: string): ParsedLead[] {
  return parseLeadBlocksDetailed(text).leads;
}
