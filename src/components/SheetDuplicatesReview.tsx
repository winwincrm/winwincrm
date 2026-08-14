import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CopyX, RefreshCw, Check, SkipForward, Replace, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  listSheetDuplicates, resolveSheetDuplicates, type PendingDuplicate,
} from "@/lib/sheet-duplicates.functions";
import { cn } from "@/lib/utils";

const NONE = "__none__";

type Props = {
  syncId: string | null;
  /** Called after a decision so the parent can refresh stats / history. */
  onResolved?: () => void;
};

function openLeadInNewTab(leadId: string) {
  window.open(`/leads/${leadId}`, "_blank", "noopener,noreferrer");
}

/** Duplicate sheet rows that are held back until someone decides what to do. */
export function SheetDuplicatesReview({ syncId, onResolved }: Props) {
  const fetchDuplicates = useServerFn(listSheetDuplicates);
  const resolve = useServerFn(resolveSheetDuplicates);

  const [rows, setRows] = useState<PendingDuplicate[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [office, setOffice] = useState<string>(NONE);
  const [agent, setAgent] = useState<string>(NONE);
  const [offices, setOffices] = useState<Array<{ id: string; name: string }>>([]);
  const [agents, setAgents] = useState<Array<{ user_id: string; full_name: string | null; office_id: string | null }>>([]);

  useEffect(() => {
    void supabase.from("offices").select("id, name").then(({ data }) => setOffices(data ?? []));
    void supabase.from("profiles").select("user_id, full_name, office_id")
      .then(({ data }) => setAgents(data ?? []));
  }, []);

  const load = useCallback(async () => {
    if (!syncId) { setRows([]); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDuplicates({ data: { sync_id: syncId } });
      setRows(res.pending);
      setError(res.error ?? null);
      setChecked(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [fetchDuplicates, syncId]);

  useEffect(() => { void load(); }, [load]);

  const agentOptions = useMemo(
    () => agents.filter((a) => office === NONE || !a.office_id || a.office_id === office),
    [agents, office],
  );

  const allChecked = rows.length > 0 && checked.size === rows.length;

  const apply = async (action: "skip" | "import" | "replace", keys: string[]) => {
    if (!syncId || keys.length === 0) return;
    setBusy(true);
    try {
      const res = await resolve({
        data: {
          sync_id: syncId,
          keys,
          action,
          ...(action === "skip"
            ? {}
            : {
              office_id: office === NONE ? null : office,
              assigned_user_id: agent === NONE ? null : agent,
            }),
        },
      });
      const done = res.skipped + res.imported + res.linked + (res.replaced ?? 0);
      const label = action === "skip"
        ? "skipped — the existing lead was kept"
        : action === "replace"
          ? "replaced — the old lead was deleted, the sheet row kept"
          : "imported as new leads";
      toast.success(
        `${done} duplicate${done === 1 ? "" : "s"} ${label}` +
        (res.failed.length ? ` · ${res.failed.length} could not be processed` : ""),
      );
      await load();
      onResolved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };


  if (!syncId) return null;

  return (
    <Card className="border-orange-500/40">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CopyX className="h-4 w-4 text-orange-500" />
          Duplicates awaiting your decision
          <Badge variant={rows.length ? "default" : "secondary"}>{rows.length}</Badge>
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={() => void load()} disabled={loading || busy} aria-label="Reload duplicates">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-xs text-destructive break-words">{error}</p>}
        {loading ? (
          <p className="text-sm text-muted-foreground">Reading the sheet…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No duplicate rows are waiting. Rows that match a lead already in the CRM appear here instead of being skipped silently.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <Checkbox
                checked={allChecked}
                onCheckedChange={(v) => setChecked(v ? new Set(rows.map((r) => r.rowKey)) : new Set())}
                aria-label="Select all duplicates"
              />
              <span className="text-xs text-muted-foreground">
                {checked.size > 0 ? `${checked.size} selected` : "Select all"}
              </span>
              <span className="mx-1 h-4 w-px bg-border" />
              <Select value={office} onValueChange={(v) => { setOffice(v); setAgent(NONE); }}>
                <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Office" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Admin inbox (no office)</SelectItem>
                  {offices.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={agent} onValueChange={setAgent}>
                <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Agent" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {agentOptions.map((a) => (
                    <SelectItem key={a.user_id} value={a.user_id}>{a.full_name || a.user_id.slice(0, 8)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" disabled={busy || checked.size === 0} onClick={() => void apply("skip", [...checked])}>
                <SkipForward className="h-4 w-4 mr-1" /> Skip (keep old)
              </Button>
              <Button size="sm" disabled={busy || checked.size === 0} onClick={() => void apply("import", [...checked])}>
                <Check className="h-4 w-4 mr-1" /> Import anyway (keep both)
              </Button>
              <Button size="sm" variant="destructive" disabled={busy || checked.size === 0} onClick={() => void apply("replace", [...checked])}>
                <Replace className="h-4 w-4 mr-1" /> Delete old, keep new
              </Button>

            </div>

            <ul className="divide-y rounded-md border">
              {rows.map((r) => {
                const isOpen = open.has(r.rowKey);
                return (
                  <li key={r.rowKey} className="px-3 py-2 text-sm">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        className="mt-1"
                        checked={checked.has(r.rowKey)}
                        onCheckedChange={(v) => setChecked((p) => {
                          const n = new Set(p);
                          if (v) n.add(r.rowKey); else n.delete(r.rowKey);
                          return n;
                        })}
                        aria-label={`Select ${r.name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium truncate">{r.name}</span>
                          <Badge variant="outline" className="text-[10px] font-normal">
                            sheet row {r.sheetRows.join(", ")}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            {r.match.reason === "email" ? "same email as an existing lead"
                              : r.match.reason === "phone" ? "same phone as an existing lead"
                                : `repeats sheet row ${r.match.firstSheetRow}`}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground break-words">
                          {[r.email, r.phone].filter(Boolean).join(" · ") || "no email / phone in this row"}
                        </p>
                        {r.match.leadId ? (
                          <div className="mt-1 rounded-md border bg-muted/30 px-2 py-1 text-xs">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-muted-foreground">Existing lead:</span>
                              <span className="font-medium">{r.match.leadName || "Unnamed"}</span>
                              <Badge variant="outline" className="text-[10px] font-normal">
                                Agent: {r.match.agentName || "Unassigned"}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] font-normal">
                                Office: {r.match.officeName || "Admin inbox"}
                              </Badge>
                              {r.match.leadStatus && (
                                <Badge variant="secondary" className="text-[10px] font-normal">{r.match.leadStatus}</Badge>
                              )}
                              <button
                                type="button"
                                className="text-primary underline"
                                onClick={() => r.match.leadId && openLeadInNewTab(r.match.leadId)}
                              >
                                open it
                              </button>
                            </div>
                            <p className="mt-0.5 text-[11px] text-muted-foreground break-words">
                              {[r.match.leadEmail, r.match.leadPhone].filter(Boolean).join(" · ")}
                              {r.match.leadCreatedAt ? ` · added ${new Date(r.match.leadCreatedAt).toLocaleDateString()}` : ""}
                            </p>
                          </div>
                        ) : (
                          <p className="mt-1 text-xs text-muted-foreground">
                            No lead exists yet for this person — sheet row {r.match.firstSheetRow} has not been imported.
                          </p>
                        )}


                        <button
                          type="button"
                          className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                          onClick={() => setOpen((p) => {
                            const n = new Set(p);
                            if (n.has(r.rowKey)) n.delete(r.rowKey); else n.add(r.rowKey);
                            return n;
                          })}
                        >
                          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          {isOpen ? "Hide row data" : "Show row data"}
                        </button>
                        {isOpen && (
                          <div className="mt-1 grid gap-0.5 rounded-md bg-muted/40 px-2 py-1">
                            {r.fields.map((f) => (
                              <p key={f.label} className="text-[11px] text-muted-foreground break-words">
                                {f.label}: <span className="text-foreground">{f.value}</span>
                              </p>
                            ))}
                          </div>
                        )}

                        <div className="mt-2 flex flex-wrap gap-1">
                          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy}
                            onClick={() => void apply("skip", [r.rowKey])}>
                            Skip (keep old)
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy}
                            onClick={() => void apply("import", [r.rowKey])}>
                            Import anyway (keep both)
                          </Button>
                          {r.match.leadId && (
                            <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={busy}
                              onClick={() => void apply("replace", [r.rowKey])}>
                              Delete old, keep new
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] text-muted-foreground">
              “Skip (keep old)” never imports that row again. “Import anyway (keep both)” creates a second lead using the office/agent chosen
              above. “Delete old, keep new” removes the existing lead and imports the sheet row in its place.
            </p>

          </>
        )}
      </CardContent>
    </Card>
  );
}
