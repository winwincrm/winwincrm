import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/offices")({ component: OfficesPage });

function OfficesPage() {
  return <ProtectedRoute roles={["admin"]}><OfficesContent /></ProtectedRoute>;
}

interface Office {
  id: string;
  name: string;
  company_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: "active" | "inactive";
  created_at: string;
}

function OfficesContent() {
  const { t } = useTranslation();
  const [offices, setOffices] = useState<Office[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Office | null>(null);
  const [form, setForm] = useState({ name: "", company_name: "", contact_email: "", contact_phone: "" });

  const load = async () => {
    const { data } = await supabase.from("offices").select("*").order("created_at", { ascending: false });
    setOffices((data ?? []) as Office[]);
  };
  useEffect(() => { void load(); }, []);

  const openNew = () => { setEditing(null); setForm({ name: "", company_name: "", contact_email: "", contact_phone: "" }); setOpen(true); };
  const openEdit = (o: Office) => {
    setEditing(o);
    setForm({ name: o.name, company_name: o.company_name ?? "", contact_email: o.contact_email ?? "", contact_phone: o.contact_phone ?? "" });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    const payload = {
      name: form.name.trim(),
      company_name: form.company_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
    };
    const { error } = editing
      ? await supabase.from("offices").update(payload).eq("id", editing.id)
      : await supabase.from("offices").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Office updated" : "Office created");
    setOpen(false);
    void load();
  };

  const toggleStatus = async (o: Office) => {
    const { error } = await supabase.from("offices")
      .update({ status: o.status === "active" ? "inactive" : "active" })
      .eq("id", o.id);
    if (error) { toast.error(error.message); return; }
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("offices.title")}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> {t("offices.new")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? t("offices.edit") : t("offices.new")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{t("common.name")}</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("offices.company_name")}</Label>
                <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("offices.contact_email")}</Label>
                <Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("offices.contact_phone")}</Label>
                <Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={save}>{t("common.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.name")}</TableHead>
              <TableHead>{t("offices.company_name")}</TableHead>
              <TableHead>{t("offices.contact_email")}</TableHead>
              <TableHead>{t("offices.contact_phone")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead>{t("common.created")}</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {offices.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">{t("common.no_data")}</TableCell></TableRow>
            )}
            {offices.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{o.name}</TableCell>
                <TableCell className="text-sm">{o.company_name ?? "—"}</TableCell>
                <TableCell className="text-sm">{o.contact_email ?? "—"}</TableCell>
                <TableCell className="text-sm">{o.contact_phone ?? "—"}</TableCell>
                <TableCell>
                  <span className={"text-xs px-2 py-0.5 rounded-full " + (o.status === "active" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                    {t(o.status === "active" ? "common.active" : "common.inactive")}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{format(new Date(o.created_at), "MMM d, yyyy")}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(o)}>{t("common.edit")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleStatus(o)}>
                    {t(o.status === "active" ? "common.deactivate" : "common.activate")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
