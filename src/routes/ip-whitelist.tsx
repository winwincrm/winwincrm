import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { IpWhitelistPanel } from "@/components/IpWhitelistPanel";

export const Route = createFileRoute("/ip-whitelist")({
  head: () => ({
    meta: [
      { title: "IP whitelist | YellowSkies CRM" },
      { name: "description", content: "Restrict CRM access to approved IP addresses." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: IpPage,
});

function IpPage() {
  return (
    <ProtectedRoute roles={["admin"]}>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">IP whitelist</h1>
            <p className="text-sm text-muted-foreground">
              Only whitelisted addresses can access the CRM once at least one is active.
            </p>
          </div>
        </div>
        <IpWhitelistPanel />
      </div>
    </ProtectedRoute>
  );
}
