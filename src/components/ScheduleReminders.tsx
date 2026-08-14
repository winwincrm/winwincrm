import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlarmClock, CalendarClock, Phone, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Kind = "callback" | "appointment";

interface DueItem {
  key: string; // leadId:kind:isoTime
  leadId: string;
  name: string;
  phone: string | null;
  kind: Kind;
  when: string;
}

const POLL_MS = 30_000;
const TICK_MS = 10_000;
const LOOKBACK_MS = 2 * 60 * 60 * 1000; // don't nag about very old items
const DISMISS_KEY = "schedule-reminders-dismissed";

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(s: Set<string>) {
  try {
    window.localStorage.setItem(DISMISS_KEY, JSON.stringify([...s].slice(-500)));
  } catch {
    /* ignore */
  }
}

function fmt(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${hh}:${mi} · ${dd}-${mm}-${d.getFullYear()}`;
}

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [0, 0.32, 0.64].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now + offset);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.3);
    });
    window.setTimeout(() => void ctx.close(), 1500);
  } catch {
    /* audio not available */
  }
}

export function ScheduleReminders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [scheduled, setScheduled] = useState<DueItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});
  const [nowTs, setNowTs] = useState(() => Date.now());
  const announced = useRef<Set<string>>(new Set());

  const fetchScheduled = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from("leads")
      .select("id, full_name, phone, payload")
      .eq("assigned_user_id", user.id)
      .or("payload->>callback_at.not.is.null,payload->>appointment_at.not.is.null")
      .limit(2000);
    if (error) return;
    const out: DueItem[] = [];
    for (const l of data ?? []) {
      const p = (l.payload ?? {}) as Record<string, unknown>;
      (["callback", "appointment"] as Kind[]).forEach((kind) => {
        const raw = p[kind === "callback" ? "callback_at" : "appointment_at"];
        if (typeof raw !== "string") return;
        const t = new Date(raw).getTime();
        if (Number.isNaN(t)) return;
        out.push({
          key: `${l.id}:${kind}:${raw}`,
          leadId: l.id,
          name: l.full_name ?? "—",
          phone: l.phone,
          kind,
          when: raw,
        });
      });
    }
    setScheduled(out);
  }, [user?.id]);

  useEffect(() => {
    void fetchScheduled();
    const id = window.setInterval(() => void fetchScheduled(), POLL_MS);
    return () => window.clearInterval(id);
  }, [fetchScheduled]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const due = useMemo(() => {
    return scheduled
      .filter((it) => {
        const t = new Date(it.when).getTime();
        if (t > nowTs) return false;
        if (nowTs - t > LOOKBACK_MS) return false;
        if (dismissed.has(it.key)) return false;
        const sn = snoozed[it.key];
        if (sn && sn > nowTs) return false;
        return true;
      })
      .sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime());
  }, [scheduled, nowTs, dismissed, snoozed]);

  // Sound + browser notification for newly-due items
  useEffect(() => {
    const fresh = due.filter((d) => !announced.current.has(d.key));
    if (fresh.length === 0) return;
    fresh.forEach((d) => announced.current.add(d.key));
    beep();
    if (typeof Notification !== "undefined") {
      if (Notification.permission === "default") void Notification.requestPermission();
      if (Notification.permission === "granted") {
        fresh.forEach((d) => {
          try {
            new Notification(d.kind === "appointment" ? "Appointment due" : "Callback due", {
              body: `${d.name} · ${fmt(d.when)}`,
            });
          } catch {
            /* ignore */
          }
        });
      }
    }
  }, [due]);

  const dismiss = (key: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(key);
      saveDismissed(next);
      return next;
    });
  };

  const snooze = (key: string, minutes: number) => {
    setSnoozed((prev) => ({ ...prev, [key]: Date.now() + minutes * 60_000 }));
  };

  if (due.length === 0) return null;
  const current = due[0];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-md rounded-xl border-2 border-primary bg-card shadow-2xl ring-4 ring-primary/25 animate-scale-in">
        <div className="flex items-center gap-3 rounded-t-[10px] bg-primary px-5 py-3 text-primary-foreground">
          <AlarmClock className="h-6 w-6 animate-pulse" />
          <div className="flex-1 text-lg font-semibold">
            {current.kind === "appointment" ? "Appointment due now" : "Callback due now"}
          </div>
          {due.length > 1 && (
            <Badge variant="secondary" className="font-semibold">+{due.length - 1} more</Badge>
          )}
          <button
            type="button"
            aria-label="Dismiss reminder"
            onClick={() => dismiss(current.key)}
            className="opacity-80 hover:opacity-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <div className="text-2xl font-bold tracking-tight">{current.name}</div>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock className="h-4 w-4" />
              {fmt(current.when)}
            </div>
            {current.phone && (
              <a
                href={`tel:${current.phone}`}
                className="mt-2 inline-flex items-center gap-2 font-mono text-sm text-primary hover:underline"
              >
                <Phone className="h-4 w-4" />
                {current.phone}
              </a>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              className="flex-1"
              onClick={() => {
                dismiss(current.key);
                void navigate({ to: "/leads", search: { selected: current.leadId } as never });
              }}
            >
              Open lead
            </Button>
            <Button variant="outline" onClick={() => snooze(current.key, 5)}>Snooze 5m</Button>
            <Button variant="outline" onClick={() => snooze(current.key, 15)}>15m</Button>
            <Button variant="ghost" onClick={() => dismiss(current.key)}>Dismiss</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
