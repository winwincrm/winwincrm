import { useState, useMemo, useRef, useEffect } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { emailKey, emailVariants, normalizeEmail } from "@/lib/email-normalize";
import { useAuth } from "@/lib/auth-context";
import { Upload, Trash2, Download, Link2 } from "lucide-react";
import { parseLeadBlocks, type ParsedLead } from "@/lib/parseLeadText";
import { fetchSheetCsv } from "@/lib/sheets.functions";
import { saveSheetSync, setSheetSyncEnabled, runSheetSyncNow } from "@/lib/sheet-syncs.functions";


const TARGET_FIELDS = [
  { key: "first_name", required: false },
  { key: "last_name", required: false },
  { key: "full_name", required: false },
  { key: "email", required: false },
  { key: "phone", required: false },
  { key: "amount", required: false },
  { key: "timeframe", required: false },
  { key: "agent", required: false },
  { key: "comment", required: false },
  { key: "country", required: false },
  { key: "date", required: false },
  { key: "source", required: false },
  { key: "funnel", required: false },
  { key: "platform", required: false },
  { key: "description_1", required: false },
  { key: "description_2", required: false },
  { key: "description_3", required: false },
  { key: "description_4", required: false },
] as const;

type TargetKey = (typeof TARGET_FIELDS)[number]["key"];
const NONE = "__none__";

const MANAGER = "__manager__";
const DUP_DEFAULT = "__dup_default__";
const DUP_OWNER = "__dup_owner__";

const INBOX = "__inbox__";

function autoMap(header: string): TargetKey | null {
  const h = header.trim().toLowerCase().replace(/[\s\-]+/g, "_");
  if (!h) return null;
  const has = (...needles: string[]) => needles.some((n) => h === n || h.includes(n));
  if (has("first_name", "firstname", "fname", "given_name", "vorname", "prenom")) return "first_name";
  if (has("last_name", "lastname", "lname", "surname", "family_name", "nachname", "cognome")) return "last_name";
  if (has("full_name", "fullname") || h === "name" || h === "nome") return "full_name";
  if (has("email", "e_mail", "mail")) return "email";
  if (has("phone", "telephone", "mobile", "cell", "telefon", "tel", "handy", "numero")) return "phone";
  if (has("amount", "value", "deposit", "budget", "anlagebetrag", "betrag", "importo", "capital")) return "amount";
  if (has("timeframe", "duration", "horizon", "laufzeit", "durata")) return "timeframe";
  if (has("agent", "agente", "assigned_to", "owner", "berater", "consulente")) return "agent";
  if (has("comment", "note", "kommentar", "bemerkung", "nota", "message", "remark")) return "comment";
  if (has("country", "land", "paese", "nation", "pays")) return "country";
  if (has("date", "created_at", "datum", "data", "lieferdatum", "timestamp")) return "date";
  if (has("source", "quelle", "origine", "fonte", "channel", "kanal", "lead_source", "leadsource", "campaign", "list")) return "source";
  if (has("funnel", "trichter", "imbuto", "funnel_name", "entonnoir")) return "funnel";
  if (has("platform", "plattform", "piattaforma", "plateforme", "list", "liste")) return "platform";
  if (has("description_1", "description1", "desc_1", "desc1")) return "description_1";
  if (has("description_2", "description2", "desc_2", "desc2")) return "description_2";
  if (has("description_3", "description3", "desc_3", "desc3")) return "description_3";
  if (has("description_4", "description4", "desc_4", "desc4")) return "description_4";
  if (has("description", "desc", "beschreibung", "descrizione", "info", "details", "notes")) return "description_1";
  return null;
}


interface Office { id: string; name: string }
interface Agent { user_id: string; full_name: string | null; email: string | null }

const PASTE_PLACEHOLDER = `Name: Herr Horst-Rüdiger Backhaus
Kontakt: horst-ruediger-backhaus@t-online.de | +4915128053311
anlagebetrag: 25000
laufzeit: 12
Lieferdatum: 04.05.26 13:56

Name: Frau Erika Mustermann
Kontakt: erika@example.com | +491701234567
anlagebetrag: 50000
laufzeit: 24`;

// ---- Duplicate-review types ----------------------------------------------
type DupMatch = {
  lead_id: string;
  office_id: string | null;
  office_name: string;
  platform: string | null;
  source: string | null;
  created_at: string;
  matched_by: "email";
  assigned_user_id: string | null;
  agent_name: string;
  status: string | null;
};


type PendingRow = {
  insert: Record<string, unknown>;
  comment?: string;
};

type DupAction = "skip" | "import" | "replace";

type ReviewItem = {
  key: string;
  full_name: string;
  email: string;
  phone: string;
  source: string;
  amount: string;
  timeframe: string;
  matches: DupMatch[];      // existing leads across all offices
  inFile: boolean;          // also a duplicate of another row in the same upload
  action: DupAction;
  pending: PendingRow;      // fully-built insert row, ready to send if action=import/replace
};

export function CsvImportDialog({
  open, onOpenChange, offices, defaultOfficeId, onComplete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  offices: Office[];
  defaultOfficeId?: string | null;
  onComplete?: () => void;
}) {
  const { t } = useTranslation();
  const { role, profile } = useAuth();
  const [tab, setTab] = useState<"paste" | "csv" | "sheet">("paste");

  // CSV state
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, TargetKey | typeof NONE>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Google Sheet state
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetTitle, setSheetTitle] = useState("");

  // Live auto-sync (polls the sheet and imports only brand-new rows)
  const [liveOn, setLiveOn] = useState(false);
  const [liveEvery, setLiveEvery] = useState("2"); // seconds
  const [liveStats, setLiveStats] = useState<{ checks: number; added: number; updated: number; duplicates: number; lastAt: string | null; error: string | null }>(
    { checks: 0, added: 0, updated: 0, duplicates: 0, lastAt: null, error: null },
  );
  const [liveSyncId, setLiveSyncId] = useState<string | null>(null);
  const [liveSaving, setLiveSaving] = useState(false);
  const liveRunning = useRef(false);
  // Set while "Start live sync" is waiting for the duplicate-review step to finish.
  const pendingLiveStart = useRef(false);
  // Guards a manual import so it can never run twice concurrently.
  const preparing = useRef(false);


  // Paste state
  const [pasteText, setPasteText] = useState("");
  const [parsedLeads, setParsedLeads] = useState<ParsedLead[]>([]);


  // Shared
  const [batchTag, setBatchTag] = useState("");
  const [officeId, setOfficeId] = useState<string>(defaultOfficeId ?? NONE);
  const [assigneeId, setAssigneeId] = useState<string>(MANAGER);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [importing, setImporting] = useState(false);
  // Admin choice in the duplicate review: where allowed duplicates land —
  // the normal import target, the agent who already owns the existing lead,
  // or a specific agent picked here.
  const [dupTarget, setDupTarget] = useState<string>(DUP_DEFAULT);


  const [sourceOverride, setSourceOverride] = useState<string>(NONE);
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);


  // Duplicate-review state
  const [review, setReview] = useState<{
    items: ReviewItem[];
    keptClean: PendingRow[]; // non-duplicate rows, always imported
    totalParsed: number;
  } | null>(null);

  const unassignedFallbackId = role === "superiormanager" ? profile?.user_id ?? null : null;

  const reset = () => {
    setFile(null); setHeaders([]); setRows([]); setMapping({});
    setPasteText(""); setParsedLeads([]);
    setSheetUrl(""); setSheetTitle(""); setSheetLoading(false);
    setBatchTag(""); setImporting(false); setAssigneeId(MANAGER);
    setReview(null); setSourceOverride(NONE);
    pendingLiveStart.current = false;
  };


  // Load available sources (registered + already used on leads) so the user can pick one.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const [{ data: regRows }, { data: usedRows }] = await Promise.all([
        supabase.from("lead_sources" as never).select("name").order("name", { ascending: true }),
        supabase.from("leads").select("source").not("source", "is", null).is("deleted_at", null).limit(20000),
      ]);
      if (cancelled) return;
      const set = new Set<string>();
      for (const r of (regRows ?? []) as Array<{ name: string }>) {
        const n = (r.name ?? "").trim();
        if (n) set.add(n);
      }
      for (const r of (usedRows ?? []) as Array<{ source: string | null }>) {
        const n = (r.source ?? "").trim();
        if (n) set.add(n);
      }
      setSourceOptions(Array.from(set).sort((a, b) => a.localeCompare(b)));
    })();
    return () => { cancelled = true; };
  }, [open]);


  // Load agents whenever office changes
  useEffect(() => {
    if (officeId === NONE || officeId === INBOX) { setAgents([]); return; }
    let cancelled = false;
    (async () => {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .eq("office_id", officeId)
        .eq("status", "active");
      const ids = (profs ?? []).map((p) => p.user_id);
      if (ids.length === 0) { if (!cancelled) setAgents([]); return; }
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "agent")
        .in("user_id", ids);
      const agentIds = new Set((roles ?? []).map((r) => r.user_id));
      if (!cancelled) setAgents((profs ?? []).filter((p) => agentIds.has(p.user_id)) as Agent[]);
    })();
    return () => { cancelled = true; };
  }, [officeId]);

  // CSV file handler
  const applyParsedTable = (hs: string[], rs: Record<string, string>[]) => {
    setHeaders(hs);
    setRows(rs);
    const m: Record<string, TargetKey | typeof NONE> = {};
    const used = new Set<TargetKey>();
    // Pass 1 — confident auto-map on known headers.
    for (const h of hs) {
      const guess = autoMap(h);
      if (guess && !used.has(guess)) {
        m[h] = guess;
        used.add(guess);
      } else {
        m[h] = NONE;
      }
    }
    // Pass 2 — any leftover non-empty header auto-fills the next free
    // description_1..4 slot so unknown columns from the Excel are preserved
    // and visible on the lead, not silently dropped.
    const descSlots: TargetKey[] = ["description_1", "description_2", "description_3", "description_4"];
    for (const h of hs) {
      if (m[h] !== NONE) continue;
      if (!h.trim()) continue;
      const slot = descSlots.find((s) => !used.has(s));
      if (!slot) break;
      m[h] = slot;
      used.add(slot);
    }
    setMapping(m);
  };

  const parseSheetTable = (csv: string) => {
    const parsed = Papa.parse<string[]>(csv, { skipEmptyLines: "greedy" });
    if (parsed.errors.length > 0 && parsed.data.length === 0) throw new Error(parsed.errors[0]?.message ?? "Could not parse the sheet");
    const matrix = parsed.data;
    if (matrix.length === 0) return { headers: [] as string[], rows: [] as Record<string, string>[] };

    const rawHeaders = (matrix[0] ?? []).map((value) => String(value ?? "").replace(/^\uFEFF/, "").trim());
    let width = rawHeaders.length;
    while (width > 0 && !rawHeaders[width - 1]) width--;
    const used = new Map<string, number>();
    const normalizedHeaders = rawHeaders.slice(0, width).map((value, index) => {
      const base = value || `column_${index + 1}`;
      const count = (used.get(base) ?? 0) + 1;
      used.set(base, count);
      return count === 1 ? base : `${base}_${count}`;
    });
    const parsedRows = matrix.slice(1).map((values) => {
      const row: Record<string, string> = {};
      normalizedHeaders.forEach((header, index) => { row[header] = String(values?.[index] ?? ""); });
      return row;
    }).filter((row) => Object.values(row).some((value) => value.trim() !== ""));
    return { headers: normalizedHeaders, rows: parsedRows };
  };

  const mappingForHeaders = (nextHeaders: string[]) => {
    const next: Record<string, TargetKey | typeof NONE> = {};
    const used = new Set<TargetKey>();
    for (const header of nextHeaders) {
      const existing = mapping[header];
      const target = existing && existing !== NONE ? existing : autoMap(header);
      if (target && !used.has(target)) {
        next[header] = target;
        used.add(target);
      } else next[header] = NONE;
    }
    return next;
  };


  const handleFile = (f: File) => {
    setFile(f);
    // Auto-suggest the list tag from the filename so every import is traceable.
    if (!batchTag.trim()) {
      const base = f.name.replace(/\.(csv|xlsx?|txt)$/i, "").slice(0, 60);
      if (base) setBatchTag(base);
    }
    const name = f.name.toLowerCase();
    const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");
    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });
          if (aoa.length === 0) { toast.error(t("leads.import.empty_file", { defaultValue: "File is empty" })); return; }
          const rawHs = (aoa[0] as unknown[]).map((h) => String(h ?? "").trim());
          let end = rawHs.length;
          while (end > 0 && !rawHs[end - 1]) end--;
          const hs = rawHs.slice(0, end).map((h, i) => h || `column_${i + 1}`);
          const rs: Record<string, string>[] = [];
          for (let i = 1; i < aoa.length; i++) {
            const row = aoa[i] as unknown[];
            const obj: Record<string, string> = {};
            let any = false;
            hs.forEach((h, idx) => {
              const v = row?.[idx];
              const s = v === undefined || v === null ? "" : String(v);
              if (s.trim()) any = true;
              obj[h] = s;
            });
            if (any) rs.push(obj);
          }
          applyParsedTable(hs, rs);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : String(err));
        }
      };
      reader.onerror = () => toast.error(t("leads.import.read_error", { defaultValue: "Failed to read file" }));
      reader.readAsArrayBuffer(f);
      return;
    }
    Papa.parse<Record<string, string>>(f, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        const hs = res.meta.fields ?? [];
        applyParsedTable(hs, res.data);
      },
      error: (err) => toast.error(err.message),
    });
  };

  // Pull a public Google Sheet (or any CSV link) through the server and feed it
  // into the exact same mapping + duplicate-review pipeline as a file upload.
  const handleSheetFetch = async () => {
    const url = sheetUrl.trim();
    if (!url) return;
    setSheetLoading(true);
    try {
      const res = await fetchSheetCsv({ data: { url } });
      const { headers: hs, rows: data } = parseSheetTable(res.csv);
      if (hs.length === 0 || data.length === 0) {
        toast.error(t("leads.import.sheet_empty", { defaultValue: "No rows found in that sheet" }));
        return;
      }
      applyParsedTable(hs, data);
      const title = res.title || "Google Sheet";
      setSheetTitle(title);
      if (!batchTag.trim()) setBatchTag(title.slice(0, 60));
      toast.success(
        t("leads.import.sheet_loaded", { defaultValue: "Loaded {{n}} rows", n: data.length }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSheetLoading(false);
    }
  };

  // ---- Live auto-sync (server-side) ---------------------------------------
  // The sheet connection is saved in the database and executed by the server:
  //   * a background cron worker runs it every minute even with the app closed
  //   * while this dialog is open we also trigger it on the chosen interval
  // New rows are inserted, edited cells update the lead the row created.
  const liveTick = async (syncId = liveSyncId) => {
    if (!syncId || liveRunning.current) return;
    liveRunning.current = true;
    try {
      const res = await runSheetSyncNow({ data: { id: syncId } });
      const added = res.inserted ?? 0;
      const updated = res.updated ?? 0;
      const dupes = res.duplicates ?? 0;
      setLiveStats((s) => ({
        checks: s.checks + 1,
        added: s.added + added,
        updated: s.updated + updated,
        duplicates: s.duplicates + dupes,
        lastAt: new Date().toLocaleTimeString(),
        error: res.error ?? null,
      }));
      if (added > 0 || updated > 0) {
        toast.success(
          t("leads.import.live_added", {
            defaultValue: "{{n}} new · {{u}} updated from the sheet",
            n: added, u: updated,
          }),
        );
        onComplete?.();
      }
      // Duplicates are never silent: say exactly how many rows were rejected.
      if (dupes > 0) {
        toast.warning(
          t("leads.import.live_dupes", {
            defaultValue: "{{n}} duplicate row(s) skipped — already in the CRM",
            n: dupes,
          }),
        );
      }
      // Keep the preview in step with the live sheet.
      try {
        const fresh = await fetchSheetCsv({ data: { url: sheetUrl.trim() } });
        const { headers: hs, rows: rs } = parseSheetTable(fresh.csv);
        if (hs.length > 0) { setHeaders(hs); setRows(rs); setMapping(mappingForHeaders(hs)); }
      } catch { /* preview refresh is best-effort */ }
    } catch (e) {
      setLiveStats((s) => ({
        ...s,
        checks: s.checks + 1,
        lastAt: new Date().toLocaleTimeString(),
        error: e instanceof Error ? e.message : String(e),
      }));
    } finally {
      liveRunning.current = false;
    }
  };

  const tickRef = useRef(liveTick);
  tickRef.current = liveTick;

  useEffect(() => {
    if (!liveOn || !liveSyncId) return;
    const ms = Math.max(2, Number(liveEvery) || 2) * 1000;
    const id = setInterval(() => { void tickRef.current(liveSyncId); }, ms);
    return () => clearInterval(id);
  }, [liveOn, liveEvery, liveSyncId]);

  // Stop the foreground polling once the dialog is closed (the server cron keeps going).
  useEffect(() => {
    if (!open) setLiveOn(false);
  }, [open]);

  /** Saves the sync config and turns polling on. Called only after the duplicate step. */
  const beginLiveSync = async () => {
    if (officeId === NONE) {
      toast.error(t("leads.import.choose_office", { defaultValue: "Please choose an office" }));
      return;
    }
    if (!sheetUrl.trim() || rows.length === 0) {
      toast.error(t("leads.import.sheet_fetch_first", { defaultValue: "Fetch the sheet once first" }));
      return;
    }
    setLiveSaving(true);
    try {
      const overrideActive = sourceOverride !== NONE && sourceOverride.trim() !== "";
      const saved = await saveSheetSync({
        data: {
          id: liveSyncId ?? undefined,
          name: (sheetTitle || listName()).slice(0, 120),
          sheet_url: sheetUrl.trim(),
          office_id: officeId === INBOX ? null : officeId,
          assigned_user_id: officeId === INBOX
            ? null
            : (assigneeId === MANAGER ? unassignedFallbackId : assigneeId),
          source: overrideActive ? sourceOverride : "google_sheet",
          list_name: listName().slice(0, 120),
          mapping: mapping as Record<string, string>,
          interval_seconds: Math.max(5, Number(liveEvery) || 60),
          update_existing: true,
          enabled: true,
        },
      });
      setLiveSyncId(saved.id);
      setLiveStats({ checks: 0, added: 0, updated: 0, duplicates: 0, lastAt: null, error: null });
      setLiveOn(true);
      toast.success(t("leads.import.live_started", { defaultValue: "Live sync started — it keeps running in the background" }));
      void liveTick(saved.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLiveSaving(false);
    }
  };

  // "Start live sync" never imports blindly: the current sheet snapshot goes
  // through the same duplicate-review step as a manual import first, and the
  // background sync only starts once the user has decided what to do.
  const startLive = async () => {
    if (officeId === NONE) {
      toast.error(t("leads.import.choose_office", { defaultValue: "Please choose an office" }));
      return;
    }
    if (!sheetUrl.trim() || rows.length === 0) {
      toast.error(t("leads.import.sheet_fetch_first", { defaultValue: "Fetch the sheet once first" }));
      return;
    }
    pendingLiveStart.current = true;
    await doPrepare();
  };

  const stopLive = async () => {
    setLiveOn(false);
    if (!liveSyncId) return;
    try {
      await setSheetSyncEnabled({ data: { id: liveSyncId, enabled: false } });
      toast.success(t("leads.import.live_stopped", { defaultValue: "Live sync stopped" }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };





  const downloadTemplate = () => {
    const headers = TARGET_FIELDS.map((f) => f.key);
    const example: Record<string, string | number> = {
      first_name: "Erika",
      last_name: "Mustermann",
      full_name: "Erika Mustermann",
      email: "erika@example.com",
      phone: "+491701234567",
      amount: 25000,
      timeframe: "12",
      agent: "agent@example.com",
      comment: "Called once, will retry",
      country: "DE",
      date: "2026-06-17",
      source: "facebook_ads",
    };
    const aoa: (string | number)[][] = [headers, headers.map((h) => example[h] ?? "")];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads");
    XLSX.writeFile(wb, "leads-template.xlsx");
  };

  const mappedCount = useMemo(
    () => Object.values(mapping).filter((v) => v !== NONE).length,
    [mapping],
  );

  const doParsePaste = () => {
    const parsed = parseLeadBlocks(pasteText);
    if (parsed.length === 0) {
      toast.error(t("leads.import.no_blocks", { defaultValue: "No leads detected in pasted text" }));
      return;
    }
    setParsedLeads(parsed);
    toast.success(t("leads.import.parsed_n", { defaultValue: "Parsed {{n}} leads", n: parsed.length }));
  };

  const updateParsedField = (i: number, field: keyof ParsedLead, value: string) => {
    setParsedLeads((prev) => {
      const next = [...prev];
      const lead = { ...next[i] };
      if (field === "amount") {
        const n = Number(value.replace(/[^\d.\-]/g, ""));
        (lead as ParsedLead).amount = Number.isFinite(n) ? n : undefined;
      } else {
        (lead as Record<string, unknown>)[field] = value || undefined;
      }
      next[i] = lead;
      return next;
    });
  };

  const removeParsedRow = (i: number) => {
    setParsedLeads((prev) => prev.filter((_, idx) => idx !== i));
  };

  const parseDateValue = (raw: string): string | null => {
    const s = raw.trim();
    if (!s) return null;
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = Number(s);
      if (n > 20000 && n < 90000) {
        const ms = Math.round((n - 25569) * 86400 * 1000);
        const d = new Date(ms);
        if (!isNaN(d.getTime())) return d.toISOString();
      }
    }
    const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?$/);
    if (m) {
      let [, dd, mm, yy, hh, mi] = m;
      if (yy.length === 2) yy = (Number(yy) > 50 ? "19" : "20") + yy;
      const iso = `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${(hh ?? "00").padStart(2, "0")}:${mi ?? "00"}:00`;
      const d = new Date(iso);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString();
    return null;
  };

  type CsvRow = {
    insert: Record<string, unknown>;
    comment?: string;
    agentName?: string;
  };

  const buildRowsFromCsv = (
    rowsArg?: Record<string, string>[],
    mappingArg: Record<string, TargetKey | typeof NONE> = mapping,
  ): CsvRow[] => {
    const out: CsvRow[] = [];
    for (const r of (rowsArg ?? rows)) {
      const fields: Partial<Record<TargetKey, string>> = {};
      const extras: Record<string, string> = {};
      for (const [src, val] of Object.entries(r)) {
        const raw = (val ?? "").trim();
        if (!raw) continue;
        const tgt = mappingArg[src];
        if (!tgt || tgt === NONE) {
          // Preserve unmapped columns so nothing from the file is lost.
          extras[src] = raw;
        } else {
          fields[tgt] = raw;
        }
      }
      if (Object.keys(fields).length === 0 && Object.keys(extras).length === 0) continue;

      const payload: Record<string, unknown> = {};
      if (fields.country) payload.country = fields.country;
      if (fields.funnel) payload.funnel = fields.funnel;
      if (Object.keys(extras).length) payload.extra = extras;

      const fullName = fields.full_name?.trim()
        || [fields.first_name, fields.last_name].filter(Boolean).join(" ").trim()
        || fields.email?.trim()
        || fields.phone?.trim()
        || fields.agent?.trim()
        || "Imported lead";

      let assignedUserId: string | null = null;
      if (fields.agent) {
        const needle = fields.agent.toLowerCase();
        const match = agents.find(
          (a) => a.full_name?.toLowerCase() === needle || a.email?.toLowerCase() === needle,
        );
        if (match) assignedUserId = match.user_id;
      }

      // Only include fields that actually have values — never write NULL manually
      // so DB defaults apply and partial files (e.g. name+email+phone only) import cleanly.
      const insert: Record<string, unknown> = { full_name: fullName, payload };
      if (fields.first_name) insert.first_name = fields.first_name;
      if (fields.last_name) insert.last_name = fields.last_name;
      if (fields.email) insert.email = fields.email;
      if (fields.phone) insert.phone = fields.phone;
      if (fields.timeframe) insert.timeframe = fields.timeframe;
      if (fields.agent) insert.origin_agent_name = fields.agent;
      if (fields.amount) {
        const n = Number(fields.amount.replace(/[^\d.\-]/g, ""));
        if (!isNaN(n) && n !== 0) insert.amount = n;
      }
      if (fields.source) {
        insert.source = fields.source;
        insert.platform = fields.source;
      }
      if (fields.platform) insert.platform = fields.platform;
      if (fields.description_1) insert.description_1 = fields.description_1;
      if (fields.description_2) insert.description_2 = fields.description_2;
      if (fields.description_3) insert.description_3 = fields.description_3;
      if (fields.description_4) insert.description_4 = fields.description_4;
      if (assignedUserId) insert.assigned_user_id = assignedUserId;
      if (fields.date) {
        const iso = parseDateValue(fields.date);
        if (iso) insert.created_at = iso;
      }

      out.push({ insert, comment: fields.comment, agentName: fields.agent });
    }
    return out;
  };


  // Cross-office lookup: return every existing lead matching a normalized email.
  const fetchDuplicateMatches = async (
    values: string[],
    chunkSize = 200,
  ): Promise<Map<string, DupMatch[]>> => {
    const out = new Map<string, DupMatch[]>();
    if (values.length === 0) return out;
    const lookups = Array.from(new Set(values.flatMap((v) => emailVariants(v))));
    const size = Math.min(chunkSize, 100);
    for (let i = 0; i < lookups.length; i += size) {
      const chunk = lookups.slice(i, i + size);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const query = (supabase.from("leads") as any)
        .select("id, office_id, platform, source, created_at, email, assigned_user_id, status")
        .is("deleted_at", null);
      const { data, error } = await query
        .or(chunk.map((v) => `email.ilike.${v.replace(/[,()]/g, "")}`).join(","))
        .limit(5000);
      if (error) throw error;
      for (const r of (data ?? []) as Array<{
        id: string; office_id: string | null; platform: string | null;
        source: string | null; created_at: string;
        email: string | null;
        assigned_user_id: string | null; status: string | null;
      }>) {
        const raw = emailKey(r.email) ?? "";
        if (!raw) continue;
        const office = offices.find((o) => o.id === r.office_id);
        const match: DupMatch = {
          lead_id: r.id,
          office_id: r.office_id,
          office_name: office?.name ?? (r.office_id ? r.office_id.slice(0, 8) : "—"),
          platform: r.platform,
          source: r.source,
          created_at: r.created_at,
          matched_by: "email",
          assigned_user_id: r.assigned_user_id,
          agent_name: "",
          status: r.status,
        };
        const arr = out.get(raw) ?? [];
        arr.push(match);
        out.set(raw, arr);
      }
    }
    await resolveAgentNames(out);
    return out;
  };

  // Fill in a readable agent name for every matched lead so the review table can
  // say WHO currently owns the duplicate, not just which office it sits in.
  const agentNameCache = useRef<Map<string, string>>(new Map());
  const resolveAgentNames = async (map: Map<string, DupMatch[]>) => {
    const all = [...map.values()].flat();
    const missing = Array.from(new Set(
      all.map((m) => m.assigned_user_id).filter((id): id is string => !!id && !agentNameCache.current.has(id)),
    ));
    for (let i = 0; i < missing.length; i += 200) {
      const chunk = missing.slice(i, i + 200);
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", chunk);
      for (const p of (data ?? []) as Array<{ user_id: string; full_name: string | null; email: string | null }>) {
        agentNameCache.current.set(p.user_id, p.full_name || p.email || p.user_id.slice(0, 8));
      }
    }
    for (const m of all) {
      m.agent_name = m.assigned_user_id
        ? (agentNameCache.current.get(m.assigned_user_id) ?? m.assigned_user_id.slice(0, 8))
        : "Unassigned";
    }
  };


  // Build final insert row for a pending row using the shared office / assignee / tag.
  // The list name (batchTag) always wins so imports are traceable in the duplicates UI.
  const listName = (): string => {
    const b = batchTag.trim();
    if (b) return b;
    if (tab === "csv" && file) return file.name.replace(/\.(csv|xlsx?|txt)$/i, "");
    if (tab === "sheet" && sheetTitle) return sheetTitle;
    return `${tab === "paste" ? "Paste" : "Import"} ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  };
  const finalizeInsertRow = (p: PendingRow, sourceTag: string): Record<string, unknown> => ({
    office_id: officeId === INBOX ? null : officeId,
    // store a cleaned address so future duplicate checks stay reliable
    assigned_user_id: officeId === INBOX
      ? null
      : (p.insert.assigned_user_id ?? (assigneeId === MANAGER ? unassignedFallbackId : assigneeId)),
    ...p.insert,
    // store a cleaned address so future duplicate checks stay reliable
    ...(p.insert.email ? { email: normalizeEmail(p.insert.email as string) ?? p.insert.email } : {}),
    platform: (p.insert.platform as string | undefined) || listName(),
    source: p.insert.source ?? sourceTag,
    status: "new" as const,
  });

  // PostgREST bulk inserts must have uniform keys: supabase-js pads any key that
  // is missing on a row with NULL. If ONE row carries an imported created_at, the
  // rest would be sent as created_at: null and violate the NOT NULL column.
  // Fill the gaps with "now" so mixed files import cleanly.
  const normalizeInsertRows = (rowsIn: Record<string, unknown>[]): Record<string, unknown>[] => {
    const hasCreatedAt = rowsIn.some((r) => r.created_at != null);
    if (!hasCreatedAt) return rowsIn;
    const now = new Date().toISOString();
    return rowsIn.map((r) => (r.created_at != null ? r : { ...r, created_at: now }));
  };

  // Step 1 — prepare: build rows, detect duplicates. If any → show review UI.
  const doPrepare = async () => {
    if (officeId === NONE) {
      toast.error(t("leads.import.choose_office", { defaultValue: "Please choose an office" }));
      return;
    }
    // A second click (or a live-sync tick) while preparing would import the same
    // file twice — the first pass writes the rows, the second then reports every
    // row as an existing duplicate. Only ever run one import at a time.
    if (preparing.current || importing) return;
    preparing.current = true;
    if (liveOn) void stopLive();

    let built: PendingRow[];
    let totalParsed: number;


    try {
      if (tab !== "paste") {
        if (rows.length === 0) return;
        const b = buildRowsFromCsv();
        totalParsed = b.length;
        built = b.map((x) => ({ insert: x.insert, comment: x.comment }));
      } else {
        if (parsedLeads.length === 0) {
          toast.error(t("leads.import.parse_first", { defaultValue: "Click Parse first" }));
          return;
        }
        totalParsed = parsedLeads.length;
        built = parsedLeads.map((p) => {
          const ins: Record<string, unknown> = {
            full_name: p.full_name
              || [p.first_name, p.last_name].filter(Boolean).join(" ").trim()
              || p.email || p.phone || "Imported lead",
            payload: p.payload ?? {},
          };
          if (p.first_name) ins.first_name = p.first_name;
          if (p.last_name) ins.last_name = p.last_name;
          if (p.email) ins.email = p.email;
          if (p.phone) ins.phone = p.phone;
          if (p.amount != null) ins.amount = p.amount;
          if (p.timeframe) ins.timeframe = p.timeframe;
          return { insert: ins };
        });
      }


      const emails = Array.from(new Set(
        built.map((b) => normalizeEmail(b.insert.email as string | null)).filter(Boolean) as string[],
      ));
      setImporting(true);
      const byEmail = await fetchDuplicateMatches(emails);
      setImporting(false);

      const seenEmails = new Set<string>();
      const items: ReviewItem[] = [];
      const keptClean: PendingRow[] = [];

      built.forEach((b, idx) => {
        const e = emailKey(b.insert.email as string | null) ?? "";

        const dbMatches = e ? (byEmail.get(e) ?? []) : [];
        const inFile = !!e && seenEmails.has(e);

        if (dbMatches.length === 0 && !inFile) {
          keptClean.push(b);
          if (e) seenEmails.add(e);
          return;
        }

        items.push({
          key: `${idx}`,
          full_name: String(b.insert.full_name ?? ""),
          email: String(b.insert.email ?? ""),
          phone: String(b.insert.phone ?? ""),
          source: String(b.insert.source ?? (tab === "paste" ? "manual_paste" : "csv_import")),
          amount: b.insert.amount == null ? "" : String(b.insert.amount),
          timeframe: String(b.insert.timeframe ?? ""),
          matches: dbMatches,
          inFile,
          action: "skip",
          pending: b,
        });
        // Still register so subsequent rows detect repeats.
        if (e) seenEmails.add(e);
      });

      if (items.length === 0) {
        await runInsert(keptClean, [], [], totalParsed);
        return;
      }

      // Announce the duplicate count before the decision screen opens, so it is
      // never a silent drop: the user always sees how many rows need a choice.
      toast.warning(
        t("leads.import.dupes_found", {
          defaultValue: "{{n}} of {{total}} rows are duplicates — choose skip, import anyway or replace",
          n: items.length, total: totalParsed,
        }),
      );
      setReview({ items, keptClean, totalParsed });
    } catch (e) {
      setImporting(false);
      pendingLiveStart.current = false;
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      preparing.current = false;
    }

  };

  // Step 2 — insert final rows (kept + any "import anyway"/"replace" duplicates).
  // `replaceIds` is the set of existing lead ids to delete first (used by "Replace old").
  const runInsert = async (
    keptClean: PendingRow[],
    extraFromReview: PendingRow[],
    replaceIds: string[],
    totalParsed: number,
  ) => {
    const overrideActive = sourceOverride !== NONE && sourceOverride.trim() !== "";
    const defaultTag = tab === "paste" ? "manual_paste" : tab === "sheet" ? "google_sheet" : "csv_import";
    const sourceTag = overrideActive ? sourceOverride : defaultTag;
    // Re-check rows previously classified as clean immediately before writing.
    // This closes the gap between opening the review screen and confirming it,
    // and ensures the normal import path can never silently create duplicates.
    const cleanEmails = Array.from(new Set(
      keptClean.map((p) => normalizeEmail(p.insert.email as string | null)).filter(Boolean) as string[],
    ));
    const latestByEmail = await fetchDuplicateMatches(cleanEmails);
    const stillClean = keptClean.filter((p) => {
      const email = emailKey(p.insert.email as string | null) ?? "";
      return !(email && latestByEmail.has(email));
    });
    const lateDuplicates = keptClean.length - stillClean.length;
    // extraFromReview contains only rows the user explicitly selected as
    // "Import anyway" or "Replace"; those choices remain intentional.
    const merged = [...stillClean, ...extraFromReview];
    if (merged.length === 0 && replaceIds.length === 0) {
      toast.info(t("leads.import.nothing_new", { defaultValue: "Nothing new to import" }));
      setReview(null);
      if (pendingLiveStart.current) { pendingLiveStart.current = false; await beginLiveSync(); }
      return;
    }
    // When the user picks a source override, force it on every row (ignore CSV source column).
    const toInsert = normalizeInsertRows(merged.map((p) => {
      const row = finalizeInsertRow(p, sourceTag);
      if (overrideActive) row.source = sourceOverride;
      return row;
    }));


    const comments = merged.map((p) => p.comment);

    setImporting(true);

    // Delete existing leads that the user chose to replace (children first).
    let replaced = 0;
    if (replaceIds.length > 0) {
      const DEL_CHUNK = 200;
      for (let i = 0; i < replaceIds.length; i += DEL_CHUNK) {
        const ids = replaceIds.slice(i, i + DEL_CHUNK);
        await supabase.from("lead_comments").delete().in("lead_id", ids);
        await supabase.from("lead_activity").delete().in("lead_id", ids);
        const { error } = await supabase.from("leads").delete().in("id", ids);
        if (error) {
          toast.error(`${error.message} (replaced ${replaced} of ${replaceIds.length})`);
          setImporting(false);
          onComplete?.();
          return;
        }
        replaced += ids.length;
      }
    }

    let inserted = 0;
    const INSERT_CHUNK = 500;
    const commentRows: Array<{ lead_id: string; comment: string }> = [];
    for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
      const chunk = toInsert.slice(i, i + INSERT_CHUNK);
      const { data, error } = await supabase.from("leads").insert(chunk as never).select("id");
      if (error) {
        const reason = [error.message, error.details, error.hint].filter(Boolean).join(" ");
        toast.error(`${reason} (inserted ${inserted} of ${toInsert.length})`);
        setImporting(false);
        onComplete?.();
        return;
      }
      (data ?? []).forEach((row, idx) => {
        const c = comments[i + idx];
        if (c && c.trim()) commentRows.push({ lead_id: (row as { id: string }).id, comment: c.trim() });
      });
      inserted += chunk.length;
    }
    if (commentRows.length > 0) {
      await supabase.from("lead_comments").insert(commentRows as never);
    }

    const skipped = totalParsed - toInsert.length;
    toast.success(
      t("leads.import.done_with_replace", {
        defaultValue: "Imported {{inserted}}, replaced {{replaced}}, skipped {{skipped}}",
        inserted, replaced, skipped,
      }),
    );
    if (lateDuplicates > 0) {
      toast.info(`${lateDuplicates} additional duplicate${lateDuplicates === 1 ? " was" : "s were"} skipped during the final safety check.`);
    }
    setImporting(false);
    setReview(null);
    onComplete?.();
    if (pendingLiveStart.current) {
      // Keep the dialog open so the user can watch the live sync they asked for.
      pendingLiveStart.current = false;
      await beginLiveSync();
      return;
    }
    // A one-off Google Sheet import still registers the sheet (paused) so it
    // shows up on the Google Sheets page and can be synced later.
    if (tab === "sheet" && sheetUrl.trim() && !liveSyncId) {
      try {
        const overrideActive = sourceOverride !== NONE && sourceOverride.trim() !== "";
        const saved = await saveSheetSync({
          data: {
            name: (sheetTitle || listName()).slice(0, 120),
            sheet_url: sheetUrl.trim(),
            office_id: officeId === INBOX ? null : officeId,
            assigned_user_id: officeId === INBOX
              ? null
              : (assigneeId === MANAGER ? unassignedFallbackId : assigneeId),
            source: overrideActive ? sourceOverride : "google_sheet",
            list_name: listName().slice(0, 120),
            mapping: mapping as Record<string, string>,
            interval_seconds: Math.max(5, Number(liveEvery) || 60),
            update_existing: true,
            enabled: false,
          },
        });
        setLiveSyncId(saved.id);
      } catch { /* registering the link is best-effort */ }
    }

    reset();
    onOpenChange(false);
  };

  const confirmReview = async () => {
    if (!review) return;
    const extras: PendingRow[] = [];
    const replaceIds: string[] = [];
    for (const it of review.items) {
      if (it.action === "import" || it.action === "replace") {
        // Optional routing: keep the normal import target, hand the duplicate
        // to the agent who already owns the existing lead, or force a chosen agent.
        let override: Record<string, unknown> | null = null;
        if (dupTarget === DUP_OWNER) {
          const owner = it.matches.find((m) => m.assigned_user_id);
          if (owner) {
            override = {
              assigned_user_id: owner.assigned_user_id,
              office_id: owner.office_id ?? null,
            };
          }
        } else if (dupTarget !== DUP_DEFAULT) {
          override = { assigned_user_id: dupTarget };
        }
        extras.push(override
          ? { ...it.pending, insert: { ...it.pending.insert, ...override } }
          : it.pending);
      }

      if (it.action === "replace") for (const m of it.matches) replaceIds.push(m.lead_id);
    }
    await runInsert(review.keptClean, extras, replaceIds, review.totalParsed);
  };


  const setAllActions = (a: DupAction) => {
    setReview((prev) => prev ? { ...prev, items: prev.items.map((it) => ({ ...it, action: a })) } : prev);
  };
  const setItemAction = (key: string, a: DupAction) => {
    setReview((prev) => prev ? {
      ...prev,
      items: prev.items.map((it) => it.key === key ? { ...it, action: a } : it),
    } : prev);
  };

  const downloadReviewXlsx = () => {
    if (!review) return;
    const headers = ["full_name", "email", "phone", "matched_by", "existing_agent", "existing_office", "existing_platform", "existing_source", "existing_status", "existing_created_at", "existing_lead_id", "in_file_duplicate", "action"];
    const aoa: (string | number)[][] = [headers];
    for (const it of review.items) {
      if (it.matches.length === 0) {
        aoa.push([it.full_name, it.email, it.phone, "in-file", "", "", "", "", "", "", "", it.inFile ? "yes" : "", it.action]);
        continue;
      }
      for (const m of it.matches) {
        aoa.push([
          it.full_name, it.email, it.phone, m.matched_by,
          m.agent_name || "Unassigned",
          m.office_name, m.platform ?? "", m.source ?? "", m.status ?? "", m.created_at, m.lead_id,
          it.inFile ? "yes" : "", it.action,
        ]);
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Duplicates");
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `duplicates-${ts}.xlsx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const canImport = officeId !== NONE && !importing && (
    (tab !== "paste" && rows.length > 0) ||
    (tab === "paste" && parsedLeads.length > 0)
  );

  const importCount = review ? review.items.filter((i) => i.action === "import").length : 0;
  const replaceCount = review ? review.items.filter((i) => i.action === "replace").length : 0;
  const skipCount = review ? review.items.length - importCount - replaceCount : 0;

  // Detailed breakdown of WHERE the duplicates already live: agent, source,
  // office and list. Duplicate identity is email-only.
  const dupBreakdown = useMemo(() => {
    const empty = {
      byAgent: [] as Array<[string, number]>,
      bySource: [] as Array<[string, number]>,
      byOffice: [] as Array<[string, number]>,
      byList: [] as Array<[string, number]>,
      byMatch: [] as Array<[string, number]>,
      existing: 0,
      inFileOnly: 0,
      matchedLeads: 0,
    };
    if (!review) return empty;
    const tally = new Map<string, Map<string, number>>();
    const bump = (group: string, key: string) => {
      const m = tally.get(group) ?? new Map<string, number>();
      m.set(key, (m.get(key) ?? 0) + 1);
      tally.set(group, m);
    };
    let existing = 0, inFileOnly = 0, matchedLeads = 0;
    for (const it of review.items) {
      if (it.matches.length === 0) { inFileOnly++; continue; }
      existing++;
      for (const m of it.matches) {
        matchedLeads++;
        bump("agent", m.agent_name || "Unassigned");
        bump("source", m.source || "—");
        bump("office", m.office_name || "—");
        bump("list", m.platform || "—");
        bump("match", m.matched_by);
      }
    }
    const sorted = (g: string) =>
      [...(tally.get(g) ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);
    return {
      byAgent: sorted("agent"),
      bySource: sorted("source"),
      byOffice: sorted("office"),
      byList: sorted("list"),
      byMatch: sorted("match"),
      existing,
      inFileOnly,
      matchedLeads,
    };
  }, [review]);


  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {review
              ? t("leads.import.review_title", { defaultValue: "Review duplicates" })
              : t("leads.import.title", { defaultValue: "Import leads" })}
          </DialogTitle>
          <DialogDescription>
            {review
              ? t("leads.import.review_desc", {
                  defaultValue: "{{n}} lead(s) in this upload already exist in the CRM. They are skipped by default. Only choose Import anyway if you intentionally want duplicate records.",
                  n: review.items.length,
                })
              : t("leads.import.desc", { defaultValue: "Paste raw text or upload a CSV." })}
          </DialogDescription>
        </DialogHeader>

        {review ? (
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">
                {t("leads.import.review_summary_v2", {
                  defaultValue: "Clean: {{clean}} · Duplicates: {{dup}} · Import: {{imp}} · Replace: {{rep}} · Skip: {{skip}}",
                  clean: review.keptClean.length,
                  dup: review.items.length,
                  imp: importCount,
                  rep: replaceCount,
                  skip: skipCount,
                })}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  {t("leads.import.dup_target_label", { defaultValue: "Approved duplicates go to" })}
                </span>
                <Select value={dupTarget} onValueChange={setDupTarget}>
                  <SelectTrigger className="h-7 w-[230px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DUP_DEFAULT}>
                      {t("leads.import.dup_target_default", { defaultValue: "Selected office / assignee" })}
                    </SelectItem>
                    <SelectItem value={DUP_OWNER}>
                      {t("leads.import.dup_target_owner", { defaultValue: "Agent who already owns the lead" })}
                    </SelectItem>
                    {agents.map((a) => (
                      <SelectItem key={a.user_id} value={a.user_id}>
                        {a.full_name || a.email || a.user_id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="ml-auto flex gap-2 flex-wrap">

                <Button size="sm" variant="outline" onClick={() => setAllActions("skip")}>
                  {t("leads.import.skip_all", { defaultValue: "Skip all" })}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setAllActions("import")}>
                  {t("leads.import.import_all_anyway", { defaultValue: "Allow all duplicates" })}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAllActions("replace")}>
                  {t("leads.import.replace_all", { defaultValue: "Replace all old" })}
                </Button>
                <Button size="sm" variant="outline" onClick={downloadReviewXlsx}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  {t("leads.import.export_xlsx", { defaultValue: "Export XLSX" })}
                </Button>
              </div>
            </div>

            {/* Detailed duplicate breakdown — who owns them, where they live */}
            <div className="rounded-md border bg-muted/30 p-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold">
                  {t("leads.import.dup_details_title", { defaultValue: "Duplicate details" })}
                </span>
                <span className="text-muted-foreground">
                  {dupBreakdown.existing} already in CRM ({dupBreakdown.matchedLeads} matching lead
                  {dupBreakdown.matchedLeads === 1 ? "" : "s"}) · {dupBreakdown.inFileOnly} repeated only inside this file
                  {dupBreakdown.byMatch.length > 0 && (
                    <> · matched by {dupBreakdown.byMatch.map(([k, n]) => `${k}: ${n}`).join(" · ")}</>
                  )}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {([
                  [t("leads.import.by_agent", { defaultValue: "By agent" }), dupBreakdown.byAgent],
                  [t("leads.import.by_source", { defaultValue: "By source" }), dupBreakdown.bySource],
                  [t("leads.import.by_office", { defaultValue: "By office" }), dupBreakdown.byOffice],
                  [t("leads.import.by_list", { defaultValue: "By list" }), dupBreakdown.byList],
                ] as Array<[string, Array<[string, number]>]>).map(([label, entries]) => (
                  <div key={label} className="rounded-md border bg-background p-2">
                    <p className="text-[11px] font-semibold text-muted-foreground mb-1">{label}</p>
                    {entries.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic">—</p>
                    ) : (
                      <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                        {entries.map(([k, n]) => (
                          <li key={k} className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="truncate">{k}</span>
                            <span className="font-semibold tabular-nums">{n}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="border rounded-md overflow-x-auto">

              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2">{t("common.name", { defaultValue: "Name" })}</th>
                    <th className="text-left p-2">Email / Phone</th>
                    <th className="text-left p-2">
                      {t("leads.import.existing_in_lists", { defaultValue: "Existing in list(s)" })}
                    </th>
                    <th className="text-left p-2 w-40">
                      {t("common.actions", { defaultValue: "Action" })}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {review.items.map((it) => (
                    <tr key={it.key} className="border-t align-top">
                      <td className="p-2">
                        <div className="font-medium">{it.full_name || "—"}</div>
                        {it.inFile && (
                          <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                            {t("leads.import.repeated_in_file", { defaultValue: "Repeated in this upload" })}
                          </div>
                        )}
                      </td>
                      <td className="p-2">
                        <div className="text-muted-foreground">{it.email || "—"}</div>
                        <div className="text-muted-foreground">{it.phone || "—"}</div>
                      </td>
                      <td className="p-2">
                        {it.matches.length === 0 ? (
                          <span className="text-muted-foreground italic">
                            {t("leads.import.only_in_file", { defaultValue: "Only duplicated within this upload" })}
                          </span>
                        ) : (
                          <ul className="space-y-1">
                            {it.matches.map((m) => (
                              <li key={m.lead_id} className="leading-tight">
                                <span className="inline-flex items-center gap-1 flex-wrap">
                                  <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary font-semibold">
                                    {t("leads.import.list_label", { defaultValue: "List" })}: {m.platform ?? "—"}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-muted font-medium">
                                    {m.office_name}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-medium">
                                    {t("leads.import.agent_label", { defaultValue: "agent" })}: {m.agent_name || "Unassigned"}
                                  </span>
                                  <span className="text-muted-foreground">·</span>
                                  <span>
                                    {t("leads.import.source_label", { defaultValue: "source" })}:{" "}
                                    <b>{m.source ?? "—"}</b>
                                  </span>
                                  {m.status && (
                                    <>
                                      <span className="text-muted-foreground">·</span>
                                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                        {m.status}
                                      </span>
                                    </>
                                  )}

                                  <span className="text-muted-foreground">·</span>
                                  <span>{new Date(m.created_at).toLocaleDateString()}</span>
                                  <span className="text-muted-foreground">·</span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {t("leads.import.matched_by", { defaultValue: "matched by" })} {m.matched_by}
                                  </span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="p-2">
                        <Select value={it.action} onValueChange={(v) => setItemAction(it.key, v as DupAction)}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="skip">
                              {t("leads.import.action_skip", { defaultValue: "Skip (keep old)" })}
                            </SelectItem>
                            <SelectItem value="import">
                              {t("leads.import.action_import_anyway", { defaultValue: "Import anyway (keep both)" })}
                            </SelectItem>
                            <SelectItem value="replace">
                              {t("leads.import.action_replace", { defaultValue: "Replace old with new" })}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            {/* Office + Assignee + Tag */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>{t("common.office", { defaultValue: "Office" })}</Label>
                <Select value={officeId} onValueChange={(v) => { setOfficeId(v); setAssigneeId(MANAGER); }}>
                  <SelectTrigger><SelectValue placeholder={t("common.office", { defaultValue: "Office" })} /></SelectTrigger>
                  <SelectContent>
                    {role === "admin" && (
                      <SelectItem value={INBOX}>
                        {t("leads.import.admin_inbox", { defaultValue: "📥 Admin Inbox (distribute later)" })}
                      </SelectItem>
                    )}
                    {offices.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("leads.import.assign_to", { defaultValue: "Assign to" })}</Label>
                <Select value={assigneeId} onValueChange={setAssigneeId} disabled={officeId === NONE || officeId === INBOX}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={MANAGER}>
                      {officeId === INBOX
                        ? t("leads.import.admin_inbox_pending", { defaultValue: "— unassigned (inbox) —" })
                        : role === "superiormanager"
                        ? t("leads.import.assign_to_me", { defaultValue: "Me" })
                        : t("leads.import.office_manager", { defaultValue: "Office manager (unassigned)" })}
                    </SelectItem>
                    {agents.map((a) => (
                      <SelectItem key={a.user_id} value={a.user_id}>
                        {a.full_name || a.email || a.user_id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("leads.import.list_name", { defaultValue: "List name (shows on every lead)" })}</Label>
                <Input value={batchTag} onChange={(e) => setBatchTag(e.target.value)} placeholder="e.g. AU-mail-Nov-26" />
              </div>
            </div>



            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>{t("leads.import.source_override", { defaultValue: "Source (applied to all rows)" })}</Label>
                <Select
                  value={sourceOverride === NONE ? "__auto" : (sourceOptions.includes(sourceOverride) ? sourceOverride : "__custom")}
                  onValueChange={(v) => {
                    if (v === "__auto") setSourceOverride(NONE);
                    else if (v === "__custom") setSourceOverride("");
                    else setSourceOverride(v);
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__auto">Auto (use file's source or default)</SelectItem>
                    {sourceOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    <SelectItem value="__custom">Custom…</SelectItem>
                  </SelectContent>
                </Select>
                {sourceOverride !== NONE && !sourceOptions.includes(sourceOverride) && (
                  <Input
                    className="mt-2"
                    value={sourceOverride}
                    onChange={(e) => setSourceOverride(e.target.value)}
                    placeholder="Type custom source name (e.g. Facebook Ads)"
                    autoFocus
                  />
                )}
                <p className="text-[11px] text-muted-foreground mt-1">
                  Pick an existing source, type a custom one, or leave Auto to keep the file's source column.
                </p>
              </div>
            </div>



            <Tabs value={tab} onValueChange={(v) => {
              setTab(v as "paste" | "csv" | "sheet");
              setHeaders([]); setRows([]); setMapping({});
              setFile(null); setSheetTitle("");
              if (inputRef.current) inputRef.current.value = "";
            }}>
              <TabsList>
                <TabsTrigger value="paste">{t("leads.import.tab_paste", { defaultValue: "Paste text" })}</TabsTrigger>
                <TabsTrigger value="csv">{t("leads.import.tab_csv", { defaultValue: "CSV / Excel file" })}</TabsTrigger>
                <TabsTrigger value="sheet">{t("leads.import.tab_sheet", { defaultValue: "Google Sheet URL" })}</TabsTrigger>
              </TabsList>


              <TabsContent value="paste" className="space-y-3">
                <Textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={PASTE_PLACEHOLDER}
                  rows={10}
                  className="font-mono text-xs"
                />
                <div className="flex items-center gap-2">
                  <Button type="button" variant="secondary" onClick={doParsePaste} disabled={!pasteText.trim()}>
                    {t("leads.import.parse", { defaultValue: "Parse" })}
                  </Button>
                  {parsedLeads.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {parsedLeads.length} {t("leads.import.rows", { defaultValue: "rows" })}
                    </span>
                  )}
                </div>

                {parsedLeads.length > 0 && (
                  <div className="border rounded-md overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-2">Name</th>
                          <th className="text-left p-2">Email</th>
                          <th className="text-left p-2">Phone</th>
                          <th className="text-left p-2">Amount</th>
                          <th className="text-left p-2">Months</th>
                          <th className="w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedLeads.map((p, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-1">
                              <Input className="h-7 text-xs" value={p.full_name ?? ""} onChange={(e) => updateParsedField(i, "full_name", e.target.value)} />
                            </td>
                            <td className="p-1">
                              <Input className="h-7 text-xs" value={p.email ?? ""} onChange={(e) => updateParsedField(i, "email", e.target.value)} />
                            </td>
                            <td className="p-1">
                              <Input className="h-7 text-xs" value={p.phone ?? ""} onChange={(e) => updateParsedField(i, "phone", e.target.value)} />
                            </td>
                            <td className="p-1">
                              <Input className="h-7 text-xs w-24" value={p.amount?.toString() ?? ""} onChange={(e) => updateParsedField(i, "amount", e.target.value)} />
                            </td>
                            <td className="p-1">
                              <Input className="h-7 text-xs w-16" value={p.timeframe ?? ""} onChange={(e) => updateParsedField(i, "timeframe", e.target.value)} />
                            </td>
                            <td className="p-1 text-right">
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeParsedRow(i)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="csv" className="space-y-3">
                <div className="flex justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    {t("leads.import.download_template", { defaultValue: "Download Excel template" })}
                  </Button>
                </div>
                {!file ? (
                  <div
                    className="border-2 border-dashed rounded-md p-10 text-center cursor-pointer hover:bg-muted/40"
                    onClick={() => inputRef.current?.click()}
                  >
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <div className="text-sm">{t("leads.import.choose_file", { defaultValue: "Choose CSV or Excel file" })}</div>
                    <input
                      ref={inputRef} type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" hidden
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                    />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-muted-foreground truncate">
                        {file.name} · {rows.length} {t("leads.import.rows", { defaultValue: "rows" })} · {mappedCount} {t("leads.import.mapped", { defaultValue: "mapped" })}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setFile(null);
                          setHeaders([]);
                          setRows([]);
                          setMapping({});
                          if (inputRef.current) inputRef.current.value = "";
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        {t("leads.import.clear_file", { defaultValue: "Clear file" })}
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("leads.import.column_mapping", { defaultValue: "Column mapping" })}</Label>
                      <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
                        {headers.map((h) => (
                          <div key={h} className="flex items-center gap-3 p-2">
                            <div className="text-sm flex-1 font-mono">{h}</div>
                            <Select
                              value={mapping[h] ?? NONE}
                              onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v as TargetKey | typeof NONE }))}
                            >
                              <SelectTrigger className="w-48 h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>{t("leads.import.skip", { defaultValue: "Skip" })}</SelectItem>
                                {TARGET_FIELDS.map((f) => (
                                  <SelectItem key={f.key} value={f.key}>{f.key}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="sheet" className="space-y-3">
                <div>
                  <Label>{t("leads.import.sheet_url", { defaultValue: "Google Sheet link" })}</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleSheetFetch(); } }}
                      disabled={liveOn}
                    />
                    <Button type="button" onClick={() => void handleSheetFetch()} disabled={!sheetUrl.trim() || sheetLoading || liveOn}>
                      <Link2 className="h-3.5 w-3.5 mr-1.5" />
                      {sheetLoading
                        ? t("common.loading", { defaultValue: "Loading..." })
                        : t("leads.import.sheet_fetch", { defaultValue: "Fetch sheet" })}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {t("leads.import.sheet_hint", {
                      defaultValue: "The sheet must be shared as “Anyone with the link → Viewer”. The first row is used as headers; the tab in the link (gid) is the one imported.",
                    })}
                  </p>
                </div>

                {/* Live auto-sync */}
                <div className="rounded-md border p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {t("leads.import.live_title", { defaultValue: "Live auto-sync" })}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${liveOn ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {liveOn ? t("leads.import.live_on", { defaultValue: "Running" }) : t("leads.import.live_off", { defaultValue: "Off" })}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      <Select value={liveEvery} onValueChange={setLiveEvery} disabled={liveOn}>
                        <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2">every 2s</SelectItem>
                          <SelectItem value="5">every 5s</SelectItem>
                          <SelectItem value="15">every 15s</SelectItem>
                          <SelectItem value="60">every 60s</SelectItem>
                        </SelectContent>
                      </Select>
                      {liveSyncId && (
                        <Button
                          type="button" variant="outline" size="sm"
                          onClick={() => void liveTick(liveSyncId)}
                        >
                          {t("leads.import.live_now", { defaultValue: "Sync now" })}
                        </Button>
                      )}
                      {liveOn ? (
                        <Button type="button" variant="destructive" size="sm" onClick={() => void stopLive()}>
                          {t("leads.import.live_stop", { defaultValue: "Stop" })}
                        </Button>
                      ) : (
                        <Button type="button" size="sm" onClick={() => void startLive()} disabled={rows.length === 0 || liveSaving}>
                          {t("leads.import.live_start", { defaultValue: "Start live sync" })}
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {t("leads.import.live_hint", {
                      defaultValue: "Saved on the server: new rows are imported and edited cells update the matching lead. Runs on the interval below while this dialog is open, and every minute in the background even when the app is closed. Uses the office, assignee, list name, source and mapping selected above.",
                    })}
                  </p>
                  {(liveStats.checks > 0 || liveOn) && (
                    <div className="text-[11px] text-muted-foreground">
                      {t("leads.import.live_stats", {
                        defaultValue: "{{checks}} checks · {{added}} imported · {{updated}} updated · {{dupes}} duplicates skipped",
                        checks: liveStats.checks, added: liveStats.added, updated: liveStats.updated, dupes: liveStats.duplicates,
                      })}
                      {liveStats.lastAt ? ` · ${liveStats.lastAt}` : ""}
                      {liveStats.error ? <span className="text-destructive"> · {liveStats.error}</span> : null}
                    </div>
                  )}
                </div>



                {rows.length > 0 && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-muted-foreground truncate">
                        {sheetTitle || "Google Sheet"} · {rows.length} {t("leads.import.rows", { defaultValue: "rows" })} · {mappedCount} {t("leads.import.mapped", { defaultValue: "mapped" })}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => { setHeaders([]); setRows([]); setMapping({}); setSheetTitle(""); }}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        {t("leads.import.clear_file", { defaultValue: "Clear" })}
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("leads.import.column_mapping", { defaultValue: "Column mapping" })}</Label>
                      <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
                        {headers.map((h) => (
                          <div key={h} className="flex items-center gap-3 p-2">
                            <div className="text-sm flex-1 font-mono">{h}</div>
                            <Select
                              value={mapping[h] ?? NONE}
                              onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v as TargetKey | typeof NONE }))}
                            >
                              <SelectTrigger className="w-48 h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>{t("leads.import.skip", { defaultValue: "Skip" })}</SelectItem>
                                {TARGET_FIELDS.map((f) => (
                                  <SelectItem key={f.key} value={f.key}>{f.key}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>

          </div>
        )}

        <DialogFooter>
          {review ? (
            <>
              <Button variant="ghost" onClick={() => { pendingLiveStart.current = false; setReview(null); }} disabled={importing}>
                {t("common.back", { defaultValue: "Back" })}
              </Button>
              <Button
                onClick={confirmReview}
                disabled={importing || (review.keptClean.length + importCount + replaceCount === 0)}
              >
                {importing
                  ? t("common.loading", { defaultValue: "Loading..." })
                  : t("leads.import.confirm_import", {
                      defaultValue: "Import {{n}} new lead(s) · Skip {{skip}} duplicate(s)",
                      n: review.keptClean.length + importCount + replaceCount,
                      skip: skipCount,
                    })}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel", { defaultValue: "Cancel" })}</Button>
              <Button onClick={doPrepare} disabled={!canImport}>
                {importing ? t("common.loading", { defaultValue: "Loading..." }) : t("leads.import.import", { defaultValue: "Import" })}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
