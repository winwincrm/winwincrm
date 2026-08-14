import { ReactNode, useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, Users, Building2, Phone, ShieldCheck, FileText, KeyRound, Settings, LogOut, Moon, Sun, Menu, Tag, CalendarClock, SlidersHorizontal, FileSpreadsheet } from "lucide-react";
import { useDarkTheme } from "@/lib/dark-theme";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/permissions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";
import { ScheduleReminders } from "@/components/ScheduleReminders";
import { SheetSyncNotifications } from "@/components/SheetSyncNotifications";



interface NavItem {
  to: string;
  label: string;
  icon: typeof Users;
  roles: Array<"admin" | "manager" | "superiormanager" | "agent">;
  permKey?: string; // key in role_permissions.nav_items
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard, roles: ["admin", "manager", "superiormanager", "agent"], permKey: "dashboard" },
  { to: "/leads", label: "nav.leads", icon: Phone, roles: ["admin", "manager", "superiormanager", "agent"], permKey: "leads" },
  { to: "/calendar", label: "Calendar", icon: CalendarClock, roles: ["admin", "manager", "superiormanager", "agent"], permKey: "calendar" },
  { to: "/offices", label: "nav.offices", icon: Building2, roles: ["admin"], permKey: "offices" },
  { to: "/my-office", label: "nav.my_office", icon: Building2, roles: ["manager", "superiormanager"], permKey: "my_office" },
  { to: "/my-team", label: "nav.my_team", icon: Users, roles: ["admin", "superiormanager", "manager"], permKey: "my_team" },
  { to: "/users", label: "nav.users", icon: Users, roles: ["admin", "superiormanager", "manager"], permKey: "users" },

  { to: "/api-keys", label: "API Keys", icon: KeyRound, roles: ["admin"], permKey: "api_keys" },
  { to: "/affiliates", label: "Affiliates", icon: ShieldCheck, roles: ["admin"], permKey: "affiliates" },
  { to: "/sources", label: "Sources", icon: Tag, roles: ["admin"], permKey: "sources" },
  { to: "/sheet-syncs", label: "Google Sheets", icon: FileSpreadsheet, roles: ["admin", "superiormanager", "manager"], permKey: "sheet_syncs" },

  { to: "/api-logs", label: "nav.api_logs", icon: FileText, roles: ["admin"], permKey: "api_logs" },

  { to: "/admin/permissions", label: "Permissions", icon: SlidersHorizontal, roles: ["admin"] },

  { to: "/settings", label: "nav.settings", icon: Settings, roles: ["admin", "manager", "superiormanager", "agent"], permKey: "settings" },
];


const LANGS: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const crt = useDarkTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const perms = usePermissions(role, profile?.user_id ?? null);
  const items = NAV.filter(
    (n) => !!role && n.roles.includes(role) && (!n.permKey || perms.canNav(n.permKey)),
  );

  const changeLang = async (code: string) => {
    i18n.changeLanguage(code);
    if (profile?.user_id) {
      await supabase.from("profiles").update({ language_preference: code }).eq("user_id", profile.user_id);
    }
  };

  const initials = (profile?.full_name || profile?.email || "?")
    .split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen flex flex-col w-full bg-background">
      <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-40">
        <div className="h-14 flex items-center gap-3 md:gap-6 px-4 md:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="p-4 border-b">
                <SheetTitle className="flex items-center gap-2">
                  <img src={logo} alt="" className="h-10 w-10 object-contain" />
                  <span className="font-semibold text-sm">
                    {t("app.name")}<span className="text-muted-foreground font-normal ml-1">CRM</span>
                  </span>
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col p-2">
                {items.map((item) => {
                  const active = pathname === item.to || pathname.startsWith(item.to + "/");
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 h-10 rounded-md text-sm transition-colors",
                        active
                          ? "text-foreground font-medium bg-accent/60"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {t(item.label)}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>

          <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
            <img src={logo} alt="" className="h-10 w-10 object-contain" />
            <span className="font-semibold text-sm tracking-tight">
              {t("app.name")}<span className="text-muted-foreground font-normal ml-1 hidden sm:inline">CRM</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 flex-1 min-w-0">
            {items.map((item) => {
              const active = pathname === item.to || pathname.startsWith(item.to + "/");
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "px-3 h-8 inline-flex items-center rounded-md text-sm transition-colors whitespace-nowrap",
                    active
                      ? "text-foreground font-medium bg-accent/60"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t(item.label)}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1 shrink-0 ml-auto">
            <SheetSyncNotifications />
            <Button

              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={crt.toggle}
              aria-label="Toggle dark mode"
            >
              {crt.enabled ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs uppercase font-medium text-muted-foreground">
                  {i18n.language?.slice(0, 2) || "en"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t("common.language")}</DropdownMenuLabel>
                {LANGS.map((l) => (
                  <DropdownMenuItem key={l.code} onClick={() => changeLang(l.code)}>
                    {l.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-2 pl-1 pr-2">
                  <div className="h-7 w-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-medium">
                    {initials}
                  </div>
                  <span className="text-sm hidden lg:inline max-w-[140px] truncate">{profile?.full_name || profile?.email}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
                  {profile?.email}
                  {role ? <div className="mt-0.5">{t(`roles.${role}`)}</div> : null}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
                  <Settings className="mr-2 h-4 w-4" /> {t("nav.settings")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={async () => { await signOut(); navigate({ to: "/login" }); }}>
                  <LogOut className="mr-2 h-4 w-4" /> {t("auth.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>

      <ScheduleReminders />

    </div>
  );
}
