import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { handleLeadReassignment } from "@/lib/lead-reassignment.server";

export const reassignLeadWithCommentOption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      leadId: z.string().uuid(),
      assignedUserId: z.string().uuid().nullable(),
      keepComments: z.boolean(),
      keepDescriptions: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => handleLeadReassignment(data, context));