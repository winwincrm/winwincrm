import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/settings/language")({ component: LanguagePage });

function LanguagePage() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();

  const save = async (code: string) => {
    i18n.changeLanguage(code);
    if (profile) {
      await supabase.from("profiles").update({ language_preference: code }).eq("user_id", profile.user_id);
    }
    toast.success("Language updated");
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{t("settings.language_section")}</CardTitle></CardHeader>
      <CardContent>
        <Select value={i18n.language?.slice(0, 2) || "en"} onValueChange={save}>
          <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="de">Deutsch</SelectItem>
            <SelectItem value="it">Italiano</SelectItem>
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
