const MAX_BYTES = 15 * 1024 * 1024;

type SheetTarget = { url: URL; isGoogle: boolean };

function googleSheetTarget(input: URL): SheetTarget | null {
  if (input.hostname !== "docs.google.com") return null;

  const published = input.pathname.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9_-]+)/);
  if (published?.[1]) {
    const fragment = new URLSearchParams(input.hash.replace(/^#/, ""));
    const gid = input.searchParams.get("gid") ?? fragment.get("gid");
    const url = new URL(`https://docs.google.com/spreadsheets/d/e/${published[1]}/pub`);
    url.searchParams.set("output", "csv");
    if (gid) url.searchParams.set("gid", gid);
    return { url, isGoogle: true };
  }

  const standard = input.pathname.match(/\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/);
  if (standard?.[1]) {
    const fragment = new URLSearchParams(input.hash.replace(/^#/, ""));
    // Only pin a gid when the link actually names one. Defaulting to gid=0 breaks
    // sheets whose first tab was deleted; without it Google exports the first tab.
    const gid = input.searchParams.get("gid") ?? fragment.get("gid");
    const url = new URL(`https://docs.google.com/spreadsheets/d/${standard[1]}/export?format=csv`);
    if (gid) url.searchParams.set("gid", gid);
    return { url, isGoogle: true };
  }


  return null;
}

export function toSheetCsvUrl(raw: string): SheetTarget {
  let input: URL;
  try {
    input = new URL(raw.trim());
  } catch {
    throw new Error("Not a valid URL");
  }
  if (input.protocol !== "https:" && input.protocol !== "http:") throw new Error("Not a valid URL");

  const google = googleSheetTarget(input);
  if (google) return google;
  return { url: input, isGoogle: false };
}

function candidateUrls(target: SheetTarget): URL[] {
  const original = new URL(target.url.toString());
  const list = [original];
  if (!target.isGoogle) return list;
  const m = target.url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)\/export/);
  if (m?.[1]) {
    const gid = target.url.searchParams.get("gid");
    // The regular /export endpoint can serve an older generated file for several
    // minutes. gviz reads the live grid and is therefore the primary endpoint for
    // auto-sync as well as a fallback for link-shared sheets.
    const gviz = new URL(`https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq`);
    gviz.searchParams.set("tqx", "out:csv");
    gviz.searchParams.set("tq", "select *");
    gviz.searchParams.set("headers", "1");
    if (gid) gviz.searchParams.set("gid", gid);
    list.unshift(gviz);
    if (gid) {
      // Last resort: first visible tab (handles a stale/deleted gid in the link).
      list.push(new URL(`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv`));
    }
  }
  return list;
}

export async function fetchSheetCsvFromUrl(raw: string): Promise<{ csv: string; title: string }> {
  const target = toSheetCsvUrl(raw);
  const host = target.url.hostname;
  if (/^(localhost|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/i.test(host)) {
    throw new Error("This URL is not allowed");
  }

  let lastError = "Could not fetch the sheet";
  for (const candidate of candidateUrls(target)) {
    // Google may cache export URLs for several minutes. A changing query value and
    // no-store headers are required for live sync to see newly appended rows.
    candidate.searchParams.set("_crm_refresh", Date.now().toString());
    let res: Response;
    try {
      res = await fetch(candidate, {
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: { "cache-control": "no-cache, no-store", pragma: "no-cache" },
      });
    } catch {
      lastError = "The sheet took too long to respond. Try again.";
      continue;
    }

    if (!res.ok) {
      lastError =
        res.status === 401 || res.status === 403
          ? "Sheet is not accessible. Share it as ‘Anyone with the link → Viewer’ or use its published CSV link."
          : `Could not fetch the sheet (HTTP ${res.status})`;
      continue;
    }

    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BYTES) throw new Error("Sheet is too large");
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error("Sheet is too large");
    const head = text.slice(0, 500).toLowerCase();
    if (target.isGoogle && (head.includes("<html") || head.includes("<!doctype"))) {
      lastError = "Google returned a sign-in page. Share the Sheet as ‘Anyone with the link → Viewer’.";
      continue;
    }
    if (!text.trim()) {
      lastError = "The sheet is empty";
      continue;
    }

    const cd = res.headers.get("content-disposition") ?? "";
    const nameMatch = cd.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
    let title = "";
    if (nameMatch?.[1]) {
      try {
        title = decodeURIComponent(nameMatch[1]).replace(/\.csv$/i, "").trim();
      } catch {
        title = nameMatch[1].replace(/\.csv$/i, "").trim();
      }
    }
    return { csv: text.replace(/^\uFEFF/, ""), title };
  }

  throw new Error(lastError);

}