// Server-side Google Sheet auto-sync worker.
//
// One run = read the sheet, then for every row:
//   * new row            → insert a lead (unless an existing lead already has that email/phone)
//   * changed cell(s)    → update the lead that row created
//   * unchanged row      → nothing
// Row identity is stored in sheet_sync_rows, so re-reads are idempotent and a
// cell edit reliably updates the same lead instead of creating a duplicate.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchSheetCsvFromUrl } from "@/lib/sheets.server";
import { buildSheetRows, parseSheetCsv, autoMapTable, type SheetMapping } from "@/lib/sheet-mapping";
import { emailVariants } from "@/lib/email-normalize";

export type SheetSync = {
  id: string;
  name: string;
  sheet_url: string;
  office_id: string | null;
  assigned_user_id: string | null;
  source: string | null;
  list_name: string | null;
  mapping: SheetMapping | null;
  interval_seconds: number;
  enabled: boolean;
  update_existing: boolean;
  consecutive_failures: number;
};

export type SyncResult = {
  inserted: number;
  updated: number;
  skipped: number;
  /** Sheet rows not imported because the same email/phone already exists. */
  duplicates: number;
  rows: number;
};

const UPDATABLE = [
  "full_name", "first_name", "last_name", "email", "phone", "amount", "timeframe",
  "description_1", "description_2", "description_3", "description_4", "payload",
  "origin_agent_name",
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

export async function runSheetSync(sync: SheetSync): Promise<SyncResult> {
  const { csv } = await fetchSheetCsvFromUrl(sync.sheet_url);
  const { headers, rows } = parseSheetCsv(csv);
  if (headers.length === 0) throw new Error("The sheet has no header row");

  const mapping = autoMapTable(headers, sync.mapping ?? undefined);
  const builtRaw = buildSheetRows(rows, mapping);

  // Two sheet rows can produce the same row identity (same email/phone, or both
  // empty). Keeping both would insert the lead twice AND make the tracking
  // upsert fail ("cannot affect row a second time"), so the next tick would
  // insert them all over again. Keep the first occurrence only.
  const seenKeys = new Map<string, number>();
  const built: typeof builtRaw = [];
  const inSheetDupRows: Array<{ row: Record<string, unknown>; key: string; firstRow: number; atRow: number }> = [];
  builtRaw.forEach((b, i) => {
    const firstRow = seenKeys.get(b.rowKey);
    if (firstRow !== undefined) {
      inSheetDupRows.push({ row: b.insert, key: b.rowKey, firstRow, atRow: i + 2 });
      return;
    }
    seenKeys.set(b.rowKey, i + 2);
    built.push(b);
  });
  const inSheetDuplicates = inSheetDupRows.length;



  // Everything this sync has already imported.
  const { data: trackedRows, error: trackedErr } = await db()
    .from("sheet_sync_rows").select("row_key, lead_id, content_hash").eq("sync_id", sync.id);
  if (trackedErr) throw new Error(trackedErr.message);
  const tracked = new Map<string, { lead_id: string | null; content_hash: string }>();
  for (const r of (trackedRows ?? []) as Array<{ row_key: string; lead_id: string | null; content_hash: string }>) {
    tracked.set(r.row_key, { lead_id: r.lead_id, content_hash: r.content_hash });
  }

  // Which tracked leads still exist (a deleted lead should be re-created).
  const trackedIds = [...tracked.values()].map((v) => v.lead_id).filter(Boolean) as string[];
  const alive = new Set<string>();
  for (let i = 0; i < trackedIds.length; i += 500) {
    const { data } = await db().from("leads").select("id")
      .in("id", trackedIds.slice(i, i + 500)).is("deleted_at", null);
    for (const r of (data ?? []) as Array<{ id: string }>) alive.add(r.id);
  }

  const result: SyncResult = {
    inserted: 0,
    updated: 0,
    skipped: inSheetDuplicates,
    duplicates: inSheetDuplicates,
    rows: builtRaw.length,
  };
  const toInsert: Array<{ row: Record<string, unknown>; key: string; hash: string; comment?: string }> = [];
  const events: SyncEvent[] = [];
  // Repeated rows stay in the sheet, so this is true on every tick. Log one
  // detailed event per repeated row, but only the first time we ever see it —
  // otherwise the bell fires the same toast every few seconds.
  const loggedDuplicateDetails: string[] = [];
  {
    const { data: pastDups } = await db()
      .from("sheet_sync_events")
      .select("detail")
      .eq("sync_id", sync.id)
      .eq("kind", "duplicate")
      .order("created_at", { ascending: false })
      .limit(300);
    for (const r of (pastDups ?? []) as Array<{ detail: string | null }>) {
      if (r.detail) loggedDuplicateDetails.push(r.detail);
    }
  }
  const duplicateWasLogged = (detail: string) =>
    loggedDuplicateDetails.some((logged) => logged === detail || logged.startsWith(`${detail}\nExisting lead:`));
  const inSheetOwnerFix: Array<{ ev: SyncEvent; leadId: string }> = [];
  for (const d of inSheetDupRows) {
    const detail = [
      `sheet row ${d.atRow} is the same person as sheet row ${d.firstRow} — only row ${d.firstRow} was imported`,
      ...rowSummary(d.row),
    ].join("\n");
    if (duplicateWasLogged(detail)) continue;
    loggedDuplicateDetails.push(detail);
    const leadId = tracked.get(d.key)?.lead_id ?? null;
    const ev: SyncEvent = {
      kind: "duplicate",
      lead_name: leadLabel(d.row),
      detail,
      ...(leadId ? { lead_id: leadId } : {}),
    };
    events.push(ev);
    if (leadId) inSheetOwnerFix.push({ ev, leadId });
  }

  // Show which agent / office already owns the lead the first row created.
  if (inSheetOwnerFix.length > 0) {
    const ids = [...new Set(inSheetOwnerFix.map((d) => d.leadId))];
    const ownerById = new Map<string, {
      full_name: string | null; office_id: string | null; assigned_user_id: string | null; status: string | null;
    }>();
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await db().from("leads")
        .select("id, full_name, office_id, assigned_user_id, status")
        .in("id", ids.slice(i, i + 300));
      for (const r of (data ?? []) as Array<{
        id: string; full_name: string | null; office_id: string | null; assigned_user_id: string | null; status: string | null;
      }>) ownerById.set(r.id, r);
    }
    const officeIds = new Set<string>();
    const userIds = new Set<string>();
    for (const m of ownerById.values()) {
      if (m.office_id) officeIds.add(m.office_id);
      if (m.assigned_user_id) userIds.add(m.assigned_user_id);
    }
    const [oRes, pRes] = await Promise.all([
      officeIds.size ? db().from("offices").select("id, name").in("id", [...officeIds]) : Promise.resolve({ data: [] }),
      userIds.size ? db().from("profiles").select("user_id, full_name, email").in("user_id", [...userIds]) : Promise.resolve({ data: [] }),
    ]);
    const officeNames = new Map<string, string>(
      ((oRes.data ?? []) as Array<{ id: string; name: string }>).map((o) => [o.id, o.name]),
    );
    const agentNames = new Map<string, string>(
      ((pRes.data ?? []) as Array<{ user_id: string; full_name: string | null; email: string | null }>)
        .map((p) => [p.user_id, p.full_name || p.email || "Unknown"]),
    );
    for (const { ev, leadId } of inSheetOwnerFix) {
      const m = ownerById.get(leadId);
      if (!m) continue;
      const office = m.office_id ? (officeNames.get(m.office_id) ?? "Unknown office") : "Admin inbox";
      const agentLabel = m.assigned_user_id ? (agentNames.get(m.assigned_user_id) ?? "Unknown agent") : "Unassigned";
      ev.detail = [
        ev.detail,
        `Existing lead: ${m.full_name || "Unnamed"} · agent: ${agentLabel} · office: ${office}${m.status ? ` · status: ${m.status}` : ""}`,
      ].join("\n");
    }
  }






  const seenRowKeys = new Set<string>();
  for (const b of built) {
    seenRowKeys.add(b.rowKey);
    const prev = tracked.get(b.rowKey);
    // A tracking row with no lead is an intentional deletion tombstone. Keep
    // it suppressed while the source row remains in the sheet; deleting the
    // sheet row below removes the tombstone, so a later re-add imports again.
    if (prev && !prev.lead_id) {
      result.skipped++;
      if (prev.content_hash !== b.contentHash) {
        await db().from("sheet_sync_rows")
          .update({ content_hash: b.contentHash, updated_at: new Date().toISOString() })
          .eq("sync_id", sync.id).eq("row_key", b.rowKey);
      }
      continue;
    }
    if (prev?.lead_id && alive.has(prev.lead_id)) {
      if (prev.content_hash === b.contentHash) { result.skipped++; continue; }
      if (sync.update_existing) {
        const patch: Record<string, unknown> = {};
        for (const f of UPDATABLE) if (b.insert[f] !== undefined) patch[f] = b.insert[f];
        if (Object.keys(patch).length > 0) {
          // Read the current values first so the notification can name what changed.
          const { data: before } = await db().from("leads")
            .select(UPDATABLE.join(", ")).eq("id", prev.lead_id).maybeSingle();
          const prevRow = (before ?? {}) as Record<string, unknown>;
          const changes = Object.keys(patch)
            .map((f) => ({ f, from: String(prevRow[f] ?? ""), to: String(patch[f] ?? "") }))
            .filter((c) => c.from !== c.to);
          const { error } = await db().from("leads").update(patch).eq("id", prev.lead_id);
          if (error) throw new Error(error.message);
          const filled = changes.filter((c) => c.from.trim() === "" && c.to.trim() !== "").length;
          const cleared = changes.filter((c) => c.to.trim() === "" && c.from.trim() !== "").length;
          const edited = changes.length - filled - cleared;
          const summary =
            changes.length === 0 ? "row re-saved (no visible field changed)"
            : changes.length === 1 ? "1 cell changed"
            : `${changes.length} cells changed${changes.length >= 4 ? " (whole row rewritten)" : ""}`;
          const parts = [
            summary,
            [
              edited ? `${edited} edited` : "",
              filled ? `${filled} filled in` : "",
              cleared ? `${cleared} cleared` : "",
            ].filter(Boolean).join(", "),
          ].filter(Boolean).join(" — ");
          events.push({
            kind: "updated",
            lead_id: prev.lead_id,
            lead_name: leadLabel(b.insert),
            detail: [
              parts,
              ...changes.map((c) => `${fieldLabel(c.f)}: ${short(c.from)} → ${short(c.to)}`),
            ].join("\n"),
          });
        }
        result.updated++;
      } else result.skipped++;
      await db().from("sheet_sync_rows")
        .update({ content_hash: b.contentHash, updated_at: new Date().toISOString() })
        .eq("sync_id", sync.id).eq("row_key", b.rowKey);
      continue;
    }

    // The sheet row was imported before but the lead no longer exists in the CRM.
    if (prev?.lead_id && !alive.has(prev.lead_id)) {
      events.push({
        kind: "restored",
        lead_name: leadLabel(b.insert),
        detail: "the lead created from this sheet row was deleted in the CRM — the row is still in the sheet, so it is imported again",
      });
    }

    const row: Record<string, unknown> = {
      office_id: sync.office_id,
      assigned_user_id: sync.assigned_user_id,
      ...b.insert,
      platform: (b.insert.platform as string | undefined) || sync.list_name || sync.name || "Google Sheet",
      source: sync.source || (b.insert.source as string | undefined) || "google_sheet",
      status: "new",
    };
    toInsert.push({ row, key: b.rowKey, hash: b.contentHash, comment: b.comment });
  }

  // Rows that vanished from the sheet since the last run.
  const removedKeys = [...tracked.keys()].filter((k) => !seenRowKeys.has(k));
  if (removedKeys.length > 0) {
    const removedIds = removedKeys.map((k) => tracked.get(k)?.lead_id).filter(Boolean) as string[];
    const names = new Map<string, string>();
    const infos = new Map<string, string[]>();
    for (let i = 0; i < removedIds.length; i += 500) {
      const { data } = await db().from("leads")
        .select("id, full_name, first_name, last_name, email, phone")
        .in("id", removedIds.slice(i, i + 500));
      for (const r of (data ?? []) as Array<Record<string, unknown>>) {
        names.set(String(r.id), leadLabel(r));
        infos.set(String(r.id), [
          String(r.email ?? "").trim() ? `Email: ${short(String(r.email))}` : "",
          String(r.phone ?? "").trim() ? `Phone: ${short(String(r.phone))}` : "",
        ].filter(Boolean));
      }
    }
    for (const k of removedKeys) {
      const leadId = tracked.get(k)?.lead_id ?? null;
      const stillHere = !!leadId && alive.has(leadId);
      events.push({
        kind: "deleted",
        lead_id: stillHere ? leadId : null,
        lead_name: (leadId && names.get(leadId)) || null,
        detail: [
          stillHere
            ? "this row was deleted from the Google Sheet — the lead it created is kept in the CRM and is no longer linked to the sheet"
            : leadId
              ? "this row was deleted from the Google Sheet — its lead had already been deleted in the CRM too"
              : "this row was deleted from the Google Sheet — it had never created a lead (it was skipped as a duplicate or blocked earlier)",
          ...((leadId && infos.get(leadId)) || []),
        ].join("\n"),
      });
    }

    // Forget the tracking rows, otherwise re-adding the row in the sheet would be ignored.
    for (let i = 0; i < removedKeys.length; i += 200) {
      await db().from("sheet_sync_rows").delete()
        .eq("sync_id", sync.id).in("row_key", removedKeys.slice(i, i + 200));
    }
  }


  if (toInsert.length > 0) {
    // Never create a lead that already exists in the CRM (email or phone).
    const emails = new Set<string>();
    const k9s = new Set<string>();
    for (const t of toInsert) {
      for (const v of emailVariants(t.row.email as string | null)) emails.add(v);
      const d = String(t.row.phone ?? "").replace(/\D/g, "");
      if (d.length >= 9) k9s.add(d.slice(-9));
    }
    const existingEmails = new Set<string>();
    const existingByEmail = new Map<string, string>();
    const existingByK9 = new Map<string, string>();
    const emailList = [...emails];
    // Leads that this very sheet created earlier (tracking lost) are not real
    // duplicates — they get re-linked instead of queued for review.
    const wantSource = (sync.source ?? "").trim().toLowerCase();
    const wantPlatform = (sync.list_name || sync.name || "").trim().toLowerCase();
    const ownLeadIds = new Set<string>();
    type DupMeta = { full_name: string | null; office_id: string | null; assigned_user_id: string | null; status: string | null };
    const leadMeta = new Map<string, DupMeta>();
    const metaCols = "id, email, phone_k9, source, platform, full_name, office_id, assigned_user_id, status";
    type MetaRow = DupMeta & { id: string; email: string | null; phone_k9: string | null; source: string | null; platform: string | null };
    for (let i = 0; i < emailList.length; i += 200) {
      let query = db().from("leads").select(metaCols)
        .in("email", emailList.slice(i, i + 200)).is("deleted_at", null);
      if (sync.office_id) query = query.eq("office_id", sync.office_id);
      const { data } = await query;
      for (const r of (data ?? []) as MetaRow[]) {
        const key = (r.email ?? "").toLowerCase();
        if (key) { existingEmails.add(key); if (!existingByEmail.has(key)) existingByEmail.set(key, r.id); }
        leadMeta.set(r.id, { full_name: r.full_name, office_id: r.office_id, assigned_user_id: r.assigned_user_id, status: r.status });
        const s = (r.source ?? "").trim().toLowerCase();
        const p = (r.platform ?? "").trim().toLowerCase();
        if ((wantSource && s === wantSource) || (wantPlatform && p === wantPlatform)) ownLeadIds.add(r.id);
      }
    }
    const k9List = [...k9s];
    for (let i = 0; i < k9List.length; i += 200) {
      let query = db().from("leads").select(metaCols)
        .in("phone_k9", k9List.slice(i, i + 200)).is("deleted_at", null);
      if (sync.office_id) query = query.eq("office_id", sync.office_id);
      const { data } = await query;
      for (const r of (data ?? []) as MetaRow[]) {
        if (r.phone_k9 && !existingByK9.has(r.phone_k9)) existingByK9.set(r.phone_k9, r.id);
        leadMeta.set(r.id, { full_name: r.full_name, office_id: r.office_id, assigned_user_id: r.assigned_user_id, status: r.status });
        const s = (r.source ?? "").trim().toLowerCase();
        const p = (r.platform ?? "").trim().toLowerCase();
        if ((wantSource && s === wantSource) || (wantPlatform && p === wantPlatform)) ownLeadIds.add(r.id);
      }
    }


    const fresh: typeof toInsert = [];
    const links: Array<{ sync_id: string; row_key: string; lead_id: string; content_hash: string }> = [];
    const dupOwnerFix: Array<{ ev: SyncEvent; leadId: string }> = [];
    const seenEmail = new Set<string>();
    const seenK9 = new Set<string>();

    for (const t of toInsert) {
      const variants = emailVariants(t.row.email as string | null);
      const d = String(t.row.phone ?? "").replace(/\D/g, "");
      const k9 = d.length >= 9 ? d.slice(-9) : "";
      const hitEmail = variants.find((v) => existingByEmail.has(v));
      const dupLead = hitEmail ? existingByEmail.get(hitEmail)! : k9 ? existingByK9.get(k9) : undefined;
      const dupInBatch = variants.some((v) => seenEmail.has(v)) || (!!k9 && seenK9.has(k9));
      variants.forEach((v) => seenEmail.add(v));
      if (k9) seenK9.add(k9);
      if (dupLead && ownLeadIds.has(dupLead)) {
        // This sheet's own lead lost its tracking row — re-link it silently.
        links.push({ sync_id: sync.id, row_key: t.key, lead_id: dupLead, content_hash: t.hash });
        continue;
      }
      if (dupLead) {
        // Do NOT decide for the user: leave the row untracked so it shows up in
        // "Duplicates awaiting review" until someone skips / imports / links it.
        result.skipped++;
        result.duplicates++;
        const detail = [
          `this sheet row matches a lead already in the CRM by ${hitEmail ? "email" : "phone number"} — it is waiting for your decision in the Google Sheets page (skip and keep old, import anyway and keep both, or delete old and keep new)`,
          ...rowSummary(t.row),
        ].join("\n");
        if (!duplicateWasLogged(detail)) {
          loggedDuplicateDetails.push(detail);
          const ev: SyncEvent = {
            kind: "duplicate",
            lead_id: dupLead,
            lead_name: leadLabel(t.row),
            detail,
          };
          events.push(ev);
          dupOwnerFix.push({ ev, leadId: dupLead });
        }

        continue;
      }
      if (dupInBatch) {
        result.skipped++;
        result.duplicates++;
        const detail = [
          "another row in this same sheet has the same email/phone — it is waiting for your decision in the Google Sheets page (skip and keep old, import anyway and keep both, or delete old and keep new)",
          ...rowSummary(t.row),
        ].join("\n");
        if (!duplicateWasLogged(detail)) {
          loggedDuplicateDetails.push(detail);
          events.push({ kind: "duplicate", lead_name: leadLabel(t.row), detail });
        }
        continue;
      }


      fresh.push(t);
    }

    // Say who currently owns the lead the duplicate matched.
    if (dupOwnerFix.length > 0) {
      const ids = [...new Set(dupOwnerFix.map((d) => d.leadId))];
      const officeIds = new Set<string>();
      const userIds = new Set<string>();
      for (const id of ids) {
        const m = leadMeta.get(id);
        if (m?.office_id) officeIds.add(m.office_id);
        if (m?.assigned_user_id) userIds.add(m.assigned_user_id);
      }
      const [oRes, pRes] = await Promise.all([
        officeIds.size ? db().from("offices").select("id, name").in("id", [...officeIds]) : Promise.resolve({ data: [] }),
        userIds.size ? db().from("profiles").select("user_id, full_name, email").in("user_id", [...userIds]) : Promise.resolve({ data: [] }),
      ]);
      const officeNames = new Map<string, string>(
        ((oRes.data ?? []) as Array<{ id: string; name: string }>).map((o) => [o.id, o.name]),
      );
      const agentNames = new Map<string, string>(
        ((pRes.data ?? []) as Array<{ user_id: string; full_name: string | null; email: string | null }>)
          .map((p) => [p.user_id, p.full_name || p.email || "Unknown"]),
      );
      for (const { ev, leadId } of dupOwnerFix) {
        const m = leadMeta.get(leadId);
        if (!m) continue;
        const office = m.office_id ? (officeNames.get(m.office_id) ?? "Unknown office") : "Admin inbox";
        const agentLabel = m.assigned_user_id ? (agentNames.get(m.assigned_user_id) ?? "Unknown agent") : "Unassigned";
        ev.detail = [
          ev.detail,
          `Existing lead: ${m.full_name || "Unnamed"} · agent: ${agentLabel} · office: ${office}${m.status ? ` · status: ${m.status}` : ""}`,
        ].filter(Boolean).join("\n");
      }
    }

    if (links.length > 0) await db().from("sheet_sync_rows").upsert(links, { onConflict: "sync_id,row_key" });


    for (let i = 0; i < fresh.length; i += 500) {
      const chunk = fresh.slice(i, i + 500);
      const now = new Date().toISOString();
      const hasCreated = chunk.some((c) => c.row.created_at != null);
      const payloadRows = chunk.map((c) => (hasCreated && c.row.created_at == null ? { ...c.row, created_at: now } : c.row));
      const { data, error } = await db().from("leads").insert(payloadRows).select("id");
      if (error) throw new Error(error.message);
      const ids = (data ?? []) as Array<{ id: string }>;
      const trackRows = ids.map((r, idx) => ({
        sync_id: sync.id, row_key: chunk[idx].key, lead_id: r.id, content_hash: chunk[idx].hash,
      }));
      if (trackRows.length) await db().from("sheet_sync_rows").upsert(trackRows, { onConflict: "sync_id,row_key" });
      ids.forEach((r, idx) => events.push({
        kind: "inserted",
        lead_id: r.id,
        lead_name: leadLabel(chunk[idx].row),
        detail: ["new row added in the sheet — lead created", ...rowSummary(chunk[idx].row)].join("\n"),
      }));

      const comments = ids
        .map((r, idx) => ({ lead_id: r.id, comment: (chunk[idx].comment ?? "").trim() }))
        .filter((c) => c.comment);
      if (comments.length) await db().from("lead_comments").insert(comments);
      result.inserted += ids.length;
    }
  }

  await logSyncEvents(sync, events);
  return result;
}

export type SyncEventKind = "inserted" | "updated" | "duplicate" | "deleted" | "restored" | "error";
type SyncEvent = { kind: SyncEventKind; lead_id?: string | null; lead_name?: string | null; detail: string };

/** Kinds the events table accepted before deleted/restored existed. */
const LEGACY_KIND: Record<SyncEventKind, string> = {
  inserted: "inserted", updated: "updated", duplicate: "duplicate",
  deleted: "updated", restored: "inserted", error: "error",
};

function short(v: string) {
  const s = v.trim();
  return s.length > 40 ? `${s.slice(0, 40)}…` : s || "(empty)";
}

function fieldLabel(field: string) {
  return field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "Field: value" lines for every filled field of a newly imported row. */
function rowSummary(row: Record<string, unknown>) {
  return UPDATABLE
    .filter((f) => String(row[f] ?? "").trim() !== "" && f !== "payload")
    .map((f) => `${fieldLabel(f)}: ${short(String(row[f]))}`);
}

function leadLabel(row: Record<string, unknown>) {
  const name = [row.full_name, [row.first_name, row.last_name].filter(Boolean).join(" ")]
    .map((v) => String(v ?? "").trim()).find(Boolean);
  return name || String(row.email ?? row.phone ?? "Unnamed lead");
}

/** Writes the per-change feed the notification bell reads. Never throws. */
async function logSyncEvents(sync: SheetSync, events: SyncEvent[]) {
  if (events.length === 0) return;
  const build = (legacy: boolean) => events.slice(0, 200).map((e) => ({
    sync_id: sync.id,
    sync_name: sync.name,
    sheet_url: sync.sheet_url,
    office_id: sync.office_id,
    kind: legacy ? LEGACY_KIND[e.kind] : e.kind,
    lead_id: e.lead_id ?? null,
    lead_name: e.lead_name ?? null,
    detail: e.detail,
  }));
  try {
    const { error } = await db().from("sheet_sync_events").insert(build(false));
    // Older databases constrain `kind` to the original four values — retry mapped.
    if (error) {
      const { error: retry } = await db().from("sheet_sync_events").insert(build(true));
      if (retry) throw new Error(retry.message);
    }
  } catch (err) {
    console.error("[sheet-sync] event log failed", err);
  }
}



/** Runs one sync and records status/next run on the row. Never throws. */
export async function runSheetSyncAndRecord(sync: SheetSync): Promise<SyncResult & { error?: string }> {
  const started = Date.now();
  try {
    const res = await runSheetSync(sync);
    await db().from("sheet_syncs").update({
      last_run_at: new Date().toISOString(),
      next_run_at: new Date(Date.now() + Math.max(5, sync.interval_seconds) * 1000).toISOString(),
      last_status: `ok · +${res.inserted} new · ${res.updated} updated · ${res.duplicates} duplicates · ${Math.round((Date.now() - started) / 100) / 10}s`,
      last_error: null,
      consecutive_failures: 0,
      updated_at: new Date().toISOString(),
    }).eq("id", sync.id);
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await logSyncEvents(sync, [{ kind: "error", detail: message.slice(0, 300) }]);
    const failures = (sync.consecutive_failures ?? 0) + 1;

    await db().from("sheet_syncs").update({
      last_run_at: new Date().toISOString(),
      next_run_at: new Date(Date.now() + Math.min(300, Math.max(15, sync.interval_seconds * failures)) * 1000).toISOString(),
      last_status: "error",
      last_error: message.slice(0, 500),
      consecutive_failures: failures,
      // Pause after many consecutive failures instead of hammering Google forever.
      enabled: failures < 20,
      updated_at: new Date().toISOString(),
    }).eq("id", sync.id);
    return { inserted: 0, updated: 0, skipped: 0, duplicates: 0, rows: 0, error: message };
  }
}

export async function runDueSheetSyncs(limit = 25) {
  const nowIso = new Date().toISOString();
  const { data, error } = await db().from("sheet_syncs").select("*")
    .eq("enabled", true).lte("next_run_at", nowIso)
    .order("next_run_at", { ascending: true }).limit(limit);
  if (error) throw new Error(error.message);
  const syncs = (data ?? []) as SheetSync[];
  const results = [];
  for (const s of syncs) {
    // Claim the sync atomically so two overlapping cron ticks can never run the
    // same sheet at once (that is what inserted the same row several times).
    const lease = new Date(Date.now() + Math.max(30, s.interval_seconds) * 1000).toISOString();
    const { data: claimed } = await db().from("sheet_syncs")
      .update({ next_run_at: lease })
      .eq("id", s.id).lte("next_run_at", nowIso).select("id");
    if (!claimed || (claimed as unknown[]).length === 0) continue;
    const r = await runSheetSyncAndRecord(s);
    results.push({ id: s.id, name: s.name, ...r });
  }
  return results;

}
