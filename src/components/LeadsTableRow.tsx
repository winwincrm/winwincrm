import { memo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Eye, Phone, Pencil, Trash2, Copy } from "lucide-react";

import { TableCell, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { OriginAgentBadge } from "@/components/OriginAgentBadge";
import { LeadDetailInline } from "@/components/LeadDetailInline";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/lead-constants";
import { effectiveKind, KIND_BADGE_CLASS, KIND_SHORT } from "@/lib/lead-kind";
import { buildCallHref, type Softphone } from "@/lib/softphone";
import { cn } from "@/lib/utils";
import { amountDisplayValue } from "@/lib/amount-value";

export interface LeadRowData {
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

export interface AgentLiteRow { user_id: string; full_name: string | null; office_id: string | null }

type Role = "admin" | "manager" | "superiormanager" | "agent";

export interface LeadsTableRowProps {
  lead: LeadRowData;
  role: Role | null;
  t: (key: string, opts?: Record<string, unknown>) => string;
  selectMode: boolean;
  isSelected: boolean;
  isExpanded: boolean;
  showAgentColumn: boolean;
  canAlexReassign: boolean;
  canDelete: boolean;
  cols: Record<string, boolean>;
  eligibleAgents: AgentLiteRow[];
  officeMap: Map<string, string>;
  softphone: Softphone;
  latestComment: string | undefined;
  /** True when this lead is linked to a Google Sheet sync. */
  fromSheet?: boolean;
  fmtAmount: (v: unknown) => string;
  onToggleSelect: (id: string) => void;
  onOpenRow: (id: string) => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
  onAgentChange: (id: string, agent: string | null) => void;
  onDelete: (id: string) => void;
  onCloseDetail: () => void;
  onLocalUpdate: (id: string, patch: Record<string, unknown>) => void;
}

function LeadsTableRowImpl(p: LeadsTableRowProps) {
  const l = p.lead;
  const show = (k: string) => p.cols[k] !== false;
  const [statusOpen, setStatusOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const lastTs = l.last_contacted_at ?? l.updated_at;
  const kind = effectiveKind(l, (p.role ?? "agent") as Role);

  return (
    <>
      <TableRow
        data-lead-id={l.id}
        className={cn(
          "h-10 hover:bg-muted/40 group cursor-pointer",
          p.isExpanded && "bg-primary/10 ring-2 ring-primary/60",
        )}
        onClick={() => p.onOpenRow(l.id)}
      >
        {p.selectMode && (
          <TableCell className="py-1" onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={p.isSelected} onCheckedChange={() => p.onToggleSelect(l.id)} />
          </TableCell>
        )}
        {show("full_name") && (
          <TableCell className="py-1 font-medium">
            <span className="inline-flex items-center gap-2 flex-wrap">
              {l.full_name}
              {/* "Live" only for Google Sheet leads; Cold / In House always show. */}
              {(kind !== "live" || p.fromSheet) && (
                <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${KIND_BADGE_CLASS[kind]}`}>
                  {KIND_SHORT[kind]}
                </span>
              )}
              <OriginAgentBadge name={l.origin_agent_name} />
            </span>

          </TableCell>
        )}
        {show("email") && (
          <TableCell className="py-1 text-sm text-muted-foreground">
            {l.email ? (
              <span className="inline-flex items-center gap-1">
                {l.email}
                <button
                  onClick={(e) => { e.stopPropagation(); void navigator.clipboard.writeText(l.email!); toast.success("Copied"); }}
                  className="opacity-0 group-hover:opacity-100 hover:text-foreground"
                  aria-label="Copy email"
                ><Copy className="h-3 w-3" /></button>
              </span>
            ) : "—"}
          </TableCell>
        )}
        {show("phone") && (
          <TableCell className="py-1 font-mono text-xs">
            {l.phone ? (
              <span className="inline-flex items-center gap-1">
                <a
                  href={buildCallHref(l.phone, p.softphone)}
                  onClick={(e) => e.stopPropagation()}
                  className="text-foreground hover:underline"
                >{l.phone}</a>
                <a
                  href={buildCallHref(l.phone, p.softphone)}
                  onClick={(e) => e.stopPropagation()}
                  title={p.t("common.call", { defaultValue: "Call" })}
                  aria-label={p.t("common.call", { defaultValue: "Call" })}
                  className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-primary text-primary-foreground hover:opacity-90"
                ><Phone className="h-3 w-3" /></a>
                <button
                  onClick={(e) => { e.stopPropagation(); void navigator.clipboard.writeText(l.phone!); toast.success("Copied"); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                  aria-label="Copy phone"
                ><Copy className="h-3 w-3" /></button>
              </span>
            ) : "—"}
          </TableCell>
        )}
        {show("amount") && (
          <TableCell className="py-1 text-sm text-right tabular-nums">
            {p.fmtAmount(amountDisplayValue(l.amount, l.payload))}
          </TableCell>
        )}
        {show("platform") && <TableCell className="py-1 text-sm">{l.platform ?? "—"}</TableCell>}
        {show("source") && <TableCell className="py-1 text-sm">{l.source ?? "—"}</TableCell>}
        {show("country") && (
          <TableCell className="py-1 text-sm">
            {((l.payload as Record<string, unknown> | null)?.country as string | undefined) ?? "—"}
          </TableCell>
        )}
        {show("comment") && (
          <TableCell className="py-1 text-sm text-muted-foreground max-w-[280px]">
            {p.latestComment
              ? <span className="line-clamp-1" title={p.latestComment}>{p.latestComment}</span>
              : <span className="text-muted-foreground/60">—</span>}
          </TableCell>
        )}
        {([l.description_1, l.description_2, l.description_3, l.description_4] as (string | null)[]).map((d, i) => {
          const key = `description_${i + 1}`;
          if (!show(key)) return null;
          return (
            <TableCell key={`d${i}`} className="py-1 text-sm text-muted-foreground max-w-[200px]">
              {d && d.trim()
                ? (
                  <span
                    className="inline-flex items-center rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                    title={d}
                  >
                    {p.t("leads.desc_info", { defaultValue: "Info" })}
                  </span>
                )
                : <span className="text-muted-foreground/60">—</span>}
            </TableCell>
          );
        })}
        {show("status") && (
          <TableCell className="py-1" onClick={(e) => e.stopPropagation()}>
            <Select
              value={l.status}
              open={statusOpen}
              onOpenChange={setStatusOpen}
              onValueChange={(v) => p.onStatusChange(l.id, v as LeadStatus)}
            >
              <SelectTrigger className="h-7 w-[150px] border-0 bg-transparent p-0 hover:bg-muted/50">
                <StatusBadge status={l.status} />
              </SelectTrigger>
              {statusOpen && (
                <SelectContent>
                  {LEAD_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{p.t(`status.${s}`)}</SelectItem>
                  ))}
                </SelectContent>
              )}
            </Select>
          </TableCell>
        )}
        {p.showAgentColumn && show("agent") && (
          <TableCell className="py-1" onClick={(e) => e.stopPropagation()}>
            <Select
              value={l.assigned_user_id ?? "__none"}
              open={agentOpen}
              onOpenChange={setAgentOpen}
              onValueChange={(v) => p.onAgentChange(l.id, v === "__none" ? null : v)}
              disabled={!l.office_id && p.role !== "admin"}
            >
              <SelectTrigger className="h-7 w-[140px] text-xs">
                {/* Render label manually: SelectContent is lazily mounted, so SelectValue would be blank when closed. */}
                <span className={cn("truncate", !l.assigned_user_id && "text-muted-foreground")}>
                  {l.assigned_user_id
                    ? (p.eligibleAgents.find((a) => a.user_id === l.assigned_user_id)?.full_name
                        ?? l.origin_agent_name
                        ?? p.t("common.unassigned"))
                    : p.t("common.unassigned")}
                </span>
              </SelectTrigger>
              {agentOpen && (
                <SelectContent>
                  <SelectItem value="__none">{p.t("common.unassigned")}</SelectItem>
                  {p.eligibleAgents
                    .filter((a) => p.canAlexReassign || (p.role === "admin" && !l.office_id) || a.office_id === l.office_id)
                    .map((a) => (
                      <SelectItem key={a.user_id} value={a.user_id}>
                        {a.full_name ?? "—"}
                        {p.role === "admin" && !l.office_id && a.office_id ? ` · ${p.officeMap.get(a.office_id) ?? ""}` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              )}
            </Select>
          </TableCell>
        )}
        {show("imported") && (() => {
          const ts = p.role === "agent" ? (l.assigned_at ?? l.created_at) : l.created_at;
          return (
            <TableCell className="py-1 text-xs text-muted-foreground whitespace-nowrap" title={format(new Date(ts), "PPpp")}>
              {formatDistanceToNow(new Date(ts), { addSuffix: true })}
            </TableCell>
          );
        })()}
        {show("activity") && (
          <TableCell className="py-1 text-xs text-muted-foreground whitespace-nowrap" title={formatDistanceToNow(new Date(lastTs), { addSuffix: true })}>
            {format(new Date(lastTs), "MMM d, yyyy HH:mm")}
          </TableCell>
        )}
        <TableCell className="py-1 text-right" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100">
            <Button size="icon" variant="ghost" className="h-7 w-7" title="Open in new tab"
              onClick={() => window.open(`/leads/${l.id}`, "_blank", "noopener,noreferrer")}>
              <Eye className="h-3.5 w-3.5" />
            </Button>
            {l.phone && (
              <a href={buildCallHref(l.phone, p.softphone)}>
                <Button size="icon" variant="ghost" className="h-7 w-7"><Phone className="h-3.5 w-3.5" /></Button>
              </a>
            )}
            <Link to="/leads/$id" params={{ id: l.id }}>
              <Button size="icon" variant="ghost" className="h-7 w-7"><Pencil className="h-3.5 w-3.5" /></Button>
            </Link>
            {p.canDelete && (
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => p.onDelete(l.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
      {p.isExpanded && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={99} className="p-0">
            <LeadDetailInline
              leadId={l.id}
              agents={p.role === "admin" && !l.office_id
                ? p.eligibleAgents
                : p.eligibleAgents.filter((a) => a.office_id === l.office_id)}
              onClose={p.onCloseDetail}
              onLocalUpdate={(patch) => p.onLocalUpdate(l.id, patch as Record<string, unknown>)}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export const LeadsTableRow = memo(LeadsTableRowImpl);
