import { useTranslation } from "react-i18next";
import { LEAD_STATUSES, STATUS_TOKEN, type LeadStatus } from "@/lib/lead-constants";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: LeadStatus; className?: string }) {
  const { t } = useTranslation();
  const token = STATUS_TOKEN[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        className
      )}
      style={{
        backgroundColor: `color-mix(in oklab, var(--color-${token}) 15%, transparent)`,
        color: `var(--color-${token})`,
        border: `1px solid color-mix(in oklab, var(--color-${token}) 30%, transparent)`,
      }}
    >
      {t(`status.${status}`)}
    </span>
  );
}

export const ALL_STATUSES = LEAD_STATUSES;
