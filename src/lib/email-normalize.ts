// Email normalization used by duplicate detection on import.
//
// normalizeEmail  → cleaned, lowercased address ("  John.Doe@Gmail.com " → "john.doe@gmail.com")
// emailKey        → canonical identity key used for matching:
//                     * lowercased
//                     * "+tag" removed from the local part (all providers)
//                     * dots removed from the local part for Gmail/Googlemail
//                     * googlemail.com treated as gmail.com
// emailVariants   → the different literal spellings we should look up in the DB
//                   so an existing row stored in another spelling is still found.

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

export function normalizeEmail(input: string | null | undefined): string | null {
  let e = (input ?? "").trim().toLowerCase();
  if (!e) return null;
  // strip mailto:, angle brackets, wrapping quotes and stray whitespace/commas
  e = e.replace(/^mailto:/, "").replace(/^[<"'\s]+|[>"'\s,;]+$/g, "");
  // "Name <a@b.com>" style
  const m = e.match(/<([^>]+)>/);
  if (m?.[1]) e = m[1].trim();
  e = e.replace(/\s+/g, "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return null;
  return e;
}

export function emailKey(input: string | null | undefined): string | null {
  const e = normalizeEmail(input);
  if (!e) return null;
  const at = e.lastIndexOf("@");
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (GMAIL_DOMAINS.has(domain)) {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }
  if (!local) return null;
  return `${local}@${domain}`;
}

/** Literal spellings to search for in the database for a given input email. */
export function emailVariants(input: string | null | undefined): string[] {
  const out = new Set<string>();
  const e = normalizeEmail(input);
  if (e) out.add(e);
  const k = emailKey(input);
  if (k) {
    out.add(k);
    const at = k.lastIndexOf("@");
    const local = k.slice(0, at);
    const domain = k.slice(at + 1);
    if (domain === "gmail.com") out.add(`${local}@googlemail.com`);
  }
  return [...out];
}
