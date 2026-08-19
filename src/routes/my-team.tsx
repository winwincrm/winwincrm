import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/lib/auth-context";
import { normalizeRole, type AppRole } from "@/lib/hierarchy";
import { supabase } from "@/integrations/supabase/client";
import { reassignLeadWithCommentOption } from "@/lib/lead-reassignment.functions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/my-team")({ component: MyTeamPage });

function MyTeamPage() {
  return (
    <ProtectedRoute roles={["admin", "superiormanager", "manager"]}>
      <MyTeamContent />
    </ProtectedRoute>
  );
}

type MemberRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  office_id: string | null;
  manager_id: string | null;
  status: string;
  role: AppRole;
};
type LeadRow = { id: string; full_name: string; status: string; assigned_user_id: string | null };

function MyTeamContent() {
  const { t } = useTranslation();
  const { role, profile } = useAuth();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!role || !profile) return;
    let alive = true;
    void (async () => {
      setLoading(true);
      const [{ data: profiles, error: profilesError }, { data: roleRows, error: rolesError }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("user_id, full_name, email, office_id, manager_id, status"),
          supabase.from("user_roles").select("user_id, role"),
        ]);
      if (!alive) return;
      if (profilesError || rolesError) {
        toast.error(profilesError?.message ?? rolesError?.message ?? "Could not load hierarchy");
        setLoading(false);
        return;
      }

      const roleMap = new Map<string, AppRole>();
      for (const row of roleRows ?? []) {
        const next = normalizeRole(String(row.role));
        const current = roleMap.get(row.user_id);
        if (next && (!current || rank(next) > rank(current))) roleMap.set(row.user_id, next);
      }
      const all = (profiles ?? []).flatMap((row) => {
        const memberRole = roleMap.get(row.user_id);
        return memberRole ? [{ ...row, role: memberRole } as MemberRow] : [];
      });

      const visible = scopedMembers(all, role, profile.user_id, profile.office_id);
      setMembers(visible);
      const agentIds = visible
        .filter((member) => member.role === "agent" && member.status === "active")
        .map((member) => member.user_id);

      let leadQuery = supabase
        .from("leads")
        .select("id, full_name, status, assigned_user_id")
        .order("created_at", { ascending: false })
        .limit(200);
      if (role !== "admin" && profile.office_id)
        leadQuery = leadQuery.eq("office_id", profile.office_id);
      leadQuery = leadQuery.or(
        agentIds.length > 0
          ? `assigned_user_id.is.null,assigned_user_id.in.(${agentIds.join(",")})`
          : "assigned_user_id.is.null",
      );
      const { data: leadRows, error: leadsError } = await leadQuery;
      if (!alive) return;
      if (leadsError) toast.error(leadsError.message);
      setLeads((leadRows ?? []) as LeadRow[]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [role, profile]);

  const agents = useMemo(
    () => members.filter((member) => member.role === "agent" && member.status === "active"),
    [members],
  );
  const managers = useMemo(() => members.filter((member) => member.role === "manager"), [members]);
  const memberName = useMemo(() => {
    const names = new Map(
      members.map((member) => [member.user_id, member.full_name || member.email || "—"]),
    );
    if (profile) names.set(profile.user_id, profile.full_name || profile.email || "You");
    return names;
  }, [members, profile]);

  const distribute = async () => {
    if (!selectedLeadId || !selectedAgent) return;
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Not authenticated");
      await reassignLeadWithCommentOption({
        data: {
          leadId: selectedLeadId,
          assignedUserId: selectedAgent,
          keepComments: true,
          keepDescriptions: true,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      setLeads((previous) =>
        previous.map((lead) =>
          lead.id === selectedLeadId ? { ...lead, assigned_user_id: selectedAgent } : lead,
        ),
      );
      setSelectedLeadId("");
      setSelectedAgent("");
      toast.success(t("common.updated", { defaultValue: "Assigned" }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not assign lead");
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">{t("common.loading")}</div>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">My Team</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {role === "manager" && `${agents.length} direct agent${agents.length === 1 ? "" : "s"}`}
          {role === "superiormanager" &&
            `${managers.length} manager${managers.length === 1 ? "" : "s"} · ${agents.length} agent${agents.length === 1 ? "" : "s"}`}
          {role === "admin" &&
            `${members.length} hierarchy member${members.length === 1 ? "" : "s"}`}
        </p>
      </header>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="text-sm font-medium">Hierarchy members</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Reports to</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                  No users are assigned below you in the hierarchy.
                </TableCell>
              </TableRow>
            )}
            {members.map((member) => (
              <TableRow key={member.user_id}>
                <TableCell>
                  <div className="font-medium">{member.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{member.email ?? "—"}</div>
                </TableCell>
                <TableCell>{t(`roles.${member.role}`)}</TableCell>
                <TableCell>
                  {member.manager_id ? (memberName.get(member.manager_id) ?? "—") : "—"}
                </TableCell>
                <TableCell>
                  {member.status === "active" ? t("common.active") : t("common.inactive")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="text-sm font-medium">Distribute a lead</h2>
        {agents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add an active agent under a manager before assigning leads.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Select value={selectedLeadId} onValueChange={setSelectedLeadId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a lead" />
              </SelectTrigger>
              <SelectContent>
                {leads.map((lead) => (
                  <SelectItem key={lead.id} value={lead.id}>
                    {lead.full_name} —{" "}
                    {lead.assigned_user_id
                      ? (memberName.get(lead.assigned_user_id) ?? "assigned")
                      : "unassigned"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger>
                <SelectValue placeholder="Assign to agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.user_id} value={agent.user_id}>
                    {agent.full_name ?? agent.email ?? agent.user_id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={distribute} disabled={!selectedLeadId || !selectedAgent}>
              Assign
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

function rank(role: AppRole): number {
  return role === "admin" ? 4 : role === "superiormanager" ? 3 : role === "manager" ? 2 : 1;
}

function scopedMembers(
  all: MemberRow[],
  callerRole: AppRole,
  callerId: string,
  officeId: string | null,
): MemberRow[] {
  if (callerRole === "admin") return all.filter((member) => member.role !== "admin");
  if (!officeId) return [];
  if (callerRole === "manager") {
    return all.filter(
      (member) =>
        member.role === "agent" && member.manager_id === callerId && member.office_id === officeId,
    );
  }
  const managerIds = new Set(
    all
      .filter(
        (member) =>
          member.role === "manager" &&
          member.manager_id === callerId &&
          member.office_id === officeId,
      )
      .map((member) => member.user_id),
  );
  return all.filter(
    (member) =>
      member.office_id === officeId &&
      ((member.role === "manager" && managerIds.has(member.user_id)) ||
        (member.role === "agent" && !!member.manager_id && managerIds.has(member.manager_id))),
  );
}
