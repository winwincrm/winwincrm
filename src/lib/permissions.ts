// Role-based permission overlay driven by public.role_permissions.
// Admin bypasses every check. Managers/superiormanagers/agents get exactly
// what the admin permission panel grants them.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/auth-context";

export type ConfigurableRole = "agent" | "manager" | "superiormanager";

export interface RolePermissionsRow {
  role: ConfigurableRole;
  lead_fields: Record<string, boolean>;
  nav_items: Record<string, boolean>;
  actions: Record<string, boolean>;
  dashboard: Record<string, boolean>;
}

// Field keys used across the UI. Keep in sync with admin panel + DB seed.
export const LEAD_FIELD_KEYS = [
  "email", "phone", "source", "platform", "country", "amount_lost",
  "comment", "description_1", "description_2", "description_3", "description_4",
  "office", "assigned_agent", "imported", "last_activity",
] as const;

export const NAV_KEYS = [
  "dashboard", "leads", "calendar", "offices", "my_office", "my_team",
  "users", "api_keys", "affiliates", "sources", "api_logs", "sheet_syncs",
  "settings", "admin",
] as const;

export const ACTION_KEYS = [
  "export_csv", "import_leads", "add_lead", "delete_lead",
  "bulk_reassign", "reassign", "call", "edit_status",
  "edit_descriptions", "edit_comment",
  "sheet_sync_now", "sheet_pause", "sheet_remove_link",
  "sheet_resolve_duplicates", "sheet_assign_lead",
] as const;

export const DASHBOARD_KEYS = [
  "total_leads", "leads_today", "my_followups", "new_assigned",
  "by_status", "by_agent", "by_office", "agent_matrix", "recent_activity",
] as const;

export const LEAD_FIELD_LABELS: Record<string, string> = {
  email: "Email", phone: "Phone", source: "Source", platform: "Platform",
  country: "Country", amount_lost: "Amount lost", comment: "Comment",
  description_1: "Description 1", description_2: "Description 2",
  description_3: "Description 3", description_4: "Description 4",
  office: "Office column", assigned_agent: "Assigned agent",
  imported: "Imported date", last_activity: "Last activity",
};

export const NAV_LABELS: Record<string, string> = {
  dashboard: "Dashboard", leads: "Leads", calendar: "Calendar",
  offices: "Offices (all)", my_office: "My office", my_team: "My team",
  users: "Users", api_keys: "API keys", affiliates: "Affiliates",
  sources: "Sources", api_logs: "API logs", sheet_syncs: "Google Sheets",
  settings: "Settings",
  admin: "Admin panel",
};

export const ACTION_LABELS: Record<string, string> = {
  export_csv: "Export CSV", import_leads: "Import leads", add_lead: "Add lead manually",
  delete_lead: "Delete leads", bulk_reassign: "Bulk reassign",
  reassign: "Reassign single lead", call: "Click-to-call",
  edit_status: "Change lead status", edit_descriptions: "Edit descriptions",
  edit_comment: "Add / edit comments",
  sheet_sync_now: "Google Sheets: sync now",
  sheet_pause: "Google Sheets: pause / start live sync",
  sheet_remove_link: "Google Sheets: remove sheet link",
  sheet_resolve_duplicates: "Google Sheets: resolve duplicates",
  sheet_assign_lead: "Google Sheets: assign lead from activity",
};

export const DASHBOARD_LABELS: Record<string, string> = {
  total_leads: "Total leads tile", leads_today: "Leads today tile",
  my_followups: "Follow-ups tile", new_assigned: "New assigned tile",
  by_status: "Leads by status panel", by_agent: "Leads by agent panel",
  by_office: "Leads by office panel", agent_matrix: "Agent × status matrix",
  recent_activity: "Recent activity feed",
};

// Cache: single fetch, reused across components until invalidated.
let cache: Record<ConfigurableRole, RolePermissionsRow> | null = null;
let inFlight: Promise<Record<ConfigurableRole, RolePermissionsRow>> | null = null;
const listeners = new Set<() => void>();

export interface UserOverrideRow {
  user_id: string;
  lead_fields: Record<string, boolean>;
  nav_items: Record<string, boolean>;
  actions: Record<string, boolean>;
  dashboard: Record<string, boolean>;
}

const overrideCache = new Map<string, UserOverrideRow | null>();
const overrideInFlight = new Map<string, Promise<UserOverrideRow | null>>();

async function fetchAll(): Promise<Record<ConfigurableRole, RolePermissionsRow>> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const { data, error } = await (supabase as any)
      .from("role_permissions")
      .select("role, lead_fields, nav_items, actions, dashboard");
    if (error) throw error;
    const map: Record<string, RolePermissionsRow> = {};
    ((data ?? []) as RolePermissionsRow[]).forEach((row) => {
      map[row.role] = row;
    });
    cache = map as Record<ConfigurableRole, RolePermissionsRow>;
    inFlight = null;
    listeners.forEach((l) => l());
    return cache;
  })();
  return inFlight;
}

async function fetchOverride(userId: string): Promise<UserOverrideRow | null> {
  if (overrideCache.has(userId)) return overrideCache.get(userId) ?? null;
  const existing = overrideInFlight.get(userId);
  if (existing) return existing;
  const p = (async () => {
    const { data, error } = await (supabase as any)
      .from("user_permission_overrides")
      .select("user_id, lead_fields, nav_items, actions, dashboard")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) { overrideInFlight.delete(userId); return null; }
    const row = (data as UserOverrideRow | null) ?? null;
    overrideCache.set(userId, row);
    overrideInFlight.delete(userId);
    listeners.forEach((l) => l());
    return row;
  })();
  overrideInFlight.set(userId, p);
  return p;
}

export function invalidatePermissions(userId?: string) {
  cache = null;
  inFlight = null;
  if (userId) {
    overrideCache.delete(userId);
    overrideInFlight.delete(userId);
  } else {
    overrideCache.clear();
    overrideInFlight.clear();
  }
  void fetchAll().catch(() => {});
  listeners.forEach((l) => l());
}

export function usePermissions(role: AppRole | null, userId?: string | null) {
  const [, force] = useState(0);
  useEffect(() => {
    let mounted = true;
    const sync = () => { if (mounted) force((n) => n + 1); };
    listeners.add(sync);
    if (!cache) void fetchAll().then(sync).catch(() => sync());
    if (userId && !overrideCache.has(userId)) void fetchOverride(userId).then(sync).catch(() => sync());
    return () => { mounted = false; listeners.delete(sync); };
  }, [userId]);

  const isAdmin = role === "admin";
  const row = role && role !== "admin" ? cache?.[role as ConfigurableRole] ?? null : null;
  const override = userId ? overrideCache.get(userId) ?? null : null;

  const pick = (bucket: "nav_items" | "actions" | "lead_fields" | "dashboard", key: string, defaultOn: boolean) => {
    if (isAdmin) return true;
    const ov = override?.[bucket]?.[key];
    if (typeof ov === "boolean") return ov;
    const base = row?.[bucket]?.[key];
    if (typeof base === "boolean") return base;
    return defaultOn;
  };

  // Google Sheets is a manager-level tool: on by default for manager /
  // superior manager, off for agents, still fully overridable in the panel.
  const canNav = (key: string) =>
    pick("nav_items", key, key === "sheet_syncs" ? role !== "agent" : false);
  const canAction = (key: string) =>
    pick("actions", key, key.startsWith("sheet_") ? role !== "agent" : true);
  const canField = (key: string) => pick("lead_fields", key, true);
  const canDash = (key: string) => pick("dashboard", key, true);

  return {
    data: cache, row, override, isAdmin, canNav, canAction, canField, canDash,
    loaded: !!cache || isAdmin,
  };
}

