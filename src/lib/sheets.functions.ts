import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchSheetCsvFromUrl } from "@/lib/sheets.server";

export const fetchSheetCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ url: z.string().url().max(2000) }).parse(i))
  .handler(async ({ data }) => fetchSheetCsvFromUrl(data.url));
