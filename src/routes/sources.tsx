import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

export const Route = createFileRoute("/sources")({ component: Page });

const GLOBAL_SCOPE = "__global__";

interface Source {
  id: string;
  name: string;
  office_id: string | null;
  created_at: string;
}

interface Office {
  id: string;
  name: string;
  status: string;
}

function Page() {
  return (
    <ProtectedRoute roles={["admin"]}>
      <Content />
    </ProtectedRoute>
  );
}

function Content() {
  const [items, setItems] = useState<Source[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [extraSources, setExtraSources] = useState<string[]>([]);
  const [untagged, setUntagged] = useState(0);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState(GLOBAL_SCOPE);
  const [creating, setCreating] = useState(false);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameFrom, setRenameFrom] = useState("");
  const [renameFromId, setRenameFromId] = useState<string | null>(null);
  const [renameFromOfficeId, setRenameFromOfficeId] = useState<string | null | undefined>(
    undefined,
  );
  const [renameMode, setRenameMode] = useState<"existing" | "custom">("custom");
  const [renameExisting, setRenameExisting] = useState("");
  const [renameCustom, setRenameCustom] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  const officeById = useMemo(
    () => new Map(offices.map((office) => [office.id, office])),
    [offices],
  );

  const scopeLabel = (officeId: string | null) =>
    officeId ? (officeById.get(officeId)?.name ?? "Unknown office") : "Global";

  const load = async () => {
    setLoading(true);
    const [sourcesResult, officesResult] = await Promise.all([
      supabase
        .from("lead_sources")
        .select("id, name, office_id, created_at")
        .order("name", { ascending: true }),
      supabase.from("offices").select("id, name, status").order("name", { ascending: true }),
    ]);

    if (sourcesResult.error) {
      toast.error(sourcesResult.error.message);
      setLoading(false);
      return;
    }
    if (officesResult.error) {
      toast.error(officesResult.error.message);
      setLoading(false);
      return;
    }

    const rows = (sourcesResult.data ?? []) as Source[];
    setItems(rows);
    setOffices((officesResult.data ?? []) as Office[]);

    const entries = await Promise.all(
      rows.map(async (source) => {
        const baseQuery = supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("source", source.name)
          .is("deleted_at", null);
        const { count } = source.office_id
          ? await baseQuery.eq("office_id", source.office_id)
          : await baseQuery;
        return [source.name, count ?? 0] as const;
      }),
    );
    const nextUsage = Object.fromEntries(entries) as Record<string, number>;

    const registered = new Set(rows.map((row) => row.name));
    const { data: distinctRows, error: distinctError } = await supabase
      .from("leads")
      .select("source")
      .not("source", "is", null)
      .is("deleted_at", null)
      .limit(20000);
    if (distinctError) toast.error(distinctError.message);

    const found = new Set<string>();
    for (const row of (distinctRows ?? []) as Array<{ source: string | null }>) {
      const source = (row.source ?? "").trim();
      if (source && !registered.has(source)) found.add(source);
    }
    const extras = Array.from(found).sort((a, b) => a.localeCompare(b));
    setExtraSources(extras);

    const extraEntries = await Promise.all(
      extras.map(async (source) => {
        const { count } = await supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("source", source)
          .is("deleted_at", null);
        return [source, count ?? 0] as const;
      }),
    );
    for (const [source, count] of extraEntries) nextUsage[source] = count;
    setUsage(nextUsage);

    const { count: noSourceCount } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .is("source", null)
      .is("deleted_at", null);
    setUntagged(noSourceCount ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreate = (initialName = "") => {
    setName(initialName);
    setScope(GLOBAL_SCOPE);
    setOpen(true);
  };

  const create = async () => {
    const sourceName = name.trim();
    if (!sourceName) {
      toast.error("Name required");
      return;
    }

    setCreating(true);
    const { error } = await supabase.from("lead_sources").insert({
      name: sourceName,
      office_id: scope === GLOBAL_SCOPE ? null : scope,
    });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Source added as ${scope === GLOBAL_SCOPE ? "Global" : scopeLabel(scope)}`);
    setOpen(false);
    void load();
  };

  const changeScope = async (source: Source, value: string) => {
    const officeId = value === GLOBAL_SCOPE ? null : value;
    if (officeId === source.office_id) return;
    const label = scopeLabel(officeId);
    const warning = officeId
      ? `Assign "${source.name}" to ${label}? It will only be selectable for leads in that office.`
      : `Make "${source.name}" Global? It will be selectable in every office.`;
    if (!confirm(warning)) return;

    const { error } = await supabase
      .from("lead_sources")
      .update({ office_id: officeId })
      .eq("id", source.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Source scope changed to ${label}`);
    void load();
  };

  const remove = async (source: Source) => {
    if (!confirm(`Delete source "${source.name}"? Existing leads keep the tag.`)) return;
    const { error } = await supabase.from("lead_sources").delete().eq("id", source.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deleted");
    void load();
  };

  const openRename = (sourceName: string, id: string | null, officeId?: string | null) => {
    setRenameFrom(sourceName);
    setRenameFromId(id);
    setRenameFromOfficeId(id ? (officeId ?? null) : undefined);
    setRenameMode("custom");
    setRenameExisting("");
    setRenameCustom(sourceName);
    setRenameOpen(true);
  };

  const allSourceNames = useMemo(() => {
    const names = new Set<string>();
    for (const source of items) names.add(source.name);
    for (const source of extraSources) names.add(source);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [items, extraSources]);

  const submitRename = async () => {
    const target = (renameMode === "existing" ? renameExisting : renameCustom).trim();
    if (!target) {
      toast.error("Choose or type a new source name");
      return;
    }
    if (target === renameFrom) {
      toast.error("Same name — nothing to change");
      return;
    }

    const targetExists = allSourceNames.includes(target);
    const targetRegistration = items.find((source) => source.name === target);
    if (
      targetRegistration?.office_id &&
      (renameFromOfficeId === undefined || renameFromOfficeId !== targetRegistration.office_id)
    ) {
      toast.error(
        `Only sources already assigned to ${scopeLabel(targetRegistration.office_id)} can merge into that office source.`,
      );
      return;
    }

    const affected = usage[renameFrom] ?? 0;
    const message = targetExists
      ? `Merge "${renameFrom}" into existing "${target}"?\n${affected} lead(s) will be re-tagged.`
      : `Rename "${renameFrom}" to "${target}"?\n${affected} lead(s) will be re-tagged.`;
    if (!confirm(message)) return;

    setRenameBusy(true);
    try {
      const leadUpdate =
        renameFromId && renameFromOfficeId
          ? supabase
              .from("leads")
              .update({ source: target })
              .eq("source", renameFrom)
              .eq("office_id", renameFromOfficeId)
              .is("deleted_at", null)
          : supabase
              .from("leads")
              .update({ source: target })
              .eq("source", renameFrom)
              .is("deleted_at", null);
      const { error: updateError } = await leadUpdate;
      if (updateError) throw updateError;

      if (renameFromId) {
        if (targetExists) {
          const { error } = await supabase.from("lead_sources").delete().eq("id", renameFromId);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("lead_sources")
            .update({ name: target })
            .eq("id", renameFromId);
          if (error) throw error;
        }
      } else if (!targetExists) {
        const { error } = await supabase
          .from("lead_sources")
          .insert({ name: target, office_id: null });
        if (error) throw error;
      }

      toast.success(targetExists ? `Merged into "${target}"` : `Renamed to "${target}"`);
      setRenameOpen(false);
      void load();
    } catch (error) {
      toast.error((error as { message?: string }).message ?? "Rename failed");
    } finally {
      setRenameBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
          <p className="text-sm text-muted-foreground">
            Global sources work in every office. Office sources can only be selected and used in
            their assigned office.
          </p>
        </div>
        <Button onClick={() => openCreate()}>
          <Plus className="h-4 w-4 mr-1" /> New source
        </Button>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Scope / office</TableHead>
              <TableHead>Leads</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!loading && items.length === 0 && extraSources.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  No sources yet
                </TableCell>
              </TableRow>
            )}
            {items.map((source) => (
              <TableRow key={source.id}>
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-2">
                    <Tag className="h-3.5 w-3.5 text-primary" />
                    {source.name}
                  </span>
                </TableCell>
                <TableCell className="min-w-52">
                  <Select
                    value={source.office_id ?? GLOBAL_SCOPE}
                    onValueChange={(value) => {
                      void changeScope(source, value);
                    }}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={GLOBAL_SCOPE}>Global (all offices)</SelectItem>
                      {offices.map((office) => (
                        <SelectItem
                          key={office.id}
                          value={office.id}
                          disabled={office.status !== "active" && source.office_id !== office.id}
                        >
                          {office.name}
                          {office.status !== "active" ? " (inactive)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-sm">
                  <Link
                    to="/leads"
                    search={
                      {
                        source: [source.name],
                        office: source.office_id ? [source.office_id] : undefined,
                        page: 1,
                      } as never
                    }
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    {usage[source.name] ?? 0}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(source.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openRename(source.name, source.id, source.office_id)}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void remove(source);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {untagged > 0 && (
              <TableRow className="bg-muted/30">
                <TableCell className="font-medium italic text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Tag className="h-3.5 w-3.5" /> (no source)
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">Not registered</TableCell>
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
            Register a tag and choose whether it is Global or belongs to one office.
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
                {extraSources.map((source) => (
                  <TableRow key={source}>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        <Tag className="h-3.5 w-3.5 text-muted-foreground" /> {source}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      <Link
                        to="/leads"
                        search={{ source: [source], page: 1 } as never}
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {usage[source] ?? 0}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => openRename(source, null)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Rename
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openCreate(source)}>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {extraSources.includes(name) ? "Register source" : "Add source"}
            </DialogTitle>
            <DialogDescription>
              Choose Global for an independent source, or assign it to exactly one office.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void create();
                }}
                placeholder="e.g. Facebook Ads, Newsletter, Referral"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Scope / office</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GLOBAL_SCOPE}>Global (all offices)</SelectItem>
                  {offices.map((office) => (
                    <SelectItem
                      key={office.id}
                      value={office.id}
                      disabled={office.status !== "active"}
                    >
                      {office.name}
                      {office.status !== "active" ? " (inactive)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Office sources are visible and selectable only for users working in that office.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                void create();
              }}
              disabled={creating}
            >
              {creating ? "Saving…" : "Save source"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename / merge source</DialogTitle>
            <DialogDescription>
              Change <span className="font-medium text-foreground">"{renameFrom}"</span>. The{" "}
              {usage[renameFrom] ?? 0} lead(s) in its current scope will be re-tagged. Picking an
              existing source merges them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Mode</Label>
              <Select
                value={renameMode}
                onValueChange={(value) => setRenameMode(value as "existing" | "custom")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a source…" />
                  </SelectTrigger>
                  <SelectContent>
                    {allSourceNames
                      .filter((source) => source !== renameFrom)
                      .map((source) => {
                        const registration = items.find((item) => item.name === source);
                        return (
                          <SelectItem key={source} value={source}>
                            {source}
                            {registration
                              ? ` · ${scopeLabel(registration.office_id)}`
                              : " · Unregistered"}
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>New name</Label>
                <Input
                  value={renameCustom}
                  onChange={(event) => setRenameCustom(event.target.value)}
                  placeholder="e.g. Facebook Ads"
                  autoFocus
                />
                {renameCustom.trim() &&
                  allSourceNames.includes(renameCustom.trim()) &&
                  renameCustom.trim() !== renameFrom && (
                    <p className="text-xs text-muted-foreground">
                      "{renameCustom.trim()}" already exists — this will merge into it.
                    </p>
                  )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)} disabled={renameBusy}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                void submitRename();
              }}
              disabled={renameBusy}
            >
              {renameBusy ? "Saving…" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
