import { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { AppShell } from "./AppShell";
import { isUserAllowedOnHost } from "@/lib/subdomain-tenancy";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function ProtectedRoute({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: AppRole[];
}) {
  const { session, role, loading, profile, signOut, refresh, loadError } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login" });
      return;
    }
    // Wait for profile/role to hydrate before evaluating the tenant gate —
    // otherwise we'd sign the user out during the brief window between
    // session-ready and profile-loaded.
    if (!profile || !role) return;
    if (!isUserAllowedOnHost(role, profile.office_id ?? null)) {
      void supabase.auth.signOut().then(() => signOut()).finally(() => {
        toast.error("This account is not allowed on this domain.");
        navigate({ to: "/login" });
      });
      return;
    }
    if (roles && !roles.includes(role)) {
      navigate({ to: "/dashboard" });
    }
  }, [session, role, loading, profile, roles, navigate, signOut]);

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!profile || !role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-foreground">Account access is not ready</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your session is active, but the app could not load your{" "}
            {!profile && !role ? "profile and role" : !profile ? "profile" : "role"}.
          </p>
          {loadError && (
            <pre className="mt-3 max-h-32 overflow-auto rounded-md bg-muted p-3 text-left font-mono text-xs text-destructive">
              {loadError}
            </pre>
          )}
          <div className="mt-5 flex items-center justify-center gap-2">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              onClick={() => { void refresh(); }}
            >
              Retry
            </button>
          <button
            type="button"
              className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent"
            onClick={async () => {
              await signOut();
              navigate({ to: "/login" });
            }}
          >
            Sign in again
          </button>
          </div>
        </div>
      </div>
    );
  }

  if (roles && !roles.includes(role)) return null;

  return <AppShell>{children}</AppShell>;
}
