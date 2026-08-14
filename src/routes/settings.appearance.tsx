import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDarkTheme } from "@/lib/dark-theme";
import { Moon } from "lucide-react";

export const Route = createFileRoute("/settings/appearance")({ component: AppearancePage });

function AppearancePage() {
  const { t } = useTranslation();
  const dark = useDarkTheme();

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{t("settings.appearance_section")}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-md border p-4">
          <div className="space-y-1">
            <div className="text-sm font-medium flex items-center gap-2">
              <Moon className="h-4 w-4" /> Dark mode
            </div>
            <p className="text-xs text-muted-foreground">
              Switch the interface to a dark slate theme with orange accents.
            </p>
          </div>
          <Button variant={dark.enabled ? "default" : "outline"} onClick={dark.toggle}>
            {dark.enabled ? "ON" : "OFF"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
