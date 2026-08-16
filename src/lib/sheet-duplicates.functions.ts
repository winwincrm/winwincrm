import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PendingDuplicate } from "@/lib/sheet-duplicates.server";
import { requireAccessibleSheetSync, validateSheetTarget } from "@/lib/sheet-access.server";

export type { PendingDuplicate, DuplicateMatch } from "@/lib/sheet-duplicates.server";

const uuid = z.string().uuid();

/** Duplicate sheet rows that are waiting for a human decision. */
export const listSheetDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ sync_id: uuid }).parse(i))
  .handler(async ({ data, context }): Promise<{ pending: PendingDuplicate[]; error?: string }> => {
    const { sync } = await requireAccessibleSheetSync(context, data.sync_id, "*");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { computePendingDuplicates } = await import("@/lib/sheet-duplicates.server");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { pending } = await computePendingDuplicates(sync as any, supabaseAdmin as any);
      return { pending };
    } catch (e) {
      return { pending: [], error: e instanceof Error ? e.message : String(e) };
    }
  });

/** Skip and keep old, import and keep both, or delete old and keep new. */
export const resolveSheetDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      sync_id: uuid,
      keys: z.array(z.string().max(200)).min(1).max(500),
      action: z.enum(["skip", "import", "replace"]),
      office_id: uuid.nullable().optional(),
      assigned_user_id: uuid.nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { access, sync } = await requireAccessibleSheetSync<{
      id: string;
      office_id: string | null;
      assigned_user_id: string | null;
    }>(context, data.sync_id, "*");
    const hasTargetOverride = data.office_id !== undefined || data.assigned_user_id !== undefined;
    const target = hasTargetOverride
      ? await validateSheetTarget(
          access,
          data.office_id !== undefined ? data.office_id : sync.office_id,
          data.assigned_user_id !== undefined ? data.assigned_user_id : sync.assigned_user_id,
        )
      : null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolvePendingDuplicates } = await import("@/lib/sheet-duplicates.server");
    return resolvePendingDuplicates(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sync as any, supabaseAdmin as any,
      {
        keys: data.keys,
        action: data.action,
        ...(target ? { officeId: target.officeId, assignedUserId: target.assignedUserId } : {}),
      },
    );
  });
