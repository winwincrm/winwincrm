// Human-friendly labels for lead status enum values.
// Single source of truth — reusable across audit, leads list, etc.

export const LEAD_STATUS_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  callback: "Callback",
  appointment: "Appointment booked",
  qualified: "Qualified",
  converted: "Converted",
  rejected: "Rejected",
  not_interested: "Not interested",
  lost: "Lost",
  try_again: "Try again later",
  not_available: "Not available",
  wrong_person: "Wrong person",
  bad_number: "Bad number",
  low_potential: "Low potential",
  high_potential: "High potential",
  no_answer_1: "No answer (1st try)",
  no_answer_2: "No answer (2nd try)",
  no_answer_3: "No answer (3rd try)",
  no_answer_4: "No answer (4th try)",
  no_answer_5: "No answer (5th try)",
};

export function statusLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return LEAD_STATUS_LABEL[key] ?? key.replace(/_/g, " ");
}
