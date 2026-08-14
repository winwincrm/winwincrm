import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, KeyRound, Search } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  createUserFn,
  impersonateUserFn,
  deleteUserFn,
  updateUserFn,
  resetUserPasswordFn,
} from "@/lib/users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { toast } from "sonner";

export const Route = createFileRoute("/users")({ component: UsersPage });

function UsersPage() {
  return (
    <ProtectedRoute roles={["admin", "superiormanager", "manager"]}>
      <UsersContent />
    </ProtectedRoute>
  );
}

type UserRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  office_id: string | null;
  status: string;
  manager_id: string | null;
};

const rankOf: Record<string, number> = { admin: 4, superiormanager: 3, manager: 2, agent: 1 };
const PAGE_SIZE = 25;

function UsersContent() {
  const { t } = useTranslation();
  const { role, profile } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Map<string, string>>(new Map());
  const [offices, setOffices] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    email: "",
    full_name: "",
    password: "",
    role: "agent",
    office_id: "",
    manager_id: "",
  });
  const [submitting, setSubmitting] = useState(false);

  // Filters / pagination
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  // Dialogs
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<UserRow | null>(null);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);

  const load = async () => {
    const { data: profs } = await (supabase
      .from("profiles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("user_id, full_name, email, office_id, status, manager_id") as any);
    setUsers((profs ?? []) as unknown as UserRow[]);

    const { data: rs } = await supabase.from("user_roles").select("user_id, role");
    const m = new Map<string, string>();
    (rs ?? []).forEach((r) => {
      const cur = m.get(r.user_id);
      if (!cur || (rankOf[r.role] ?? 0) > (rankOf[cur] ?? 0)) m.set(r.user_id, r.role);
    });
    setRoles(m);
    if (role === "admin") {
      const { data: o } = await supabase.from("offices").select("id, name");
      setOffices(o ?? []);
    } else if (profile?.office_id) {
      setOffices([{ id: profile.office_id, name: "" }]);
      setForm((f) => ({ ...f, office_id: profile.office_id! }));
    }
  };

  useEffect(() => {
    void load(); /* eslint-disable-next-line */
  }, [role, profile?.office_id]);

  const withAuth = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Not authenticated");
    return { Authorization: `Bearer ${token}` };
  };

  const create = async () => {
    if (!form.email || !form.password) {
      toast.error("Email & password required");
      return;
    }
    if (form.password.length < 8) {
      toast.error("Password ≥ 8 chars");
      return;
    }
    const myRank = rankOf[role ?? ""] ?? 0;
    let targetRole = form.role as "admin" | "manager" | "superiormanager" | "agent";
    if (role !== "admin") {
      if (role === "manager") targetRole = "agent";
      else if (role === "superiormanager") {
        if (targetRole !== "manager" && targetRole !== "agent") targetRole = "agent";
      }
      if ((rankOf[targetRole] ?? 0) >= myRank) targetRole = "agent";
    }
    const targetOffice = role === "admin" ? (form.office_id || null) : (profile?.office_id ?? null);
    const targetManager = form.manager_id
      || (role !== "admin" ? (profile?.user_id ?? null) : null);
    setSubmitting(true);
    try {
      const headers = await withAuth();
      const result = await createUserFn({
        data: {
          email: form.email,
          password: form.password,
          full_name: form.full_name || null,
          role: targetRole,
          office_id: targetOffice,
          manager_id: targetManager || null,
        },
        headers,
      });
      if (!result.ok) throw new Error(result.message);
      toast.success("User created. They'll reset password on first login.");
      setOpen(false);
      setForm({
        email: "",
        full_name: "",
        password: "",
        role: "agent",
        office_id: profile?.office_id ?? "",
        manager_id: "",
      });
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  const updateManager = async (userId: string, newManagerId: string | null) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("profiles") as any)
      .update({ manager_id: newManagerId })
      .eq("user_id", userId);
    if (error) { toast.error(error.message); return; }
    setUsers((prev) => prev.map((p) => p.user_id === userId ? { ...p, manager_id: newManagerId } : p));
    toast.success("Hierarchy updated");
  };

  const performToggleStatus = async (u: UserRow) => {
    const { error } = await supabase
      .from("profiles")
      .update({ status: u.status === "active" ? "inactive" : "active" })
      .eq("user_id", u.user_id);
    if (error) { toast.error(error.message); return; }
    void load();
  };

  const impersonate = async (u: UserRow) => {
    if (!confirm(`Sign in as ${u.full_name || u.email}? You will be signed out of your current session.`)) return;
    try {
      const headers = await withAuth();
      const result = await impersonateUserFn({ data: { user_id: u.user_id }, headers });
      if (!result.ok) throw new Error(result.message);
      await supabase.auth.signOut();
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: result.token_hash,
      });
      if (verifyErr) throw verifyErr;
      window.location.href = "/";

    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to impersonate user");
    }
  };

  const performDelete = async (u: UserRow) => {
    try {
      const headers = await withAuth();
      const result = await deleteUserFn({ data: { user_id: u.user_id }, headers });
      if (!result.ok) throw new Error(result.message);
      toast.success("User deleted");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete user");
    }
  };

  // Filtered + paginated
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (q) {
        const hay = `${u.full_name ?? ""} ${u.email ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (roleFilter !== "all" && roles.get(u.user_id) !== roleFilter) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      return true;
    });
  }, [users, query, roleFilter, statusFilter, roles]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [query, roleFilter, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t("users.title")}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1" /> {t("users.new")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("users.new")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{t("users.full_name")}</Label>
                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("auth.email")}</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("users.temp_password")}</Label>
                <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <p className="text-xs text-muted-foreground">{t("users.must_reset")}</p>
              </div>

              <div className="space-y-1.5">
                <Label>{t("users.role")}</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {role === "admin" && <SelectItem value="admin">{t("roles.admin")}</SelectItem>}
                    {role === "admin" && <SelectItem value="superiormanager">{t("roles.superiormanager")}</SelectItem>}
                    {(role === "admin" || role === "superiormanager") && (
                      <SelectItem value="manager">{t("roles.manager")}</SelectItem>
                    )}
                    <SelectItem value="agent">{t("roles.agent")}</SelectItem>
                  </SelectContent>
                </Select>
                {role !== "admin" && (
                  <p className="text-xs text-muted-foreground">
                    Only roles below yours can be created.
                  </p>
                )}
              </div>

              {role === "admin" && form.role !== "admin" && (
                <div className="space-y-1.5">
                  <Label>{t("common.office")}</Label>
                  <Select value={form.office_id} onValueChange={(v) => setForm({ ...form, office_id: v })}>
                    <SelectTrigger><SelectValue placeholder={t("common.none")} /></SelectTrigger>
                    <SelectContent>
                      {offices.map((o) => (
                        <SelectItem key={o.id} value={o.id}>{o.name || o.id.slice(0, 8)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {role !== "admin" && (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
                  <div>Office: <span className="font-medium">{profile?.office_id ? "Your office" : "—"}</span></div>
                  <div>Reports to: <span className="font-medium">You</span></div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={create} disabled={submitting}>{t("users.create_user")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="admin">{t("roles.admin")}</SelectItem>
            <SelectItem value="superiormanager">{t("roles.superiormanager")}</SelectItem>
            <SelectItem value="manager">{t("roles.manager")}</SelectItem>
            <SelectItem value="agent">{t("roles.agent")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">{t("common.active")}</SelectItem>
            <SelectItem value="inactive">{t("common.inactive")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm text-muted-foreground">
          {filtered.length} of {users.length}
        </div>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.name")}</TableHead>
              <TableHead>{t("auth.email")}</TableHead>
              <TableHead>{t("users.role")}</TableHead>
              <TableHead>Reports to</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                  {t("common.no_data")}
                </TableCell>
              </TableRow>
            )}
            {paged.map((u) => {
              const userRole = roles.get(u.user_id);
              const userRank = rankOf[userRole ?? ""] ?? 0;
              const canEditHierarchy = role === "admin" && userRole && userRole !== "admin";
              const eligible = users.filter((p) => {
                const pr = roles.get(p.user_id);
                if (!pr) return false;
                return (rankOf[pr] ?? 0) > userRank && p.user_id !== u.user_id;
              });
              const currentParent = users.find((p) => p.user_id === u.manager_id);
              const myRank = rankOf[role ?? ""] ?? 0;
              const canManage = role === "admin" || userRank < myRank;
              const isSelf = u.user_id === profile?.user_id;

              return (
                <TableRow key={u.user_id}>
                  <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
                  <TableCell className="text-sm">{u.email ?? "—"}</TableCell>
                  <TableCell className="text-sm">{userRole ? t(`roles.${userRole}`) : "—"}</TableCell>
                  <TableCell className="text-sm">
                    {canEditHierarchy ? (
                      <Select
                        value={u.manager_id ?? "__none__"}
                        onValueChange={(v) => updateManager(u.user_id, v === "__none__" ? null : v)}
                      >
                        <SelectTrigger className="h-8 w-[220px]">
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Unassigned</SelectItem>
                          {eligible.map((p) => (
                            <SelectItem key={p.user_id} value={p.user_id}>
                              {(p.full_name || p.email || p.user_id.slice(0, 8))}
                              {roles.get(p.user_id) ? ` · ${t(`roles.${roles.get(p.user_id)}`)}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      currentParent
                        ? (currentParent.full_name || currentParent.email || "—")
                        : <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={
                      "text-xs px-2 py-0.5 rounded-full " +
                      (u.status === "active" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")
                    }>
                      {t(u.status === "active" ? "common.active" : "common.inactive")}
                    </span>
                  </TableCell>
                  <TableCell className="text-right space-x-1 whitespace-nowrap">
                    {role === "admin" && !isSelf && (
                      <Button size="sm" variant="outline" onClick={() => impersonate(u)}>Login as</Button>
                    )}
                    {canManage && (
                      <Button size="sm" variant="ghost" title="Edit" onClick={() => setEditUser(u)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {canManage && (
                      <Button size="sm" variant="ghost" title="Reset password" onClick={() => setResetTarget(u)}>
                        <KeyRound className="h-4 w-4" />
                      </Button>
                    )}
                    {canManage && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => u.status === "active" ? setDeactivateTarget(u) : void performToggleStatus(u)}
                      >
                        {t(u.status === "active" ? "common.deactivate" : "common.activate")}
                      </Button>
                    )}
                    {canManage && !isSelf && (
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Delete"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(u)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            Page {currentPage} of {totalPages}
          </div>
          <div className="space-x-2">
            <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Edit dialog */}
      <EditUserDialog
        user={editUser}
        role={role}
        offices={offices}
        allUsers={users}
        roles={roles}
        onClose={() => setEditUser(null)}
        onSaved={() => { setEditUser(null); void load(); }}
        withAuth={withAuth}
      />

      {/* Reset password dialog */}
      <ResetPasswordDialog
        user={resetTarget}
        onClose={() => setResetTarget(null)}
        withAuth={withAuth}
      />

      {/* Deactivate confirm */}
      <AlertDialog open={!!deactivateTarget} onOpenChange={(o) => !o && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate user?</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateTarget?.full_name || deactivateTarget?.email} will no longer be able to sign in
              until reactivated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deactivateTarget) await performToggleStatus(deactivateTarget);
                setDeactivateTarget(null);
              }}
            >
              {t("common.deactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <b>{deleteTarget?.full_name || deleteTarget?.email}</b> and
              their account access. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleteTarget) await performDelete(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EditUserDialog({
  user, role, offices, allUsers, roles, onClose, onSaved, withAuth,
}: {
  user: UserRow | null;
  role: string | null | undefined;
  offices: { id: string; name: string }[];
  allUsers: UserRow[];
  roles: Map<string, string>;
  onClose: () => void;
  onSaved: () => void;
  withAuth: () => Promise<{ Authorization: string }>;
}) {
  const { t } = useTranslation();
  const [full_name, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [userRole, setUserRole] = useState("agent");
  const [officeId, setOfficeId] = useState<string>("");
  const [managerId, setManagerId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFullName(user.full_name ?? "");
    setEmail(user.email ?? "");
    setUserRole(roles.get(user.user_id) ?? "agent");
    setOfficeId(user.office_id ?? "");
    setManagerId(user.manager_id ?? "");
  }, [user, roles]);

  if (!user) return null;

  const currentRank = rankOf[roles.get(user.user_id) ?? ""] ?? 0;
  const eligible = allUsers.filter((p) => {
    const pr = roles.get(p.user_id);
    if (!pr) return false;
    return (rankOf[pr] ?? 0) > currentRank && p.user_id !== user.user_id;
  });

  const save = async () => {
    setSaving(true);
    try {
      const headers = await withAuth();
      const result = await updateUserFn({
        data: {
          user_id: user.user_id,
          full_name: full_name || null,
          email: email || null,
          role: role === "admin" ? (userRole as "admin" | "manager" | "superiormanager" | "agent") : undefined,
          office_id: role === "admin" ? (officeId || null) : undefined,
          manager_id: role === "admin" ? (managerId || null) : undefined,
        },
        headers,
      });
      if (!result.ok) throw new Error(result.message);
      toast.success("User updated");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("users.full_name")}</Label>
            <Input value={full_name} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("auth.email")}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {role === "admin" && (
            <>
              <div className="space-y-1.5">
                <Label>{t("users.role")}</Label>
                <Select value={userRole} onValueChange={setUserRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{t("roles.admin")}</SelectItem>
                    <SelectItem value="superiormanager">{t("roles.superiormanager")}</SelectItem>
                    <SelectItem value="manager">{t("roles.manager")}</SelectItem>
                    <SelectItem value="agent">{t("roles.agent")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("common.office")}</Label>
                <Select value={officeId || "__none__"} onValueChange={(v) => setOfficeId(v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder={t("common.none")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("common.none")}</SelectItem>
                    {offices.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name || o.id.slice(0, 8)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Reports to</Label>
                <Select value={managerId || "__none__"} onValueChange={(v) => setManagerId(v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {eligible.map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {(p.full_name || p.email || p.user_id.slice(0, 8))}
                        {roles.get(p.user_id) ? ` · ${t(`roles.${roles.get(p.user_id)}`)}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={save} disabled={saving}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  user, onClose, withAuth,
}: {
  user: UserRow | null;
  onClose: () => void;
  withAuth: () => Promise<{ Authorization: string }>;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setPassword(""); }, [user]);

  if (!user) return null;

  const submit = async () => {
    if (password.length < 8) { toast.error("Password ≥ 8 chars"); return; }
    setSaving(true);
    try {
      const headers = await withAuth();
      const result = await resetUserPasswordFn({
        data: { user_id: user.user_id, password },
        headers,
      });
      if (!result.ok) throw new Error(result.message);
      toast.success("Password reset. User must change it on next login.");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Set a new temporary password for <b>{user.full_name || user.email}</b>. They'll be prompted to change it on next login.
          </p>
          <div className="space-y-1.5">
            <Label>New password</Label>
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={submit} disabled={saving}>Reset password</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
