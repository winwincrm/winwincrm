// Subdomain → Office tenancy enforcement.
// - Admin (overlord) accounts: allowed on ANY known production host.
// - Manager / superiormanager / agent accounts: only allowed on the host mapped to their office_id.
// - Lovable preview / editor URLs: bypass the check entirely (dev convenience).
// - Anything else (unknown / unmapped): blocked.

import type { AppRole } from "./auth-context";

export const OFFICE_DB = "e960656f-7111-4258-86f7-f20569f4a0a1";
export const OFFICE_KS = "4cb70020-cabf-4ab6-bc06-58f55e7e0220";
export const OFFICE_BLACK = "a2d7b652-902d-4b5d-9665-54d83b528847";
export const OFFICE_HELFENSTEIN = "1aaf0a2b-0359-4528-a4d7-6def28fba3c3";
export const OFFICE_RAISIN = "1047f9bc-505c-4e89-94a9-999376f824f3";

export const HOST_TO_OFFICE: Record<string, string> = {
  "crlm.purpleskies.pro": OFFICE_KS,
  "kla.purpleskies.pro": OFFICE_DB,
  "bla.purpleskies.pro": OFFICE_BLACK,
  "helf.purpleskies.pro": OFFICE_HELFENSTEIN,
  "ras.purpleskies.pro": OFFICE_RAISIN,
};

/** Hosts that are not bound to a single office — any authenticated user may log in. */
export const MULTI_OFFICE_HOSTS: ReadonlySet<string> = new Set([
  "crm.orangeskies.org",
  "office-link-crm.lovable.app",
  "tiktakcrm.com",
  "www.tiktakcrm.com",
]);

export function getCurrentHost(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname.toLowerCase();
}

/** Lovable preview / editor URLs — always allowed (dev).
 * Do not exempt every *.lovable.app host: published applications also use
 * that domain and must remain subject to normal tenant and IP enforcement.
 */
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
  return host in HOST_TO_OFFICE || MULTI_OFFICE_HOSTS.has(host);
}

export function getHostOffice(host: string = getCurrentHost()): string | null {
  return HOST_TO_OFFICE[host] ?? null;
}

/** Host that should display the app at all (mapped tenant or preview). */
export function isAllowedHost(host: string = getCurrentHost()): boolean {
  return isPreviewHost(host) || isKnownTenantHost(host);
}

export function isUserAllowedOnHost(
  role: AppRole | null,
  officeId: string | null,
  host: string = getCurrentHost(),
): boolean {
  if (isPreviewHost(host)) return true;
  if (!isKnownTenantHost(host)) return false;
  if (role === "admin") return true;
  if (MULTI_OFFICE_HOSTS.has(host)) return !!officeId;
  const expected = getHostOffice(host);
  return !!expected && !!officeId && expected === officeId;
}
