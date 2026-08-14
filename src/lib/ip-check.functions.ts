import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { ipMatches } from "./ip-match";

export { ipMatches };

export const checkIpAllowed = createServerFn({ method: "GET" }).handler(async () => {
  const { evaluateIp } = await import("./ip-guard.server");
  return await evaluateIp(getRequest());
});

/** Drops the cached whitelist rules so edits take effect immediately. */
export const refreshIpRules = createServerFn({ method: "POST" }).handler(async () => {
  const { invalidateIpRuleCache } = await import("./ip-guard.server");
  invalidateIpRuleCache();
  return { ok: true };
});
