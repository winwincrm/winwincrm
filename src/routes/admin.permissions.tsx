import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, RotateCcw, Save, User as UserIcon, Search } from "lucide-react";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { IpWhitelistPanel } from "@/components/IpWhitelistPanel";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LEAD_FIELD_KEYS, LEAD_FIELD_LABELS,
  NAV_KEYS, NAV_LABELS,
  ACTION_KEYS, ACTION_LABELS,
  DASHBOARD_KEYS, DASHBOARD_LABELS,
  invalidatePermissions,
  type ConfigurableRole, type RolePermissionsRow,
} from "@/lib/permissions";

export const Route = createFileRoute("/admin/permissions")({
  head: () => ({
    meta: [
      { title: "Permissions | Admin | YellowSkies CRM" },
      { name: "description", content: "Control what each role and user can see and do." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <ProtectedRoute roles={["admin"]}>
      <PermissionsPanel />
    </ProtectedRoute>
  ),
});

const ROLES: ConfigurableRole[] = ["agent", "manager", "superiormanager"];
const ROLE_LABEL: Record<ConfigurableRole, string> = {
  agent: "Agent", manager: "Manager", superiormanager: "Superior manager",
};

type PermsMap = Record<ConfigurableRole, RolePermissionsRow>;

function makeDefault(role: ConfigurableRole): RolePermissionsRow {
  const on: Record<string, boolean> = {};
  LEAD_FIELD_KEYS.forEach((k) => (on[k] = true));
  const nav: Record<string, boolean> = {};
  NAV_KEYS.forEach((k) => (nav[k] = role !== "agent"));
  nav.dashboard = true; nav.leads = true; nav.calendar = true; nav.settings = true;
  const act: Record<string, boolean> = {};
  ACTION_KEYS.forEach((k) => (act[k] = true));
  if (role === "agent") {
    act.delete_lead = false; act.export_csv = false; act.import_leads = false;
    act.add_lead = false; act.bulk_reassign = false; act.reassign = false;
    act.sheet_sync_now = false; act.sheet_pause = false; act.sheet_remove_link = false;
    act.sheet_resolve_duplicates = false; act.sheet_assign_lead = false;
  }
  const dash: Record<string, boolean> = {};
  DASHBOARD_KEYS.forEach((k) => (dash[k] = true));
  return { role, lead_fields: on, nav_items: nav, actions: act, dashboard: dash };
}

function PermissionsPanel() {
  const [tab, setTab] = useState<"roles" | "users" | "ip">("roles");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Permissions</h1>
          <p className="text-sm text-muted-foreground">
            Admins always see everything. Set defaults per role, then override per user.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "roles" | "users" | "ip")}>
        <TabsList>
          <TabsTrigger value="roles">By role</TabsTrigger>
          <TabsTrigger value="users">By user</TabsTrigger>
          <TabsTrigger value="ip">IP whitelist</TabsTrigger>
        </TabsList>
        <TabsContent value="roles" className="mt-4">
          <RolesEditor />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <UsersEditor />
        </TabsContent>
        <TabsContent value="ip" className="mt-4">
          <IpWhitelistPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* -------------------- Roles editor -------------------- */

function RolesEditor() {
  const [perms, setPerms] = useState<PermsMap | null>(null);
  const [active, setActive] = useState<ConfigurableRole>("agent");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data, error } = await (supabase as any)
        .from("role_permissions")
        .select("role, lead_fields, nav_items, actions, dashboard");
      if (error) { toast.error(error.message); setLoading(false); return; }
      const map = {} as PermsMap;
      ROLES.forEach((r) => { map[r] = makeDefault(r); });
      (data ?? []).forEach((row: any) => {
        const r = row.role as ConfigurableRole;
        map[r] = {
          role: r,
          lead_fields: { ...map[r].lead_fields, ...(row.lead_fields ?? {}) },
          nav_items:   { ...map[r].nav_items,   ...(row.nav_items ?? {}) },
          actions:     { ...map[r].actions,     ...(row.actions ?? {}) },
          dashboard:   { ...map[r].dashboard,   ...(row.dashboard ?? {}) },
        };
      });
      setPerms(map); setLoading(false);
    })();
  }, []);

  const setKey = (bucket: keyof RolePermissionsRow, key: string, value: boolean) => {
    setPerms((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      const row = { ...next[active] };
      (row as any)[bucket] = { ...(row as any)[bucket], [key]: value };
      next[active] = row;
      return next;
    });
  };

  const resetRole = () => setPerms((prev) => prev ? { ...prev, [active]: makeDefault(active) } : prev);

  const save = async () => {
    if (!perms) return;
    setSaving(true);
    const row = perms[active];
    const { error } = await (supabase as any)
      .from("role_permissions")
      .upsert({
        role: row.role,
        lead_fields: row.lead_fields, nav_items: row.nav_items,
        actions: row.actions, dashboard: row.dashboard,
        updated_at: new Date().toISOString(),
      }, { onConflict: "role" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    invalidatePermissions();
    toast.success(`Saved permissions for ${ROLE_LABEL[active]}`);
  };

  if (loading || !perms) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const row = perms[active];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Tabs value={active} onValueChange={(v) => setActive(v as ConfigurableRole)}>
          <TabsList>
            {ROLES.map((r) => (<TabsTrigger key={r} value={r}>{ROLE_LABEL[r]}</TabsTrigger>))}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={resetRole}>
            <RotateCcw className="h-4 w-4 mr-1" /> Reset to defaults
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Lead fields (list + detail)"
          desc="Uncheck to hide the value across every lead view."
          keys={LEAD_FIELD_KEYS as unknown as string[]} labels={LEAD_FIELD_LABELS}
          values={row.lead_fields} onChange={(k, v) => setKey("lead_fields", k, v)} />
        <Section title="Navigation"
          desc="Which sidebar / top-nav items this role can open."
          keys={NAV_KEYS as unknown as string[]} labels={NAV_LABELS}
          values={row.nav_items} onChange={(k, v) => setKey("nav_items", k, v)} />
        <Section title="Actions"
          desc="Buttons and controls this role can use."
          keys={ACTION_KEYS as unknown as string[]} labels={ACTION_LABELS}
          values={row.actions} onChange={(k, v) => setKey("actions", k, v)} />
        <Section title="Dashboard widgets"
          desc="Tiles and panels shown on the dashboard."
          keys={DASHBOARD_KEYS as unknown as string[]} labels={DASHBOARD_LABELS}
          values={row.dashboard} onChange={(k, v) => setKey("dashboard", k, v)} />
      </div>
    </div>
  );
}

function Section({
  title, desc, keys, labels, values, onChange,
}: {
  title: string; desc: string; keys: string[];
  labels: Record<string, string>;
  values: Record<string, boolean>;
  onChange: (k: string, v: boolean) => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
      <div className="mt-3 grid grid-cols-1 gap-1.5">
        {keys.map((k) => {
          const checked = values[k] !== false;
          const id = `${title}-${k}`;
          return (
            <label key={k} htmlFor={id}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent/40 cursor-pointer">
              <Checkbox id={id} checked={checked}
                onCheckedChange={(v) => onChange(k, v === true)} />
              <span>{labels[k] ?? k}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------- Users editor (per-user overrides) -------------------- */

type ProfileLite = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: ConfigurableRole | "admin" | null;
};

// Override values: true, false, or undefined (= inherit from role).
type OverrideBucket = Record<string, boolean | undefined>;
type OverrideRow = {
  user_id: string;
  lead_fields: OverrideBucket;
  nav_items: OverrideBucket;
  actions: OverrideBucket;
  dashboard: OverrideBucket;
};

function emptyOverride(userId: string): OverrideRow {
  return { user_id: userId, lead_fields: {}, nav_items: {}, actions: {}, dashboard: {} };
}

function UsersEditor() {
  const [users, setUsers] = useState<ProfileLite[]>([]);
  const [rolePerms, setRolePerms] = useState<PermsMap | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [override, setOverride] = useState<OverrideRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    void (async () => {
      const [{ data: profs }, { data: roles }, { data: rp }] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, email").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
        (supabase as any).from("role_permissions").select("role, lead_fields, nav_items, actions, dashboard"),
      ]);
      const rolesByUser = new Map<string, ConfigurableRole | "admin">();
      (roles ?? []).forEach((r: any) => {
        // Prefer highest privilege if user has several rows.
        const cur = rolesByUser.get(r.user_id);
        const rank = (x: string) => x === "admin" ? 4 : x === "superiormanager" ? 3 : x === "manager" ? 2 : 1;
        if (!cur || rank(r.role) > rank(cur)) rolesByUser.set(r.user_id, r.role);
      });
      setUsers((profs ?? []).map((p: any) => ({
        user_id: p.user_id, full_name: p.full_name, email: p.email,
        role: (rolesByUser.get(p.user_id) as any) ?? null,
      })));
      const map = {} as PermsMap;
      ROLES.forEach((r) => { map[r] = makeDefault(r); });
      (rp ?? []).forEach((row: any) => {
        const r = row.role as ConfigurableRole;
        map[r] = {
          role: r,
          lead_fields: { ...map[r].lead_fields, ...(row.lead_fields ?? {}) },
          nav_items:   { ...map[r].nav_items,   ...(row.nav_items ?? {}) },
          actions:     { ...map[r].actions,     ...(row.actions ?? {}) },
          dashboard:   { ...map[r].dashboard,   ...(row.dashboard ?? {}) },
        };
      });
      setRolePerms(map);
    })();
  }, []);

  useEffect(() => {
    if (!selectedId) { setOverride(null); return; }
    void (async () => {
      const { data } = await (supabase as any)
        .from("user_permission_overrides")
        .select("user_id, lead_fields, nav_items, actions, dashboard")
        .eq("user_id", selectedId)
        .maybeSingle();
      setOverride(data ? {
        user_id: data.user_id,
        lead_fields: data.lead_fields ?? {},
        nav_items: data.nav_items ?? {},
        actions: data.actions ?? {},
        dashboard: data.dashboard ?? {},
      } : emptyOverride(selectedId));
    })();
  }, [selectedId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      (u.full_name ?? "").toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q)
    );
  }, [users, search]);

  const selectedUser = users.find((u) => u.user_id === selectedId) ?? null;
  const effectiveRole = selectedUser?.role;
  const roleRow: RolePermissionsRow | null =
    effectiveRole && effectiveRole !== "admin" && rolePerms
      ? rolePerms[effectiveRole as ConfigurableRole]
      : null;

  const setOverrideKey = (bucket: keyof Omit<OverrideRow, "user_id">, key: string, value: boolean | undefined) => {
    setOverride((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [bucket]: { ...prev[bucket] } };
      if (value === undefined) delete next[bucket][key];
      else next[bucket][key] = value;
      return next;
    });
  };

  const clearAll = () => selectedId && setOverride(emptyOverride(selectedId));

  const save = async () => {
    if (!override || !selectedId) return;
    setSaving(true);
    // Strip undefined values before storing (jsonb doesn't carry them).
    const clean = (b: OverrideBucket) => {
      const out: Record<string, boolean> = {};
      Object.entries(b).forEach(([k, v]) => { if (typeof v === "boolean") out[k] = v; });
      return out;
    };
    const payload = {
      user_id: selectedId,
      lead_fields: clean(override.lead_fields),
      nav_items: clean(override.nav_items),
      actions: clean(override.actions),
      dashboard: clean(override.dashboard),
      updated_at: new Date().toISOString(),
    };
    const { error } = await (supabase as any)
      .from("user_permission_overrides")
      .upsert(payload, { onConflict: "user_id" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    invalidatePermissions(selectedId);
    toast.success("Saved user overrides");
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px,1fr] gap-4">
      <aside className="rounded-lg border bg-card p-3 space-y-2 max-h-[70vh] flex flex-col">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-7 h-8" placeholder="Search users…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="overflow-auto -mx-1 flex-1">
          {filtered.map((u) => {
            const isSelected = u.user_id === selectedId;
            return (
              <button key={u.user_id} type="button"
                onClick={() => setSelectedId(u.user_id)}
                className={
                  "w-full text-left rounded-md px-2 py-1.5 text-sm flex items-center gap-2 " +
                  (isSelected ? "bg-accent" : "hover:bg-accent/50")
                }>
                <UserIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{u.full_name || u.email || u.user_id}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {u.email} {u.role ? `· ${u.role}` : ""}
                  </div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-xs text-muted-foreground px-2 py-3">No users match.</div>
          )}
        </div>
      </aside>

      <div className="space-y-4">
        {!selectedUser && (
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            Pick a user on the left to override their permissions. Each option can be
            <strong> Inherit </strong> (use the role default), <strong>Allow</strong>, or <strong>Deny</strong>.
          </div>
        )}

        {selectedUser && (
          <>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="font-medium">{selectedUser.full_name || selectedUser.email}</div>
                <div className="text-xs text-muted-foreground">
                  Role: {selectedUser.role ?? "unknown"}
                  {selectedUser.role === "admin" && " (admins always have full access)"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={clearAll}
                  disabled={selectedUser.role === "admin"}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Clear overrides
                </Button>
                <Button size="sm" onClick={save}
                  disabled={saving || selectedUser.role === "admin"}>
                  <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save overrides"}
                </Button>
              </div>
            </div>

            {selectedUser.role === "admin" ? (
              <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                Admins bypass all permission checks — no overrides needed.
              </div>
            ) : override ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TriSection title="Lead fields" keys={LEAD_FIELD_KEYS as unknown as string[]}
                  labels={LEAD_FIELD_LABELS} roleValues={roleRow?.lead_fields}
                  overrides={override.lead_fields} onChange={(k, v) => setOverrideKey("lead_fields", k, v)} />
                <TriSection title="Navigation" keys={NAV_KEYS as unknown as string[]}
                  labels={NAV_LABELS} roleValues={roleRow?.nav_items}
                  overrides={override.nav_items} onChange={(k, v) => setOverrideKey("nav_items", k, v)} />
                <TriSection title="Actions" keys={ACTION_KEYS as unknown as string[]}
                  labels={ACTION_LABELS} roleValues={roleRow?.actions}
                  overrides={override.actions} onChange={(k, v) => setOverrideKey("actions", k, v)} />
                <TriSection title="Dashboard widgets" keys={DASHBOARD_KEYS as unknown as string[]}
                  labels={DASHBOARD_LABELS} roleValues={roleRow?.dashboard}
                  overrides={override.dashboard} onChange={(k, v) => setOverrideKey("dashboard", k, v)} />
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Loading…</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TriSection({
  title, keys, labels, roleValues, overrides, onChange,
}: {
  title: string; keys: string[]; labels: Record<string, string>;
  roleValues?: Record<string, boolean>;
  overrides: OverrideBucket;
  onChange: (k: string, v: boolean | undefined) => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        "Inherit" uses the role default (shown in the dropdown).
      </p>
      <div className="mt-3 grid grid-cols-1 gap-1.5">
        {keys.map((k) => {
          const roleDefault = roleValues?.[k] !== false;
          const ov = overrides[k];
          const value: "inherit" | "allow" | "deny" =
            ov === undefined ? "inherit" : ov ? "allow" : "deny";
          return (
            <div key={k} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate">{labels[k] ?? k}</div>
                <div className="text-[10px] text-muted-foreground">
                  role default: {roleDefault ? "allowed" : "denied"}
                </div>
              </div>
              <Select value={value}
                onValueChange={(v) =>
                  onChange(k, v === "inherit" ? undefined : v === "allow")
                }>
                <SelectTrigger className="h-8 w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inherit">Inherit</SelectItem>
                  <SelectItem value="allow">Allow</SelectItem>
                  <SelectItem value="deny">Deny</SelectItem>
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
