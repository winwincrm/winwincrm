// Duplicate rows coming from a Google Sheet are no longer silently skipped:
// they stay "pending" until a human decides what to do with them.
//
// There is no extra table — the decision itself is the storage:
//   * skip   → a tombstone row in sheet_sync_rows (lead_id = null)
//   * import → a new lead + a tracking row pointing at it
//   * replace → soft-delete the old lead and import the sheet row as a new lead
// Anything that is a duplicate and has no tracking row yet is "pending".
import { fetchSheetCsvFromUrl } from "@/lib/sheets.server";
import { buildSheetRows, parseSheetCsv, autoMapTable } from "@/lib/sheet-mapping";
import { emailVariants } from "@/lib/email-normalize";
import type { SheetSync } from "@/lib/sheet-sync.server";

export type DuplicateMatch = {
  reason: "email" | "phone" | "in_sheet";
  leadId: string | null;
  leadName: string | null;
  leadEmail: string | null;
  leadPhone: string | null;
  leadStatus: string | null;
  leadCreatedAt: string | null;
  officeName: string | null;
  agentName: string | null;
  /** For in-sheet repeats: the sheet row that was imported. */
  firstSheetRow: number | null;
};

export type PendingDuplicate = {
  rowKey: string;
  /** 1-based sheet row numbers (header is row 1) this entry covers. */
  sheetRows: number[];
  name: string;
  email: string | null;
  phone: string | null;
  fields: Array<{ label: string; value: string }>;
  match: DuplicateMatch;
};

const FIELD_LABELS: Array<[string, string]> = [
  ["full_name", "Full name"],
  ["first_name", "First name"],
  ["last_name", "Last name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["amount", "Amount"],
  ["timeframe", "Timeframe"],
  ["origin_agent_name", "Sheet agent"],
  ["description_1", "Description 1"],
  ["description_2", "Description 2"],
  ["description_3", "Description 3"],
  ["description_4", "Description 4"],
];

function k9(phone: unknown) {
  const d = String(phone ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : "";
}

function label(row: Record<string, unknown>) {
  const name = [row.full_name, [row.first_name, row.last_name].filter(Boolean).join(" ")]
    .map((v) => String(v ?? "").trim()).find(Boolean);
  return name || String(row.email ?? row.phone ?? "Unnamed lead");
}

type Built = ReturnType<typeof buildSheetRows>[number];

/** Reads the live sheet and returns every duplicate row still waiting for a decision. */
export async function computePendingDuplicates(
  sync: SheetSync,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
): Promise<{ pending: PendingDuplicate[]; built: Map<string, Built> }> {
  const { csv } = await fetchSheetCsvFromUrl(sync.sheet_url);
  const { headers, rows } = parseSheetCsv(csv);
  const builtMap = new Map<string, Built>();
  if (headers.length === 0) return { pending: [], built: builtMap };

  const mapping = autoMapTable(headers, sync.mapping ?? undefined);
  const all = buildSheetRows(rows, mapping);

  // Collapse repeats of the same row identity, remembering every sheet row.
  const order: string[] = [];
  const occurrences = new Map<string, number[]>();
  all.forEach((b, i) => {
    if (!occurrences.has(b.rowKey)) { occurrences.set(b.rowKey, []); order.push(b.rowKey); builtMap.set(b.rowKey, b); }
    occurrences.get(b.rowKey)!.push(i + 2);
  });

  // Rows this sync already handled (imported, linked or skipped).
  const { data: trackedRows } = await admin
    .from("sheet_sync_rows").select("row_key, lead_id").eq("sync_id", sync.id);
  const trackedLead = new Map<string, string | null>(
    ((trackedRows ?? []) as Array<{ row_key: string; lead_id: string | null }>)
      .map((r) => [r.row_key, r.lead_id]),
  );
  const tracked = new Set(trackedLead.keys());


  const candidates = order.filter((k) => !tracked.has(k));
  if (candidates.length === 0) return { pending: [], built: builtMap };

  // Look up existing CRM leads by email / phone for the candidate rows.
  const emails = new Set<string>();
  const phones = new Set<string>();
  for (const key of candidates) {
    const b = builtMap.get(key)!;
    for (const v of emailVariants(b.insert.email as string | null)) emails.add(v);
    const p = k9(b.insert.phone);
    if (p) phones.add(p);
  }

  type LeadRow = {
    id: string; full_name: string | null; email: string | null; phone: string | null;
    phone_k9: string | null; status: string | null; created_at: string | null;
    office_id: string | null; assigned_user_id: string | null;
    source: string | null; platform: string | null;
  };
  const cols = "id, full_name, email, phone, phone_k9, status, created_at, office_id, assigned_user_id, source, platform";
  const byEmail = new Map<string, LeadRow>();
  const byPhone = new Map<string, LeadRow>();
  const emailList = [...emails];
  for (let i = 0; i < emailList.length; i += 200) {
    const { data } = await admin.from("leads").select(cols)
      .in("email", emailList.slice(i, i + 200)).is("deleted_at", null);
    for (const r of (data ?? []) as LeadRow[]) {
      const key = (r.email ?? "").toLowerCase();
      if (key && !byEmail.has(key)) byEmail.set(key, r);
    }
  }
  const phoneList = [...phones];
  for (let i = 0; i < phoneList.length; i += 200) {
    const { data } = await admin.from("leads").select(cols)
      .in("phone_k9", phoneList.slice(i, i + 200)).is("deleted_at", null);
    for (const r of (data ?? []) as LeadRow[]) {
      if (r.phone_k9 && !byPhone.has(r.phone_k9)) byPhone.set(r.phone_k9, r);
    }
  }

  // A lead this very sheet already created is NOT a duplicate — it is the same
  // row. That happens when the tracking rows were lost (link removed and added
  // again, or the sheet was re-linked as a new sync). Re-adopt those rows
  // silently instead of asking the user 150 times about its own leads.
  const matched = [...byEmail.values(), ...byPhone.values()];
  const matchedIds = [...new Set(matched.map((r) => r.id))];
  const sameSheetLeadIds = new Set<string>();
  if (matchedIds.length) {
    // 1) leads already tracked by any sync pointing at the same sheet URL
    const { data: sameUrlSyncs } = await admin
      .from("sheet_syncs").select("id").eq("sheet_url", sync.sheet_url);
    const syncIds = ((sameUrlSyncs ?? []) as Array<{ id: string }>).map((s) => s.id);
    if (syncIds.length) {
      for (let i = 0; i < matchedIds.length; i += 200) {
        const { data } = await admin.from("sheet_sync_rows")
          .select("lead_id").in("sync_id", syncIds).in("lead_id", matchedIds.slice(i, i + 200));
        for (const r of (data ?? []) as Array<{ lead_id: string | null }>) {
          if (r.lead_id) sameSheetLeadIds.add(r.lead_id);
        }
      }
    }
    // 2) untracked leads that carry this sync's own source / list name
    const wantSource = (sync.source ?? "").trim().toLowerCase();
    const wantPlatform = (sync.list_name || sync.name || "").trim().toLowerCase();
    for (const r of matched) {
      if (sameSheetLeadIds.has(r.id)) continue;
      const s = (r.source ?? "").trim().toLowerCase();
      const p = (r.platform ?? "").trim().toLowerCase();
      if ((wantSource && s === wantSource) || (wantPlatform && p === wantPlatform)) {
        sameSheetLeadIds.add(r.id);
      }
    }
  }
  const adopt: Array<{ sync_id: string; row_key: string; lead_id: string; content_hash: string; updated_at: string }> = [];


  // Names for office / agent of the matched leads.
  const officeIds = new Set<string>();
  const userIds = new Set<string>();
  for (const r of [...byEmail.values(), ...byPhone.values()]) {
    if (r.office_id) officeIds.add(r.office_id);
    if (r.assigned_user_id) userIds.add(r.assigned_user_id);
  }
  const [officesRes, profilesRes] = await Promise.all([
    officeIds.size ? admin.from("offices").select("id, name").in("id", [...officeIds]) : Promise.resolve({ data: [] }),
    userIds.size ? admin.from("profiles").select("user_id, full_name, email").in("user_id", [...userIds]) : Promise.resolve({ data: [] }),
  ]);
  const officeName = new Map<string, string>(
    ((officesRes.data ?? []) as Array<{ id: string; name: string }>).map((o) => [o.id, o.name]),
  );
  const agentName = new Map<string, string>(
    ((profilesRes.data ?? []) as Array<{ user_id: string; full_name: string | null; email: string | null }>)
      .map((p) => [p.user_id, p.full_name || p.email || "Unknown"]),
  );

  // Earlier rows of the same sheet (imported or kept) used for in-sheet repeats.
  const seenEmail = new Map<string, number>();
  const seenPhone = new Map<string, number>();
  // Same, but remembering which row identity was seen first, so an in-sheet
  // repeat can point at the lead that first row created (and its agent).
  const seenEmailKey = new Map<string, string>();
  const seenPhoneKey = new Map<string, string>();
  const inSheetFirstKey = new Map<string, string>();


  const pending: PendingDuplicate[] = [];
  for (const key of order) {
    const b = builtMap.get(key)!;
    const rowsAt = occurrences.get(key)!;
    const variants = emailVariants(b.insert.email as string | null);
    const p = k9(b.insert.phone);

    if (!tracked.has(key)) {
      const hitEmail = variants.find((v) => byEmail.has(v));
      const lead = hitEmail ? byEmail.get(hitEmail)! : p ? byPhone.get(p) : undefined;
      const earlier = variants.map((v) => seenEmail.get(v)).find((v) => v !== undefined)
        ?? (p ? seenPhone.get(p) : undefined);

      let match: DuplicateMatch | null = null;
      if (lead && sameSheetLeadIds.has(lead.id)) {
        // This sheet's own lead lost its tracking row — re-link, don't ask.
        adopt.push({
          sync_id: sync.id, row_key: key, lead_id: lead.id,
          content_hash: b.contentHash, updated_at: new Date().toISOString(),
        });
      } else if (lead) {
        match = {
          reason: hitEmail ? "email" : "phone",
          leadId: lead.id,
          leadName: lead.full_name,
          leadEmail: lead.email,
          leadPhone: lead.phone,
          leadStatus: lead.status,
          leadCreatedAt: lead.created_at,
          officeName: lead.office_id ? (officeName.get(lead.office_id) ?? "Unknown office") : "Admin inbox",
          agentName: lead.assigned_user_id ? (agentName.get(lead.assigned_user_id) ?? "Unknown agent") : "Unassigned",
          firstSheetRow: null,
        };
      } else if (earlier !== undefined || rowsAt.length > 1) {
        const firstKey = variants.map((v) => seenEmailKey.get(v)).find(Boolean)
          ?? (p ? seenPhoneKey.get(p) : undefined) ?? key;
        inSheetFirstKey.set(key, firstKey);
        match = {
          reason: "in_sheet",
          leadId: null, leadName: null, leadEmail: null, leadPhone: null,
          leadStatus: null, leadCreatedAt: null, officeName: null, agentName: null,
          firstSheetRow: earlier ?? rowsAt[0],
        };
      }


      if (match) {
        pending.push({
          rowKey: key,
          sheetRows: rowsAt,
          name: label(b.insert),
          email: (b.insert.email as string | null) ?? null,
          phone: (b.insert.phone as string | null) ?? null,
          fields: FIELD_LABELS
            .filter(([f]) => String(b.insert[f] ?? "").trim() !== "")
            .map(([f, l]) => ({ label: l, value: String(b.insert[f]) })),
          match,
        });
      }
    }

    variants.forEach((v) => {
      if (!seenEmail.has(v)) { seenEmail.set(v, rowsAt[0]); seenEmailKey.set(v, key); }
    });
    if (p && !seenPhone.has(p)) { seenPhone.set(p, rowsAt[0]); seenPhoneKey.set(p, key); }
  }

  // In-sheet repeats: show who owns the lead the first row already created.
  const firstLeadIds = new Set<string>();
  for (const item of pending) {
    if (item.match.reason !== "in_sheet") continue;
    const lid = trackedLead.get(inSheetFirstKey.get(item.rowKey) ?? "") ?? null;
    if (lid) firstLeadIds.add(lid);
  }
  if (firstLeadIds.size) {
    const { data: firstLeads } = await admin.from("leads").select(cols).in("id", [...firstLeadIds]);
    const byId = new Map<string, LeadRow>(((firstLeads ?? []) as LeadRow[]).map((r) => [r.id, r]));
    const missingOffices = new Set<string>();
    const missingUsers = new Set<string>();
    for (const r of byId.values()) {
      if (r.office_id && !officeName.has(r.office_id)) missingOffices.add(r.office_id);
      if (r.assigned_user_id && !agentName.has(r.assigned_user_id)) missingUsers.add(r.assigned_user_id);
    }
    const [oRes, pRes] = await Promise.all([
      missingOffices.size ? admin.from("offices").select("id, name").in("id", [...missingOffices]) : Promise.resolve({ data: [] }),
      missingUsers.size ? admin.from("profiles").select("user_id, full_name, email").in("user_id", [...missingUsers]) : Promise.resolve({ data: [] }),
    ]);
    for (const o of (oRes.data ?? []) as Array<{ id: string; name: string }>) officeName.set(o.id, o.name);
    for (const pr of (pRes.data ?? []) as Array<{ user_id: string; full_name: string | null; email: string | null }>) {
      agentName.set(pr.user_id, pr.full_name || pr.email || "Unknown");
    }
    for (const item of pending) {
      if (item.match.reason !== "in_sheet") continue;
      const lid = trackedLead.get(inSheetFirstKey.get(item.rowKey) ?? "") ?? null;
      const lead = lid ? byId.get(lid) : undefined;
      if (!lead) continue;
      item.match.leadId = lead.id;
      item.match.leadName = lead.full_name;
      item.match.leadEmail = lead.email;
      item.match.leadPhone = lead.phone;
      item.match.leadStatus = lead.status;
      item.match.leadCreatedAt = lead.created_at;
      item.match.officeName = lead.office_id ? (officeName.get(lead.office_id) ?? "Unknown office") : "Admin inbox";
      item.match.agentName = lead.assigned_user_id ? (agentName.get(lead.assigned_user_id) ?? "Unknown agent") : "Unassigned";
    }
  }

  for (let i = 0; i < adopt.length; i += 200) {
    await admin.from("sheet_sync_rows")
      .upsert(adopt.slice(i, i + 200), { onConflict: "sync_id,row_key" });
  }


  return { pending, built: builtMap };
}

export type ResolveAction = "skip" | "import" | "replace";

/** Applies a decision to a set of pending duplicate rows. */
export async function resolvePendingDuplicates(
  sync: SheetSync,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  opts: {
    keys: string[];
    action: ResolveAction;
    officeId?: string | null;
    assignedUserId?: string | null;
  },
): Promise<{ skipped: number; imported: number; linked: number; replaced: number; failed: string[] }> {
  const { pending, built } = await computePendingDuplicates(sync, admin);
  const byKey = new Map(pending.map((p) => [p.rowKey, p]));
  const out = { skipped: 0, imported: 0, linked: 0, replaced: 0, failed: [] as string[] };
  const now = new Date().toISOString();
  const events: Array<Record<string, unknown>> = [];


  const track = async (rowKey: string, leadId: string | null) => {
    await admin.from("sheet_sync_rows").upsert(
      { sync_id: sync.id, row_key: rowKey, lead_id: leadId, content_hash: built.get(rowKey)?.contentHash ?? "", updated_at: now },
      { onConflict: "sync_id,row_key" },
    );
  };

  for (const key of opts.keys) {
    const p = byKey.get(key);
    const b = built.get(key);
    if (!p || !b) { out.failed.push(key); continue; }

    if (opts.action === "skip") {
      await track(key, null);
      out.skipped++;
      events.push({
        kind: "duplicate", lead_id: p.match.leadId, lead_name: p.name,
        detail: `duplicate ignored on purpose — sheet row ${p.sheetRows.join(", ")} will not create a lead`,
      });
      continue;
    }

    // import / replace — create the lead from the sheet row
    const officeId = opts.officeId !== undefined ? opts.officeId : sync.office_id;
    const assignedUserId = opts.assignedUserId !== undefined ? opts.assignedUserId : sync.assigned_user_id;
    const row: Record<string, unknown> = {
      office_id: officeId,
      assigned_user_id: assignedUserId,
      ...b.insert,
      platform: (b.insert.platform as string | undefined) || sync.list_name || sync.name || "Google Sheet",
      source: sync.source || (b.insert.source as string | undefined) || "google_sheet",
      status: "new",
    };
    const replacedLeadId = opts.action === "replace" ? p.match.leadId : null;
    if (opts.action === "replace" && !replacedLeadId) { out.failed.push(key); continue; }

    // Delete first so database duplicate constraints do not block the replacement.
    // If creating the fresh lead fails, restore the old lead immediately.
    if (replacedLeadId) {
      const { error: deleteError } = await admin.from("leads")
        .update({ deleted_at: now }).eq("id", replacedLeadId);
      if (deleteError) { out.failed.push(key); continue; }
    }
    const { data, error } = await admin.from("leads").insert(row).select("id").maybeSingle();
    if (error || !data?.id) {
      if (replacedLeadId) await admin.from("leads").update({ deleted_at: null }).eq("id", replacedLeadId);
      out.failed.push(key);
      continue;
    }
    await track(key, data.id);
    if ((b.comment ?? "").trim()) {
      await admin.from("lead_comments").insert({ lead_id: data.id, comment: (b.comment ?? "").trim() });
    }

    if (replacedLeadId) {
      // Any sheet tracking rows pointing at the removed lead must let go of it.
      await admin.from("sheet_sync_rows").delete().eq("lead_id", replacedLeadId).neq("row_key", key);
      out.replaced++;
      events.push({
        kind: "inserted", lead_id: data.id, lead_name: p.name,
        detail: "duplicate replaced — the older lead was deleted and the sheet row kept",
      });
      continue;
    }

    out.imported++;
    events.push({
      kind: "inserted", lead_id: data.id, lead_name: p.name,
      detail: "duplicate approved — lead created from the sheet row anyway",
    });

  }

  if (events.length) {
    try {
      await admin.from("sheet_sync_events").insert(events.map((e) => ({
        sync_id: sync.id, sync_name: sync.name, sheet_url: sync.sheet_url, office_id: sync.office_id, ...e,
      })));
    } catch (err) {
      console.error("[sheet-duplicates] event log failed", err);
    }
  }

  return out;
}
