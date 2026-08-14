import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Tag, ExternalLink, Pencil } from "lucide-react";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";


export const Route = createFileRoute("/sources")({ component: Page });

interface Source { id: string; name: string; created_at: string }

function Page() {
  return <ProtectedRoute roles={["admin"]}><Content /></ProtectedRoute>;
}

function Content() {
  const [items, setItems] = useState<Source[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [extraSources, setExtraSources] = useState<string[]>([]);
  const [untagged, setUntagged] = useState<number>(0);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  // Rename dialog state
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameFrom, setRenameFrom] = useState<string>("");
  const [renameFromId, setRenameFromId] = useState<string | null>(null); // null for extras
  const [renameMode, setRenameMode] = useState<"existing" | "custom">("custom");
  const [renameExisting, setRenameExisting] = useState<string>("");
  const [renameCustom, setRenameCustom] = useState<string>("");
  const [renameBusy, setRenameBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("lead_sources" as never)
      .select("id, name, created_at")
      .order("name", { ascending: true });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as unknown as Source[];
    setItems(rows);

    const entries = await Promise.all(
      rows.map(async (s) => {
        const { count } = await supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("source", s.name)
          .is("deleted_at", null);
        return [s.name, count ?? 0] as const;
      }),
    );
    setUsage(Object.fromEntries(entries));

    const registered = new Set(rows.map((r) => r.name));
    const { data: distinctRows } = await supabase
      .from("leads")
      .select("source")
      .not("source", "is", null)
      .is("deleted_at", null)
      .limit(20000);
    const found = new Set<string>();
    for (const r of (distinctRows ?? []) as Array<{ source: string | null }>) {
      const s = (r.source ?? "").trim();
      if (s && !registered.has(s)) found.add(s);
    }
    const extras = Array.from(found).sort((a, b) => a.localeCompare(b));
    setExtraSources(extras);
    const extraEntries = await Promise.all(
      extras.map(async (s) => {
        const { count } = await supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("source", s)
          .is("deleted_at", null);
        return [s, count ?? 0] as const;
      }),
    );
    setUsage((prev) => ({ ...prev, ...Object.fromEntries(extraEntries) }));

    const { count: noSourceCount } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .is("source", null)
      .is("deleted_at", null);
    setUntagged(noSourceCount ?? 0);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const create = async () => {
    const n = name.trim();
    if (!n) { toast.error("Name required"); return; }
    const { error } = await supabase.from("lead_sources" as never).insert({ name: n } as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Source added");
    setName(""); setOpen(false);
    void load();
  };

  const remove = async (s: Source) => {
    if (!confirm(`Delete source "${s.name}"? Existing leads keep the tag.`)) return;
    const { error } = await supabase.from("lead_sources" as never).delete().eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    void load();
  };

  const registerExtra = async (nameToAdd: string) => {
    const { error } = await supabase.from("lead_sources" as never).insert({ name: nameToAdd } as never);
    if (error) { toast.error(error.message); return; }
    toast.success(`"${nameToAdd}" registered`);
    void load();
  };

  const openRename = (from: string, fromId: string | null) => {
    setRenameFrom(from);
    setRenameFromId(fromId);
    setRenameMode("custom");
    setRenameExisting("");
    setRenameCustom(from);
    setRenameOpen(true);
  };

  const allSourceNames = useMemo(() => {
    const s = new Set<string>();
    for (const r of items) s.add(r.name);
    for (const e of extraSources) s.add(e);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [items, extraSources]);

  const submitRename = async () => {
    const target = (renameMode === "existing" ? renameExisting : renameCustom).trim();
    if (!target) { toast.error("Choose or type a new source name"); return; }
    if (target === renameFrom) { toast.error("Same name — nothing to change"); return; }

    const targetExists = allSourceNames.includes(target);
    const affected = usage[renameFrom] ?? 0;
    const merging = targetExists;
    const msg = merging
      ? `Merge "${renameFrom}" into existing "${target}"?\n${affected} lead(s) will be re-tagged.`
      : `Rename "${renameFrom}" to "${target}"?\n${affected} lead(s) will be re-tagged.`;
    if (!confirm(msg)) return;

    setRenameBusy(true);
    try {
      // 1. Re-tag all leads with the old source.
      const { error: updErr } = await supabase
        .from("leads")
        .update({ source: target })
        .eq("source", renameFrom)
        .is("deleted_at", null);
      if (updErr) throw updErr;

      // 2. Update the lead_sources row if this was a registered source.
      if (renameFromId) {
        if (merging) {
          // Target already exists — just drop the old registration row.
          const { error: delErr } = await supabase
            .from("lead_sources" as never).delete().eq("id", renameFromId);
          if (delErr) throw delErr;
        } else {
          const { error: renErr } = await supabase
            .from("lead_sources" as never)
            .update({ name: target } as never)
            .eq("id", renameFromId);
          if (renErr) throw renErr;
        }
      } else if (!merging) {
        // Extra (unregistered) source renamed to a brand-new name — register it.
        await supabase.from("lead_sources" as never).insert({ name: target } as never);
      }

      toast.success(merging ? `Merged into "${target}"` : `Renamed to "${target}"`);
      setRenameOpen(false);
      void load();
    } catch (e) {
      const err = e as { message?: string };
      toast.error(err.message ?? "Rename failed");
    } finally {
      setRenameBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
          <p className="text-sm text-muted-foreground">
            Manage lead sources. Click a row to see all leads with that source. Sources used on leads but not yet registered are listed below.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> New source</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add source</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void create(); }}
                placeholder="e.g. Facebook Ads, Newsletter, Referral"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={create}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Leads</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">Loading…</TableCell></TableRow>
            )}
            {!loading && items.length === 0 && extraSources.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">No sources yet</TableCell></TableRow>
            )}
            {items.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-2">
                    <Tag className="h-3.5 w-3.5 text-primary" />
                    {s.name}
                  </span>
                </TableCell>
                <TableCell className="text-sm">
                  <Link
                    to="/leads"
                    search={{ source: [s.name], page: 1 } as never}
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    {usage[s.name] ?? 0}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => openRename(s.name, s.id)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Rename
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(s)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {untagged > 0 && (
              <TableRow className="bg-muted/30">
                <TableCell className="font-medium italic text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Tag className="h-3.5 w-3.5" />
                    (no source)
                  </span>
                </TableCell>
                <TableCell className="text-sm">{untagged}</TableCell>
                <TableCell />
                <TableCell />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {extraSources.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Used on leads but not registered</h2>
          <p className="text-xs text-muted-foreground">
            These source tags appear on existing leads (from imports, API, or older data) but aren't in your list. Register them to make them selectable in the Add-lead and Import dialogs.
          </p>
          <div className="border rounded-lg bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {extraSources.map((s) => (
                  <TableRow key={s}>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                        {s}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      <Link
                        to="/leads"
                        search={{ source: [s], page: 1 } as never}
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {usage[s] ?? 0}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => openRename(s, null)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Rename
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => registerExtra(s)}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Register
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename / merge source</DialogTitle>
            <DialogDescription>
              Change <span className="font-medium text-foreground">"{renameFrom}"</span> to another name. All{" "}
              {usage[renameFrom] ?? 0} lead(s) currently tagged with it will be re-tagged. Picking an
              existing source will merge them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Mode</Label>
              <Select value={renameMode} onValueChange={(v) => setRenameMode(v as "existing" | "custom")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="existing">Select existing source (merge)</SelectItem>
                  <SelectItem value="custom">Type a new / custom name</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {renameMode === "existing" ? (
              <div className="space-y-2">
                <Label>Target source</Label>
                <Select value={renameExisting} onValueChange={setRenameExisting}>
                  <SelectTrigger><SelectValue placeholder="Choose a source…" /></SelectTrigger>
                  <SelectContent>
                    {allSourceNames
                      .filter((n) => n !== renameFrom)
                      .map((n) => (
                        <SelectItem key={n} value={n}>{n}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>New name</Label>
                <Input
                  value={renameCustom}
                  onChange={(e) => setRenameCustom(e.target.value)}
                  placeholder="e.g. Facebook Ads"
                  autoFocus
                />
                {renameCustom.trim() && allSourceNames.includes(renameCustom.trim()) && renameCustom.trim() !== renameFrom && (
                  <p className="text-xs text-muted-foreground">
                    "{renameCustom.trim()}" already exists — this will merge into it.
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)} disabled={renameBusy}>Cancel</Button>
            <Button onClick={submitRename} disabled={renameBusy}>
              {renameBusy ? "Saving…" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
