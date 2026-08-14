import { useCallback, useEffect, useState } from "react";

// Sheet-sync notifications are dismissed locally: the underlying event rows must
// stay in the database (the sync worker uses them to avoid re-announcing the same
// duplicate every tick), so "delete" here means "hide it from this browser".
const KEY = "sheet-sync-events-dismissed";
const MAX = 2000;

const listeners = new Set<(ids: Set<string>) => void>();

function read(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function write(ids: Set<string>) {
  const arr = [...ids].slice(-MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {
    /* storage full or unavailable — dismissal is best-effort */
  }
  const next = new Set(arr);
  listeners.forEach((fn) => fn(next));
}

export function dismissSyncEvents(eventIds: string[]) {
  const ids = read();
  eventIds.forEach((id) => ids.add(id));
  write(ids);
}

export function restoreAllSyncEvents() {
  write(new Set());
}

/** Reactive set of locally dismissed sheet-sync event ids. */
export function useDismissedSyncEvents() {
  const [ids, setIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setIds(read());
    const fn = (next: Set<string>) => setIds(next);
    listeners.add(fn);
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) setIds(read()); };
    window.addEventListener("storage", onStorage);
    return () => { listeners.delete(fn); window.removeEventListener("storage", onStorage); };
  }, []);

  const dismiss = useCallback((eventIds: string[]) => dismissSyncEvents(eventIds), []);
  const restoreAll = useCallback(() => restoreAllSyncEvents(), []);

  return { dismissed: ids, dismiss, restoreAll };
}
