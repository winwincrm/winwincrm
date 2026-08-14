import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/api-logs")({ component: ApiLogsPage });

function ApiLogsPage() {
  return <ProtectedRoute roles={["admin"]}><ApiLogsContent /></ProtectedRoute>;
}

function ApiLogsContent() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<Array<{ id: string; ip_address: string | null; status: string; payload: unknown; error_message: string | null; created_at: string }>>([]);

  useEffect(() => {
    void supabase.from("api_logs").select("*").order("created_at", { ascending: false }).limit(200).then(({ data }) => setLogs((data ?? []) as typeof logs));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("api_logs.title")}</h1>
      <div className="border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("api_logs.timestamp")}</TableHead>
            <TableHead>{t("api_logs.ip_address")}</TableHead>
            <TableHead>{t("common.status")}</TableHead>
            <TableHead>{t("api_logs.error")}</TableHead>
            <TableHead>{t("api_logs.payload")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {logs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">{t("api_logs.empty")}</TableCell></TableRow>}
            {logs.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="text-xs text-muted-foreground">{format(new Date(l.created_at), "MMM d, HH:mm:ss")}</TableCell>
                <TableCell className="font-mono text-xs">{l.ip_address ?? "—"}</TableCell>
                <TableCell>
                  <span className={"text-xs px-2 py-0.5 rounded-full " + (l.status === "success" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>
                    {l.status}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-destructive max-w-xs truncate">{l.error_message ?? "—"}</TableCell>
                <TableCell className="text-xs font-mono max-w-md truncate">{l.payload ? JSON.stringify(l.payload).slice(0, 120) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
