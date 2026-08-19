// Host tenancy enforcement. The public CRM hosts are shared entry points;
// office data isolation happens in Supabase RLS, not by rejecting valid users at login.

import type { AppRole } from "./auth-context";

/** Any active authenticated CRM account may log in on these shared hosts. */
export const MULTI_OFFICE_HOSTS: ReadonlySet<string> = new Set([
  "crmwinwin.com",
  "www.crmwinwin.com",
  "winwincrm.vercel.app",
  "crm.orangeskies.org",
  "office-link-crm.lovable.app",
  "tiktakcrm.com",
  "www.tiktakcrm.com",
]);

export function getCurrentHost(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname.toLowerCase();
}

/** Development/preview hosts bypass the production hostname allowlist. */
export function isPreviewHost(host: string = getCurrentHost()): boolean {
  const normalizedHost = host.toLowerCase();
  return (
    normalizedHost.startsWith("id-preview--") ||
    (normalizedHost.startsWith("project--") && normalizedHost.includes("-dev.lovable.app")) ||
    normalizedHost.endsWith(".lovableproject.com") ||
    normalizedHost.endsWith(".gptengineer.app") ||
    normalizedHost === "localhost" ||
    normalizedHost === "127.0.0.1"
  );
}

export function isKnownTenantHost(host: string = getCurrentHost()): boolean {
  return MULTI_OFFICE_HOSTS.has(host.toLowerCase());
}

/** Host that should display the app at all (known production host or preview). */
export function isAllowedHost(host: string = getCurrentHost()): boolean {
  return isPreviewHost(host) || isKnownTenantHost(host);
}

export function isUserAllowedOnHost(
  role: AppRole | null,
  _officeId: string | null,
  host: string = getCurrentHost(),
): boolean {
  if (isPreviewHost(host)) return true;
  return isKnownTenantHost(host) && role !== null;
}
