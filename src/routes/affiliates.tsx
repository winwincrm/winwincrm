import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Copy, Check, KeyRound } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useServerFn } from "@tanstack/react-start";
import {
  listAffiliates, createAffiliate, setAffiliateStatus,
  listAffiliateApiKeys, createAffiliateApiKey, revokeAffiliateApiKey,
  type Affiliate, type AffiliateKey,
} from "@/lib/affiliates.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/affiliates")({ component: Page });

function Page() {
  return <ProtectedRoute roles={["admin"]}><Content /></ProtectedRoute>;
}

function Content() {
  const list = useServerFn(listAffiliates);
  const create = useServerFn(createAffiliate);
  const toggleStatus = useServerFn(setAffiliateStatus);

  const [items, setItems] = useState<Affiliate[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Affiliate | null>(null);

  const load = async () => {
    try { setItems(await list()); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };
  useEffect(() => { void load(); }, []);

  const onCreate = async () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    try {
      await create({ data: { name: name.trim() } });
      setOpen(false); setName("");
      toast.success("Affiliate created");
      void load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const onToggle = async (a: Affiliate) => {
    try {
      await toggleStatus({ data: { id: a.id, status: a.status === "active" ? "inactive" : "active" } });
      void load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const endpoint = "https://madaraos.purpleskies.pro/api/public/affiliate/leads/ingest";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Affiliates</h1>
          <p className="text-sm text-muted-foreground">External partners who push live leads to the inbox via the public API.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New affiliate</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create affiliate</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Marketing" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={onCreate}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-lg bg-card p-4 space-y-2">
        <div className="text-sm font-medium">Ingest endpoint</div>
        <code className="block text-xs bg-muted p-2 rounded select-all break-all">POST {endpoint}</code>
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Example curl</summary>
          <pre className="mt-2 bg-muted p-2 rounded overflow-x-auto text-[11px]">{`curl -X POST ${endpoint} \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "full_name": "Max Mustermann",
    "email": "max@example.com",
    "phone": "+49 170 1234567",
    "amount": 50000,
    "percentage": 5.5,
    "timeframe": "3 months",
    "external_lead_id": "your-internal-id-123"
  }'`}</pre>
        </details>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Keys</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">No affiliates yet</TableCell></TableRow>
            )}
            {items.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell>
                  <span className={"text-xs px-2 py-0.5 rounded-full " + (a.status === "active" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                    {a.status}
                  </span>
                </TableCell>
                <TableCell className="text-sm">{a.key_count}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Button size="sm" variant="outline" onClick={() => setSelected(a)}>
                    <KeyRound className="h-3.5 w-3.5 mr-1" /> Keys
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onToggle(a)}>
                    {a.status === "active" ? "Disable" : "Enable"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {selected && <KeysDialog affiliate={selected} onClose={() => { setSelected(null); void load(); }} />}
    </div>
  );
}

function KeysDialog({ affiliate, onClose }: { affiliate: Affiliate; onClose: () => void }) {
  const list = useServerFn(listAffiliateApiKeys);
  const create = useServerFn(createAffiliateApiKey);
  const revoke = useServerFn(revokeAffiliateApiKey);

  const [keys, setKeys] = useState<AffiliateKey[]>([]);
  const [label, setLabel] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    try { setKeys(await list({ data: { affiliate_id: affiliate.id } })); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };
  useEffect(() => { void load(); }, [affiliate.id]);

  const onCreate = async () => {
    if (!label.trim()) { toast.error("Label required"); return; }
    try {
      const res = await create({ data: { affiliate_id: affiliate.id, label: label.trim() } });
      setNewToken(res.raw_token);
      setCopied(false);
      setLabel("");
      void load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const onRevoke = async (id: string) => {
    if (!confirm("Revoke this key?")) return;
    try {
      await revoke({ data: { id } });
      toast.success("Revoked");
      void load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const copy = async () => {
    if (!newToken) return;
    await navigator.clipboard.writeText(newToken);
    setCopied(true);
  };

  return (
    <>
      <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>API keys — {affiliate.name}</DialogTitle>
            <DialogDescription>Each key is shown once at creation. Store it safely.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Key label (e.g. Production)" className="flex-1" />
            <Button onClick={onCreate}><Plus className="h-4 w-4 mr-1" /> Generate</Button>
          </div>
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {keys.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">No keys</TableCell></TableRow>
                )}
                {keys.map((k) => (
                  <TableRow key={k.id}>
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
        </DialogContent>
      </Dialog>

      <Dialog open={!!newToken} onOpenChange={(o) => { if (!o) setNewToken(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save this key now</DialogTitle>
            <DialogDescription className="text-destructive">
              This is the only time the full token will be shown.
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
    </>
  );
}
