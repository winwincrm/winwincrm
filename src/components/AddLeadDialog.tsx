import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

const INBOX = "__inbox__";
const NONE = "__none__";
const UNASSIGNED = "__unassigned__";

export interface AddLeadOffice { id: string; name?: string | null; company_name?: string | null }
export interface AddLeadAgent { user_id: string; full_name: string | null; office_id: string | null }

export interface AddLeadDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  role: "admin" | "manager" | "superiormanager" | "agent" | null;
  offices: AddLeadOffice[];
  agents: AddLeadAgent[];
  defaultOfficeId: string | null;
  currentUserId: string | null;
  onComplete?: () => void;
}

export function AddLeadDialog({
  open, onOpenChange, role, offices, agents, defaultOfficeId, currentUserId, onComplete,
}: AddLeadDialogProps) {
  const { t } = useTranslation();

  const [officeId, setOfficeId] = useState<string>(defaultOfficeId ?? NONE);
  const [assigneeId, setAssigneeId] = useState<string>(UNASSIGNED);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [platform, setPlatform] = useState("");
  const [source, setSource] = useState<string>("manual");
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [desc1, setDesc1] = useState("");
  const [desc2, setDesc2] = useState("");
  const [desc3, setDesc3] = useState("");
  const [desc4, setDesc4] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // reset when opened
    setOfficeId(role === "admin" ? (defaultOfficeId ?? INBOX) : (defaultOfficeId ?? NONE));
    setAssigneeId(role === "agent" && currentUserId ? currentUserId : UNASSIGNED);
    setFirstName(""); setLastName(""); setEmail(""); setPhone("");
    setPlatform(""); setSource("manual"); setAmount(""); setTimeframe("");
    setDesc1(""); setDesc2(""); setDesc3(""); setDesc4(""); setNote("");
    void (async () => {
      const { data } = await supabase
        .from("lead_sources" as never)
        .select("name")
        .order("name", { ascending: true });
      const names = ((data ?? []) as unknown as { name: string }[]).map((r) => r.name);
      setSourceOptions(names);
    })();
  }, [open, role, defaultOfficeId, currentUserId]);

  const officeAgents = agents.filter((a) => a.office_id === officeId);

  const submit = async () => {
    const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ").trim();
    if (!fullName && !email.trim() && !phone.trim()) {
      toast.error(t("leads.add.need_identifier", { defaultValue: "Enter at least a name, email, or phone" }));
      return;
    }
    if (role !== "admin" && officeId === NONE) {
      toast.error(t("leads.import.choose_office", { defaultValue: "Please choose an office" }));
      return;
    }

    setSaving(true);
    try {
      const targetOfficeId = officeId === INBOX ? null : (officeId === NONE ? null : officeId);
      const emailTrim = email.trim().toLowerCase() || null;
      const phoneTrim = phone.trim() || null;

      // Same-office dedup check (email or phone)
      if (targetOfficeId && (emailTrim || phoneTrim)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let dupQ: any = supabase.from("leads").select("id, full_name").eq("office_id", targetOfficeId).is("deleted_at", null).limit(1);
        if (emailTrim && phoneTrim) dupQ = dupQ.or(`email.eq.${emailTrim},phone.eq.${phoneTrim}`);
        else if (emailTrim) dupQ = dupQ.eq("email", emailTrim);
        else dupQ = dupQ.eq("phone", phoneTrim);
        const { data: dup } = await dupQ.maybeSingle();
        if (dup?.id) {
          toast.error(t("leads.add.duplicate", { defaultValue: "A lead with this email or phone already exists in this office" }));
          setSaving(false);
          return;
        }
      }

      const amt = amount.trim() ? Number(amount.replace(/[^\d.-]/g, "")) : null;

      const insert: Record<string, unknown> = {
        office_id: targetOfficeId,
        assigned_user_id: assigneeId === UNASSIGNED ? null : assigneeId,
        full_name: fullName || emailTrim || phoneTrim || "Manual lead",
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        email: emailTrim,
        phone: phoneTrim,
        platform: platform.trim() || null,
        source: source || "manual",
        amount: amt != null && Number.isFinite(amt) ? amt : null,
        timeframe: timeframe.trim() || null,
        description_1: desc1.trim() || null,
        description_2: desc2.trim() || null,
        description_3: desc3.trim() || null,
        description_4: desc4.trim() || null,
        status: "new",
        payload: { entry: "manual" },
      };

      const { data, error } = await supabase.from("leads").insert(insert as never).select("id").single();
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }

      const leadId = (data as { id: string } | null)?.id;
      if (leadId && note.trim()) {
        await supabase.from("lead_comments").insert({ lead_id: leadId, comment: note.trim() } as never);
      }

      toast.success(t("leads.add.created", { defaultValue: "Lead created" }));
      onComplete?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("leads.add.title", { defaultValue: "Add lead manually" })}</DialogTitle>
          <DialogDescription>
            {t("leads.add.desc", { defaultValue: "Create a single lead. Duplicates within the same office are blocked." })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Office + assignee */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("common.office")}</Label>
              <Select value={officeId} onValueChange={(v) => { setOfficeId(v); setAssigneeId(UNASSIGNED); }} disabled={role !== "admin" && !!defaultOfficeId}>
                <SelectTrigger><SelectValue placeholder={t("leads.import.choose_office", { defaultValue: "Choose office" })} /></SelectTrigger>
                <SelectContent>
                  {role === "admin" && (
                    <SelectItem value={INBOX}>{t("leads.import.admin_inbox", { defaultValue: "Admin Inbox" })}</SelectItem>
                  )}
                  {offices.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.company_name ?? o.name ?? o.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t("common.agent")}</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId} disabled={officeId === INBOX || officeId === NONE}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>{t("common.unassigned")}</SelectItem>
                  {officeAgents.map((a) => (
                    <SelectItem key={a.user_id} value={a.user_id}>{a.full_name ?? a.user_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Names */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("common.full_name")} ({t("common.name", { defaultValue: "First" })})</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" />
            </div>
            <div>
              <Label className="text-xs">{t("common.name", { defaultValue: "Last" })}</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" />
            </div>
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("common.email")}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@example.com" />
            </div>
            <div>
              <Label className="text-xs">{t("common.phone")}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+49 …" />
            </div>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("common.source", { defaultValue: "Source" })}</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  {sourceOptions.filter((s) => s !== "manual").map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t("common.campaign", { defaultValue: "Platform" })}</Label>
              <Input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="Facebook, Google, …" />
            </div>
            <div>
              <Label className="text-xs">{t("common.amount")}</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10000" />
            </div>
            <div>
              <Label className="text-xs">{t("common.duration")}</Label>
              <Input value={timeframe} onChange={(e) => setTimeframe(e.target.value)} placeholder="12 months" />
            </div>
          </div>


          {/* Descriptions */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Description 1</Label>
              <Input value={desc1} onChange={(e) => setDesc1(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Description 2</Label>
              <Input value={desc2} onChange={(e) => setDesc2(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Description 3</Label>
              <Input value={desc3} onChange={(e) => setDesc3(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Description 4</Label>
              <Input value={desc4} onChange={(e) => setDesc4(e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="text-xs">{t("leads.add_comment", { defaultValue: "Note" })}</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t("common.cancel")}</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? t("common.loading") : t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
