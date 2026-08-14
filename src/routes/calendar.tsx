import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarClock, Search, RefreshCw, ExternalLink } from "lucide-react";
import { statusLabel } from "@/lib/lead-status-labels";
import { LeadDetailInline } from "@/components/LeadDetailInline";

export const Route = createFileRoute("/calendar")({
  component: CalendarPage,
});

function CalendarPage() {
  return (
    <ProtectedRoute roles={["admin", "manager", "superiormanager", "agent"]}>
      <CalendarContent />
    </ProtectedRoute>
  );
}

const FINISHED_STATUSES = new Set(["converted", "qualified", "rejected", "lost"]);

interface Row {
  id: string;
  full_name: string;
  phone: string | null;
  status: string;
  assigned_user_id: string | null;
  office_id: string | null;
  kind: "callback" | "appointment";
  when: string; // ISO
}

interface OfficeLite { id: string; name: string }
interface AgentLite { user_id: string; full_name: string | null; office_id: string | null }

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function fmtWhen(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mi} | ${dd}-${mm}-${yy}`;
}

function CalendarContent() {
  const { role, profile } = useAuth();
  const isAdmin = role === "admin";
  const canFilterOffice = isAdmin;
  const canFilterAgent = isAdmin || role === "manager" || role === "superiormanager";

  const [offices, setOffices] = useState<OfficeLite[]>([]);
  const [agents, setAgents] = useState<AgentLite[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters (draft = pending, applied = active)
  const [officeDraft, setOfficeDraft] = useState<string>("all");
  const [agentDraft, setAgentDraft] = useState<string>("all");
  const [fromDraft, setFromDraft] = useState<string>(todayISO(-30));
  const [toDraft, setToDraft] = useState<string>(todayISO(60));
  const [finishedDraft, setFinishedDraft] = useState<string>("all");
  const [kindDraft, setKindDraft] = useState<string>("all");
  const [limitDraft, setLimitDraft] = useState<string>("50");

  const [applied, setApplied] = useState({
    office: "all",
    agent: "all",
    from: todayISO(-30),
    to: todayISO(60),
    finished: "all",
    kind: "all",
    limit: 50,
  });

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const navigate = useNavigate();

  // Load reference data once (RLS scopes results per role)
  useEffect(() => {
    if (canFilterOffice) {
      void supabase.from("offices").select("id, name").order("name").then(({ data }) => setOffices(data ?? []));
    }
    if (canFilterAgent) {
      void supabase.from("profiles").select("user_id, full_name, office_id").order("full_name")
        .then(({ data }) => setAgents(data ?? []));
    }
  }, [canFilterOffice, canFilterAgent, profile?.office_id]);

  // Load calendar data whenever filters applied
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const fromIso = new Date(applied.from + "T00:00:00").toISOString();
      const toIso = new Date(applied.to + "T23:59:59").toISOString();

      let q = supabase
        .from("leads")
        .select("id, full_name, phone, status, assigned_user_id, office_id, payload")
        .or("payload->>callback_at.not.is.null,payload->>appointment_at.not.is.null")
        .limit(5000);

      if (applied.office !== "all") q = q.eq("office_id", applied.office);
      if (applied.agent !== "all") q = q.eq("assigned_user_id", applied.agent);

      const { data, error } = await q;
      if (cancelled) return;
      if (error) {
        console.error(error);
        setRows([]);
        setLoading(false);
        return;
      }

      const out: Row[] = [];
      for (const l of data ?? []) {
        const p = (l.payload ?? {}) as Record<string, unknown>;
        const cb = typeof p.callback_at === "string" ? p.callback_at : null;
        const ap = typeof p.appointment_at === "string" ? p.appointment_at : null;
        if (cb) {
          out.push({
            id: l.id, full_name: l.full_name, phone: l.phone, status: l.status,
            assigned_user_id: l.assigned_user_id, office_id: l.office_id,
            kind: "callback", when: cb,
          });
        }
        if (ap) {
          out.push({
            id: l.id, full_name: l.full_name, phone: l.phone, status: l.status,
            assigned_user_id: l.assigned_user_id, office_id: l.office_id,
            kind: "appointment", when: ap,
          });
        }
      }

      const filtered = out.filter((r) => {
        const t = new Date(r.when).getTime();
        if (Number.isNaN(t)) return false;
        if (t < new Date(fromIso).getTime()) return false;
        if (t > new Date(toIso).getTime()) return false;
        if (applied.kind !== "all" && r.kind !== applied.kind) return false;
        const isFinished = FINISHED_STATUSES.has(r.status);
        if (applied.finished === "finished" && !isFinished) return false;
        if (applied.finished === "unfinished" && isFinished) return false;
        return true;
      });

      filtered.sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime());

      setRows(filtered);
      setPage(1);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [applied]);

  const officeMap = useMemo(() => new Map(offices.map((o) => [o.id, o.name])), [offices]);
  const agentMap = useMemo(() => new Map(agents.map((a) => [a.user_id, a.full_name ?? ""])), [agents]);

  const agentOptions = useMemo(() => {
    if (officeDraft === "all") return agents;
    return agents.filter((a) => a.office_id === officeDraft);
  }, [agents, officeDraft]);

  const searched = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const agent = (r.assigned_user_id ? agentMap.get(r.assigned_user_id) : "") ?? "";
      return (
        r.full_name.toLowerCase().includes(s) ||
        (r.phone ?? "").toLowerCase().includes(s) ||
        agent.toLowerCase().includes(s) ||
        r.status.toLowerCase().includes(s)
      );
    });
  }, [rows, search, agentMap]);

  const total = searched.length;
  const pageSize = applied.limit;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const visible = searched.slice((page - 1) * pageSize, page * pageSize);

  const apply = () => {
    setApplied({
      office: officeDraft,
      agent: agentDraft,
      from: fromDraft,
      to: toDraft,
      finished: finishedDraft,
      kind: kindDraft,
      limit: Math.max(1, Number(limitDraft) || 50),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">
            ({total}) Calendar
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 rounded-lg border bg-card p-4">
        {canFilterOffice && (
          <div>
            <label className="text-xs text-muted-foreground">Office</label>
            <Select value={officeDraft} onValueChange={(v) => { setOfficeDraft(v); setAgentDraft("all"); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {offices.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {canFilterAgent && (
          <div>
            <label className="text-xs text-muted-foreground">Agent</label>
            <Select value={agentDraft} onValueChange={setAgentDraft}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {agentOptions.map((a) => (
                  <SelectItem key={a.user_id} value={a.user_id}>{a.full_name || a.user_id.slice(0, 8)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <label className="text-xs text-muted-foreground">Kind</label>
          <Select value={kindDraft} onValueChange={setKindDraft}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="callback">Callbacks</SelectItem>
              <SelectItem value="appointment">Appointments</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Finished</label>
          <Select value={finishedDraft} onValueChange={setFinishedDraft}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="finished">Finished</SelectItem>
              <SelectItem value="unfinished">Unfinished</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Per page</label>
          <Input className="h-9" type="number" min={1} value={limitDraft} onChange={(e) => setLimitDraft(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button onClick={apply} className="h-9 w-full">
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Apply Filters"}
          </Button>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">From</label>
          <Input className="h-9" type="date" value={fromDraft} onChange={(e) => setFromDraft(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">To</label>
          <Input className="h-9" type="date" value={toDraft} onChange={(e) => setToDraft(e.target.value)} />
        </div>
      </div>

      <div className="flex justify-end">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search…"
            className="pl-8 h-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Operator</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Office</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : visible.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No scheduled leads for these filters.</TableCell></TableRow>
            ) : visible.map((r, idx) => {
              const finished = FINISHED_STATUSES.has(r.status);
              return (
                <Fragment key={`${r.id}-${r.kind}-${idx}`}>
                <TableRow className={expandedId === r.id ? "bg-muted/30" : ""}>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {r.assigned_user_id ? (agentMap.get(r.assigned_user_id) || "—") : "Unassigned"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => navigate({ to: "/leads", search: { selected: r.id } as never })}
                      className="text-primary hover:underline inline-flex items-center gap-1"
                      title="Open in Leads and highlight this lead"
                    >
                      {r.full_name}
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-foreground">{r.phone ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={r.kind === "appointment" ? "default" : "outline"} className="capitalize">
                      {r.kind}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{fmtWhen(r.when)}</TableCell>
                  <TableCell>
                    <Badge variant={finished ? "default" : "secondary"} className={finished ? "bg-primary" : ""}>
                      {finished ? "Finished" : "Unfinished"}
                    </Badge>
                    <span className="ml-2 text-xs text-muted-foreground">{statusLabel(r.status)}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.office_id ? (officeMap.get(r.office_id) ?? "—") : "Admin inbox"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedId((prev) => (prev === r.id ? null : r.id))}
                    >
                      {expandedId === r.id ? "Hide details" : "View details"}
                    </Button>
                  </TableCell>
                </TableRow>
                {expandedId === r.id && (
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableCell colSpan={8} className="p-0">
                      <LeadDetailInline
                        leadId={r.id}
                        agents={agents.filter((a) => a.office_id === r.office_id)}
                        onClose={() => setExpandedId(null)}
                      />
                    </TableCell>
                  </TableRow>
                )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>
          Showing {total === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total} results
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>« Previous</Button>
          <span>Page {page} / {pageCount}</span>
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Next »</Button>
        </div>
      </div>
    </div>
  );
}
