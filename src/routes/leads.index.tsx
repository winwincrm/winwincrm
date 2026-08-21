import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { toast } from "sonner";
import {
  Search, Filter as FilterIcon, Upload, ListChecks, Eye, Phone,
  Pencil, Trash2, Copy, X, ChevronLeft, ChevronRight, Plus, Download,
  Settings2, ArrowLeftRight, RefreshCw, MoreHorizontal,
} from "lucide-react";
import { useReassignPrefs } from "@/lib/reassign-prefs";


import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { reassignLeadWithCommentOption } from "@/lib/lead-reassignment.functions";
import { deleteLeadsSecurely } from "@/lib/lead-deletion.functions";
import { useLeadRealtime } from "@/hooks/use-lead-realtime";
import { CsvImportDialog } from "@/components/CsvImportDialog";
import { AddLeadDialog } from "@/components/AddLeadDialog";
import { LeadsTableRow, type LeadRowData } from "@/components/LeadsTableRow";
import { sheetLinkedLeadIds, leadIdsForSheetSync } from "@/lib/sheet-leads.functions";



import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/lead-constants";
import {
  STATUS_GROUP_ORDER, statusesInGroup, STATUSES_BY_GROUP, statusGroupOf,
  CONTACT_RELEVANT_STATUSES, type LeadStatusGroup,
} from "@/lib/lead-status";
import { cn } from "@/lib/utils";
import { amountDisplayValue } from "@/lib/amount-value";
import { useSoftphone, buildCallHref, SOFTPHONES, type Softphone } from "@/lib/softphone";
import { MultiSelectPopover } from "@/components/MultiSelectPopover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ---------- Search params ----------

const SOURCE = ["all", "crm", "in_house", "cold"] as const;
type SourceVal = (typeof SOURCE)[number];

// Multi-select param: accepts comma-separated string or array; always normalized to string[].
const csvArray = z.preprocess(
  (v) => {
    if (v == null) return undefined;
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.length > 0);
    if (typeof v === "string") return v.length ? v.split(",").filter(Boolean) : undefined;
    return undefined;
  },
  z.array(z.string()).optional(),
);

const searchSchema = z.object({
  q: z.string().optional(),
  group: z.enum(["all", ...STATUS_GROUP_ORDER] as [string, ...string[]]).optional(),
  status: csvArray,                       // multi LeadStatus
  src: z.enum(SOURCE).optional(),
  agent: csvArray,                        // user_ids and/or "__unassigned"
  platform: csvArray,
  office: csvArray,
  country: csvArray,
  source: csvArray,
  from: z.string().optional(),           // ISO date (yyyy-mm-dd)
  to: z.string().optional(),             // ISO date (yyyy-mm-dd)
  page: z.coerce.number().int().min(1).optional(),
  size: z.coerce.number().int().min(1).max(1000).optional(),
  selected: z.string().optional(),
  sort: z.enum(["newest", "oldest", "activity_desc", "activity_asc"]).optional(),
  sheet: z.string().optional(),            // Google Sheet sync id — show only its leads
  sheetpending: z.coerce.number().int().optional(), // 1 = only the still-unassigned ones
  ids: z.string().optional(),              // explicit lead id list (comma separated), shown in this exact order
});

type LeadSearch = z.infer<typeof searchSchema>;

function toPSort(s: LeadSearch["sort"]): string {
  if (s === "oldest") return "asc";
  if (s === "activity_desc") return "activity_desc";
  if (s === "activity_asc") return "activity_asc";
  return "desc";
}

// The server-side p_group mapping is outdated (it predates statuses like
// bad_number / wrong_person / no_answer_4-5 / low|high_potential), so we
// resolve the group to its status list client-side and send p_status instead.
function toStatusFilter(
  group: string | undefined,
  status: string[] | undefined,
): string[] | undefined {
  const explicit = status?.length ? status : undefined;
  if (!group || group === "all") return explicit;
  const groupStatuses = statusesInGroup(group as LeadStatusGroup) as unknown as string[];
  if (!groupStatuses.length) return explicit;
  if (!explicit) return groupStatuses;
  const inter = explicit.filter((s) => groupStatuses.includes(s));
  // No overlap → nothing can match; use an impossible value to return 0 rows.
  return inter.length ? inter : ["__none__"];
}



export const Route = createFileRoute("/leads/")({
  head: () => ({
    meta: [
      { title: "Leads | YellowSkies CRM" },
      { name: "description", content: "Manage, filter, assign, and track CRM leads in YellowSkies." },
      { property: "og:title", content: "Leads | YellowSkies CRM" },
      { property: "og:description", content: "Manage, filter, assign, and track CRM leads in YellowSkies." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (s) => {
    const parsed = searchSchema.safeParse(s);
    return parsed.success ? parsed.data : {};
  },
  component: LeadsPage,
});

function LeadsPage() {
  return <ProtectedRoute><LeadsContent /></ProtectedRoute>;
}

// ---------- Types ----------

interface LeadRow {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  status: LeadStatus;
  office_id: string | null;
  assigned_user_id: string | null;
  source: string | null;
  platform: string | null;
  amount: number | string | null;
  percentage: number | string | null;
  timeframe: string | null;
  payload: Record<string, unknown> | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
  assigned_at: string | null;
  lead_kind: "live" | "cold" | null;
  is_in_house: boolean | null;
  hide_in_house_from_agents: boolean | null;
  origin_agent_id: string | null;
  origin_agent_name: string | null;
  description_1: string | null;
  description_2: string | null;
  description_3: string | null;
  description_4: string | null;
}

interface AgentLite { user_id: string; full_name: string | null; office_id: string | null }
interface OfficeLite { id: string; name: string }

// ---------- Helpers ----------

function fmtAmount(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function leadsToCsv(
  rows: LeadRow[],
  officeMap: Map<string, string>,
  agentMap: Map<string, string>,
): string {
  const headers = [
    "id", "full_name", "first_name", "last_name", "phone", "email", "status",
    "office", "assigned_agent", "source", "platform", "country", "amount",
    "percentage", "timeframe", "lead_kind", "is_in_house",
    "last_contacted_at", "assigned_at", "created_at", "updated_at",
  ];
  const lines = [headers.join(",")];
  for (const l of rows) {
    const country = (l.payload as { country?: unknown } | null)?.country ?? "";
    lines.push([
      l.id, l.full_name, l.first_name ?? "", l.last_name ?? "",
      l.phone ?? "", l.email ?? "", l.status,
      l.office_id ? (officeMap.get(l.office_id) ?? "") : "",
      l.assigned_user_id ? (agentMap.get(l.assigned_user_id) ?? "") : "",
      l.source ?? "", l.platform ?? "", country,
      amountDisplayValue(l.amount, l.payload) ?? "", l.percentage ?? "", l.timeframe ?? "",
      l.lead_kind ?? "", l.is_in_house ?? "",
      l.last_contacted_at ?? "", l.assigned_at ?? "",
      l.created_at, l.updated_at,
    ].map(csvEscape).join(","));
  }
  return lines.join("\n");
}

// ---------- Column visibility ----------

type ColKey =
  | "full_name" | "email" | "phone" | "amount" | "platform" | "source"
  | "country" | "comment" | "description_1" | "description_2" | "description_3"
  | "description_4" | "status" | "agent" | "imported" | "activity";

const ALL_COLUMNS: { key: ColKey; labelKey: string; fallback: string; defaultOn: boolean }[] = [
  { key: "full_name",     labelKey: "common.full_name",       fallback: "Full name",     defaultOn: true },
  { key: "email",         labelKey: "common.email",           fallback: "Email",         defaultOn: true },
  { key: "phone",         labelKey: "common.phone",           fallback: "Phone",         defaultOn: true },
  { key: "amount",        labelKey: "leads.amount_lost",      fallback: "Amount lost",   defaultOn: true },
  { key: "platform",      labelKey: "common.platform",        fallback: "Platform",      defaultOn: true },
  { key: "source",        labelKey: "common.source",          fallback: "Source",        defaultOn: true },
  { key: "country",       labelKey: "common.country",         fallback: "Country",       defaultOn: true },
  { key: "comment",       labelKey: "leads.comment",          fallback: "Comment",       defaultOn: true },
  { key: "description_1", labelKey: "leads.desc_1",    fallback: "Desc1", defaultOn: true },
  { key: "description_2", labelKey: "leads.desc_2",    fallback: "Desc2", defaultOn: true },
  { key: "description_3", labelKey: "leads.desc_3",    fallback: "Desc3", defaultOn: true },
  { key: "description_4", labelKey: "leads.desc_4",    fallback: "Desc4", defaultOn: false },
  { key: "status",        labelKey: "common.status",          fallback: "Status",        defaultOn: true },
  { key: "agent",         labelKey: "common.agent",           fallback: "Agent",         defaultOn: true },
  { key: "imported",      labelKey: "leads.imported",         fallback: "Imported",      defaultOn: true },
  { key: "activity",      labelKey: "leads.last_activity",    fallback: "Last Activity", defaultOn: true },
];

const COLS_STORAGE_KEY = "leads.columns.visible.v1";

function loadVisibleCols(): Record<ColKey, boolean> {
  const defaults = Object.fromEntries(ALL_COLUMNS.map((c) => [c.key, c.defaultOn])) as Record<ColKey, boolean>;
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(COLS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Record<ColKey, boolean>>;
    return { ...defaults, ...parsed };
  } catch { return defaults; }
}

function StatTile({
  label, value, active, accent, onClick,
}: { label: string; value: number | string; active?: boolean; accent?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start justify-center px-4 py-3 bg-card text-left transition-colors",
        "hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-primary/10 text-foreground",
      )}
    >
      <span className={cn("text-[10px] uppercase tracking-wider text-muted-foreground", active && "text-primary")}>
        {label}
      </span>
      <span className={cn(
        "text-2xl font-semibold tabular-nums mt-0.5",
        accent && "text-primary",
      )}>{value}</span>
    </button>
  );
}

// ---------- Main content ----------

function LeadsContent() {
  const { t } = useTranslation();
  const { role, profile } = useAuth();
  const reassignLead = useServerFn(reassignLeadWithCommentOption);
  const deleteLeadsMutation = useServerFn(deleteLeadsSecurely);
  
  const navigate = useNavigate({ from: "/leads" });
  const search = Route.useSearch() as LeadSearch;

  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [groupCounts, setGroupCounts] = useState<Record<LeadStatusGroup | "total", number>>({
    total: 0, new: 0, in_progress: 0, callback: 0, appointment: 0, converted: 0, bad: 0,
  });
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [offices, setOffices] = useState<OfficeLite[]>([]);
  const [agents, setAgents] = useState<AgentLite[]>([]);
  const [latestComments, setLatestComments] = useState<Map<string, string>>(new Map());
  const [sheetLeadIds, setSheetLeadIds] = useState<Set<string>>(new Set());
  const fetchSheetLeadIds = useServerFn(sheetLinkedLeadIds);
  const fetchSheetSyncLeadIds = useServerFn(leadIdsForSheetSync);
  const [sheetTotal, setSheetTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(search.q ?? "");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ ids: string[] } | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<LeadStatus | "">("");
  const [bulkAgent, setBulkAgent] = useState<string>("");
  const [bulkOffice, setBulkOffice] = useState<string>("");
  const [exportCount, setExportCount] = useState<string>("1000");
  const [exportUseFilters, setExportUseFilters] = useState(true);
  const [exportOnlySelected, setExportOnlySelected] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Record<ColKey, boolean>>(() => loadVisibleCols());
  const showCol = (k: ColKey) => visibleCols[k] !== false;
  const toggleCol = (k: ColKey, on: boolean) => {
    setVisibleCols((prev) => {
      const next = { ...prev, [k]: on };
      try { window.localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  const resetCols = () => {
    const defaults = Object.fromEntries(ALL_COLUMNS.map((c) => [c.key, c.defaultOn])) as Record<ColKey, boolean>;
    setVisibleCols(defaults);
    try { window.localStorage.removeItem(COLS_STORAGE_KEY); } catch { /* ignore */ }
  };
  
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [softphone, setSoftphoneApp] = useSoftphone();
  const [reassignPrefs, setReassignPrefs] = useReassignPrefs();


  // Request sequencers — prevent older in-flight RPC responses from overwriting
  // newer state (the root cause of intermittent "0 leads" flicker when filters,
  // realtime, or auth changes fire reloads in quick succession).
  const loadSeq = useRef(0);
  const countsSeq = useRef(0);

  // Update search params helper
  const setSearch = (patch: Partial<LeadSearch>) => {
    void navigate({
      search: (prev: LeadSearch) => {
        const next = { ...(prev as LeadSearch), ...patch };
        // Clear empty values for clean URLs
        for (const k of Object.keys(next) as (keyof LeadSearch)[]) {
          const val = next[k];
          if (val === "" || val === undefined || val === null || (Array.isArray(val) && val.length === 0)) {
            delete next[k];
          }
        }
        return next;
      },
      resetScroll: false,
    });
  };

  // Remove a single value from a multi-select filter (used by active filter pills).
  const removeFilterValue = (key: keyof LeadSearch, value: string) => {
    const cur = (search[key] as unknown);
    if (Array.isArray(cur)) {
      const next = (cur as string[]).filter((v) => v !== value);
      setSearch({ [key]: next.length ? next : undefined, page: 1 } as Partial<LeadSearch>);
    } else {
      setSearch({ [key]: undefined, page: 1 } as Partial<LeadSearch>);
    }
  };

  // Debounced search
  useEffect(() => {
    const id = setTimeout(() => {
      if ((search.q ?? "") !== searchInput) {
        setSearch({ q: searchInput || undefined, page: 1 });
      }
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Server-side pagination: page + page size come from the URL search params.
  const pageSize = search.size ?? 50;
  const currentPage = Math.max(1, search.page ?? 1);


  // RPC-based chunked loading. Authorization happens server-side in leads_page().
  const fetchChunk = async (offset: number, limitOverride?: number) => {
    const officeSel = (search.office ?? []).filter((x) => x !== "__inbox__");
    const wantsInbox = role === "admin" && (search.office ?? []).includes("__inbox__");
    const officeArg = role === "admin" && officeSel.length ? officeSel : undefined;
    const agentSel = search.agent ?? [];
    const agentIds = agentSel.filter((a) => a !== "__unassigned");
    const wantsUnassigned = agentSel.includes("__unassigned");
    return supabase.rpc("leads_page", {
      p_office: officeArg,
      p_agent: agentIds.length ? agentIds : undefined,
      p_unassigned: wantsUnassigned ? true : undefined,
      p_platform: search.platform?.length ? search.platform : undefined,
      p_source: search.source?.length ? search.source : undefined,
      p_country: search.country?.length ? search.country : undefined,
      p_q: search.q?.trim() || undefined,
      p_from: search.from || undefined,
      p_to: search.to || undefined,
      p_src: search.src && search.src !== "all" ? search.src : undefined,
      p_group: undefined,
      p_status: toStatusFilter(search.group, search.status),

      p_offset: offset,
      p_limit: limitOverride ?? pageSize,
      p_sort: toPSort(search.sort),


      p_inbox_only: wantsInbox ? true : undefined,
    });
  };

  const fetchComments = async (ids: string[]) => {
    if (ids.length === 0) return new Map<string, string>();
    const { data: cmts } = await supabase
      .from("lead_comments")
      .select("lead_id, comment, created_at")
      .in("lead_id", ids)
      .order("created_at", { ascending: false });
    const map = new Map<string, string>();
    for (const c of (cmts ?? []) as Array<{ lead_id: string; comment: string }>) {
      if (!map.has(c.lead_id)) map.set(c.lead_id, c.comment);
    }
    return map;
  };

  // Load one page of leads belonging to a single Google Sheet sync.
  const fetchSheetPage = async (): Promise<{ rows: LeadRow[]; more: boolean; total: number; error?: string }> => {
    try {
      const res = await fetchSheetSyncLeadIds({ data: { syncId: search.sheet! } }) as
        { ids: string[]; pendingIds: string[] };
      const all = search.sheetpending ? res.pendingIds : res.ids;
      const pageIds = all.slice((currentPage - 1) * pageSize, currentPage * pageSize);
      if (pageIds.length === 0) return { rows: [], more: false, total: all.length };
      const { data, error } = await supabase
        .from("leads").select("*").in("id", pageIds)
        .order("created_at", { ascending: search.sort === "oldest" });
      if (error) return { rows: [], more: false, total: all.length, error: error.message };
      return {
        rows: (data ?? []) as unknown as LeadRow[],
        more: all.length > currentPage * pageSize,
        total: all.length,
      };
    } catch (e) {
      return { rows: [], more: false, total: 0, error: (e as Error).message };
    }
  };

  // Explicit id list (opened from the Google Sheet activity log) — keep the
  // given order and ignore every other filter.
  const idList = useMemo(
    () => (search.ids ? search.ids.split(",").map((s) => s.trim()).filter(Boolean) : []),
    [search.ids],
  );

  const fetchIdsPage = async (): Promise<{ rows: LeadRow[]; more: boolean; total: number; error?: string }> => {
    const pageIds = idList.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    if (pageIds.length === 0) return { rows: [], more: false, total: idList.length };
    const { data, error } = await supabase.from("leads").select("*").in("id", pageIds);
    if (error) return { rows: [], more: false, total: idList.length, error: error.message };
    const byId = new Map((data ?? []).map((r) => [(r as { id: string }).id, r]));
    const rows = pageIds.map((id) => byId.get(id)).filter(Boolean) as unknown as LeadRow[];
    return { rows, more: idList.length > currentPage * pageSize, total: idList.length };
  };

  // Load the current page of rows.
  // Stale-while-revalidate: only blank the table when we have no rows yet.
  const load = async () => {
    const seq = ++loadSeq.current;
    setLoading((prev) => (leads.length === 0 ? true : prev));
    setLoadError(null);

    if (idList.length) {
      const res = await fetchIdsPage();
      if (seq !== loadSeq.current) return;
      if (res.error) { setHasMore(false); setLoadError(res.error); setLoading(false); return; }
      setLeads(res.rows);
      setHasMore(res.more);
      setLoading(false);
      void (async () => {
        const map = await fetchComments(res.rows.map((l) => l.id));
        if (seq !== loadSeq.current) return;
        setLatestComments(map);
      })();
      void (async () => {
        try {
          const ids = await fetchSheetLeadIds({ data: { ids: res.rows.map((l) => l.id) } });
          if (seq !== loadSeq.current) return;
          setSheetLeadIds(new Set(ids as string[]));
        } catch { /* badge just stays hidden */ }
      })();
      return;
    }

    if (search.sheet) {
      const res = await fetchSheetPage();
      if (seq !== loadSeq.current) return;
      setSheetTotal(res.total);
      if (res.error) {
        setHasMore(false); setLoadError(res.error); setLoading(false); return;
      }
      setLeads(res.rows);
      setHasMore(res.more);
      setLoading(false);
      void (async () => {
        const map = await fetchComments(res.rows.map((l) => l.id));
        if (seq !== loadSeq.current) return;
        setLatestComments(map);
      })();
      setSheetLeadIds(new Set(res.rows.map((l) => l.id)));
      return;
    }

    const { data, error } = await fetchChunk((currentPage - 1) * pageSize);
    if (seq !== loadSeq.current) return; // stale response — ignore
    if (error) {
      setHasMore(false);
      setLoadError(error.message);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as unknown as LeadRow[];
    setLeads(rows);
    setHasMore(rows.length === pageSize);
    setLoading(false);
    // Fetch latest comments in the background — don't block the paint.
    void (async () => {
      const map = await fetchComments(rows.map((l) => l.id));
      if (seq !== loadSeq.current) return;
      setLatestComments(map);
    })();
    // Which of these leads came from a Google Sheet (drives the "Live" badge).
    void (async () => {
      try {
        const ids = await fetchSheetLeadIds({ data: { ids: rows.map((l) => l.id) } });
        if (seq !== loadSeq.current) return;
        setSheetLeadIds(new Set(ids as string[]));
      } catch { /* badge just stays hidden */ }
    })();
  };


  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([load(), loadGroupCounts()]);
    } finally {
      setRefreshing(false);
    }
  };


  // Fetch stats strip via RPC (counts respect same filters except group/status)
  const loadGroupCounts = async () => {
    const seq = ++countsSeq.current;
    const officeSelC = (search.office ?? []).filter((x) => x !== "__inbox__");
    const wantsInboxC = role === "admin" && (search.office ?? []).includes("__inbox__");
    const officeArg: string[] | undefined =
      (role === "manager" || role === "superiormanager")
        ? (profile?.office_id ? [profile.office_id] : undefined)
        : (officeSelC.length ? officeSelC : undefined);
    const agentSel = search.agent ?? [];
    const agentIds = role === "agent"
      ? (profile?.user_id ? [profile.user_id] : [])
      : agentSel.filter((a) => a !== "__unassigned");
    const wantsUnassigned = role !== "agent" && agentSel.includes("__unassigned");

    const { data, error } = await supabase.rpc("leads_group_counts", {
      p_office: officeArg,
      p_agent: agentIds.length ? agentIds : undefined,
      p_unassigned: wantsUnassigned ? true : undefined,
      p_platform: search.platform?.length ? search.platform : undefined,
      p_source: search.source?.length ? search.source : undefined,
      p_country: search.country?.length ? search.country : undefined,
      p_q: search.q?.trim() || undefined,
      p_from: search.from || undefined,
      p_to: search.to || undefined,
      p_src: search.src && search.src !== "all" ? search.src : undefined,
      p_inbox_only: wantsInboxC ? true : undefined,
    });
    if (seq !== countsSeq.current) return; // stale response — ignore
    if (error) {
      setLoadError(error.message);
      return;
    }

    const res = (data ?? null) as { total: number; by_status: Record<string, number> } | null;
    const next: Record<LeadStatusGroup | "total", number> = {
      total: res?.total ?? 0, new: 0, in_progress: 0, callback: 0, appointment: 0, converted: 0, bad: 0,
    };
    const by = res?.by_status ?? {};
    setStatusCounts(by);
    for (const g of STATUS_GROUP_ORDER) {
      let c = 0;
      for (const s of STATUSES_BY_GROUP[g]) c += by[s] ?? 0;
      next[g] = c;
    }
    setGroupCounts(next);
  };

  // Reload page rows whenever filters/page change
  useEffect(() => {
    // Wait for role + needed profile fields before firing — otherwise the first
    // call goes out with the wrong scope and its (zero) response can land after
    // the correct one.
    if (!role) return;
    if ((role === "manager" || role === "superiormanager") && !profile?.office_id) { setLoading(false); return; }
    if (role === "agent" && !profile?.user_id) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    role, profile?.office_id, profile?.user_id,
    search.q, search.group, search.status, search.src, search.agent, search.platform,
    search.office, search.country, search.source, search.from, search.to, search.sort,
    search.page, search.size, search.sheet, search.sheetpending, search.ids,
  ]);

  // Group counts reload only on filter changes (not page changes)
  useEffect(() => {
    if (!role) return;
    if ((role === "manager" || role === "superiormanager") && !profile?.office_id) return;
    if (role === "agent" && !profile?.user_id) return;
    void loadGroupCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    role, profile?.office_id, profile?.user_id,
    search.q, search.src, search.agent, search.platform,
    search.office, search.country, search.source, search.from, search.to,
  ]);

  // One-time lookups
  useEffect(() => {
    void supabase.from("offices").select("id, name").then(({ data }) => setOffices(data ?? []));
    let agentsQ = supabase.from("profiles").select("user_id, full_name, office_id");
    if ((role === "manager" || role === "superiormanager") && profile?.office_id) agentsQ = agentsQ.eq("office_id", profile.office_id);
    void agentsQ.then(({ data }) => setAgents(data ?? []));
  }, [role, profile?.office_id]);

  // Distinct filter options across the full visible dataset (not just loaded page)
  const [filterOptions, setFilterOptions] = useState<{ countries: string[]; sources: string[]; platforms: string[] }>({ countries: [], sources: [], platforms: [] });
  useEffect(() => {
    void supabase.rpc("leads_filter_options").then(({ data }) => {
      const d = (data ?? {}) as { countries?: string[]; sources?: string[]; platforms?: string[] };
      setFilterOptions({
        countries: Array.isArray(d.countries) ? d.countries : [],
        sources: Array.isArray(d.sources) ? d.sources : [],
        platforms: Array.isArray(d.platforms) ? d.platforms : [],
      });
    });
  }, [role, profile?.office_id, profile?.user_id]);

  // Realtime — only when user is bound to an office.
  // With server-side pagination, inserts/deletes change the total/page contents,
  // so we just refetch the current page; updates patch the visible row in place.
  useLeadRealtime(profile?.office_id ?? null, (evt) => {
    if (evt.op === "UPDATE" && evt.new) {
      const newRow = evt.new as unknown as LeadRow;
      setLeads((prev) => prev.map((l) => l.id === newRow.id ? { ...l, ...newRow } : l));
    } else if (evt.op === "INSERT" && evt.new) {
      const newRow = evt.new as unknown as LeadRow;
      if (role === "agent" && newRow.assigned_user_id !== profile?.user_id) return;
      toast.success(t("leads.new_lead_received", { defaultValue: "New lead received" }));
      void load();
    } else if (evt.op === "DELETE") {
      void load();
    }
  });

  // Scroll selected lead into view (e.g. when navigating from Calendar with ?selected=...)
  useEffect(() => {
    if (!search.selected || loading) return;
    const el = document.querySelector(`[data-lead-id="${search.selected}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [search.selected, loading, leads]);



  const officeMap = useMemo(() => new Map(offices.map((o) => [o.id, o.name])), [offices]);
  const agentMap = useMemo(() => new Map(agents.map((a) => [a.user_id, a.full_name ?? "—"])), [agents]);
  const platforms = useMemo(
    () => [...filterOptions.platforms].sort((a, b) => a.localeCompare(b)),
    [filterOptions.platforms],
  );
  const countries = useMemo(
    () => [...filterOptions.countries].sort((a, b) => a.localeCompare(b)),
    [filterOptions.countries],
  );
  const sources = useMemo(
    () => [...filterOptions.sources].sort((a, b) => a.localeCompare(b)),
    [filterOptions.sources],
  );
  const ALEX_ID = "9e0a659f-d2dd-4901-ac88-079d6de6461c";
  const BYRAZA_ID = "c03ac0e8-7cbc-4d5b-898a-562b4919e97b";
  const canAlexReassign = role === "agent" && profile?.user_id === ALEX_ID;
  const eligibleAgents = useMemo(() => {
    if (role === "admin") return agents;
    if (role === "manager" || role === "superiormanager") return agents.filter((a) => a.office_id === profile?.office_id);
    if (canAlexReassign) {
      const list = agents.filter((a) => a.user_id === BYRAZA_ID || a.user_id === ALEX_ID);
      if (!list.some((a) => a.user_id === BYRAZA_ID)) {
        list.push({ user_id: BYRAZA_ID, full_name: "Byraza", office_id: profile?.office_id ?? null });
      }
      return list;
    }
    return [];
  }, [agents, role, profile?.office_id, canAlexReassign]);
  const showAgentColumn = role !== "agent" || canAlexReassign;

  // ---------- Stats / pagination (server-driven) ----------

  const stats = groupCounts;
  const pageRows = leads;

  const groupKey = search.group && search.group !== "all" ? (search.group as LeadStatusGroup) : null;
  const statusSel = (search.status ?? []) as string[];
  const filteredTotal = statusSel.length
    ? statusSel.reduce((sum, s) => sum + (statusCounts[s] ?? 0), 0)
    : groupKey ? (groupCounts[groupKey] ?? 0) : groupCounts.total;
  const knownTotal = filteredTotal || (hasMore ? (currentPage * pageSize) + 1 : (currentPage - 1) * pageSize + leads.length);
  const totalPages = Math.max(1, Math.ceil(knownTotal / pageSize));
  const rangeStart = leads.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = (currentPage - 1) * pageSize + leads.length;

  // ---------- Mutations ----------

  const updateLeadLocal = (id: string, patch: Partial<LeadRow>) => {
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, ...patch } : l));
  };

  // A row that no longer matches the active agent filter (e.g. an "Unassigned"
  // filter after the lead got assigned) must leave the visible list.
  const matchesAgentFilter = (assignedUserId: string | null) => {
    const agentSel = search.agent ?? [];
    if (agentSel.length === 0) return true;
    if (assignedUserId == null) return agentSel.includes("__unassigned");
    return agentSel.includes(assignedUserId);
  };

  const pruneByAgentFilter = (ids: string[], newAgent: string | null) => {
    // Viewing a sheet's still-unassigned leads: assigning one removes it here
    // and drops the "Leads imported" count towards zero.
    if (search.sheet && search.sheetpending && newAgent) {
      setLeads((prev) => prev.filter((l) => !ids.includes(l.id)));
      setSheetTotal((n) => Math.max(0, n - ids.length));
      return;
    }
    if (matchesAgentFilter(newAgent)) return;
    setLeads((prev) => prev.filter((l) => !ids.includes(l.id)));
    setSelectedIds((prev) => {
      const n = new Set(prev);
      ids.forEach((id) => n.delete(id));
      return n;
    });
    void loadGroupCounts();
  };


  const updateStatus = async (id: string, status: LeadStatus) => {
    const target = leads.find((l) => l.id === id);
    if (!target) return;
    if ((role === "manager" || role === "superiormanager") && target.office_id !== profile?.office_id) {
      toast.error(t("common.not_allowed", { defaultValue: "Not allowed" })); return;
    }
    const patch: { status: LeadStatus; last_contacted_at?: string } = { status };
    if (CONTACT_RELEVANT_STATUSES.includes(status) && !target.last_contacted_at) {
      patch.last_contacted_at = new Date().toISOString();
    }
    const { error } = await supabase.from("leads").update(patch as never).eq("id", id);
    if (error) { toast.error(error.message); return; }
    updateLeadLocal(id, patch);
  };

  const updateAgent = async (id: string, agent: string | null) => {
    const target = leads.find((l) => l.id === id);
    if (!target) return;
    if ((role === "manager" || role === "superiormanager") && target.office_id !== profile?.office_id) {
      toast.error(t("common.not_allowed", { defaultValue: "Not allowed" })); return;
    }
    if (agent && !target.office_id && role !== "admin") { toast.error(t("leads.assign_office_first")); return; }
    if (canAlexReassign && (!agent || (agent !== ALEX_ID && agent !== BYRAZA_ID))) {
      toast.error(t("common.not_allowed", { defaultValue: "Not allowed" })); return;
    }
    try {
      await reassignLead({ data: {
        leadId: id,
        assignedUserId: agent,
        keepComments: reassignPrefs.keepComments,
        keepDescriptions: reassignPrefs.keepDescriptions,
      } });

      const agentOffice = agent ? agents.find((a) => a.user_id === agent)?.office_id ?? null : null;
      updateLeadLocal(id, {
        assigned_user_id: agent,
        ...(!target.office_id && agentOffice ? { office_id: agentOffice } : {}),
      });
      pruneByAgentFilter([id], agent);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.error", { defaultValue: "Something went wrong" }));
    }
  };

  const deleteLeads = async (ids: string[]) => {
    try {
      const result = await deleteLeadsMutation({ data: { ids } });
      setLeads((prev) => prev.filter((l) => !ids.includes(l.id)));
      setSelectedIds(new Set());
      toast.success(t("leads.deleted", { defaultValue: "Deleted", count: result.deleted }));
      await loadGroupCounts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.error", { defaultValue: "Something went wrong" }));
    }
  };

  // Delete every lead matching the current filters — not just the visible page.
  const deleteAllFiltered = async () => {
    setDeletingAll(true);
    try {
      const CHUNK = 1000;
      const ids: string[] = [];
      for (let offset = 0; ; offset += CHUNK) {
        const { data, error } = await fetchChunk(offset, CHUNK);
        if (error) { toast.error(error.message); return; }
        const rows = (data ?? []) as unknown as LeadRow[];
        ids.push(...rows.map((r) => r.id));
        if (rows.length < CHUNK) break;
        if (ids.length > 200_000) break;
      }
      if (ids.length === 0) { toast.info(t("leads.no_data", { defaultValue: "No data" })); return; }

      let deleted = 0;
      for (let i = 0; i < ids.length; i += 500) {
        const slice = ids.slice(i, i + 500);
        try {
          const result = await deleteLeadsMutation({ data: { ids: slice } });
          deleted += result.deleted;
        } catch (error) {
          toast.error(error instanceof Error ? error.message : t("common.error", { defaultValue: "Something went wrong" }));
          break;
        }
      }
      setSelectedIds(new Set());
      toast.success(t("leads.deleted", { defaultValue: "Deleted", count: deleted }) + ` (${deleted})`);
      await load();
      await loadGroupCounts();
    } finally {
      setDeletingAll(false);
    }
  };


  const bulkApplyStatus = async () => {
    if (!bulkStatus || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("leads").update({ status: bulkStatus } as never).in("id", ids);
    if (error) { toast.error(error.message); return; }
    setLeads((prev) => prev.map((l) => ids.includes(l.id) ? { ...l, status: bulkStatus } : l));
    setBulkStatus("");
    toast.success(t("common.updated", { defaultValue: "Updated" }));
  };

  const bulkApplyAgent = async () => {
    if (!bulkAgent || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const newAgent = bulkAgent === "__unassigned" ? null : bulkAgent;

    // Reassign through the secure server fn so the global transfer settings
    // (keep comments / keep descriptions) apply to every selected lead.
    let failed = 0;
    const failReasons: string[] = [];
    const CHUNK = 8;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const results = await Promise.allSettled(slice.map((leadId) =>
        reassignLead({ data: {
          leadId,
          assignedUserId: newAgent,
          keepComments: reassignPrefs.keepComments,
          keepDescriptions: reassignPrefs.keepDescriptions,
        } })
      ));
      for (const r of results) {
        if (r.status === "rejected") {
          failed += 1;
          const msg = r.reason instanceof Error ? r.reason.message : String(r.reason ?? "");
          if (msg && !failReasons.includes(msg)) failReasons.push(msg);
        }
      }
    }

    // Status is optional: only apply it when the user picked one.
    if (bulkStatus) {
      const { error } = await supabase.from("leads").update({ status: bulkStatus } as never).in("id", ids);
      if (error) { toast.error(error.message); return; }
    }

    setLeads((prev) => prev.map((l) => ids.includes(l.id)
      ? { ...l, assigned_user_id: newAgent, ...(bulkStatus ? { status: bulkStatus } : {}) }
      : l));
    pruneByAgentFilter(ids, newAgent);
    setBulkAgent("");
    if (bulkStatus) setBulkStatus("");
    if (failed > 0) {
      toast.error(t("leads.bulk_reassign_partial", {
        defaultValue: `${failed} of ${ids.length} leads could not be reassigned`,
        failed, total: ids.length,
      }), failReasons.length ? { description: failReasons.join(" · ") } : undefined);
    } else {
      toast.success(t("common.updated", { defaultValue: "Updated" }));
    }
  };

  // Send selected leads to another office (admin only). Agents that don't
  // belong to the target office are unassigned so visibility stays correct.
  const bulkApplyOffice = async () => {
    if (!bulkOffice || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const newOffice = bulkOffice === "__inbox__" ? null : bulkOffice;
    const keepAgent = (agentId: string | null) =>
      !!agentId && !!newOffice && agents.find((a) => a.user_id === agentId)?.office_id === newOffice;

    const stay = ids.filter((id) => keepAgent(leads.find((l) => l.id === id)?.assigned_user_id ?? null));
    const drop = ids.filter((id) => !stay.includes(id));

    if (stay.length) {
      const { error } = await supabase.from("leads").update({ office_id: newOffice } as never).in("id", stay);
      if (error) { toast.error(error.message); return; }
    }
    if (drop.length) {
      const { error } = await supabase.from("leads")
        .update({ office_id: newOffice, assigned_user_id: null } as never).in("id", drop);
      if (error) { toast.error(error.message); return; }
    }

    setLeads((prev) => prev.map((l) => ids.includes(l.id)
      ? { ...l, office_id: newOffice, assigned_user_id: stay.includes(l.id) ? l.assigned_user_id : null }
      : l));

    // Drop rows that no longer match the active office filter.
    const officeSel = search.office ?? [];
    const matchesOfficeFilter = officeSel.length === 0
      || (newOffice ? officeSel.includes(newOffice) : officeSel.includes("__inbox__"));
    if (!matchesOfficeFilter) {
      setLeads((prev) => prev.filter((l) => !ids.includes(l.id)));
      setSelectedIds(new Set());
      void loadGroupCounts();
    }
    setBulkOffice("");
    toast.success(t("leads.bulk.sent_to_office", {
      defaultValue: `${ids.length} lead(s) moved`, count: ids.length,
    }));
  };



  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (prev.size === pageRows.length) return new Set();
      return new Set(pageRows.map((r) => r.id));
    });
  };

  // ---------- Stable row handlers ----------
  // Keeping these identities constant lets each row memoize, so typing in the
  // search box or toggling UI state no longer re-renders every row.
  const handlersRef = useRef({
    toggleSelect, setSearch, updateStatus, updateAgent, setConfirmDelete, updateLeadLocal,
  });
  handlersRef.current = {
    toggleSelect, setSearch, updateStatus, updateAgent, setConfirmDelete, updateLeadLocal,
  };
  const selectedIdRef = useRef<string | undefined>(search.selected);
  selectedIdRef.current = search.selected;

  const onToggleSelectRow = useCallback((id: string) => handlersRef.current.toggleSelect(id), []);
  const onOpenRow = useCallback((id: string) => {
    handlersRef.current.setSearch({ selected: selectedIdRef.current === id ? undefined : id });
  }, []);
  const onStatusChange = useCallback((id: string, status: LeadStatus) => {
    void handlersRef.current.updateStatus(id, status);
  }, []);
  const onAgentChange = useCallback((id: string, agent: string | null) => {
    void handlersRef.current.updateAgent(id, agent);
  }, []);
  const onDeleteRow = useCallback((id: string) => handlersRef.current.setConfirmDelete({ ids: [id] }), []);
  const onCloseDetail = useCallback(() => handlersRef.current.setSearch({ selected: undefined }), []);
  const onLocalUpdateRow = useCallback((id: string, patch: Record<string, unknown>) => {
    handlersRef.current.updateLeadLocal(id, patch as Partial<LeadRow>);
  }, []);


  // ---------- Active filter pills ----------

  type ActiveFilter = { key: keyof LeadSearch; value: string | null; label: string };
  const activeFilters: ActiveFilter[] = [];
  for (const s of search.status ?? []) activeFilters.push({ key: "status", value: s, label: `${t("common.status")}: ${t(`status.${s}`)}` });
  for (const a of search.agent ?? []) activeFilters.push({
    key: "agent", value: a,
    label: `${t("common.agent")}: ${a === "__unassigned" ? t("common.unassigned") : agentMap.get(a) ?? "—"}`,
  });
  for (const p of search.platform ?? []) activeFilters.push({ key: "platform", value: p, label: `${t("common.platform", { defaultValue: "Platform" })}: ${p}` });
  for (const o of search.office ?? []) activeFilters.push({ key: "office", value: o, label: `${t("common.office")}: ${o === "__inbox__" ? t("leads.admin_inbox", { defaultValue: "Admin Inbox" }) : (officeMap.get(o) ?? "—")}` });
  for (const c of search.country ?? []) activeFilters.push({ key: "country", value: c, label: `${t("common.country", { defaultValue: "Country" })}: ${c}` });
  for (const s of search.source ?? []) activeFilters.push({ key: "source", value: s, label: `${t("common.source", { defaultValue: "Source" })}: ${s}` });
  if (search.from) activeFilters.push({ key: "from", value: null, label: `${t("common.from", { defaultValue: "From" })}: ${search.from}` });
  if (search.to) activeFilters.push({ key: "to", value: null, label: `${t("common.to", { defaultValue: "To" })}: ${search.to}` });
  const filterCount = activeFilters.length;

  return (
    <div className="space-y-4">
      {/* ---------- Stats Strip ---------- */}
      {loadError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-px bg-border rounded-md overflow-hidden border">
        <StatTile
          label={t("leads.stats.total")}
          value={stats.total}
          active={!search.group || search.group === "all"}
          onClick={() => setSearch({ group: undefined, page: 1 })}
        />
        {STATUS_GROUP_ORDER.map((g) => (
          <StatTile
            key={g}
            label={t(`leads.group.${g}`)}
            value={stats[g] ?? 0}
            active={search.group === g}
            accent={search.group === g}
            onClick={() => setSearch({ group: search.group === g ? undefined : g, page: 1 })}
          />
        ))}
      </div>

      {/* ---------- Toolbar ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("leads.search_placeholder")}
            className="pl-8 pr-12 h-9"
          />
          <kbd className="absolute right-2 top-1.5 hidden sm:inline-flex h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">/</kbd>
        </div>

        <ToggleGroup
          type="single"
          value={search.src ?? "all"}
          onValueChange={(v) => v && setSearch({ src: (v as SourceVal) === "all" ? undefined : (v as SourceVal), page: 1 })}
          className="h-9"
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="crm" className="px-3">{t("leads.source.crm", { defaultValue: "Live" })}</ToggleGroupItem>
          <ToggleGroupItem value="in_house" className="px-3">
            {t("leads.source.live_in_house", { defaultValue: "Live in House" })}
          </ToggleGroupItem>
          <ToggleGroupItem value="cold" className="px-3">
            {t("leads.source.cold", { defaultValue: "Cold" })}
          </ToggleGroupItem>
          <ToggleGroupItem value="all" className="px-3">{t("common.all")}</ToggleGroupItem>
        </ToggleGroup>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              <FilterIcon className="h-4 w-4 mr-1" />
              {t("common.filter")}
              {filterCount > 0 && <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">{filterCount}</Badge>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">{t("common.status")}</label>
              <div className="mt-1">
                <MultiSelectPopover
                  options={LEAD_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))}
                  value={search.status ?? []}
                  onChange={(v) => setSearch({ status: v.length ? v : undefined, page: 1 })}
                  placeholder={t("common.all")}
                />
              </div>
            </div>
            {role !== "agent" && (
              <div>
                <label className="text-xs text-muted-foreground">{t("common.agent")}</label>
                <div className="mt-1">
                  <MultiSelectPopover
                    options={[
                      { value: "__unassigned", label: t("common.unassigned") },
                      ...eligibleAgents.map((a) => ({ value: a.user_id, label: a.full_name ?? "—" })),
                    ]}
                    value={search.agent ?? []}
                    onChange={(v) => setSearch({ agent: v.length ? v : undefined, page: 1 })}
                    placeholder={t("common.all")}
                  />
                </div>
              </div>
            )}
            {role === "admin" && (
              <div>
                <label className="text-xs text-muted-foreground">{t("common.office")}</label>
                <div className="mt-1">
                  <MultiSelectPopover
                    options={[
                      { value: "__inbox__", label: `📥 ${t("leads.admin_inbox", { defaultValue: "Admin Inbox (unassigned)" })}` },
                      ...offices.map((o) => ({ value: o.id, label: o.name })),
                    ]}
                    value={search.office ?? []}
                    onChange={(v) => setSearch({ office: v.length ? v : undefined, page: 1 })}
                    placeholder={t("common.all")}
                  />
                </div>
              </div>
            )}
            {platforms.length > 0 && (
              <div>
                <label className="text-xs text-muted-foreground">{t("common.platform", { defaultValue: "Platform" })}</label>
                <div className="mt-1">
                  <MultiSelectPopover
                    options={platforms.map((p) => ({ value: p, label: p }))}
                    value={search.platform ?? []}
                    onChange={(v) => setSearch({ platform: v.length ? v : undefined, page: 1 })}
                    placeholder={t("common.all")}
                  />
                </div>
              </div>
            )}
            {sources.length > 0 && (
              <div>
                <label className="text-xs text-muted-foreground">{t("common.source", { defaultValue: "Source" })}</label>
                <div className="mt-1">
                  <MultiSelectPopover
                    options={sources.map((s) => ({ value: s, label: s }))}
                    value={search.source ?? []}
                    onChange={(v) => setSearch({ source: v.length ? v : undefined, page: 1 })}
                    placeholder={t("common.all")}
                  />
                </div>
              </div>
            )}
            {countries.length > 0 && (
              <div>
                <label className="text-xs text-muted-foreground">{t("common.country", { defaultValue: "Country" })}</label>
                <div className="mt-1">
                  <MultiSelectPopover
                    options={countries.map((c) => ({ value: c, label: c }))}
                    value={search.country ?? []}
                    onChange={(v) => setSearch({ country: v.length ? v : undefined, page: 1 })}
                    placeholder={t("common.all")}
                  />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">{t("common.from", { defaultValue: "From" })}</label>
                <Input
                  type="date"
                  value={search.from ?? ""}
                  onChange={(e) => setSearch({ from: e.target.value || undefined, page: 1 })}
                  className="h-9 mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("common.to", { defaultValue: "To" })}</label>
                <Input
                  type="date"
                  value={search.to ?? ""}
                  onChange={(e) => setSearch({ to: e.target.value || undefined, page: 1 })}
                  className="h-9 mt-1"
                />
              </div>
            </div>
            {filterCount > 0 && (
              <Button variant="ghost" size="sm" className="w-full"
                onClick={() => setSearch({ status: undefined, agent: undefined, office: undefined, platform: undefined, country: undefined, source: undefined, from: undefined, to: undefined, page: 1 })}
              >{t("common.clear", { defaultValue: "Clear all" })}</Button>
            )}
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex items-center gap-2">
          {(role !== "agent" || canAlexReassign) && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  <ArrowLeftRight className="h-4 w-4 mr-1" />
                  {t("leads.transfer_prefs.button", { defaultValue: "Transfer" })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-3 space-y-3" align="end">
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {t("leads.transfer_prefs.title", { defaultValue: "Transfer settings" })}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("leads.transfer_prefs.desc", { defaultValue: "Applies to every reassignment — single leads and bulk assign." })}
                  </p>
                </div>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={reassignPrefs.keepComments}
                    onCheckedChange={(v) => setReassignPrefs({ keepComments: v === true })}
                  />
                  <span>{t("leads.keep_existing_comments", { defaultValue: "Keep existing comments when reassigning" })}</span>
                </label>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={reassignPrefs.keepDescriptions}
                    onCheckedChange={(v) => setReassignPrefs({ keepDescriptions: v === true })}
                  />
                  <span>{t("leads.keep_existing_descriptions", { defaultValue: "Keep existing descriptions when reassigning" })}</span>
                </label>
              </PopoverContent>
            </Popover>
          )}

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                <Settings2 className="h-4 w-4 mr-1" />
                {t("leads.columns.button", { defaultValue: "Columns" })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3 space-y-2" align="end">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t("leads.columns.title", { defaultValue: "Show columns" })}
                </span>
                <button
                  type="button"
                  onClick={resetCols}
                  className="text-[11px] text-primary hover:underline"
                >
                  {t("common.reset", { defaultValue: "Reset" })}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-1">
                {ALL_COLUMNS.map((c) => {
                  const on = showCol(c.key);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => toggleCol(c.key, !on)}
                      className="flex items-center gap-2 text-sm py-1 text-left hover:bg-accent rounded px-1"
                    >
                      <Checkbox
                        checked={on}
                        onCheckedChange={(v) => toggleCol(c.key, Boolean(v))}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="truncate">{t(c.labelKey, { defaultValue: c.fallback })}</span>
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          <Select value={softphone} onValueChange={(v) => setSoftphoneApp(v as Softphone)}>
            <SelectTrigger className="h-9 w-[140px]" title={t("softphone.hint", { defaultValue: "Softphone app used when calling a lead" })}>
              <Phone className="h-3.5 w-3.5 mr-1 opacity-70" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOFTPHONES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            title={t("common.refresh", { defaultValue: "Refresh" })}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
            {t("common.refresh", { defaultValue: "Refresh" })}
          </Button>
          <Button
            variant={selectMode ? "default" : "outline"}
            size="sm"
            className="h-9"
            onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
          >
            <ListChecks className="h-4 w-4 mr-1" />
            {selectMode ? `${selectedIds.size} ${t("leads.selected", { defaultValue: "selected" })}` : t("leads.select_mode", { defaultValue: "Select" })}
          </Button>
          {(role === "admin" || role === "manager" || role === "superiormanager") && (
            <>
              <Button variant="outline" size="sm" className="h-9" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> {t("leads.add.button", { defaultValue: "Add lead" })}
              </Button>
              <Button variant="outline" size="sm" className="h-9" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4 mr-1" /> {t("leads.import.title")}
              </Button>
            </>

          )}
          {role !== "agent" && (
          <Popover open={exportOpen} onOpenChange={(o) => {
            setExportOpen(o);
            if (o) setExportOnlySelected(selectedIds.size > 0);
          }}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                <Download className="h-4 w-4 mr-1" /> {t("leads.export.title", { defaultValue: "Export CSV" })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">
                  {t("leads.export.count", { defaultValue: "How many to export" })}
                </label>
                <Input
                  type="number"
                  min={1}
                  value={exportCount === "all" ? "" : exportCount}
                  placeholder={t("common.all", { defaultValue: "All" })}
                  onChange={(e) => setExportCount(e.target.value || "all")}
                  className="h-9 mt-1"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {["10", "50", "100", "500", "1000", "all"].map((v) => (
                    <Button
                      key={v}
                      type="button"
                      size="sm"
                      variant={exportCount === v ? "secondary" : "ghost"}
                      className="h-6 px-2 text-xs"
                      onClick={() => setExportCount(v)}
                    >
                      {v === "all" ? t("common.all", { defaultValue: "All" }) : v}
                    </Button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={exportUseFilters}
                  onCheckedChange={(v) => setExportUseFilters(Boolean(v))}
                />
                {t("leads.export.use_filters", { defaultValue: "Use current filters" })}
              </label>
              {selectedIds.size > 0 ? (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={exportOnlySelected}
                    onCheckedChange={(v) => setExportOnlySelected(Boolean(v))}
                  />
                  {t("leads.export.only_selected", { defaultValue: "Only selected ({{n}})", n: selectedIds.size })}
                </label>
              ) : (
                <div className="rounded-md border border-dashed bg-muted/40 p-2 text-xs text-muted-foreground space-y-1.5">
                  <p>{t("leads.export.pick_hint", { defaultValue: "Want to pick specific leads? Turn on Select mode, then tick the rows you want." })}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7 w-full"
                    onClick={() => {
                      setSelectMode(true);
                      setExportOpen(false);
                      toast.message(t("leads.export.select_now", { defaultValue: "Tick the leads you want, then click Export again." }));
                    }}
                  >
                    <ListChecks className="h-3.5 w-3.5 mr-1" />
                    {t("leads.export.enable_select", { defaultValue: "Enable Select mode" })}
                  </Button>
                </div>
              )}
              <Button
                size="sm"
                className="w-full"
                disabled={exporting}
                onClick={async () => {
                  setExporting(true);
                  try {
                    const target = exportCount === "all" ? Number.POSITIVE_INFINITY : Number(exportCount);
                    let rows: LeadRow[] = [];
                    if (exportOnlySelected && selectedIds.size > 0) {
                      rows = leads.filter((l) => selectedIds.has(l.id));
                    } else {
                      const officeSelE = (search.office ?? []).filter((x) => x !== "__inbox__");
                      const wantsInboxE = role === "admin" && (search.office ?? []).includes("__inbox__");
                      const officeArg = role === "admin" && officeSelE.length ? officeSelE : undefined;
                      const agentSel = search.agent ?? [];
                      const agentIds = agentSel.filter((a) => a !== "__unassigned");
                      const wantsUnassigned = agentSel.includes("__unassigned");
                      const baseArgs = exportUseFilters ? {
                        p_office: officeArg,
                        p_agent: agentIds.length ? agentIds : undefined,
                        p_unassigned: wantsUnassigned ? true : undefined,
                        p_platform: search.platform?.length ? search.platform : undefined,
                        p_source: search.source?.length ? search.source : undefined,
                        p_country: search.country?.length ? search.country : undefined,
                        p_q: search.q?.trim() || undefined,
                        p_from: search.from || undefined,
                        p_to: search.to || undefined,
                        p_src: search.src && search.src !== "all" ? search.src : undefined,
                        p_group: undefined,
                        p_status: toStatusFilter(search.group, search.status),

                        p_sort: toPSort(search.sort),
                        p_inbox_only: wantsInboxE ? true : undefined,
                      } : { p_sort: toPSort(search.sort) };
                      let offset = 0;
                      const PAGE = 1000;
                      while (rows.length < target) {
                        const remaining = target === Number.POSITIVE_INFINITY ? PAGE : Math.min(PAGE, target - rows.length);
                        const { data, error } = await supabase.rpc("leads_page", {
                          ...baseArgs,
                          p_offset: offset,
                          p_limit: remaining,
                        });
                        if (error) { toast.error(error.message); break; }
                        const chunk = (data ?? []) as unknown as LeadRow[];
                        rows.push(...chunk);
                        if (chunk.length < remaining) break;
                        offset += chunk.length;
                      }
                    }
                    if (rows.length === 0) {
                      toast.error(t("leads.export.empty", { defaultValue: "No leads to export" }));
                      return;
                    }
                    const csv = leadsToCsv(rows, officeMap, agentMap);
                    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    toast.success(t("leads.export.done", { defaultValue: "Exported {{n}} leads", n: rows.length }));
                    setExportOpen(false);
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                <Download className="h-4 w-4 mr-1" />
                {exporting ? t("common.loading", { defaultValue: "Loading…" }) : t("leads.export.download", { defaultValue: "Download CSV" })}
              </Button>
            </PopoverContent>
          </Popover>
          )}
          {(role === "admin" || role === "manager" || role === "superiormanager") && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  title={t("common.more_actions", { defaultValue: "More actions" })}
                  aria-label={t("common.more_actions", { defaultValue: "More actions" })}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {t("common.more_actions", { defaultValue: "More actions" })}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={deletingAll || filteredTotal === 0}
                  onSelect={() => setConfirmDeleteAll(true)}
                  className="items-start text-destructive focus:text-destructive"
                >
                  <Trash2 className="mt-0.5 h-4 w-4" />
                  <span className="flex flex-col gap-0.5">
                    <span>
                      {deletingAll
                        ? t("common.loading", { defaultValue: "Loading…" })
                        : t("leads.delete_filtered", { defaultValue: "Delete matching leads" }) + ` (${filteredTotal})`}
                    </span>
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {t("leads.delete_filtered_hidden_hint", {
                        defaultValue: "Permanently deletes every matching lead after confirmation",
                      })}
                    </span>
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* ---------- Explicit lead selection banner (from Sheets activity) ---------- */}
      {idList.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-medium">Showing the leads you opened from Google Sheet activity</span>
          <Badge variant="secondary">{idList.length} lead{idList.length === 1 ? "" : "s"}</Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSelectMode(true);
              setSelectedIds(new Set(leads.map((l) => l.id)));
            }}
          >
            Select all & assign
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSearch({ ids: undefined, page: 1 })}>
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        </div>
      )}

      {/* ---------- Google Sheet scope banner ---------- */}
      {search.sheet && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-medium">
            {search.sheetpending
              ? "Showing imported leads from one Google Sheet that are still unassigned"
              : "Showing all leads from one Google Sheet"}
          </span>
          <Badge variant="secondary">{sheetTotal} lead{sheetTotal === 1 ? "" : "s"}</Badge>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSearch({ sheetpending: search.sheetpending ? undefined : 1, page: 1 })}
          >
            {search.sheetpending ? "Show all from this sheet" : "Show only unassigned"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSearch({ sheet: undefined, sheetpending: undefined, page: 1 })}>
            <X className="h-3 w-3 mr-1" /> Clear sheet filter
          </Button>
        </div>
      )}

      {/* ---------- Active filter pills ---------- */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeFilters.map((f) => (
            <Badge
              key={`${String(f.key)}:${f.value ?? ""}`}
              variant="secondary"
              className="cursor-pointer gap-1 hover:bg-muted"
              onClick={() => f.value === null
                ? setSearch({ [f.key]: undefined, page: 1 } as Partial<LeadSearch>)
                : removeFilterValue(f.key, f.value)
              }
            >
              {f.label}
              <X className="h-3 w-3" />
            </Badge>
          ))}
        </div>
      )}

      {/* ---------- Bulk action bar ---------- */}
      {selectMode && selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-2 bg-primary/5 border rounded-md">
          <span className="text-sm font-medium">{selectedIds.size} {t("leads.selected", { defaultValue: "selected" })}</span>
          <div className="flex items-center gap-1">
            <Select value={bulkStatus} onValueChange={(v) => setBulkStatus(v as LeadStatus)}>
              <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder={t("leads.bulk.set_status", { defaultValue: "Set status" })} /></SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="secondary" onClick={bulkApplyStatus} disabled={!bulkStatus}>{t("common.apply", { defaultValue: "Apply" })}</Button>
          </div>
          {role !== "agent" && (
            <div className="flex items-center gap-1">
              <Select value={bulkAgent} onValueChange={setBulkAgent}>
                <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder={t("leads.bulk.set_agent", { defaultValue: "Set agent" })} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned">{t("common.unassigned")}</SelectItem>
                  {eligibleAgents.map((a) => (
                    <SelectItem key={a.user_id} value={a.user_id}>{a.full_name ?? "—"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="secondary" onClick={bulkApplyAgent} disabled={!bulkAgent}>{t("common.apply", { defaultValue: "Apply" })}</Button>
            </div>
          )}
          {role === "admin" && (
            <div className="flex items-center gap-1">
              <Select value={bulkOffice} onValueChange={setBulkOffice}>
                <SelectTrigger className="h-8 w-[180px]"><SelectValue placeholder={t("leads.bulk.send_to_office", { defaultValue: "Send to office" })} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__inbox__">{t("leads.admin_inbox", { defaultValue: "Admin Inbox" })}</SelectItem>
                  {offices.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="secondary" onClick={bulkApplyOffice} disabled={!bulkOffice}>{t("common.apply", { defaultValue: "Apply" })}</Button>
            </div>
          )}
          {(role === "admin" || role === "manager" || role === "superiormanager") && (
            <Button size="sm" variant="destructive" className="ml-auto"
              onClick={() => setConfirmDelete({ ids: Array.from(selectedIds) })}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              {t("common.delete")}
            </Button>
          )}
        </div>
      )}

      {/* ---------- Table ---------- */}
      <div className="border-y bg-card -mx-4 sm:mx-0 sm:border sm:rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b hover:bg-transparent">
                {selectMode && (
                  <TableHead className="w-10 h-10">
                    <Checkbox
                      checked={pageRows.length > 0 && selectedIds.size === pageRows.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                )}
                {showCol("full_name") && <TableHead className="h-10 text-xs font-medium text-muted-foreground">{t("common.full_name")}</TableHead>}
                {showCol("email") && <TableHead className="h-10 text-xs font-medium text-muted-foreground">{t("common.email")}</TableHead>}
                {showCol("phone") && <TableHead className="h-10 text-xs font-medium text-muted-foreground">{t("common.phone")}</TableHead>}
                {showCol("amount") && <TableHead className="h-10 text-xs font-medium text-muted-foreground text-right">{t("leads.amount_lost", { defaultValue: "Amount lost" })}</TableHead>}
                {showCol("platform") && <TableHead className="h-10 text-xs font-medium text-muted-foreground">{t("common.platform", { defaultValue: "Platform" })}</TableHead>}
                {showCol("source") && <TableHead className="h-10 text-xs font-medium text-muted-foreground">{t("common.source", { defaultValue: "Source" })}</TableHead>}
                {showCol("country") && <TableHead className="h-10 text-xs font-medium text-muted-foreground">{t("common.country", { defaultValue: "Country" })}</TableHead>}
                {showCol("comment") && <TableHead className="h-10 text-xs font-medium text-muted-foreground">{t("leads.comment", { defaultValue: "Comment" })}</TableHead>}
                {showCol("description_1") && <TableHead className="h-10 text-xs font-medium text-muted-foreground">{t("leads.desc_1", { defaultValue: "Desc1" })}</TableHead>}
                {showCol("description_2") && <TableHead className="h-10 text-xs font-medium text-muted-foreground">{t("leads.desc_2", { defaultValue: "Desc2" })}</TableHead>}
                {showCol("description_3") && <TableHead className="h-10 text-xs font-medium text-muted-foreground">{t("leads.desc_3", { defaultValue: "Desc3" })}</TableHead>}
                {showCol("description_4") && <TableHead className="h-10 text-xs font-medium text-muted-foreground">{t("leads.desc_4", { defaultValue: "Desc4" })}</TableHead>}
                {showCol("status") && <TableHead className="h-10 text-xs font-medium text-muted-foreground">{t("common.status")}</TableHead>}
                {showAgentColumn && showCol("agent") && <TableHead className="h-10 text-xs font-medium text-muted-foreground">{t("common.agent")}</TableHead>}
                {showCol("imported") && (
                <TableHead className="h-10 text-xs font-medium text-muted-foreground whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setSearch({ sort: search.sort === "oldest" ? undefined : "oldest", page: 1 })}
                    className="inline-flex items-center gap-1 hover:text-foreground focus:outline-none"
                    title={search.sort === "oldest" ? "Showing oldest first — click for newest" : "Showing newest first — click for oldest"}
                  >
                    {role === "agent"
                      ? t("leads.assigned", { defaultValue: "Assigned" })
                      : t("leads.imported", { defaultValue: "Imported" })}
                    {(search.sort === undefined || search.sort === "newest" || search.sort === "oldest") && (
                      <span className="text-primary">{search.sort === "oldest" ? "↑ Oldest" : "↓ Newest"}</span>
                    )}
                  </button>
                </TableHead>
                )}
                {showCol("activity") && (
                <TableHead className="h-10 text-xs font-medium text-muted-foreground whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setSearch({ sort: search.sort === "activity_desc" ? "activity_asc" : "activity_desc", page: 1 })}
                    className="inline-flex items-center gap-1 hover:text-foreground focus:outline-none"
                    title={search.sort === "activity_asc" ? "Showing oldest activity first — click for newest" : "Showing newest activity first — click for oldest"}
                  >
                    {t("leads.last_activity", { defaultValue: "Last Activity" })}
                    <span className={search.sort === "activity_desc" || search.sort === "activity_asc" ? "text-primary" : "text-muted-foreground/60"}>
                      {search.sort === "activity_asc" ? "↑ Oldest" : "↓ Newest"}
                    </span>

                  </button>
                </TableHead>
                )}
                <TableHead className="h-10 w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={99} className="text-center text-sm text-muted-foreground py-12">{t("common.loading")}</TableCell></TableRow>
              ) : pageRows.length === 0 ? (
                <TableRow><TableCell colSpan={99} className="text-center text-sm text-muted-foreground py-12">{t("common.no_data")}</TableCell></TableRow>
              ) : pageRows.map((l) => (
                <LeadsTableRow
                  key={l.id}
                  lead={l as unknown as LeadRowData}
                  role={role as "admin" | "manager" | "superiormanager" | "agent" | null}
                  t={t as unknown as (k: string, o?: Record<string, unknown>) => string}
                  selectMode={selectMode}
                  isSelected={selectedIds.has(l.id)}
                  isExpanded={search.selected === l.id}
                  showAgentColumn={showAgentColumn}
                  canAlexReassign={canAlexReassign}
                  canDelete={role === "admin" || role === "manager" || role === "superiormanager"}
                  cols={visibleCols as unknown as Record<string, boolean>}
                  eligibleAgents={eligibleAgents}
                  officeMap={officeMap}
                  softphone={softphone}
                  latestComment={latestComments.get(l.id)}
                  fromSheet={sheetLeadIds.has(l.id)}
                  fmtAmount={fmtAmount}
                  onToggleSelect={onToggleSelectRow}
                  onOpenRow={onOpenRow}
                  onStatusChange={onStatusChange}
                  onAgentChange={onAgentChange}
                  onDelete={onDeleteRow}
                  onCloseDetail={onCloseDetail}
                  onLocalUpdate={onLocalUpdateRow}
                />
              ))}

            </TableBody>
          </Table>
        </div>
      </div>

      {/* ---------- Pagination ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
          <span>
            {filteredTotal === 0
              ? "—"
              : `${rangeStart}–${rangeEnd} ${t("common.of", { defaultValue: "of" })} ${filteredTotal}`}
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => setSearch({ size: Number(v), page: 1 })}
          >
            <SelectTrigger className="h-8 w-[86px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100, 200, 500, 1000].map((n) => (
                <SelectItem key={n} value={String(n)}>{n} / {t("leads.page", { defaultValue: "page" })}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {totalPages > 1 && (
          <NumericPager
            page={currentPage}
            totalPages={totalPages}
            onPage={(p) => { setSearch({ page: p }); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          />
        )}
      </div>


      {/* ---------- Dialogs ---------- */}
      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        offices={role === "admin" ? offices : offices.filter((o) => o.id === profile?.office_id)}
        defaultOfficeId={profile?.office_id ?? null}
        onComplete={() => void load()}
      />
      <AddLeadDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        role={role as "admin" | "manager" | "superiormanager" | "agent" | null}
        offices={role === "admin" ? offices : offices.filter((o) => o.id === profile?.office_id)}
        agents={agents}
        defaultOfficeId={profile?.office_id ?? null}
        currentUserId={profile?.user_id ?? null}
        onComplete={() => void load()}
      />
      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("leads.confirm_delete_title", { defaultValue: "Delete leads?" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("leads.confirm_delete_desc", { defaultValue: "This will permanently remove the selected leads and their notes/activity." })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (confirmDelete) void deleteLeads(confirmDelete.ids); setConfirmDelete(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmDeleteAll} onOpenChange={setConfirmDeleteAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("leads.confirm_delete_all_title", { defaultValue: "Delete all filtered leads?" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("leads.confirm_delete_all_desc", {
                defaultValue:
                  "This permanently removes all {{count}} leads matching the current filters — not just the ones on this page — along with their notes and activity.",
                count: filteredTotal,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setConfirmDeleteAll(false); void deleteAllFiltered(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------- Numeric pager ----------

function NumericPager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  const items: (number | "…")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) items.push(i);
  } else {
    items.push(1);
    if (page > 3) items.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) items.push(i);
    if (page < totalPages - 2) items.push("…");
    items.push(totalPages);
  }
  return (
    <div className="flex items-center gap-0.5">
      <Button size="icon" variant="ghost" className="h-8 w-8" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {items.map((it, i) =>
        it === "…" ? (
          <span key={`e${i}`} className="px-2 text-muted-foreground text-xs">…</span>
        ) : (
          <Button
            key={it}
            size="sm"
            variant={it === page ? "default" : "ghost"}
            className="h-8 w-8 p-0 tabular-nums"
            onClick={() => onPage(it)}
          >{it}</Button>
        ),
      )}
      <Button size="icon" variant="ghost" className="h-8 w-8" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

// (Suppress unused import warnings for icons used inside the table)
const _suppress = { Plus };
void _suppress;
