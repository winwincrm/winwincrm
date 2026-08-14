import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Stable hash → hue so each former owner gets a consistent swatch.
function hueFor(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function OriginAgentBadge({
  name,
  className,
  compact = false,
}: {
  name: string | null | undefined;
  className?: string;
  compact?: boolean;
}) {
  if (!name) return null;
  const hue = hueFor(name);
  const dot = `hsl(${hue} 70% 55%)`;
  const bg = `hsl(${hue} 70% 55% / 0.12)`;
  const border = `hsl(${hue} 70% 55% / 0.45)`;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none text-foreground/90",
              className,
            )}
            style={{ backgroundColor: bg, borderColor: border }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: dot }}
            />
            {compact ? name : <>From {name}</>}
          </span>
        </TooltipTrigger>
        <TooltipContent>Originally assigned to {name}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
