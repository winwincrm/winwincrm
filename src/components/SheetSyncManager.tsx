import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  FileSpreadsheet, RefreshCw, Play, Pause, Trash2, ExternalLink, PlusCircle,
  PencilLine, CopyX, AlertTriangle, RotateCcw, Clock, History, X, UserPlus, Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  listSheetSyncs, setSheetSyncEnabled, runSheetSyncNow, deleteSheetSync,
  sheetSyncStats, type SheetSyncRow,
} from "@/lib/sheet-syncs.functions";
import { listSheetSyncEvents, type SheetSyncEvent } from "@/lib/sheet-sync-events.functions";
import { reassignLeadWithCommentOption } from "@/lib/lead-reassignment.functions";
import { supabase } from "@/integrations/supabase/client";
import { SheetDuplicatesReview } from "@/components/SheetDuplicatesReview";
import { useDismissedSyncEvents } from "@/lib/dismissed-sync-events";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type AgentOption = { user_id: string; full_name: string | null };

/** Inline agent picker shown on sheet events that created a lead. */
function AssignLeadInline({
  leadId, currentAgentId, currentAgent, agents, onAssigned,
}: {
  leadId: string;
  currentAgentId: string | null;
  currentAgent: string | null;
  agents: AgentOption[];
  onAssigned: (agentId: string | null, agentName: string) => void;
}) {
  const reassign = useServerFn(reassignLeadWithCommentOption);
  const [saving, setSaving] = useState(false);

  const assign = async (value: string) => {
    setSaving(true);
    try {
      await reassign({
        data: {
          leadId,
          assignedUserId: value === "__unassigned" ? null : value,
          keepComments: true,
          keepDescriptions: true,
        },
      });
      const name = value === "__unassigned"
        ? "Unassigned"
        : (agents.find((a) => a.user_id === value)?.full_name ?? "Agent");
      onAssigned(value === "__unassigned" ? null : value, name);
      toast.success(`Lead assigned to ${name}`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  const assignedName = currentAgent && currentAgent !== "Unassigned" ? currentAgent : null;
  const assignedId = currentAgentId
    ?? (assignedName ? (agents.find((a) => (a.full_name ?? "") === assignedName)?.user_id ?? null) : null);
  const availableAgents = assignedId && !agents.some((a) => a.user_id === assignedId)
    ? [{ user_id: assignedId, full_name: assignedName }, ...agents]
    : agents;

  return (
    <span className="mt-1.5 flex items-center gap-2" onClick={(ev) => ev.stopPropagation()}>
      <UserPlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <Select
        disabled={saving}
        value={assignedId ?? "__unassigned"}
        onValueChange={(v) => void assign(v)}
      >
        <SelectTrigger className="h-7 w-[200px] text-xs">
          <SelectValue placeholder="Assign to agent" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__unassigned">Unassigned</SelectItem>
          {availableAgents.map((a) => (
            <SelectItem key={a.user_id} value={a.user_id}>{a.full_name || "Unnamed"}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {assignedName && (
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">assigned</span>
      )}
    </span>
  );
}



type Stats = Awaited<ReturnType<typeof sheetSyncStats>>;

function openLeadInNewTab(leadId: string) {
  window.open(`/leads/${leadId}`, "_blank", "noopener,noreferrer");
}

function openLeadsInNewTab(search?: Record<string, unknown>) {
  const qs = search ? "?" + new URLSearchParams(Object.entries(search).map(([k, v]) => [k, String(v)])).toString() : "";
  window.open(`/leads${qs}`, "_blank", "noopener,noreferrer");
}

function eventIcon(kind: SheetSyncEvent["kind"]) {
  if (kind === "inserted") return <PlusCircle className="h-4 w-4 text-emerald-500" />;
  if (kind === "restored") return <RotateCcw className="h-4 w-4 text-sky-500" />;
  if (kind === "updated") return <PencilLine className="h-4 w-4 text-amber-500" />;
  if (kind === "duplicate") return <CopyX className="h-4 w-4 text-orange-500" />;
  if (kind === "deleted") return <Trash2 className="h-4 w-4 text-rose-500" />;
  return <AlertTriangle className="h-4 w-4 text-destructive" />;
}

function eventTitle(e: SheetSyncEvent) {
  const who = e.lead_name ?? "Unnamed";
  if (e.kind === "inserted") return `Row added in sheet · ${who}`;
  if (e.kind === "restored") return `Row re-imported · ${who}`;
  if (e.kind === "updated") return `Row edited in sheet · ${who}`;
  if (e.kind === "duplicate") return `Duplicate needs review · ${who}`;
  if (e.kind === "deleted") return `Row removed from sheet · ${who}`;
  return "Sheet sync error";
}

function when(iso: string | null) {
  if (!iso) return "never";
  return new Date(iso).toLocaleString();
}

export function SheetSyncManager() {
  const fetchSyncs = useServerFn(listSheetSyncs);
  const fetchEvents = useServerFn(listSheetSyncEvents);
  const fetchStats = useServerFn(sheetSyncStats);
  const toggleSync = useServerFn(setSheetSyncEnabled);
  const runNow = useServerFn(runSheetSyncNow);
  const removeSync = useServerFn(deleteSheetSync);

  const [syncs, setSyncs] = useState<SheetSyncRow[]>([]);
  const [allEvents, setEvents] = useState<SheetSyncEvent[]>([]);
  const { dismissed, dismiss } = useDismissedSyncEvents();
  const [stats, setStats] = useState<Stats | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SheetSyncRow | null>(null);
  const [kindFilter, setKindFilter] = useState<"all" | "new" | "edited" | "duplicate" | "removed" | "error">("all");
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const { profile, role } = useAuth();
  const perms = usePermissions(role, profile?.user_id ?? null);
  const canSyncNow = perms.canAction("sheet_sync_now");
  const canPause = perms.canAction("sheet_pause");
  const canRemoveLink = perms.canAction("sheet_remove_link");
  const canResolveDuplicates = perms.canAction("sheet_resolve_duplicates");
  const canAssign = perms.canAction("sheet_assign_lead");

  const loadSyncs = useCallback(async () => {
    const rows = await fetchSyncs({ data: {} as never });
    setSyncs(rows);
    setSelected((cur) => cur && rows.some((r) => r.id === cur) ? cur : (rows[0]?.id ?? null));
    setLoading(false);
  }, [fetchSyncs]);

  useEffect(() => { void loadSyncs().catch((e) => { setLoading(false); toast.error(String(e)); }); }, [loadSyncs]);

  const active = useMemo(() => syncs.find((s) => s.id === selected) ?? null, [syncs, selected]);

  useEffect(() => {
    if (!active?.office_id) {
      setAgents([]);
      return;
    }
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("user_id, full_name")
      .eq("office_id", active.office_id)
      .eq("status", "active")
      .order("full_name")
      .then(({ data }) => {
        if (!cancelled) setAgents((data ?? []) as AgentOption[]);
      });
    return () => { cancelled = true; };
  }, [active?.office_id]);

  // History categories: new rows, edited rows, duplicates, removed rows, errors.
  const category = (k: SheetSyncEvent["kind"]) =>
    k === "inserted" || k === "restored" ? "new"
      : k === "updated" ? "edited"
        : k === "duplicate" ? "duplicate"
          : k === "deleted" ? "removed" : "error";

  // A lead that already has an agent is no longer a pending "new lead":
  // once assigned, its row disappears from the New leads list (and counters).
  const isAssigned = (e: SheetSyncEvent) =>
    !!e.lead?.agent_name && e.lead.agent_name !== "Unassigned";

  const events = useMemo(
    () => allEvents.filter((e) =>
      !dismissed.has(e.id) && !(category(e.kind) === "new" && isAssigned(e))),
    [allEvents, dismissed],
  );

  const counts = useMemo(() => {
    const c = { all: events.length, new: 0, edited: 0, duplicate: 0, removed: 0, error: 0 };
    for (const e of events) c[category(e.kind)]++;
    return c;
  }, [events]);

  const visibleEvents = useMemo(
    () => kindFilter === "all" ? events : events.filter((e) => category(e.kind) === kindFilter),
    [events, kindFilter],
  );

  // Double-clicking a category chip opens exactly those leads (in the same
  // order as the activity list) in a new Leads tab, ready to be assigned.
  const openCategoryInLeads = (key: typeof kindFilter) => {
    const list = key === "all" ? events : events.filter((e) => category(e.kind) === key);
    const ids: string[] = [];
    for (const e of list) if (e.lead_id && !ids.includes(e.lead_id)) ids.push(e.lead_id);
    if (ids.length === 0) {
      toast.info("No leads to open in this category yet.");
      return;
    }
    const url = `/leads?ids=${ids.join(",")}&size=${Math.min(1000, Math.max(50, ids.length))}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };


  const loadDetail = useCallback(async (sync: SheetSyncRow | null) => {
    if (!sync) { setEvents([]); setStats(null); return; }
    const [ev, st] = await Promise.all([
      fetchEvents({ data: { sync_id: sync.id, limit: 200, with_lead_details: true } }),
      fetchStats({ data: { id: sync.id } }).catch(() => null),
    ]);
    setEvents(ev);
    setStats(st);
  }, [fetchEvents, fetchStats]);

  useEffect(() => { void loadDetail(active).catch(() => undefined); }, [active, loadDetail]);

  // Leads are often assigned in the Leads tab opened from a category chip —
  // re-read the activity when this tab regains focus so assigned leads drop out.
  useEffect(() => {
    const onFocus = () => { void loadDetail(active).catch(() => undefined); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [active, loadDetail]);

  const refresh = async () => {
    setBusy(true);
    try { await loadSyncs(); await loadDetail(active); } finally { setBusy(false); }
  };

  const handleToggle = async (sync: SheetSyncRow, enabled: boolean) => {
    setSyncs((p) => p.map((s) => s.id === sync.id ? { ...s, enabled } : s));
    try {
      await toggleSync({ data: { id: sync.id, enabled } });
      toast.success(enabled ? "Live sync started" : "Live sync paused");
    } catch (e) {
      setSyncs((p) => p.map((s) => s.id === sync.id ? { ...s, enabled: !enabled } : s));
      toast.error(String(e));
    }
  };

  const handleRunNow = async (sync: SheetSyncRow) => {
    setBusy(true);
    try {
      const r = await runNow({ data: { id: sync.id } });
      toast.success(`Synced · +${r.inserted} new · ${r.updated} updated · ${r.duplicates} duplicates`);
      await loadSyncs();
      await loadDetail(sync);
    } catch (e) { toast.error(String(e)); } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    const sync = confirmDelete;
    if (!sync) return;
    setConfirmDelete(null);
    setBusy(true);
    try {
      await removeSync({ data: { id: sync.id, delete_leads: false } });
      toast.success("Sheet link removed — the imported leads were kept");
      await loadSyncs();
    } catch (e) { toast.error(String(e)); } finally { setBusy(false); }
  };


  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,380px)_1fr]">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
            Connected sheets ({syncs.length})
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => void refresh()} disabled={busy} aria-label="Refresh">
            <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
          ) : syncs.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              No Google Sheet linked yet. Add one from Leads → Import → Google Sheet URL.
            </p>
          ) : (
            <ul className="divide-y">
              {syncs.map((s) => (
                <li
                  key={s.id}
                  onClick={() => setSelected(s.id)}
                  className={cn(
                    "px-4 py-3 cursor-pointer hover:bg-muted/60",
                    s.id === selected && "bg-primary/5",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate flex-1">{s.name || "Google Sheet"}</span>
                    <Badge variant={s.enabled ? "default" : "secondary"}>{s.enabled ? "Live" : "Paused"}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground truncate">{s.sheet_url}</p>
                  <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-foreground/75">
                    <Building2 className="h-3 w-3" /> {s.office_name ?? "Admin inbox"}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" /> every {s.interval_seconds}s · last run {when(s.last_run_at)}
                  </p>
                  {s.last_error && (
                    <p className="mt-1 text-[11px] text-destructive truncate">{s.last_error}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            {active ? (active.name || "Google Sheet") : "Sheet details"}
          </CardTitle>
          {active && (
            <div className="space-y-3 pt-1">
              <Badge variant="outline" className="w-fit gap-1">
                <Building2 className="h-3 w-3" /> {active.office_name ?? "Admin inbox"}
              </Badge>
              <a
                href={active.sheet_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary underline break-all"
              >
                {active.sheet_url} <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <Switch checked={active.enabled} disabled={!canPause} onCheckedChange={(v) => void handleToggle(active, v)} />
                  <span className="text-muted-foreground">{active.enabled ? "Live sync on" : "Live sync off"}</span>
                </div>
                {canSyncNow && (
                <Button size="sm" variant="outline" onClick={() => void handleRunNow(active)} disabled={busy}>
                  {active.enabled ? <RefreshCw className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                  Sync now
                </Button>
                )}
                {canPause && (
                <Button size="sm" variant="outline" onClick={() => void handleToggle(active, !active.enabled)} disabled={busy}>
                  {active.enabled ? <Pause className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                  {active.enabled ? "Pause" : "Start"}
                </Button>
                )}
                {canRemoveLink && (
                  <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(active)} disabled={busy}>
                    <Trash2 className="h-4 w-4 mr-1" /> Remove link
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {([
                  ["Leads imported (unassigned)", stats?.pendingLeads ?? 0, { sheet: active.id, sheetpending: 1 }],
                  ["Leads linked now", stats?.linkedLeads ?? 0, { sheet: active.id }],
                  ["Updates", stats?.updated ?? 0, null],
                  ["Duplicates", stats?.duplicates ?? 0, null],
                ] as Array<[string, number, Record<string, unknown> | null]>).map(([label, value, go]) => (
                go
                    ? (
                      <button
                        key={label}
                        type="button"
                        onClick={() => openLeadsInNewTab(go)}
                        className="rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/60 hover:border-primary/50"
                        title="Show exactly these leads in a new tab"
                      >
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-lg font-semibold">{value}</p>
                      </button>
                    )
                    : (
                      <div key={label} className="rounded-md border px-3 py-2">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-lg font-semibold">{value}</p>
                      </div>
                    )
                ))}
              </div>
              {stats && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md border px-3 py-2 space-y-1">
                    <p className="text-xs font-medium">Import target</p>
                    <p className="text-xs text-muted-foreground">Office: <span className="text-foreground">{stats.target.officeName}</span></p>
                    <p className="text-xs text-muted-foreground">Agent: <span className="text-foreground">{stats.target.agentName}</span></p>
                    <p className="text-xs text-muted-foreground">Source: <span className="text-foreground">{stats.target.source}</span></p>
                    <p className="text-xs text-muted-foreground">List: <span className="text-foreground">{stats.target.listName}</span></p>
                    <p className="text-xs text-muted-foreground">
                      Every {stats.target.intervalSeconds}s · updates existing rows: {stats.target.updateExisting ? "yes" : "no"}
                    </p>
                  </div>
                  <div className="rounded-md border px-3 py-2 space-y-2">
                    <p className="text-xs font-medium">Where the leads are now</p>
                    {([
                      ["Office", stats.byOffice],
                      ["Agent", stats.byAgent],
                      ["Source", stats.bySource],
                      ["List", stats.byList],
                      ["Status", stats.byStatus],
                    ] as const).map(([label, rows]) => (
                      <div key={label} className="flex flex-wrap items-center gap-1">
                        <span className="text-[11px] text-muted-foreground w-12 shrink-0">{label}</span>
                        {rows.length === 0 ? (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        ) : rows.slice(0, 6).map((r) => (
                          <Badge key={r.label} variant="secondary" className="text-[10px] font-normal">
                            {r.label} · {r.count}
                          </Badge>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Status: {active.last_status ?? "—"} · next run {when(active.next_run_at)}
              </p>
            </div>
          )}

        </CardHeader>
        <CardContent className="p-0">
          {!active ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Select a sheet to see its history.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1 border-t px-3 py-2">
                {([
                  ["all", "All"],
                  ["new", "New leads"],
                  ["edited", "Edited rows"],
                  ["duplicate", "Duplicates"],
                  ["removed", "Removed rows"],
                  ["error", "Errors"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setKindFilter(key)}
                    onDoubleClick={() => openCategoryInLeads(key)}
                    title="Double-click to open these leads in a new tab"
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      kindFilter === key
                        ? "border-primary bg-primary/10 text-foreground font-medium"
                        : "text-muted-foreground hover:bg-muted/60",
                    )}
                  >
                    {label} · {counts[key]}
                  </button>
                ))}
              </div>
              {kindFilter === "duplicate" && (
                <div className="border-t p-3">
                  {canResolveDuplicates && (
                    <SheetDuplicatesReview syncId={active.id} onResolved={() => void refresh()} />
                  )}
                </div>
              )}
              <ScrollArea className="h-[520px] border-t">
                {visibleEvents.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">
                    {events.length === 0
                      ? "No activity recorded for this sheet yet."
                      : "Nothing in this category yet."}
                  </p>
                ) : (
                  <ul className="divide-y">
                    {visibleEvents.map((e) => (

                    <li
                      key={e.id}
                      className={cn(
                        "flex gap-2 px-4 py-2 text-sm",
                        e.lead_id && "cursor-pointer hover:bg-muted/60",
                      )}
                      onClick={() => {
                        if (!e.lead_id) return;
                        openLeadInNewTab(e.lead_id);
                      }}
                    >
                      <span className="mt-0.5">{eventIcon(e.kind)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium truncate">{eventTitle(e)}</span>
                        {e.detail && (
                          <span className="mt-0.5 block text-xs text-muted-foreground whitespace-pre-line break-words">
                            {e.detail}
                          </span>
                        )}
                        {e.lead && (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {([
                              ["Source", e.lead.source],
                              ["Office", e.lead.office_name],
                              ["Agent", e.lead.agent_name],
                              ["List", e.lead.list_name],
                              ["Status", e.lead.status],
                              ["Email", e.lead.email],
                              ["Phone", e.lead.phone],
                            ] as const)
                              .filter(([, v]) => !!v)
                              .map(([label, v]) => (
                                <Badge key={label} variant="outline" className="text-[10px] font-normal">
                                  {label}: {v}
                                </Badge>
                              ))}
                          </span>
                        )}
                        {canAssign && e.lead_id && (e.kind === "inserted" || e.kind === "restored" || e.kind === "updated") && (
                          <AssignLeadInline
                            leadId={e.lead_id}
                            currentAgentId={e.lead?.assigned_user_id ?? null}
                            currentAgent={e.lead?.agent_name ?? null}
                            agents={agents}
                            onAssigned={(agentId, name) =>
                              setEvents((prev) => prev.map((x) =>
                                x.lead_id === e.lead_id && x.lead
                                  ? { ...x, lead: { ...x.lead, assigned_user_id: agentId, agent_name: name } }
                                  : x,
                              ))
                            }
                          />
                        )}



                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          {new Date(e.created_at).toLocaleString()}
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label="Delete notification"
                        className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground hover:opacity-100"
                        onClick={(ev) => { ev.stopPropagation(); dismiss([e.id]); }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base sm:text-lg break-words">
              Remove “{confirmDelete?.name || "Google Sheet"}”?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs sm:text-sm">
              The sheet will stop syncing. The{" "}
              {confirmDelete && confirmDelete.id === active?.id
                ? `${stats?.linkedLeads ?? 0} lead${(stats?.linkedLeads ?? 0) === 1 ? "" : "s"}`
                : "leads"}{" "}
              imported from this sheet will stay in the CRM — only the link is removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel className="w-full sm:w-auto mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction className="w-full sm:w-auto" onClick={() => void handleDelete()}>
              Remove link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
