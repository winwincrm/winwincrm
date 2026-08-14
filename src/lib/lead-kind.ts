// Three-way kind shown in the UI. `lead_kind` is the generated
// live/cold derived from the contact name; `is_in_house` is the
// admin-set or transfer-set second dimension. We merge them into
// one display category that everyone (admin, office, agent) sees.

export type EffectiveKind = "live" | "cold" | "live_in_house";

export type ViewerRole = "admin" | "manager" | "superiormanager" | "agent";

export function effectiveKind(
  lead: {
    lead_kind?: string | null;
    is_in_house?: boolean | null;
    hide_in_house_from_agents?: boolean | null;
  },
  viewerRole: ViewerRole = "admin",
): EffectiveKind {
  if (lead.lead_kind === "cold") return "cold";
  if (lead.is_in_house && lead.lead_kind === "live") {
    // One-off opt-out: keep these leads labelled plain "Live" for non-admins.
    if (lead.hide_in_house_from_agents && viewerRole !== "admin") return "live";
    return "live_in_house";
  }
  return "live";
}

export const KIND_LABEL: Record<EffectiveKind, string> = {
  live: "Live",
  cold: "Cold",
  live_in_house: "Live in House",
};

export const KIND_SHORT: Record<EffectiveKind, string> = {
  live: "Live",
  cold: "Cold",
  live_in_house: "In House",
};

// Tailwind class fragments for badges/bars
export const KIND_BADGE_CLASS: Record<EffectiveKind, string> = {
  live: "bg-primary/15 text-primary",
  cold: "bg-sky-500/15 text-sky-400",
  live_in_house: "bg-accent/40 text-accent-foreground border border-accent/60",
};

export const KIND_BAR_CLASS: Record<EffectiveKind, string> = {
  live: "bg-primary/70",
  cold: "bg-sky-500/60",
  live_in_house: "bg-accent/70",
};
