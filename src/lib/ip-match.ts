// Pure IP matching helpers — safe to import from client and server code.

function ipToLong(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

/** Supports exact match, CIDR (1.2.3.0/24) and wildcard (1.2.3.*). */
export function ipMatches(ip: string, rule: string): boolean {
  const r = rule.trim();
  if (!r) return false;
  if (r === ip) return true;
  if (r.includes("/")) {
    const [base, bitsRaw] = r.split("/");
    const bits = Number(bitsRaw);
    const a = ipToLong(ip);
    const b = ipToLong(base ?? "");
    if (a === null || b === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    if (bits === 0) return true;
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    return ((a & mask) >>> 0) === ((b & mask) >>> 0);
  }
  if (r.includes("*")) {
    const re = new RegExp(
      "^" +
        r
          .split(".")
          .map((s) => (s === "*" ? "\\d{1,3}" : s.replace(/[^\d]/g, "")))
          .join("\\.") +
        "$",
    );
    return re.test(ip);
  }
  return false;
}
