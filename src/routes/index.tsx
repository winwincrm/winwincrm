import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "YellowSkies CRM" },
      { name: "description", content: "YellowSkies CRM workspace routing for authenticated teams." },
      { property: "og:title", content: "YellowSkies CRM" },
      { property: "og:description", content: "YellowSkies CRM workspace routing for authenticated teams." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { session, loading, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!session) navigate({ to: "/login" });
    else if (profile?.must_change_password) navigate({ to: "/change-password" });
    else navigate({ to: "/dashboard" });
  }, [session, loading, profile, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
      Loading…
    </div>
  );
}
