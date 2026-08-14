import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Subscribe to a per-office private broadcast channel and run a handler on
 * each lead change. RLS on realtime.messages restricts subscription to office
 * members or admin.
 *
 * Pass `null` for officeId to skip subscription (e.g. admin without a fixed office).
 */
export function useLeadRealtime(
  officeId: string | null | undefined,
  onChange: (evt: {
    op: "INSERT" | "UPDATE" | "DELETE";
    lead_id: string;
    office_id: string;
    new: Record<string, unknown> | null;
    old: Record<string, unknown> | null;
  }) => void,
) {
  useEffect(() => {
    if (!officeId) return;
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) {
        supabase.realtime.setAuth(data.session.access_token);
      }
      const topic = `leads:office:${officeId}`;
      channel = supabase
        .channel(topic, { config: { private: true } })
        .on("broadcast", { event: "lead_change" }, ({ payload }) => {
          onChange(payload as Parameters<typeof onChange>[0]);
        })
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeId]);
}
