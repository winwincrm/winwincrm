import { statusLabel } from "./lead-status-labels";

export type ActivityRow = {
  id: string;
  activity_type: string;
  field_name?: string | null;
  old_value: unknown;
  new_value: unknown;
  user_id: string | null;
  created_at: string;
};

type Ctx = {
  userName: (id: string | null | undefined) => string;
  officeName: (id: string | null | undefined) => string;
};

function asStr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  return String(v);
}

export function formatActivity(a: ActivityRow, ctx: Ctx): { who: string; action: string; detail: string } {
  const who = ctx.userName(a.user_id);
  const oldV = asStr(a.old_value);
  const newV = asStr(a.new_value);
  switch (a.activity_type) {
    case "created":
      return { who, action: "created the lead", detail: newV ? `status: ${statusLabel(newV)}` : "" };
    case "status_changed":
      return { who, action: "changed status", detail: `${statusLabel(oldV)} → ${statusLabel(newV)}` };
    case "assigned":
      return {
        who,
        action: newV ? "reassigned agent" : "unassigned",
        detail: `${ctx.userName(oldV)} → ${ctx.userName(newV)}`,
      };
    case "office_changed":
      return {
        who,
        action: "moved office",
        detail: `${ctx.officeName(oldV)} → ${ctx.officeName(newV)}`,
      };
    default:
      return {
        who,
        action: a.activity_type.replace(/_/g, " "),
        detail: oldV || newV ? `${oldV ?? "—"} → ${newV ?? "—"}` : "",
      };
  }
}
