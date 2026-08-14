import { createStart, createMiddleware } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// IP whitelist enforcement — server-side, so it cannot be bypassed by the client.
const ipWhitelist = createMiddleware().server(async ({ next }) => {
  try {
    const request = getRequest();
    const { isGuardExempt, evaluateIp, blockedResponse } = await import("@/lib/ip-guard.server");
    if (!isGuardExempt(request)) {
      const decision = await evaluateIp(request);
      if (decision.enforced && !decision.allowed) {
        throw blockedResponse(decision.ip);
      }
    }
  } catch (e) {
    if (e instanceof Response) throw e;
    // Never lock everyone out because of an infrastructure error.
  }
  return next();
});

// Global security headers middleware — applied to every server response
// (SSR pages, server functions, server routes).
const securityHeaders = createMiddleware().server(async ({ next }) => {

  const result = await next();
  try {
    setResponseHeader("x-content-type-options", "nosniff");
    // Note: x-frame-options omitted in favor of CSP frame-ancestors (which allows
    // Lovable editor + published domains while still blocking arbitrary embedders).
    setResponseHeader("referrer-policy", "strict-origin-when-cross-origin");
    setResponseHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
    setResponseHeader(
      "strict-transport-security",
      "max-age=31536000; includeSubDomains",
    );
    // CSP: allow self + Supabase project + Lovable AI Gateway. No inline scripts.
    // Vite/React-Refresh in dev needs 'unsafe-eval' and 'unsafe-inline' for HMR.
    const supabaseUrl = process.env.SUPABASE_URL ?? "https://*.supabase.co";
    const supabaseHost = supabaseUrl.replace(/^https?:\/\//, "");
    const isDev = process.env.NODE_ENV !== "production";
    const csp = [
      "default-src 'self'",
      `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://ai.gateway.lovable.dev`,
      `script-src 'self'${isDev ? " 'unsafe-inline' 'unsafe-eval'" : " 'unsafe-inline'"}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com https://cdn.gpteng.co",
      "frame-ancestors 'self' https://*.lovable.app https://*.lovable.dev https://lovable.dev https://*.purpleskies.pro",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; ");
    setResponseHeader("content-security-policy", csp);
  } catch {
    // setResponseHeader can throw if called outside a request context — ignore.
  }
  return result;
});

export const startInstance = createStart(() => ({
  requestMiddleware: [ipWhitelist, securityHeaders],
  functionMiddleware: [attachSupabaseAuth],
}));
