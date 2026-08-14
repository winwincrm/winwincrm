import { useEffect, useState } from "react";
import { Plus, ShieldAlert, Globe } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { checkIpAllowed, refreshIpRules } from "@/lib/ip-check.functions";
import { ipMatches } from "@/lib/ip-match";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Row = { id: string; ip_address: string; label: string | null; status: string };

export function IpWhitelistPanel() {
  const { user } = useAuth();
  const check = useServerFn(checkIpAllowed);
  const refresh = useServerFn(refreshIpRules);
  const [items, setItems] = useState<Row[]>([]);
  const [myIp, setMyIp] = useState<string | null>(null);
  const [form, setForm] = useState({ ip_address: "", label: "" });
  const [busy, setBusy] = useState(false);

  /** Clears the server-side rule cache so changes apply right away. */
  const applyNow = async () => {
    try { await refresh({}); } catch { /* cache expires on its own within seconds */ }
  };

  const load = async () => {
    const { data, error } = await supabase
      .from("ip_whitelist")
      .select("id, ip_address, label, status")
      .order("created_at", { ascending: false });
    if (error) { toast.error(error.message); return; }
    setItems((data ?? []) as Row[]);
  };

  useEffect(() => {
    void load();
    void check({}).then((r) => setMyIp(r.ip)).catch(() => {});
  }, []);

  const activeCount = items.filter((i) => i.status === "active").length;
  const SUSPENDED_KEY = "ip-whitelist-suspended-ids";
  const [suspended, setSuspended] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SUSPENDED_KEY);
      setSuspended(raw ? (JSON.parse(raw) as string[]) : []);
    } catch { setSuspended([]); }
  }, []);

  const saveSuspended = (ids: string[]) => {
    setSuspended(ids);
    try { localStorage.setItem(SUSPENDED_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
  };

  /** Turns the whitelist OFF entirely: everyone can reach the CRM again. */
  const allowEveryone = async () => {
    const ids = items.filter((i) => i.status === "active").map((i) => i.id);
    if (ids.length === 0) { toast.info("Whitelist is already off"); return; }
    if (!window.confirm("Turn the IP whitelist OFF? Every IP address will be able to access the CRM.")) return;
    setBusy(true);
    const { error } = await supabase.from("ip_whitelist").update({ status: "inactive" }).in("id", ids);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    saveSuspended(ids);
    await applyNow();
    toast.success("IP whitelist turned off — all IPs allowed");
    void load();
  };

  /** Re-activates the rules that were turned off by the master switch. */
  const restoreWhitelist = async () => {
    const ids = suspended.filter((id) => items.some((i) => i.id === id));
    if (ids.length === 0) { toast.error("No previously active rules to restore"); return; }
    const rules = items.filter((i) => ids.includes(i.id));
    if (myIp && !rules.some((r) => ipMatches(myIp, r.ip_address))) {
      const ok = window.confirm(
        `Your IP (${myIp}) is not covered by these rules — you may lock yourself out. Continue?`,
      );
      if (!ok) return;
    }
    setBusy(true);
    const { error } = await supabase.from("ip_whitelist").update({ status: "active" }).in("id", ids);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    saveSuspended([]);
    await applyNow();
    toast.success("IP whitelist re-enabled");
    void load();
  };

  /** True if, after removing/deactivating `rule`, the admin's IP is locked out. */
  const wouldLockMeOut = (rule: Row) => {
    if (!myIp || rule.status !== "active") return false;
    const remaining = items.filter((r) => r.id !== rule.id && r.status === "active");
    if (remaining.length === 0) return false; // whitelist turns off entirely
    return !remaining.some((r) => ipMatches(myIp, r.ip_address));
  };

  const create = async () => {
    const ip = form.ip_address.trim();
    if (!ip) { toast.error("Enter an IP address"); return; }
    setBusy(true);
    const { error } = await supabase.from("ip_whitelist").insert({
      ip_address: ip,
      label: form.label.trim() || null,
      created_by: user?.id ?? null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setForm({ ip_address: "", label: "" });
    toast.success("IP added to whitelist");
    await applyNow();
    void load();
  };

  const toggle = async (i: Row) => {
    const next = i.status === "active" ? "inactive" : "active";
    if (next === "active" && activeCount === 0 && myIp && !ipMatches(myIp, i.ip_address)) {
      const ok = window.confirm(
        `Activating this rule turns the whitelist ON. Your IP (${myIp}) is not covered by it — you may lock yourself out. Continue?`,
      );
      if (!ok) return;
    }
    if (next === "inactive" && wouldLockMeOut(i)) {
      const ok = window.confirm(
        `This rule covers your current IP (${myIp}). Deactivating it while other rules stay active will lock you out of the CRM. Continue?`,
      );
      if (!ok) return;
    }
    const { error } = await supabase.from("ip_whitelist").update({ status: next }).eq("id", i.id);
    if (error) { toast.error(error.message); return; }
    await applyNow();
    void load();
  };

  const remove = async (i: Row) => {
    if (wouldLockMeOut(i)) {
      const ok = window.confirm(
        `This rule covers your current IP (${myIp}). Deleting it while other rules stay active will lock you out of the CRM. Continue?`,
      );
      if (!ok) return;
    }
    const { error } = await supabase.from("ip_whitelist").delete().eq("id", i.id);
    if (error) { toast.error(error.message); return; }
    await applyNow();
    void load();
  };


  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-primary" />
          <div className="text-sm">
            <p className="font-medium">
              {activeCount === 0
                ? "IP whitelist is OFF — every address can reach the CRM."
                : `IP whitelist is ON — only the ${activeCount} active address${activeCount === 1 ? "" : "es"} below can access the CRM.`}
            </p>
            <p className="mt-1 text-muted-foreground">
              Exact IPs (1.2.3.4), ranges (1.2.3.0/24) and wildcards (1.2.3.*) are supported.
              Adding the first active address activates the block for everyone else.
            </p>
            <p className="mt-2 flex items-center gap-2 text-muted-foreground">
              <Globe className="h-4 w-4" /> Your current IP:{" "}
              <span className="font-mono text-foreground">{myIp ?? "unknown"}</span>
              {myIp && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => setForm((f) => ({ ...f, ip_address: myIp }))}
                >
                  Use my IP
                </Button>
              )}
            </p>
            <div className="mt-3">
              {activeCount > 0 ? (
                <Button size="sm" variant="destructive" disabled={busy} onClick={allowEveryone}>
                  Allow every IP (turn whitelist off)
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || suspended.length === 0}
                  onClick={restoreWhitelist}
                >
                  Re-enable whitelist{suspended.length ? ` (${suspended.length} rule${suspended.length === 1 ? "" : "s"})` : ""}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label>IP address / range</Label>
            <Input
              value={form.ip_address}
              onChange={(e) => setForm({ ...form, ip_address: e.target.value })}
              placeholder="1.2.3.4 or 1.2.3.0/24"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Label</Label>
            <Input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Office router"
            />
          </div>
          <Button onClick={create} disabled={busy}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>IP address</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  No IP addresses yet
                </TableCell>
              </TableRow>
            )}
            {items.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-mono text-sm">
                  {i.ip_address}
                  {myIp === i.ip_address && (
                    <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">you</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{i.label ?? "—"}</TableCell>
                <TableCell>
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs " +
                      (i.status === "active" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")
                    }
                  >
                    {i.status === "active" ? "Active" : "Inactive"}
                  </span>
                </TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => toggle(i)}>
                    {i.status === "active" ? "Deactivate" : "Activate"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(i)}>
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
