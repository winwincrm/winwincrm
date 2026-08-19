import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/lead-constants";
import { STATUSES_BY_GROUP, STATUS_GROUP_ORDER, type LeadStatusGroup } from "@/lib/lead-status";
import { format } from "date-fns";
import { isOfficeManagerRole } from "@/lib/hierarchy";

export const Route = createFileRoute("/dashboard")({ component: DashboardPage });

function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

interface ProfileRow {
  user_id: string;
  full_name: string | null;
  office_id: string | null;
}
interface OfficeRow {
  id: string;
  name: string;
}
interface ActivityRow {
  id: string;
  activity_type: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  lead_id: string;
}

interface DashboardStatsResponse {
  total: number;
  today: number;
  unassigned: number;
  followups: number;
  by_status: Record<string, number>;
  by_agent: Array<{ user_id: string; count: number }>;
  by_office: Array<{ office_id: string; count: number; unassigned: number; cold: number }>;
  office_by_status: Array<{ office_id: string; status: string; count: number }>;
  agent_status: Array<{ user_id: string; status: string; count: number }>;
}

function DashboardContent() {
  const { t } = useTranslation();
  const { role, profile, user } = useAuth();
  const [statsData, setStatsData] = useState<DashboardStatsResponse | null>(null);
  const [offices, setOffices] = useState<OfficeRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [agentsCount, setAgentsCount] = useState(0);
  const [agentUserIds, setAgentUserIds] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [officeFilter, setOfficeFilter] = useState<string>("all"); // admin only
  const [dateFilter, setDateFilter] = useState<string>(""); // "" = all time, else YYYY-MM-DD

  useEffect(() => {
    if (!role) return;
    void load();
    async function load() {
      const officeArg =
        role === "admin"
          ? officeFilter !== "all"
            ? officeFilter
            : null
          : (profile?.office_id ?? null);

      setLoadError(null);
      const [statsRes, agentsRes, officesRes, profilesRes, activityRes] = await Promise.all([
        supabase.rpc("dashboard_stats", {
          p_office: officeArg ?? undefined,
          p_from: dateFilter || undefined,
          p_to: dateFilter || undefined,
        }),
        supabase.from("user_roles").select("user_id").eq("role", "agent"),
        supabase.from("offices").select("id, name"),
        supabase.from("profiles").select("user_id, full_name, office_id"),
        supabase
          .from("lead_activity")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      const firstError =
        statsRes.error ??
        agentsRes.error ??
        officesRes.error ??
        profilesRes.error ??
        activityRes.error;
      if (firstError) {
        setLoadError(firstError.message);
        setStatsData({
          total: 0,
          today: 0,
          unassigned: 0,
          followups: 0,
          by_status: {},
          by_agent: [],
          by_office: [],
          office_by_status: [],
          agent_status: [],
        });
        return;
      }

      setStatsData(
        (statsRes.data as unknown as DashboardStatsResponse) ?? {
          total: 0,
          today: 0,
          unassigned: 0,
          followups: 0,
          by_status: {},
          by_agent: [],
          by_office: [],
          office_by_status: [],
          agent_status: [],
        },
      );
      setOffices((officesRes.data ?? []) as OfficeRow[]);
      setProfiles((profilesRes.data ?? []) as ProfileRow[]);
      setActivity((activityRes.data ?? []) as ActivityRow[]);
      const nextAgentIds = (agentsRes.data ?? []).map((row) => row.user_id);
      setAgentUserIds(nextAgentIds);
      setAgentsCount(nextAgentIds.length);
    }
  }, [role, profile?.office_id, user?.id, officeFilter, dateFilter]);

  const stats = useMemo(() => {
    if (!statsData) return null;

    const byStatus: Record<string, number> = {};
    LEAD_STATUSES.forEach((s) => (byStatus[s] = 0));
    Object.entries(statsData.by_status ?? {}).forEach(([k, v]) => {
      byStatus[k] = v as number;
    });

    const officeMap = new Map(offices.map((o) => [o.id, o.name]));
    const profileMap = new Map(profiles.map((p) => [p.user_id, p.full_name || "—"]));
    const agentIdSet = new Set(agentUserIds);
    const officeAgentsCount = new Map<string, number>();
    profiles.forEach((p) => {
      if (p.office_id && agentIdSet.has(p.user_id))
        officeAgentsCount.set(p.office_id, (officeAgentsCount.get(p.office_id) ?? 0) + 1);
    });

    // Per-office breakdown from RPC
    const officeBase = new Map<
      string,
      { count: number; cold: number; unassigned: number; groups: Record<LeadStatusGroup, number> }
    >();
    (statsData.by_office ?? []).forEach((o) => {
      officeBase.set(o.office_id, {
        count: o.count,
        cold: o.cold,
        unassigned: o.unassigned,
        groups: { new: 0, in_progress: 0, callback: 0, appointment: 0, converted: 0, bad: 0 },
      });
    });
    (statsData.office_by_status ?? []).forEach((row) => {
      const cur = officeBase.get(row.office_id);
      if (!cur) return;
      for (const g of STATUS_GROUP_ORDER) {
        if (STATUSES_BY_GROUP[g].includes(row.status as LeadStatus)) {
          cur.groups[g] += row.count;
          break;
        }
      }
    });
    const byOffice = Array.from(officeBase.entries())
      .map(([id, v]) => ({
        id,
        name: officeMap.get(id) ?? "—",
        agents: officeAgentsCount.get(id) ?? 0,
        normal: v.count - v.cold,
        ...v,
      }))
      .sort((a, b) => b.count - a.count);

    // Per-agent leaderboard from RPC
    const byAgent = (statsData.by_agent ?? [])
      .filter((agent) => agentIdSet.has(agent.user_id))
      .map((agent) => ({
        name: profileMap.get(agent.user_id) ?? "—",
        count: agent.count,
      }));

    // Agent × status matrix from RPC
    const scopedAgents = profiles.filter((p) => {
      if (!agentIdSet.has(p.user_id)) return false;
      if (isOfficeManagerRole(role) && profile?.office_id) return p.office_id === profile.office_id;
      if (role === "admin" && officeFilter !== "all") return p.office_id === officeFilter;
      return true;
    });
    const matrixMap = new Map<
      string,
      { name: string; total: number; byStatus: Record<string, number> }
    >();
    scopedAgents.forEach((p) =>
      matrixMap.set(p.user_id, { name: p.full_name || "—", total: 0, byStatus: {} }),
    );
    (statsData.agent_status ?? []).forEach((row) => {
      const cur = matrixMap.get(row.user_id) ?? {
        name: profileMap.get(row.user_id) ?? "—",
        total: 0,
        byStatus: {},
      };
      cur.total += row.count;
      cur.byStatus[row.status] = (cur.byStatus[row.status] ?? 0) + row.count;
      matrixMap.set(row.user_id, cur);
    });
    const agentStatusMatrix = Array.from(matrixMap.entries())
      .map(([user_id, v]) => ({ user_id, ...v }))
      .sort((a, b) => b.total - a.total);

    // Recent activity (server already scopes via RLS; no further office filter to avoid extra fetch)
    const recentFiltered = activity;

    return {
      totalLeads: statsData.total,
      leadsToday: statsData.today,
      totalOffices: offices.length,
      totalAgents: agentsCount,
      officeAgents: role === "admin" && officeFilter !== "all" ? scopedAgents.length : 0,
      byStatus,
      byOffice,
      byAgent,
      agentStatusMatrix,
      unassigned: statsData.unassigned,
      followUps: statsData.followups,
      recent: recentFiltered.slice(0, 15),
    };
  }, [
    statsData,
    offices,
    profiles,
    activity,
    agentsCount,
    agentUserIds,
    role,
    profile?.office_id,
    officeFilter,
  ]);

  if (!stats) {
    return <div className="text-sm text-muted-foreground">{t("common.loading")}</div>;
  }

  const isAdminScoped = role === "admin" && officeFilter !== "all";

  const tiles: Array<{ label: string; value: number }> = [];
  if (role === "admin") {
    if (isAdminScoped) {
      tiles.push(
        { label: t("dashboard.total_leads"), value: stats.totalLeads },
        { label: t("dashboard.leads_today"), value: stats.leadsToday },
        {
          label: t("dashboard.agents_in_office", { defaultValue: "Agents in office" }),
          value: stats.officeAgents,
        },
        { label: t("dashboard.unassigned_leads"), value: stats.unassigned },
      );
    } else {
      tiles.push(
        { label: t("dashboard.total_leads"), value: stats.totalLeads },
        { label: t("dashboard.leads_today"), value: stats.leadsToday },
        { label: t("dashboard.total_offices"), value: stats.totalOffices },
        { label: t("dashboard.total_agents"), value: stats.totalAgents },
      );
    }
  } else if (isOfficeManagerRole(role)) {
    tiles.push(
      { label: t("dashboard.total_leads"), value: stats.totalLeads },
      { label: t("dashboard.leads_today"), value: stats.leadsToday },
      { label: t("dashboard.unassigned_leads"), value: stats.unassigned },
      { label: t("dashboard.followup_leads"), value: stats.followUps },
    );
  } else {
    tiles.push(
      { label: t("dashboard.my_leads"), value: stats.totalLeads },
      { label: t("dashboard.new_assigned"), value: stats.byStatus["new"] ?? 0 },
      { label: t("dashboard.my_followups"), value: stats.followUps },
      { label: t("dashboard.leads_today"), value: stats.leadsToday },
    );
  }

  const maxStatus = Math.max(1, ...Object.values(stats.byStatus));
  // Right panel: admin-overview shows offices; admin-scoped + office shows agents; agent has none
  const showOfficeTable = role === "admin" && !isAdminScoped;
  const showAgentTable = isOfficeManagerRole(role) || isAdminScoped;
  const rightList = showOfficeTable ? stats.byOffice : stats.byAgent;
  const maxRight = Math.max(1, ...rightList.map((r) => r.count));
  const showAgentMatrix =
    (isOfficeManagerRole(role) || isAdminScoped) && stats.agentStatusMatrix.length > 0;

  return (
    <div className="space-y-5 font-mono">
      {loadError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </div>
      )}
      {/* Title bar */}
      <div className="border-2 border-foreground bg-card">
        <div className="flex items-center justify-between px-4 py-2 border-b-2 border-foreground bg-foreground text-background gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <h1 className="text-sm uppercase tracking-[0.2em] font-bold">
              {t("dashboard.title")} // {role}
              {isAdminScoped && (
                <span className="ml-2 opacity-80">
                  · {offices.find((o) => o.id === officeFilter)?.name ?? "—"}
                </span>
              )}
              {dateFilter && (
                <span className="ml-2 opacity-80">
                  · {format(new Date(`${dateFilter}T00:00:00`), "EEE dd MMM")}
                </span>
              )}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {role === "admin" && (
              <select
                value={officeFilter}
                onChange={(e) => setOfficeFilter(e.target.value)}
                className="bg-background text-foreground text-[10px] uppercase tracking-widest px-2 py-1 border border-background/40 font-mono"
                aria-label={t("dashboard.filter_office", { defaultValue: "Filter by office" })}
              >
                <option value="all">
                  {t("dashboard.all_offices", { defaultValue: "All offices" })}
                </option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDateFilter("")}
                className={`text-[10px] uppercase tracking-widest px-2 py-1 border font-mono ${dateFilter === "" ? "bg-background text-foreground border-background" : "bg-transparent text-background border-background/40 hover:bg-background/10"}`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setDateFilter(format(new Date(), "yyyy-MM-dd"))}
                className={`text-[10px] uppercase tracking-widest px-2 py-1 border font-mono ${dateFilter === format(new Date(), "yyyy-MM-dd") ? "bg-background text-foreground border-background" : "bg-transparent text-background border-background/40 hover:bg-background/10"}`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  const y = new Date();
                  y.setDate(y.getDate() - 1);
                  setDateFilter(format(y, "yyyy-MM-dd"));
                }}
                className={`text-[10px] uppercase tracking-widest px-2 py-1 border font-mono ${dateFilter === format(new Date(Date.now() - 86400000), "yyyy-MM-dd") ? "bg-background text-foreground border-background" : "bg-transparent text-background border-background/40 hover:bg-background/10"}`}
              >
                Yesterday
              </button>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-background text-foreground text-[10px] uppercase tracking-widest px-2 py-1 border border-background/40 font-mono"
                aria-label="Filter by day"
              />
            </div>
            <span className="text-[10px] uppercase tracking-widest opacity-70">
              {format(new Date(), "EEE dd MMM yyyy · HH:mm")}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x-2 divide-foreground">
          {tiles.map((s) => (
            <div key={s.label} className="px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                ▸ {s.label}
              </div>
              <div className="text-4xl font-bold mt-2 tabular-nums">
                {String(s.value).padStart(2, "0")}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Status panel */}
        <div className="border-2 border-foreground bg-card">
          <div className="px-3 py-1.5 border-b-2 border-foreground bg-muted/50 text-[11px] uppercase tracking-[0.2em] font-bold">
            ░░ {t("dashboard.leads_by_status")}
          </div>
          <div className="p-3 space-y-1.5">
            {LEAD_STATUSES.map((s) => {
              const v = stats.byStatus[s] ?? 0;
              const pct = (v / maxStatus) * 100;
              const blocks = Math.round(pct / 5);
              return (
                <div key={s} className="grid grid-cols-[110px_1fr_40px] items-center gap-2 text-xs">
                  <StatusBadge status={s as LeadStatus} />
                  <div className="font-mono tracking-tighter text-primary truncate">
                    {"█".repeat(blocks)}
                    <span className="text-muted-foreground/40">{"░".repeat(20 - blocks)}</span>
                  </div>
                  <span className="tabular-nums text-right font-bold">
                    {String(v).padStart(3, "0")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right panel */}
        {role !== "agent" && (
          <div className="border-2 border-foreground bg-card">
            <div className="px-3 py-1.5 border-b-2 border-foreground bg-muted/50 text-[11px] uppercase tracking-[0.2em] font-bold">
              ░░ {showOfficeTable ? t("dashboard.leads_by_office") : t("dashboard.leads_by_agent")}
            </div>
            <div className="p-3 overflow-x-auto">
              {rightList.length === 0 ? (
                <div className="text-xs text-muted-foreground py-8 text-center uppercase tracking-widest">
                  — {t("common.no_data")} —
                </div>
              ) : showOfficeTable ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-muted-foreground border-b border-dashed border-foreground/40">
                      <th className="text-left py-1 font-normal">#</th>
                      <th className="text-left py-1 font-normal">Office</th>
                      <th className="text-right py-1 font-normal">Agents</th>
                      {STATUS_GROUP_ORDER.map((g) => (
                        <th key={g} className="text-right py-1 px-1 font-normal">
                          {t(`status_group.${g}`, { defaultValue: g.replace("_", " ") })}
                        </th>
                      ))}
                      <th className="text-right py-1 font-normal">Unass.</th>
                      <th className="text-right py-1 font-normal">Cold</th>
                      <th className="text-right py-1 font-normal">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byOffice.map((row, i) => (
                      <tr
                        key={row.id}
                        className="border-b border-dotted border-foreground/20 hover:bg-muted/30 cursor-pointer"
                        onClick={() => setOfficeFilter(row.id)}
                        title={t("dashboard.filter_office", { defaultValue: "Filter by office" })}
                      >
                        <td className="py-1 text-muted-foreground tabular-nums">
                          {String(i + 1).padStart(2, "0")}
                        </td>
                        <td className="py-1 font-medium truncate">{row.name}</td>
                        <td className="py-1 text-right tabular-nums">{row.agents}</td>
                        {STATUS_GROUP_ORDER.map((g) => (
                          <td key={g} className="py-1 px-1 text-right tabular-nums">
                            {row.groups[g] || <span className="opacity-30">·</span>}
                          </td>
                        ))}
                        <td className="py-1 text-right tabular-nums text-muted-foreground">
                          {row.unassigned || <span className="opacity-30">·</span>}
                        </td>
                        <td className="py-1 text-right tabular-nums text-muted-foreground">
                          {row.cold}
                        </td>
                        <td className="py-1 text-right tabular-nums font-bold">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : showAgentTable ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-muted-foreground border-b border-dashed border-foreground/40">
                      <th className="text-left py-1 font-normal">#</th>
                      <th className="text-left py-1 font-normal">Name</th>
                      <th className="text-right py-1 font-normal">Count</th>
                      <th className="text-left py-1 font-normal pl-3 w-1/3">Bar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byAgent.slice(0, 10).map((row, i) => (
                      <tr key={row.name} className="border-b border-dotted border-foreground/20">
                        <td className="py-1 text-muted-foreground tabular-nums">
                          {String(i + 1).padStart(2, "0")}
                        </td>
                        <td className="py-1 font-medium truncate">{row.name}</td>
                        <td className="py-1 text-right tabular-nums font-bold">{row.count}</td>
                        <td className="py-1 pl-3 text-primary tracking-tighter">
                          {"█".repeat(Math.round((row.count / maxRight) * 12))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Per-agent × status matrix */}
      {showAgentMatrix && (
        <div className="border-2 border-foreground bg-card overflow-x-auto">
          <div className="px-3 py-1.5 border-b-2 border-foreground bg-muted/50 text-[11px] uppercase tracking-[0.2em] font-bold">
            ░░ {t("dashboard.agent_status_matrix", { defaultValue: "Agents × Status" })}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-muted-foreground border-b border-dashed border-foreground/40">
                <th className="text-left py-1 px-3 font-normal">Agent</th>
                {LEAD_STATUSES.map((s) => (
                  <th key={s} className="text-right py-1 px-2 font-normal">
                    {t(`status.${s}`, { defaultValue: s })}
                  </th>
                ))}
                <th className="text-right py-1 px-3 font-normal">Total</th>
              </tr>
            </thead>
            <tbody>
              {stats.agentStatusMatrix.map((row) => (
                <tr key={row.user_id} className="border-b border-dotted border-foreground/20">
                  <td className="py-1 px-3 font-medium truncate">{row.name}</td>
                  {LEAD_STATUSES.map((s) => (
                    <td key={s} className="py-1 px-2 text-right tabular-nums">
                      {row.byStatus[s] ? row.byStatus[s] : <span className="opacity-30">·</span>}
                    </td>
                  ))}
                  <td className="py-1 px-3 text-right tabular-nums font-bold">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Activity log */}
      <div className="border-2 border-foreground bg-card">
        <div className="px-3 py-1.5 border-b-2 border-foreground bg-muted/50 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[0.2em] font-bold">
            ░░ {t("dashboard.recent_activity")}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            [ {stats.recent.length} ENTRIES ]
          </span>
        </div>
        <div className="p-3">
          {stats.recent.length === 0 ? (
            <div className="text-xs text-muted-foreground py-8 text-center uppercase tracking-widest">
              — {t("common.no_data")} —
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-muted-foreground border-b border-dashed border-foreground/40">
                  <th className="text-left py-1 font-normal w-32">Timestamp</th>
                  <th className="text-left py-1 font-normal w-40">Event</th>
                  <th className="text-left py-1 font-normal">Change</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.slice(0, 10).map((a) => (
                  <tr key={a.id} className="border-b border-dotted border-foreground/20">
                    <td className="py-1 tabular-nums text-muted-foreground">
                      {format(new Date(a.created_at), "MMM dd HH:mm")}
                    </td>
                    <td className="py-1 font-bold uppercase tracking-wider">
                      <span className="text-emerald-600">›</span> {a.activity_type}
                    </td>
                    <td className="py-1 text-muted-foreground">
                      {a.old_value && a.new_value ? (
                        <>
                          <span>{a.old_value}</span> <span className="text-primary">→</span>{" "}
                          <span className="text-foreground">{a.new_value}</span>
                        </>
                      ) : (
                        <span className="opacity-40">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
