// Server-side IP whitelist enforcement.
// Runs for every request (SSR pages, server functions, server routes) so the
// block cannot be bypassed by disabling JavaScript or calling APIs directly.
import { ipMatches } from "./ip-match";
import { isPreviewHost } from "./subdomain-tenancy";

export function requestClientIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for") ?? "";
  return (
    fwd.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    null
  );
}

let cache: { rules: string[]; at: number } | null = null;
const TTL_MS = 3_000;

export async function activeIpRules(): Promise<string[] | null> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.rules;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("ip_whitelist")
      .select("ip_address, status")
      .eq("status", "active");
    if (error) { console.error("[ip-guard] rules query failed", error.message); return null; }
    const rules = (data ?? []).map((r) => r.ip_address).filter(Boolean) as string[];
    cache = { rules, at: now };
    return rules;
  } catch {
    return null;
  }
}

/** Clears the cached rules so whitelist edits take effect immediately. */
export function invalidateIpRuleCache() {
  cache = null;
}

export type IpDecision = { allowed: boolean; ip: string | null; enforced: boolean };

export async function evaluateIp(request: Request): Promise<IpDecision> {
  const ip = requestClientIp(request);
  const rules = await activeIpRules();
  if (rules === null) return { allowed: true, ip, enforced: false };
  if (rules.length === 0) return { allowed: true, ip, enforced: false };
  if (!ip) return { allowed: false, ip, enforced: true };
  return { allowed: rules.some((r) => ipMatches(ip, r)), ip, enforced: true };
}

/** Requests that must never be blocked by the whitelist. */
export function isGuardExempt(request: Request): boolean {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  if (isPreviewHost(host)) return true;
  // Public ingest/webhook endpoints are authenticated by API key, not by IP.
  if (url.pathname.startsWith("/api/public/")) return true;
  return false;
}

export function blockedResponse(ip: string | null): Response {
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Access blocked</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0f17;color:#e6e8ee;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.b{max-width:28rem;text-align:center;padding:2rem}h1{font-size:1.25rem;margin:0 0 .75rem}p{color:#98a2b3;font-size:.9rem;line-height:1.5;margin:0}
code{display:inline-block;margin-top:1rem;font-family:ui-monospace,monospace;color:#e6e8ee}</style></head>
<body><div class="b"><h1>Access blocked</h1>
<p>This network is not allowed to access the CRM. Ask an administrator to whitelist your IP address.</p>
${ip ? `<code>${ip.replace(/[<>&"]/g, "")}</code>` : ""}</div></body></html>`;
  return new Response(body, {
    status: 403,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
