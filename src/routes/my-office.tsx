import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/my-office")({ component: MyOfficePage });

function MyOfficePage() {
  return (
    <ProtectedRoute roles={["manager", "admin"]}>
      <MyOfficeContent />
    </ProtectedRoute>
  );
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

function MyOfficeContent() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [office, setOffice] = useState<Office | null>(null);
  const [form, setForm] = useState({ name: "", company_name: "", contact_email: "", contact_phone: "" });
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<{ agents: number; leads: number } | null>(null);

  const load = async () => {
    if (!profile?.office_id) return;
    const { data } = await supabase.from("offices").select("*").eq("id", profile.office_id).maybeSingle();
    if (data) {
      const o = data as Office;
      setOffice(o);
      setForm({
        name: o.name,
        company_name: o.company_name ?? "",
        contact_email: o.contact_email ?? "",
        contact_phone: o.contact_phone ?? "",
      });
    }
    const [{ count: agents }, { count: leads }] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("office_id", profile.office_id),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("office_id", profile.office_id),
    ]);
    setStats({ agents: agents ?? 0, leads: leads ?? 0 });
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [profile?.office_id]);

  const save = async () => {
    if (!office) return;
    if (!form.name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    const { error } = await supabase.from("offices").update({
      name: form.name.trim(),
      company_name: form.company_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
    }).eq("id", office.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("common.save") + " ✓");
    void load();
  };

  if (!profile?.office_id) {
    return <div className="text-sm text-muted-foreground">{t("common.no_data")}</div>;
  }
  if (!office) {
    return <div className="text-sm text-muted-foreground">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">{t("my_office.title", { defaultValue: "My Office" })}</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs uppercase text-muted-foreground">{t("common.status")}</CardTitle></CardHeader>
          <CardContent><span className={"text-xs px-2 py-0.5 rounded-full " + (office.status === "active" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
            {t(office.status === "active" ? "common.active" : "common.inactive")}
          </span></CardContent>
        </Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs uppercase text-muted-foreground">{t("dashboard.total_agents")}</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{stats?.agents ?? "—"}</CardContent>
        </Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs uppercase text-muted-foreground">{t("dashboard.total_leads")}</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{stats?.leads ?? "—"}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("my_office.details", { defaultValue: "Office details" })}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("common.name")}</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("offices.company_name")}</Label>
            <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("offices.contact_email")}</Label>
              <Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("offices.contact_phone")}</Label>
              <Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {t("common.created")}: {format(new Date(office.created_at), "MMM d, yyyy")}
          </div>
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>{t("common.save")}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
