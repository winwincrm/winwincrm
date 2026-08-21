import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { format, formatDistanceToNow } from "date-fns";
import {
  Calendar as CalendarIcon, Check, MessageSquare,
  Phone as PhoneIcon, RefreshCw, Send, X,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { reassignLeadWithCommentOption } from "@/lib/lead-reassignment.functions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { OriginAgentBadge } from "@/components/OriginAgentBadge";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/lead-constants";
import { CONTACT_RELEVANT_STATUSES } from "@/lib/lead-status";
import { cn } from "@/lib/utils";
import { formatActivity, type ActivityRow } from "@/lib/lead-activity-format";
import { buildCallHref, useSoftphone } from "@/lib/softphone";
import { useReassignPrefs } from "@/lib/reassign-prefs";
import { amountDisplayValue, parseAmountNumber } from "@/lib/amount-value";


interface AgentLite { user_id: string; full_name: string | null; office_id: string | null }

interface Lead {
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
  amount: number | null;
  percentage: number | null;
  timeframe: string | null;
  payload: Record<string, unknown> | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
  origin_agent_id: string | null;
  origin_agent_name: string | null;
  description_1: string | null;
  description_2: string | null;
  description_3: string | null;
  description_4: string | null;
}

interface Note {
  id: string;
  comment: string;
  user_id: string | null;
  created_at: string;
}

interface Activity {
  id: string;
  activity_type: string;
  field_name: string | null;
  old_value: unknown;
  new_value: unknown;
  user_id: string | null;
  created_at: string;
}

export function LeadDetailInline({
  leadId, agents, onClose, onLocalUpdate,
}: {
  leadId: string;
  agents: AgentLite[];
  onClose: () => void;
  onLocalUpdate?: (patch: Partial<Lead>) => void;
}) {
  const { t } = useTranslation();
  const { role, profile, user } = useAuth();
  const reassignLead = useServerFn(reassignLeadWithCommentOption);
  const [softphone] = useSoftphone();
  
  const [lead, setLead] = useState<Lead | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [actorNames, setActorNames] = useState<Record<string, string>>({});
  const [offices, setOffices] = useState<Record<string, string>>({});
  
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [posting, setPosting] = useState(false);
  const [reassignPrefs] = useReassignPrefs();


  // Field-level perms — only admin can edit phone
  const canEditPhone = role === "admin";
  const canEdit = role === "admin"
    || (role === "manager" && lead?.office_id === profile?.office_id)
    || (role === "superiormanager" && lead?.office_id === profile?.office_id)
    || (role === "agent" && (lead?.assigned_user_id === user?.id || (!!lead?.office_id && lead?.office_id === profile?.office_id)));
  const canAlexReassign = role === "agent" && profile?.user_id === "9e0a659f-d2dd-4901-ac88-079d6de6461c";

  const reload = async () => {
    setLoading(true);
    const [{ data: l }, { data: n }, { data: a }] = await Promise.all([
      supabase.from("leads").select("*").eq("id", leadId).maybeSingle(),
      supabase.from("lead_comments").select("id, comment, user_id, created_at").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(50),
      supabase.from("lead_activity").select("id, activity_type, field_name, old_value, new_value, user_id, created_at").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(50),
    ]);
    setLead((l as unknown as Lead | null) ?? null);
    setNotes((n ?? []) as Note[]);
    setActivity((a ?? []) as Activity[]);
    const rows = (a ?? []) as Activity[];
    const userIds = new Set<string>();
    const officeIds = new Set<string>();
    rows.forEach((r) => {
      if (r.user_id) userIds.add(r.user_id);
      if (r.activity_type === "assigned") {
        if (typeof r.old_value === "string") userIds.add(r.old_value);
        if (typeof r.new_value === "string") userIds.add(r.new_value);
      }
      if (r.activity_type === "office_changed") {
        if (typeof r.old_value === "string") officeIds.add(r.old_value);
        if (typeof r.new_value === "string") officeIds.add(r.new_value);
      }
    });
    agents.forEach((ag) => { if (ag.user_id) userIds.add(ag.user_id); });
    const [pRes, oRes] = await Promise.all([
      userIds.size ? supabase.from("profiles").select("user_id, full_name").in("user_id", Array.from(userIds)) : Promise.resolve({ data: [] as { user_id: string; full_name: string | null }[] }),
      officeIds.size ? supabase.from("offices").select("id, name").in("id", Array.from(officeIds)) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const uMap: Record<string, string> = {};
    (pRes.data ?? []).forEach((p) => { uMap[p.user_id] = p.full_name ?? "—"; });
    setActorNames(uMap);
    const oMap: Record<string, string> = {};
    (oRes.data ?? []).forEach((o) => { oMap[o.id] = o.name; });
    setOffices(oMap);
    setLoading(false);
  };

  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [leadId]);


  const agentName = useMemo(
    () => lead?.assigned_user_id ? (agents.find((a) => a.user_id === lead.assigned_user_id)?.full_name ?? "—") : t("common.unassigned"),
    [agents, lead?.assigned_user_id, t],
  );
  const assignableAgents = useMemo(() => {
    if (!lead) return [];
    if (role === "admin" && !lead.office_id) return agents;
    return agents.filter((agent) => agent.office_id === lead.office_id);
  }, [agents, lead, role]);

  const update = async (patch: Partial<Lead>) => {
    if (!lead) return;
    const { error } = await supabase.from("leads").update(patch as never).eq("id", lead.id);
    if (error) { toast.error(error.message); return; }
    setLead({ ...lead, ...patch });
    onLocalUpdate?.(patch);
  };

  const updateStatus = async (status: LeadStatus) => {
    if (!lead) return;
    const patch: Partial<Lead> = { status };
    if (CONTACT_RELEVANT_STATUSES.includes(status) && !lead.last_contacted_at) {
      patch.last_contacted_at = new Date().toISOString();
    }
    await update(patch);
  };

  const performReassign = async (assignedUserId: string | null, keepComments: boolean, keepDescriptions: boolean) => {
    if (!lead) return false;
    try {
      await reassignLead({ data: { leadId: lead.id, assignedUserId, keepComments, keepDescriptions } });
      const patch: Partial<Lead> = { assigned_user_id: assignedUserId };
      if (!keepDescriptions) {
        patch.description_1 = null;
        patch.description_2 = null;
        patch.description_3 = null;
        patch.description_4 = null;
      }
      setLead({ ...lead, ...patch });
      onLocalUpdate?.(patch);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.error", { defaultValue: "Something went wrong" }));
      return false;
    }
  };

  const updateAgent = async (assignedUserId: string | null) => {
    if (!lead) return;
    if (assignedUserId === lead.assigned_user_id) return;
    const shouldClearNotes = notes.length > 0 && !!lead.assigned_user_id && !reassignPrefs.keepComments;
    const shouldClearDescriptions = lead.assigned_user_id != null && !reassignPrefs.keepDescriptions;

    const success = await performReassign(assignedUserId, !shouldClearNotes, !shouldClearDescriptions);
    if (!success) return;
    if (shouldClearNotes) {
      setNotes([]);
    }
    toast.success(t("leads.reassigned", { defaultValue: "Reassigned" }));
  };

  const markContacted = () => update({ last_contacted_at: new Date().toISOString() });

  const addNote = async () => {
    if (!newNote.trim() || !user) return;
    setPosting(true);
    const { error } = await supabase.from("lead_comments").insert({
      lead_id: leadId, user_id: user.id, comment: newNote.trim(),
    });
    setPosting(false);
    if (error) { toast.error(error.message); return; }
    setNewNote("");
    void reload();
  };

  if (loading || !lead) {
    return <div className="p-6 text-sm text-muted-foreground">{t("common.loading")}</div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold">{lead.full_name}</h2>
            <StatusBadge status={lead.status} />
            <OriginAgentBadge name={lead.origin_agent_name} />
          </div>
          <div className="text-xs text-muted-foreground">
            {t("common.created")}: {format(new Date(lead.created_at), "PPp")}
          </div>
        </div>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={markContacted} disabled={!canEdit}>
          <Check className="h-3.5 w-3.5 mr-1" />
          {t("leads.mark_contacted", { defaultValue: "Mark contacted" })}
        </Button>
        <DatePopover
          label={t("leads.set_appointment", { defaultValue: "Set appointment" })}
          icon={<CalendarIcon className="h-3.5 w-3.5 mr-1" />}
          disabled={!canEdit}
          onPick={(d) => update({ status: "appointment", payload: { ...(lead.payload ?? {}), appointment_at: d.toISOString() } })}
        />
        {lead.status === "callback" && (
          <DatePopover
            label={t("leads.set_callback", { defaultValue: "Set callback date" })}
            icon={<RefreshCw className="h-3.5 w-3.5 mr-1" />}
            disabled={!canEdit}
            onPick={(d) => update({ payload: { ...(lead.payload ?? {}), callback_at: d.toISOString() } })}
          />
        )}
        {lead.phone && (
          <a href={buildCallHref(lead.phone, softphone)}>
            <Button size="sm" variant="outline">
              <PhoneIcon className="h-3.5 w-3.5 mr-1" /> {t("common.call", { defaultValue: "Call" })}
            </Button>
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: editable fields */}
        <div className="lg:col-span-2 grid grid-cols-2 gap-3">
          <InlineField label={t("common.first_name", { defaultValue: "First name" })} value={lead.first_name} disabled={!canEdit}
            onSave={(v) => update({ first_name: v, full_name: `${v ?? ""} ${lead.last_name ?? ""}`.trim() || lead.full_name })} />
          <InlineField label={t("common.last_name", { defaultValue: "Last name" })} value={lead.last_name} disabled={!canEdit}
            onSave={(v) => update({ last_name: v, full_name: `${lead.first_name ?? ""} ${v ?? ""}`.trim() || lead.full_name })} />
          <InlineField label={t("common.email")} value={lead.email} disabled={!canEdit}
            onSave={(v) => update({ email: v })} />
          <InlineField
            label={t("common.phone")}
            value={lead.phone}
            mono
            disabled={!canEditPhone}
            hint={!canEditPhone ? t("leads.phone_admin_only", { defaultValue: "Only admin can edit phone" }) : undefined}
            onSave={(v) => update({ phone: v })}
          />
          <InlineField
            label={t("common.amount")}
            value={String(amountDisplayValue(lead.amount, lead.payload) ?? "")}
            disabled={!canEdit}
            onSave={(v) => {
              const raw = (v ?? "").trim();
              const payload = { ...(lead.payload ?? {}) };
              if (raw) payload.amount_raw = v;
              else delete payload.amount_raw;
              return update({ amount: raw ? (parseAmountNumber(raw) ?? null) : null, payload });
            }}
          />
          <InlineField label={t("common.percentage")} value={lead.percentage == null ? "" : String(lead.percentage)} disabled={!canEdit}
            onSave={(v) => update({ percentage: v ? Number(v) : null })} />
          <InlineField label={t("common.duration")} value={lead.timeframe} disabled={!canEdit}
            onSave={(v) => update({ timeframe: v })} />
          <InlineField label={t("common.platform", { defaultValue: "Platform" })} value={lead.platform} disabled={!canEdit}
            onSave={(v) => update({ platform: v })} />
          <InlineField label={t("leads.description_1", { defaultValue: "Description 1" })} value={lead.description_1} disabled={!canEdit}
            onSave={(v) => update({ description_1: v })} />
          <InlineField label={t("leads.description_2", { defaultValue: "Description 2" })} value={lead.description_2} disabled={!canEdit}
            onSave={(v) => update({ description_2: v })} />
          <InlineField label={t("leads.description_3", { defaultValue: "Description 3" })} value={lead.description_3} disabled={!canEdit}
            onSave={(v) => update({ description_3: v })} />
          <InlineField label={t("leads.description_4", { defaultValue: "Description 4" })} value={lead.description_4} disabled={!canEdit}
            onSave={(v) => update({ description_4: v })} />
        </div>

        {/* Right: status + agent */}
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">{t("common.status")}</label>
            <Select value={lead.status} onValueChange={(v) => updateStatus(v as LeadStatus)} disabled={!canEdit}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {(role !== "agent" || canAlexReassign) && (
            <div>
              <label className="text-xs text-muted-foreground">{t("common.agent")}</label>
              <Select
                value={lead.assigned_user_id ?? "__none"}
                onValueChange={(v) => updateAgent(v === "__none" ? null : v)}
                disabled={!canEdit || (!lead.office_id && role !== "admin")}
              >
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue placeholder={lead.office_id || role === "admin" ? agentName : t("leads.assign_office_first")} />
                </SelectTrigger>
                <SelectContent>
                  {!canAlexReassign && <SelectItem value="__none">{t("common.unassigned")}</SelectItem>}
                  {assignableAgents.map((a) => (
                    <SelectItem key={a.user_id} value={a.user_id}>
                      {a.full_name ?? "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t("leads.transfer_prefs.hint", {
                  defaultValue: "Comments/descriptions follow the global Transfer settings in the leads toolbar.",
                })}
              </p>

            </div>
          )}
          <div className="text-xs text-muted-foreground">
            <div>{t("leads.last_contacted")}: {lead.last_contacted_at ? formatDistanceToNow(new Date(lead.last_contacted_at), { addSuffix: true }) : "—"}</div>
          </div>
        </div>
      </div>

      {/* Notes timeline */}
      <div className="space-y-2 border-t pt-4">
        <div className="text-sm font-medium">{t("leads.comments")}</div>
        <div className="flex gap-2">
          <Textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder={t("leads.add_comment")}
            className="min-h-[70px] text-sm"
          />
          <Button size="sm" onClick={addNote} disabled={!newNote.trim() || posting}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <ul className="space-y-2 max-h-72 overflow-y-auto">
          {notes.length === 0 && (role === "agent" || activity.length === 0) && (
            <li className="text-xs text-muted-foreground">{t("common.no_data")}</li>
          )}

          {notes.map((n) => (
            <li key={n.id} className="flex gap-2 text-sm">
              <MessageSquare className="h-3.5 w-3.5 mt-1 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <div className="whitespace-pre-wrap">{n.comment}</div>
                <div className="text-[10px] text-muted-foreground">
                  {format(new Date(n.created_at), "MMM d, yyyy HH:mm")}
                </div>
              </div>
            </li>
          ))}
          {role !== "agent" && activity.map((a) => {
            const f = formatActivity(a as ActivityRow, {
              userName: (id) => (id ? (actorNames[id] ?? "—") : t("common.unassigned")),
              officeName: (id) => (id ? (offices[id] ?? "—") : "—"),
            });
            return (
              <li key={a.id} className="flex gap-2 text-xs text-muted-foreground">
                <RefreshCw className="h-3 w-3 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <span className="font-medium text-foreground/80">{f.who}</span>
                  <span> {f.action}</span>
                  {f.detail && <span> · {f.detail}</span>}
                  <span className="ml-1">· {format(new Date(a.created_at), "MMM d, yyyy HH:mm")}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

    </div>
  );
}

function InlineField({
  label, value, mono, disabled, hint, onSave,
}: {
  label: string;
  value: string | number | null | undefined;
  mono?: boolean;
  disabled?: boolean;
  hint?: string;
  onSave: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState<string>(value == null ? "" : String(value));
  useEffect(() => { setVal(value == null ? "" : String(value)); }, [value]);

  const commit = () => {
    setEditing(false);
    const next = val.trim();
    const original = value == null ? "" : String(value);
    if (next !== original) onSave(next || null);
  };

  return (
    <div>
      <label className="text-xs text-muted-foreground flex items-center gap-1">
        {label}
        {hint && <span className="text-[10px] italic">· {hint}</span>}
      </label>
      {editing && !disabled ? (
        <Input
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") { setVal(value == null ? "" : String(value)); setEditing(false); }
          }}
          className={cn("h-8 mt-0.5", mono && "font-mono text-xs")}
        />
      ) : (
        <div
          onClick={() => !disabled && setEditing(true)}
          className={cn(
            "h-8 mt-0.5 px-2 py-1 rounded text-sm flex items-center",
            !disabled && "cursor-text hover:bg-muted/50",
            disabled && "text-muted-foreground",
            mono && "font-mono text-xs",
          )}
        >
          {value == null || value === "" ? <span className="text-muted-foreground">—</span> : value}
        </div>
      )}
    </div>
  );
}

function DatePopover({
  label, icon, disabled, onPick,
}: { label: string; icon?: React.ReactNode; disabled?: boolean; onPick: (d: Date) => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState<string>("09:00");

  const confirm = () => {
    if (!date) return;
    const [hh, mm] = time.split(":").map((n) => parseInt(n, 10));
    const d = new Date(date);
    d.setHours(Number.isFinite(hh) ? hh : 9, Number.isFinite(mm) ? mm : 0, 0, 0);
    onPick(d);
    setOpen(false);
    setDate(undefined);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setDate(undefined); }}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>{icon}{label}</Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
        <div className="border-t p-3 space-y-2">
          <label className="text-xs text-muted-foreground block">Time</label>
          <Input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="h-8"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setDate(undefined); }}>Cancel</Button>
            <Button size="sm" onClick={confirm} disabled={!date}>Confirm</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
