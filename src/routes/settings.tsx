import { createFileRoute, Link, Outlet, useRouterState, Navigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { cn } from "@/lib/utils";
import { User, Languages, KeyRound, Monitor } from "lucide-react";

export const Route = createFileRoute("/settings")({ component: SettingsLayout });

const TABS = [
  { to: "/settings/profile", label: "settings.profile_section", icon: User },
  { to: "/settings/language", label: "settings.language_section", icon: Languages },
  { to: "/settings/password", label: "settings.password_section", icon: KeyRound },
  { to: "/settings/appearance", label: "settings.appearance_section", icon: Monitor },
] as const;

function SettingsLayout() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Redirect /settings → /settings/profile
  if (pathname === "/settings") return <Navigate to="/settings/profile" />;

  return (
    <ProtectedRoute>
      <div className="space-y-4 max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>

        <div className="border-b flex flex-wrap gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = pathname === tab.to;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
                  active
                    ? "border-primary text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {t(tab.label)}
              </Link>
            );
          })}
        </div>

        <Outlet />
      </div>
    </ProtectedRoute>
  );
}
