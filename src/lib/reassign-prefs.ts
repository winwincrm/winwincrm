import { useCallback, useEffect, useState } from "react";

/**
 * Global (per-browser) transfer preferences applied to every lead reassignment —
 * single row picker, expanded lead detail and bulk assign all read the same value.
 */
export type ReassignPrefs = {
  keepComments: boolean;
  keepDescriptions: boolean;
};

const STORAGE_KEY = "crm.reassign.prefs.v1";
const EVENT = "crm-reassign-prefs";
const DEFAULTS: ReassignPrefs = { keepComments: true, keepDescriptions: true };

export function readReassignPrefs(): ReassignPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<ReassignPrefs>;
    return {
      keepComments: parsed.keepComments !== false,
      keepDescriptions: parsed.keepDescriptions !== false,
    };
  } catch {
    return DEFAULTS;
  }
}

export function useReassignPrefs(): [ReassignPrefs, (patch: Partial<ReassignPrefs>) => void] {
  const [prefs, setPrefs] = useState<ReassignPrefs>(DEFAULTS);

  useEffect(() => {
    setPrefs(readReassignPrefs());
    const sync = () => setPrefs(readReassignPrefs());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((patch: Partial<ReassignPrefs>) => {
    const next = { ...readReassignPrefs(), ...patch };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota errors */
    }
    setPrefs(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [prefs, update];
}
