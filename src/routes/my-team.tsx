import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/my-team")({ component: MyTeamPage });

function MyTeamPage() {
  return (
    <ProtectedRoute roles={["admin", "superiormanager", "manager"]}>
      <MyTeamContent />
    </ProtectedRoute>
  );
}

type AgentRow = { user_id: string; full_name: string | null; email: string | null };
type LeadRow = { id: string; full_name: string; status: string; assigned_user_id: string | null };

function MyTeamContent() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const teamId = profile?.team_id ?? null;

  const [teamName, setTeamName] = useState<string>("");
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [unassigned, setUnassigned] = useState<LeadRow[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [selectedAgent, setSelectedAgent] = useState<string>("");

  useEffect(() => {
    if (!teamId) return;
    void (async () => {
      const [{ data: team }, { data: profs }] = await Promise.all([
        supabase.from("teams").select("name").eq("id", teamId).maybeSingle(),
        supabase.from("profiles").select("user_id, full_name, email").eq("team_id", teamId),
      ]);
      setTeamName(team?.name ?? "");
      setAgents((profs ?? []) as AgentRow[]);
      const agentIds = (profs ?? []).map((p) => p.user_id);
      if (profile?.office_id) {
        const { data: leads } = await supabase
          .from("leads")
          .select("id, full_name, status, assigned_user_id")
          .eq("office_id", profile.office_id)
          .or(`assigned_user_id.is.null,assigned_user_id.in.(${agentIds.join(",") || "null"})`)
          .order("created_at", { ascending: false })
          .limit(200);
        setUnassigned((leads ?? []) as LeadRow[]);
      }
    })();
  }, [teamId, profile?.office_id]);

  const agentName = useMemo(
    () => new Map(agents.map((a) => [a.user_id, a.full_name || a.email || "—"])),
    [agents],
  );

  const distribute = async () => {
    if (!selectedLeadId || !selectedAgent) return;
    const { error } = await supabase
      .from("leads")
      .update({ assigned_user_id: selectedAgent, assigned_at: new Date().toISOString() })
      .eq("id", selectedLeadId);
    if (error) { toast.error(error.message); return; }
    setUnassigned((prev) => prev.map((l) => l.id === selectedLeadId
      ? { ...l, assigned_user_id: selectedAgent } : l));
    setSelectedLeadId("");
    setSelectedAgent("");
    toast.success(t("common.updated", { defaultValue: "Assigned" }));
  };

  if (!teamId) {
    return (
      <div className="text-sm text-muted-foreground">
        You're not assigned to a team yet. Ask your manager to add you to one.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">My Team</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {teamName ? `Team: ${teamName}` : ""}
        </p>
      </header>

      <section className="border rounded-lg bg-card overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="text-sm font-medium">Agents</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.length === 0 && (
              <TableRow><TableCell colSpan={2} className="text-center text-sm text-muted-foreground py-6">
                No agents on this team yet.
              </TableCell></TableRow>
            )}
            {agents.map((a) => (
              <TableRow key={a.user_id}>
                <TableCell className="font-medium">{a.full_name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{a.email ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="border rounded-lg bg-card p-4 space-y-3">
        <h2 className="text-sm font-medium">Distribute a lead</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <Select value={selectedLeadId} onValueChange={setSelectedLeadId}>
            <SelectTrigger><SelectValue placeholder="Pick a lead" /></SelectTrigger>
            <SelectContent>
              {unassigned.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.full_name} — {l.assigned_user_id ? agentName.get(l.assigned_user_id) ?? "assigned" : "unassigned"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedAgent} onValueChange={setSelectedAgent}>
            <SelectTrigger><SelectValue placeholder="Assign to agent" /></SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a.user_id} value={a.user_id}>
                  {a.full_name ?? a.email ?? a.user_id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={distribute} disabled={!selectedLeadId || !selectedAgent}>
            Assign
          </Button>
        </div>
      </section>
    </div>
  );
}