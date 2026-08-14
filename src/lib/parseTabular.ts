import type { ParsedLead } from "./parseLeadText";
import { normalizeLead } from "./normalizeLead";

export function parseDelimited(text: string, delimiter?: string): string[][] {
  const src = (text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!src.trim()) return [];
  const delim = delimiter ?? detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === delim) { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function detectDelimiter(src: string): string {
  const firstLine = src.split("\n").find((l) => l.trim()) ?? "";
  const counts: Record<string, number> = {
    ",": (firstLine.match(/,/g) ?? []).length,
    "\t": (firstLine.match(/\t/g) ?? []).length,
    ";": (firstLine.match(/;/g) ?? []).length,
    "|": (firstLine.match(/\|/g) ?? []).length,
  };
  let best = ","; let max = 0;
  for (const [d, n] of Object.entries(counts)) if (n > max) { max = n; best = d; }
  return best;
}

export type Field = "first_name" | "last_name" | "full_name" | "email" | "phone" | "amount" | "percentage" | "timeframe";

const HEADER_ALIASES: Record<Field, string[]> = {
  first_name: ["first", "firstname", "first name", "vorname", "given", "given name", "prenom"],
  last_name: ["last", "lastname", "last name", "surname", "nachname", "familienname", "family name", "nom"],
  full_name: ["name", "full name", "fullname", "kunde", "customer", "client", "lead", "contact name"],
  email: ["email", "e-mail", "mail", "e mail", "email address", "emailaddress", "courriel"],
  phone: ["phone", "telephone", "tel", "mobile", "handy", "telefon", "phone number", "cell", "whatsapp", "mobil", "rufnummer"],
  amount: ["amount", "anlagebetrag", "betrag", "investment", "value", "sum", "kapital", "money", "summe", "anlage", "investment amount"],
  percentage: ["percentage", "percent", "prozent", "zinssatz", "zins", "rate", "%"],
  timeframe: ["timeframe", "duration", "laufzeit", "period", "term", "horizon", "dauer", "zeitraum"],
};

const DISQUALIFIERS = ["id", "nr", "nummer", "number", "code", "ref", "uuid", "guid"];
const FIELD_PRIORITY: Record<Field, number> = {
  email: 8, phone: 7, full_name: 6, first_name: 5, last_name: 4, amount: 3, percentage: 2, timeframe: 1,
};

function normHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[_\-]+/g, " ").replace(/\s+/g, " ");
}

function scoreHeader(normalized: string, alias: string, hasDisqualifier: boolean): number {
  if (normalized === alias) return 100;
  const wordRe = new RegExp(`(^|\\s)${alias.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}(\\s|$)`);
  if (wordRe.test(normalized)) return 50;
  if (!hasDisqualifier && normalized.includes(alias)) return 10;
  return 0;
}

export function autoMapHeaders(headers: string[]): Record<number, Field | "ignore"> {
  const map: Record<number, Field | "ignore"> = {};
  const used = new Set<Field>();
  type Candidate = { col: number; field: Field; score: number };
  const candidates: Candidate[] = [];
  headers.forEach((h, i) => {
    const n = normHeader(h);
    const hasDisq = DISQUALIFIERS.some((d) => new RegExp(`(^|\\s)${d}(\\s|$)`).test(n));
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [Field, string[]][]) {
      let best = 0;
      for (const a of aliases) best = Math.max(best, scoreHeader(n, a, hasDisq));
      if (best > 0) candidates.push({ col: i, field, score: best });
    }
  });
  candidates.sort((a, b) =>
    b.score - a.score || FIELD_PRIORITY[b.field] - FIELD_PRIORITY[a.field] || a.col - b.col,
  );
  for (const c of candidates) {
    if (used.has(c.field)) continue;
    if (map[c.col] !== undefined) continue;
    map[c.col] = c.field;
    used.add(c.field);
  }
  headers.forEach((_, i) => { if (map[i] === undefined) map[i] = "ignore"; });
  return map;
}

export function looksLikeHeaderRow(firstRow: string[]): boolean {
  if (!firstRow || firstRow.length === 0) return false;
  let aliasHits = 0;
  let dataShaped = 0;
  for (const cell of firstRow) {
    const c = cleanCell((cell ?? "").toString());
    if (!c) continue;
    const n = normHeader(c);
    for (const aliases of Object.values(HEADER_ALIASES)) {
      if (aliases.some((a) => n === a || normHeader(a) === n)) { aliasHits++; break; }
    }
    if (c.includes("@")) dataShaped++;
    else if (/^[\d.,\s€$£-]+$/.test(c) && /\d/.test(c)) dataShaped++;
    else if (/^[A-Z]{2}$/.test(c.trim())) dataShaped++;
  }
  return aliasHits > 0 && dataShaped === 0;
}

export function inferMappingFromRows(rows: string[][]): {
  headers: string[];
  mapping: Record<number, Field | "ignore">;
} {
  const cols = Math.max(0, ...rows.map((r) => r.length));
  const headers: string[] = [];
  const mapping: Record<number, Field | "ignore"> = {};
  const used = new Set<Field>();

  for (let i = 0; i < cols; i++) {
    const samples = rows.slice(0, 20).map((r) => cleanCell((r[i] ?? "").toString())).filter(Boolean);
    let field: Field | "ignore" = "ignore";
    let label = `column_${i + 1}`;
    if (samples.length === 0) { headers.push(label); mapping[i] = "ignore"; continue; }

    const allEmail = samples.every((s) => s.includes("@"));
    const allPhone = samples.every((s) => PHONE_LIKE_RE.test(s) || s.replace(/[^\d]/g, "").length >= 7);
    const allAmount = samples.every((s) => /^[\d.,\s€$£-]+$/.test(s) && /\d/.test(s));
    const allCountry = samples.every((s) => /^[A-Z]{2}$/.test(s.trim()));
    const allName = samples.every((s) => looksLikeName(s));

    if (allEmail && !used.has("email")) { field = "email"; label = "email"; }
    else if (allPhone && !used.has("phone")) { field = "phone"; label = "phone"; }
    else if (allAmount && !used.has("amount")) { field = "amount"; label = "amount"; }
    else if (allCountry) { field = "ignore"; label = "country"; }
    else if (allName && !used.has("full_name")) { field = "full_name"; label = "name"; }

    if (field !== "ignore") used.add(field);
    headers.push(label);
    mapping[i] = field;
  }
  return { headers, mapping };
}

function parseAmount(raw: string): number | undefined {
  const cleaned = raw.replace(/[^\d.,-]/g, "");
  if (!cleaned) return undefined;
  const n = cleaned.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const num = Number(n);
  return Number.isFinite(num) ? num : undefined;
}

const SALUTATION_RE = /^(?:herr|frau|hr\.?|fr\.?|mr\.?|mrs\.?|ms\.?|dr\.?)\s+/i;

function splitName(raw: string): { full_name: string; first_name?: string; last_name?: string } {
  let cleaned = raw.trim();
  while (SALUTATION_RE.test(cleaned)) cleaned = cleaned.replace(SALUTATION_RE, "");
  cleaned = cleaned.trim();
  if (!cleaned) return { full_name: raw.trim() };
  const tokens = cleaned.split(/\s+/);
  if (tokens.length === 1) return { full_name: cleaned, first_name: tokens[0] };
  return { full_name: cleaned, first_name: tokens.slice(0, -1).join(" "), last_name: tokens[tokens.length - 1] };
}

const HAS_LETTER_RE = /\p{L}/u;
const PHONE_LIKE_RE = /^[+\d][\d\s\-()/]{4,}$/;
function looksLikeName(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (!HAS_LETTER_RE.test(t)) return false;
  if (PHONE_LIKE_RE.test(t)) return false;
  return true;
}

function cleanCell(s: string): string {
  return s.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, " ").trim();
}

export function rowsToLeads(
  rows: string[][],
  mapping: Record<number, Field | "ignore">,
  headers: string[],
): ParsedLead[] {
  const out: ParsedLead[] = [];
  for (const row of rows) {
    const lead: ParsedLead = { payload: {} };
    let recognized = 0;
    row.forEach((cellRaw, i) => {
      const cell = cleanCell((cellRaw ?? "").toString());
      if (!cell) return;
      const target = mapping[i];
      if (!target || target === "ignore") {
        const h = headers[i]?.trim();
        if (h) lead.payload[h] = cell;
        return;
      }
      switch (target) {
        case "full_name": {
          if (!looksLikeName(cell)) { const h = headers[i]?.trim(); if (h) lead.payload[h] = cell; break; }
          const n = splitName(cell);
          lead.full_name = n.full_name;
          if (n.first_name && !lead.first_name) lead.first_name = n.first_name;
          if (n.last_name && !lead.last_name) lead.last_name = n.last_name;
          recognized++; break;
        }
        case "first_name": {
          if (!looksLikeName(cell)) { const h = headers[i]?.trim(); if (h) lead.payload[h] = cell; break; }
          lead.first_name = cell; recognized++; break;
        }
        case "last_name": {
          if (!looksLikeName(cell)) { const h = headers[i]?.trim(); if (h) lead.payload[h] = cell; break; }
          lead.last_name = cell; recognized++; break;
        }
        case "email": {
          if (!cell.includes("@")) { const h = headers[i]?.trim(); if (h) lead.payload[h] = cell; break; }
          lead.email = cell.toLowerCase(); recognized++; break;
        }
        case "phone": {
          const digits = cell.replace(/[^\d]/g, "");
          if (digits.length < 5 || cell.includes("@")) { const h = headers[i]?.trim(); if (h) lead.payload[h] = cell; break; }
          lead.phone = (cell.trim().startsWith("+") ? "+" : "") + digits;
          recognized++; break;
        }
        case "amount": {
          if (cell.includes("@") || PHONE_LIKE_RE.test(cell.trim())) { const h = headers[i]?.trim(); if (h) lead.payload[h] = cell; break; }
          const n = parseAmount(cell);
          if (n !== undefined) lead.amount = n;
          lead.payload.amount_raw = cell;
          recognized++; break;
        }
        case "percentage": {
          const stripped = cell.replace("%", "").trim().replace(",", ".");
          const n = Number(stripped);
          if (Number.isFinite(n) && n >= 0 && n <= 100) {
            lead.percentage = n;
            recognized++;
          } else {
            const h = headers[i]?.trim(); if (h) lead.payload[h] = cell;
          }
          break;
        }
        case "timeframe": lead.timeframe = cell; recognized++; break;
      }
    });
    if (!lead.full_name && (lead.first_name || lead.last_name)) {
      lead.full_name = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
    }
    if (recognized === 0) continue;
    if (!lead.full_name && !lead.email && !lead.phone) continue;
    const { lead: norm, fixes } = normalizeLead(lead);
    norm._fixes = fixes;
    out.push(norm);
  }
  return out;
}

export function googleSheetCsvUrl(input: string): string | null {
  const m = input.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) return null;
  const id = m[1];
  const gidMatch = input.match(/[?#&]gid=(\d+)/);
  const gid = gidMatch?.[1] ?? "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}
