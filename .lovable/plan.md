## Goal

Paste a public Google Sheet link and pull leads straight into the CRM — manually on demand, and optionally on a repeating schedule.

## 1. Import from a sheet URL (manual)

In the existing import dialog, add a third input mode next to Upload file / Paste text: **Google Sheet URL**.

- Paste any `docs.google.com/spreadsheets/d/.../edit#gid=...` link.
- The URL is converted to the CSV export link (the helper for this already exists in the codebase) and fetched **server-side** (a server function), since the browser can't fetch Google directly.
- The returned CSV goes into the exact same pipeline that file uploads use: header auto-mapping, column mapping editor, normalization, duplicate detection, the duplicates review table (skip / import / replace), source selection, and the automatic duplicates .xlsx download.
- Clear errors for: not a Sheets URL, sheet not shared publicly (403), tab not found, empty sheet.

Nothing about the current upload/paste flow changes.

## 2. Saved sheets + auto-sync

New page **Sheets** (admin-only, next to Sources/Affiliates) listing connected sheets. Each row: sheet name, URL, target office, source label, sync interval (Off / 15 min / hourly / daily), last sync time, rows imported, last error, and buttons Sync now / Edit / Delete.

Sync behaviour:
- Fetches the sheet, parses rows with the stored column mapping (captured when the sheet is first added, via the same mapping UI).
- Skips rows already imported — matched both by duplicate rules (email/phone in the same office) and by a per-sheet row fingerprint, so re-reading the same sheet never re-creates leads.
- Only new rows are inserted; the run is recorded with counts (new / skipped duplicates / errors).
- Auto-sync is off by default per sheet; failures are shown on the row and auto-sync pauses after repeated failures instead of retrying forever.

## Technical notes

- New table `lead_sheet_syncs` (id, office_id, name, sheet_url, gid, column_mapping jsonb, source label, interval, enabled, last_run_at, last_status, last_error, created_by) plus `lead_sheet_sync_runs` for history, with grants + RLS (admin-only write; visibility scoped by office).
- Row dedupe key stored per imported lead (hash of email+phone+name per sheet) to make repeat syncs idempotent.
- Manual fetch/parse via `createServerFn`; scheduled runs via a `/api/public/sheets/sync` route protected by a secret header, triggered by pg_cron.
- Reuses `googleSheetCsvUrl`, `parseDelimited`, `autoMapHeaders`, `rowsToLeads`, `normalizeLead` — no duplication of parsing logic.

## Limitation

Public-link sheets only ("anyone with the link can view"). Private sheets would require connecting a Google account, which we can add later if needed.
