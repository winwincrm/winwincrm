import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/settings/password")({ component: PasswordPage });

function PasswordPage() {
  const { t } = useTranslation();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  const change = async () => {
    if (pw.length < 8) { toast.error("≥ 8 chars"); return; }
    if (pw !== pw2) { toast.error(t("auth.passwords_dont_match")); return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) { toast.error(error.message); return; }
    setPw(""); setPw2(""); toast.success("Password updated");
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{t("settings.password_section")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>{t("auth.new_password")}</Label>
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("auth.confirm_password")}</Label>
          <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        <Button onClick={change}>{t("auth.update_password")}</Button>
      </CardContent>
    </Card>
  );
}
