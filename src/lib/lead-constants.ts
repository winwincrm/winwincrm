import type { Database } from "@/integrations/supabase/types";

// LeadStatus is widened locally to include newly-added enum values that may
// not yet appear in the generated types until the DB migration runs.
export type LeadStatus =
  | Database["public"]["Enums"]["lead_status"]
  | "no_answer_4"
  | "no_answer_5"
  | "low_potential"
  | "high_potential"
  | "wrong_person"
  | "bad_number";

export const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "callback",
  "no_answer_1",
  "no_answer_2",
  "no_answer_3",
  "no_answer_4",
  "no_answer_5",
  "try_again",
  "not_available",
  "low_potential",
  "high_potential",
  "wrong_person",
  "bad_number",
  "appointment",
  "qualified",
  "converted",
  "rejected",
  "not_interested",
  "lost",
];

export const STATUS_TOKEN: Record<LeadStatus, string> = {
  new: "status-new",
  contacted: "status-contacted",
  callback: "status-followup",
  no_answer_1: "status-no-answer",
  no_answer_2: "status-no-answer",
  no_answer_3: "status-no-answer",
  no_answer_4: "status-no-answer",
  no_answer_5: "status-no-answer",
  try_again: "status-followup",
  not_available: "status-no-answer",
  low_potential: "status-followup",
  high_potential: "status-interested",
  wrong_person: "status-invalid",
  wrong_number: "status-invalid",
  bad_number: "status-invalid",
  appointment: "status-interested",
  qualified: "status-interested",
  converted: "status-converted",
  rejected: "status-not-interested",
  not_interested: "status-not-interested",
  lost: "status-closed",
};
