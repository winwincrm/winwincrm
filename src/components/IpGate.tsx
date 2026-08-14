import { ReactNode, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert } from "lucide-react";
import { checkIpAllowed } from "@/lib/ip-check.functions";
import { isPreviewHost } from "@/lib/subdomain-tenancy";

/**
 * Blocks the whole app for client IPs that are not on the active whitelist.
 * Whitelist enforcement is only active when at least one active IP exists.
 * Lovable preview / localhost hosts bypass the gate.
 */
export function IpGate({ children }: { children: ReactNode }) {
  const check = useServerFn(checkIpAllowed);
  const [state, setState] = useState<{ allowed: boolean; ip: string | null } | null>(null);

  useEffect(() => {
    if (isPreviewHost()) { setState({ allowed: true, ip: null }); return; }
    let alive = true;
    void check({})
      .then((r) => { if (alive) setState({ allowed: r.allowed, ip: r.ip }); })
      .catch(() => { if (alive) setState({ allowed: true, ip: null }); });
    return () => { alive = false; };
  }, []);

  if (state === null) return <div className="min-h-screen bg-background" />;

  if (!state.allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-4 text-xl font-semibold text-foreground">Access blocked</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This network is not allowed to access the CRM. Ask an administrator to whitelist your IP
            address.
          </p>
          {state.ip && (
            <p className="mt-3 font-mono text-sm text-foreground">{state.ip}</p>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
