import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Copy, Check } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useServerFn } from "@tanstack/react-start";
import { listApiKeysFn, createApiKeyFn, revokeApiKeyFn } from "@/lib/api-keys.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/api-keys")({ component: Page });

function Page() {
  return <ProtectedRoute roles={["admin"]}><Content /></ProtectedRoute>;
}

type Key = {
  id: string; office_id: string; label: string | null;
  status: string; created_at: string; last_used_at: string | null; office_name: string | null;
};

function Content() {
  const list = useServerFn(listApiKeysFn);
  const create = useServerFn(createApiKeyFn);
  const revoke = useServerFn(revokeApiKeyFn);

  const [keys, setKeys] = useState<Key[]>([]);
  const [offices, setOffices] = useState<Array<{ id: string; name: string }>>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ office_id: "", label: "" });
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const authHeaders = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Not authenticated");
    return { Authorization: `Bearer ${token}` };
  };

  const load = async () => {
    try {
      const headers = await authHeaders();
      const res = await list({ headers });
      if (res.ok) setKeys(res.keys);
      else toast.error(res.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    }
  };

  useEffect(() => {
    void load();
    void supabase.from("offices").select("id, name").order("name").then(({ data }) => {
      setOffices((data ?? []) as Array<{ id: string; name: string }>);
    });
  }, []);

  const onCreate = async () => {
    if (!form.office_id || !form.label.trim()) { toast.error("Office and label required"); return; }
    try {
      const headers = await authHeaders();
      const res = await create({ data: { office_id: form.office_id, label: form.label.trim() }, headers });
      if (!res.ok) { toast.error(res.message); return; }
      setOpen(false);
      setForm({ office_id: "", label: "" });
      setNewToken(res.raw_token);
      setCopied(false);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const onRevoke = async (id: string) => {
    if (!confirm("Revoke this key? This cannot be undone.")) return;
    try {
      const headers = await authHeaders();
      const res = await revoke({ data: { id }, headers });
      if (!res.ok) { toast.error(res.message); return; }
      toast.success("Key revoked");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const copy = async () => {
    if (!newToken) return;
    await navigator.clipboard.writeText(newToken);
    setCopied(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
          <p className="text-sm text-muted-foreground">Per-office tokens for the Madara lead ingestion endpoint.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Generate key</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate API key</DialogTitle>
              <DialogDescription>The token is shown only once. Store it somewhere safe.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Office</Label>
                <Select value={form.office_id} onValueChange={(v) => setForm({ ...form, office_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select office" /></SelectTrigger>
                  <SelectContent>
                    {offices.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Label</Label>
                <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Madara production" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={onCreate}>Generate</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!newToken} onOpenChange={(o) => { if (!o) setNewToken(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save this key now</DialogTitle>
            <DialogDescription className="text-destructive">
              This is the only time the full token will be shown. After closing this dialog you will not be able to retrieve it again.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted p-3 font-mono text-xs break-all select-all">{newToken}</div>
          <DialogFooter>
            <Button variant="outline" onClick={copy}>
              {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button onClick={() => setNewToken(null)}>I saved it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Office</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Last used</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {keys.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">No API keys yet</TableCell></TableRow>
            )}
            {keys.map((k) => (
              <TableRow key={k.id}>
                <TableCell className="text-sm">{k.office_name ?? "—"}</TableCell>
                <TableCell className="text-sm">{k.label ?? "—"}</TableCell>
                <TableCell>
                  <span className={"text-xs px-2 py-0.5 rounded-full " + (k.status === "active" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                    {k.status}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(k.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "—"}</TableCell>
                <TableCell className="text-right">
                  {k.status === "active" && (
                    <Button size="sm" variant="ghost" onClick={() => onRevoke(k.id)}>Revoke</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
