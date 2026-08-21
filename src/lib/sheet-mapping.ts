// Shared (client-safe) helpers to turn a sheet/CSV table into lead rows.
// Used by the import dialog preview and by the server-side auto-sync worker so
// both produce byte-identical lead rows.
import Papa from "papaparse";
import { emailKey, normalizeEmail } from "@/lib/email-normalize";
import { parseAmountNumber } from "@/lib/amount-value";

export const SHEET_TARGET_FIELDS = [
  "first_name", "last_name", "full_name", "email", "phone", "amount", "timeframe",
  "agent", "comment", "country", "date", "source", "funnel", "platform",
  "description_1", "description_2", "description_3", "description_4",
] as const;

export type SheetTargetKey = (typeof SHEET_TARGET_FIELDS)[number];
export const SHEET_NONE = "__none__";
export const SHEET_COUNTRY_OVERRIDE_KEY = "__country_override";
export type SheetMapping = Record<string, SheetTargetKey | typeof SHEET_NONE>;

export function getSheetCountryOverride(mapping: unknown): string {
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) return "";
  const value = (mapping as Record<string, unknown>)[SHEET_COUNTRY_OVERRIDE_KEY];
  return typeof value === "string" ? value.trim() : "";
}

export function autoMapHeader(header: string): SheetTargetKey | null {
  const h = header.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!h) return null;
  const has = (...needles: string[]) => needles.some((n) => h === n || h.includes(n));
  if (has("first_name", "firstname", "fname", "given_name", "vorname", "prenom")) return "first_name";
  if (has("last_name", "lastname", "lname", "surname", "family_name", "nachname", "cognome")) return "last_name";
  if (has("full_name", "fullname") || h === "name" || h === "nome") return "full_name";
  if (has("email", "e_mail", "mail")) return "email";
  if (has("phone", "telephone", "mobile", "cell", "telefon", "tel", "handy", "numero")) return "phone";
  if (has("amount", "value", "deposit", "budget", "anlagebetrag", "betrag", "importo", "capital")) return "amount";
  if (has("timeframe", "duration", "horizon", "laufzeit", "durata")) return "timeframe";
  if (has("agent", "agente", "assigned_to", "owner", "berater", "consulente")) return "agent";
  if (has("comment", "note", "kommentar", "bemerkung", "nota", "message", "remark")) return "comment";
  if (has("country", "land", "paese", "nation", "pays")) return "country";
  if (has("date", "created_at", "datum", "data", "lieferdatum", "timestamp")) return "date";
  if (has("source", "quelle", "origine", "fonte", "channel", "kanal", "lead_source", "leadsource", "campaign", "list")) return "source";
  if (has("funnel", "trichter", "imbuto", "funnel_name", "entonnoir")) return "funnel";
  if (has("platform", "plattform", "piattaforma", "plateforme", "list", "liste")) return "platform";
  if (has("description_1", "description1", "desc_1", "desc1")) return "description_1";
  if (has("description_2", "description2", "desc_2", "desc2")) return "description_2";
  if (has("description_3", "description3", "desc_3", "desc3")) return "description_3";
  if (has("description_4", "description4", "desc_4", "desc4")) return "description_4";
  if (has("description", "desc", "beschreibung", "descrizione", "info", "details", "notes")) return "description_1";
  return null;
}

/** Auto-mapping identical to the import dialog: known headers first, leftovers into description slots. */
export function autoMapTable(headers: string[], existing?: SheetMapping): SheetMapping {
  const map: SheetMapping = {};
  const used = new Set<SheetTargetKey>();
  for (const h of headers) {
    const keep = existing?.[h];
    const guess = keep && keep !== SHEET_NONE ? keep : autoMapHeader(h);
    if (guess && !used.has(guess)) { map[h] = guess; used.add(guess); }
    else map[h] = SHEET_NONE;
  }
  const slots: SheetTargetKey[] = ["description_1", "description_2", "description_3", "description_4"];
  for (const h of headers) {
    if (map[h] !== SHEET_NONE || !h.trim()) continue;
    const slot = slots.find((s) => !used.has(s));
    if (!slot) break;
    map[h] = slot;
    used.add(slot);
  }
  return map;
}

export function parseSheetCsv(csv: string): { headers: string[]; rows: Record<string, string>[] } {
  const parsed = Papa.parse<string[]>(csv, { skipEmptyLines: "greedy" });
  const matrix = parsed.data ?? [];
  if (matrix.length === 0) return { headers: [], rows: [] };
  const rawHeaders = (matrix[0] ?? []).map((v) => String(v ?? "").replace(/^\uFEFF/, "").trim());
  let width = rawHeaders.length;
  while (width > 0 && !rawHeaders[width - 1]) width--;
  const used = new Map<string, number>();
  const headers = rawHeaders.slice(0, width).map((v, i) => {
    const base = v || `column_${i + 1}`;
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
  const rows = matrix.slice(1).map((values) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = String(values?.[i] ?? ""); });
    return row;
  }).filter((r) => Object.values(r).some((v) => v.trim() !== ""));
  return { headers, rows };
}

function parseDateValue(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 20000 && n < 90000) {
      const d = new Date(Math.round((n - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m) {
    let yy = m[3];
    if (yy.length === 2) yy = (Number(yy) > 50 ? "19" : "20") + yy;
    const d = new Date(`${yy}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T${(m[4] ?? "00").padStart(2, "0")}:${m[5] ?? "00"}:00`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export type BuiltSheetRow = {
  insert: Record<string, unknown>;
  comment?: string;
  agentName?: string;
  /** Stable identity of the sheet row (email → phone → row position). */
  rowKey: string;
  /** Changes whenever any mapped cell in the row changes. */
  contentHash: string;
};

function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function buildSheetRows(rows: Record<string, string>[], mapping: SheetMapping): BuiltSheetRow[] {
  const out: BuiltSheetRow[] = [];
  rows.forEach((r, index) => {
    const fields: Partial<Record<SheetTargetKey, string>> = {};
    const extras: Record<string, string> = {};
    for (const [src, val] of Object.entries(r)) {
      const raw = (val ?? "").trim();
      if (!raw) continue;
      const tgt = mapping[src];
      if (!tgt || tgt === SHEET_NONE) extras[src] = raw;
      else fields[tgt] = raw;
    }
    if (Object.keys(fields).length === 0 && Object.keys(extras).length === 0) return;

    const payload: Record<string, unknown> = {};
    if (fields.country) payload.country = fields.country;
    if (fields.funnel) payload.funnel = fields.funnel;
    if (fields.amount) payload.amount_raw = fields.amount;
    if (fields.date) payload.date_raw = fields.date;
    if (Object.keys(extras).length) payload.extra = extras;

    const fullName = fields.full_name?.trim()
      || [fields.first_name, fields.last_name].filter(Boolean).join(" ").trim()
      || fields.email?.trim() || fields.phone?.trim() || fields.agent?.trim() || "Imported lead";

    const insert: Record<string, unknown> = { full_name: fullName, payload };
    if (fields.first_name) insert.first_name = fields.first_name;
    if (fields.last_name) insert.last_name = fields.last_name;
    if (fields.email) insert.email = normalizeEmail(fields.email) ?? fields.email;
    if (fields.phone) insert.phone = fields.phone;
    if (fields.timeframe) insert.timeframe = fields.timeframe;
    if (fields.agent) insert.origin_agent_name = fields.agent;
    if (fields.amount) {
      const n = parseAmountNumber(fields.amount);
      if (n !== undefined) insert.amount = n;
    }
    if (fields.source) { insert.source = fields.source; insert.platform = fields.source; }
    if (fields.platform) insert.platform = fields.platform;
    if (fields.description_1) insert.description_1 = fields.description_1;
    if (fields.description_2) insert.description_2 = fields.description_2;
    if (fields.description_3) insert.description_3 = fields.description_3;
    if (fields.description_4) insert.description_4 = fields.description_4;
    if (fields.date) {
      const iso = parseDateValue(fields.date);
      if (iso) insert.created_at = iso;
    }

    const ek = emailKey(fields.email);
    const digits = (fields.phone ?? "").replace(/\D/g, "");
    const rowKey = ek ? `e:${ek}` : digits.length >= 7 ? `p:${digits.slice(-9)}` : `i:${index}`;
    const contentHash = hash(JSON.stringify(Object.entries(r).sort(([a], [b]) => a.localeCompare(b))));

    out.push({ insert, comment: fields.comment, agentName: fields.agent, rowKey, contentHash });
  });
  return out;
}
