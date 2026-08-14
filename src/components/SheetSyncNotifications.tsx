import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, FileSpreadsheet, PlusCircle, PencilLine, AlertTriangle, CopyX, Trash2, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { listSheetSyncEvents, type SheetSyncEvent } from "@/lib/sheet-sync-events.functions";
import { useDismissedSyncEvents } from "@/lib/dismissed-sync-events";
import { cn } from "@/lib/utils";

const POLL_MS = 10_000;
const SEEN_KEY = "sheet-sync-events-seen-at";


function icon(kind: SheetSyncEvent["kind"]) {
  if (kind === "inserted") return <PlusCircle className="h-4 w-4 text-emerald-500" />;
  if (kind === "restored") return <RotateCcw className="h-4 w-4 text-sky-500" />;
  if (kind === "updated") return <PencilLine className="h-4 w-4 text-amber-500" />;
  if (kind === "duplicate") return <CopyX className="h-4 w-4 text-orange-500" />;
  if (kind === "deleted") return <Trash2 className="h-4 w-4 text-rose-500" />;
  return <AlertTriangle className="h-4 w-4 text-destructive" />;
}

function title(e: SheetSyncEvent) {
  const who = e.lead_name ?? "Unnamed";
  if (e.kind === "inserted") return `Row added in sheet · ${who}`;
  if (e.kind === "restored") return `Row re-imported · ${who}`;
  if (e.kind === "updated") return `Row edited in sheet · ${who}`;
  if (e.kind === "duplicate") return `Duplicate needs review · ${who}`;
  if (e.kind === "deleted") return `Row deleted from sheet · ${who}`;
  return "Sheet sync error";
}


function openLeadInNewTab(leadId: string) {
  window.open(`/leads/${leadId}`, "_blank", "noopener,noreferrer");
}

function openLeadsInNewTab(search?: Record<string, unknown>) {
  const qs = search ? "?" + new URLSearchParams(Object.entries(search).map(([k, v]) => [k, String(v)])).toString() : "";
  window.open(`/leads${qs}`, "_blank", "noopener,noreferrer");
}

export function SheetSyncNotifications() {
  const fetchEvents = useServerFn(listSheetSyncEvents);
  const [allEvents, setEvents] = useState<SheetSyncEvent[]>([]);
  const [open, setOpen] = useState(false);
  const { dismissed, dismiss } = useDismissedSyncEvents();
  const events = useMemo(() => allEvents.filter((e) => !dismissed.has(e.id)), [allEvents, dismissed]);
  const [seenAt, setSeenAt] = useState<string>(() =>
    (typeof window !== "undefined" && localStorage.getItem(SEEN_KEY)) || new Date(0).toISOString(),
  );
  const lastId = useRef<string | null>(null);

  const first = useRef(true);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const response: unknown = await fetchEvents({ data: { limit: 30 } });
        if (stop) return;
        if (!Array.isArray(response)) {
          console.error("[SheetSyncNotifications] Expected an event array from the server.");
          setEvents([]);
          return;
        }
        const rows = response as SheetSyncEvent[];
        setEvents(rows);
        const newest = rows[0];
        if (newest && newest.id !== lastId.current) {
          // Only pop toasts for changes that happened while the app was open.
          if (!first.current) {
            const idx = rows.findIndex((r) => r.id === lastId.current);
            const fresh = rows.slice(0, idx === -1 ? 3 : idx).reverse();

            // Group by kind + sheet so 20 new rows become one toast, not twenty.
            const groups = new Map<string, SheetSyncEvent[]>();
            for (const e of fresh) {
              const key = `${e.kind}|${e.sync_id}`;
              const g = groups.get(key);
              if (g) g.push(e); else groups.set(key, [e]);
            }

            for (const group of groups.values()) {
              const e = group[0];
              const sheet = e.sync_name ?? "Google Sheet";
              const openLead = (leadId: string | null) => {
                if (leadId) openLeadInNewTab(leadId);
                else openLeadsInNewTab();
              };
              const reviewDuplicates = () => window.open("/sheet-syncs", "_blank", "noopener,noreferrer");

              if (group.length === 1) {
                const body = `${e.detail ?? ""}${e.sync_name ? `\n— ${e.sync_name}` : ""}`;
                const description = <span className="whitespace-pre-line text-xs">{body}</span>;
                const opts = {
                  description,
                  ...(e.lead_id
                    ? { action: { label: e.kind === "duplicate" ? "Open lead" : "Open lead", onClick: () => openLead(e.lead_id) } }
                    : e.kind === "duplicate"
                      ? { action: { label: "Review", onClick: reviewDuplicates } }
                      : {}),
                };

                if (e.kind === "error") toast.error(title(e), opts);
                else if (e.kind === "duplicate" || e.kind === "deleted") toast.warning(title(e), opts);
                else toast.success(title(e), opts);
                continue;
              }

              const n = group.length;
              const heading =
                e.kind === "inserted" ? `${n} new leads came from sheet`
                : e.kind === "restored" ? `${n} rows re-imported`
                : e.kind === "updated" ? `${n} rows edited in sheet`
                : e.kind === "duplicate" ? `${n} duplicates need review`
                : e.kind === "deleted" ? `${n} rows removed from sheet`
                : `${n} sheet sync errors`;
              const names = group.map((g) => g.lead_name ?? "Unnamed").slice(0, 5).join(", ");
              const description = (
                <span className="whitespace-pre-line text-xs">
                  {`${names}${n > 5 ? ` +${n - 5} more` : ""}\n— ${sheet}`}
                </span>
              );
              const firstLead = group.find((g) => g.lead_id)?.lead_id ?? null;
              const opts = {
                description,
                action: firstLead
                  ? { label: "Open lead", onClick: () => openLead(firstLead) }
                  : e.kind === "duplicate"
                    ? { label: "Review", onClick: reviewDuplicates }
                    : { label: "View leads", onClick: () => openLead(null) },
              };

              if (e.kind === "error") toast.error(heading, opts);
              else if (e.kind === "duplicate" || e.kind === "deleted") toast.warning(heading, opts);
              else toast.success(heading, opts);
            }
          }
          lastId.current = newest.id;
        }

        first.current = false;
      } catch {
        /* stay quiet: the bell just shows stale data until the next tick */
      }
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => { stop = true; clearInterval(id); };
  }, [fetchEvents]);

  const unread = events.filter((e) => e.created_at > seenAt).length;

  const markSeen = () => {
    const now = events[0]?.created_at ?? new Date().toISOString();
    setSeenAt(now);
    localStorage.setItem(SEEN_KEY, now);
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) markSeen(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Sheet sync notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center gap-2 px-3 py-2 border-b">
          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Google Sheet activity</span>
          {events.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 px-2 text-xs text-muted-foreground"
              onClick={() => dismiss(events.map((e) => e.id))}
            >
              Clear all
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {events.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted-foreground text-center">No sheet changes yet.</p>
          ) : (
            <ul className="divide-y">
              {events.map((e) => (
                <li
                  key={e.id}
                  className={cn(
                    "group flex gap-2 px-3 py-2 text-sm",
                    (e.lead_id || e.kind === "duplicate") && "cursor-pointer hover:bg-muted/60",
                    e.created_at > seenAt && "bg-primary/5",
                  )}
                  onClick={() => {
                    setOpen(false);
                    if (e.lead_id) {
                      openLeadInNewTab(e.lead_id);
                    } else if (e.kind === "duplicate") {
                      window.open("/sheet-syncs", "_blank", "noopener,noreferrer");
                    }
                  }}
                >

                  <span className="mt-0.5">{icon(e.kind)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium truncate">{title(e)}</span>
                    {e.detail && (
                      <span className="mt-0.5 block text-xs text-muted-foreground whitespace-pre-line break-words">
                        {e.detail}
                      </span>
                    )}

                    <span className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                      <FileSpreadsheet className="h-3 w-3" />
                      <span className="font-medium text-foreground/80 truncate max-w-[140px]">
                        {e.sync_name ?? "Google Sheet"}
                      </span>
                      {e.sheet_url && (
                        <a
                          href={e.sheet_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-primary"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          open sheet
                        </a>
                      )}
                      <span>· {new Date(e.created_at).toLocaleString()}</span>
                    </span>
                    {(e.lead_id || e.kind === "duplicate") && (
                      <span className="block text-[11px] text-primary">
                        {e.lead_id ? "Click to open this lead" : "Click to review and decide"}
                      </span>
                    )}
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
      </PopoverContent>
    </Popover>
  );
}
