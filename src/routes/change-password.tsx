import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/change-password")({ component: ChangePasswordPage });

function ChangePasswordPage() {
  const { t } = useTranslation();
  const { session, profile, refresh, loading } = useAuth();
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) navigate({ to: "/login" });
  }, [session, loading, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (pw !== pw2) { toast.error(t("auth.passwords_dont_match")); return; }
    setSubmitting(true);
    const { error: pwErr } = await supabase.auth.updateUser({ password: pw });
    if (pwErr) { setSubmitting(false); toast.error(pwErr.message); return; }
    if (profile?.user_id) {
      await supabase.from("profiles").update({ must_change_password: false }).eq("user_id", profile.user_id);
    }
    await refresh();
    setSubmitting(false);
    toast.success("Password updated");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-2xl font-semibold tracking-tight">{t("auth.must_change_title")}</div>
          <p className="text-sm text-muted-foreground mt-1">{t("auth.must_change_desc")}</p>
        </div>
        <form onSubmit={onSubmit} className="bg-card border rounded-lg p-6 space-y-4 shadow-sm">
          <div className="space-y-2">
            <Label htmlFor="pw">{t("auth.new_password")}</Label>
            <Input id="pw" type="password" required value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pw2">{t("auth.confirm_password")}</Label>
            <Input id="pw2" type="password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {t("auth.update_password")}
          </Button>
        </form>
      </div>
    </div>
  );
}
