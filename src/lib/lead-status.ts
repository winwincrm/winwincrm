import type { LeadStatus } from "@/lib/lead-constants";
import { LEAD_STATUSES, STATUS_TOKEN } from "@/lib/lead-constants";

export type LeadStatusGroup =
  | "new"
  | "in_progress"
  | "callback"
  | "appointment"
  | "converted"
  | "bad";

export const IN_PROGRESS_STATUSES: LeadStatus[] = [
  "contacted",
  "no_answer_1",
  "no_answer_2",
  "no_answer_3",
  "no_answer_4",
  "no_answer_5",
  "try_again",
  "not_available",
  "low_potential",
  "high_potential",
];

export const REJECTED_BAD_STATUSES: LeadStatus[] = [
  "rejected",
  "not_interested",
  "wrong_person",
  "bad_number",
  "lost",
  "qualified",
];

export const STATUSES_BY_GROUP: Record<LeadStatusGroup, LeadStatus[]> = {
  new: ["new"],
  in_progress: IN_PROGRESS_STATUSES,
  callback: ["callback"],
  appointment: ["appointment"],
  converted: ["converted"],
  bad: REJECTED_BAD_STATUSES,
};

export const STATUS_GROUP_ORDER: LeadStatusGroup[] = [
  "new",
  "in_progress",
  "callback",
  "appointment",
  "converted",
  "bad",
];

/** Statuses that should auto-stamp last_contacted_at when transitioned to. */
export const CONTACT_RELEVANT_STATUSES: LeadStatus[] = [
  "contacted",
  "no_answer_1",
  "no_answer_2",
  "no_answer_3",
  "no_answer_4",
  "no_answer_5",
  "not_available",
  "low_potential",
  "high_potential",
  "appointment",
  "converted",
];

export function statusGroupOf(status: LeadStatus): LeadStatusGroup {
  for (const g of STATUS_GROUP_ORDER) {
    if (STATUSES_BY_GROUP[g].includes(status)) return g;
  }
  return "in_progress";
}

export function statusesInGroup(group: LeadStatusGroup): LeadStatus[] {
  return STATUSES_BY_GROUP[group] ?? [];
}

export { LEAD_STATUSES, STATUS_TOKEN };
export type { LeadStatus };
