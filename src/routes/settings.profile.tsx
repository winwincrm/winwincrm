import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/settings/profile")({ component: ProfilePage });

function ProfilePage() {
  const { t } = useTranslation();
  const { profile, refresh } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");

  const save = async () => {
    if (!profile) return;
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName || null })
      .eq("user_id", profile.user_id);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    void refresh();
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{t("settings.profile_section")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>{t("auth.email")}</Label>
          <Input value={profile?.email ?? ""} disabled />
        </div>
        <div className="space-y-1.5">
          <Label>{t("users.full_name")}</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <Button onClick={save}>{t("common.save")}</Button>
      </CardContent>
    </Card>
  );
}
