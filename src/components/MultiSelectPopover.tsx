import { useMemo, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface Props {
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  triggerClassName?: string;
}

export function MultiSelectPopover({
  options, value, onChange, placeholder = "All", searchPlaceholder = "Search…", triggerClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle));
  }, [options, q]);

  const selectedSet = useMemo(() => new Set(value), [value]);

  const toggle = (v: string) => {
    const next = new Set(selectedSet);
    if (next.has(v)) next.delete(v); else next.add(v);
    onChange(Array.from(next));
  };

  const triggerLabel = (() => {
    if (value.length === 0) return placeholder;
    if (value.length === 1) {
      const o = options.find((x) => x.value === value[0]);
      return o?.label ?? value[0];
    }
    return `${value.length} selected`;
  })();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            triggerClassName,
          )}
        >
          <span className={cn("truncate", value.length === 0 && "text-muted-foreground")}>{triggerLabel}</span>
          <div className="flex items-center gap-1 shrink-0">
            {value.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{value.length}</Badge>
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="p-2 border-b">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-8"
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No results</div>
          ) : filtered.map((o) => {
            const sel = selectedSet.has(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent text-left"
              >
                <span className={cn(
                  "flex h-4 w-4 items-center justify-center rounded border",
                  sel ? "bg-primary border-primary text-primary-foreground" : "border-input",
                )}>
                  {sel && <Check className="h-3 w-3" />}
                </span>
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
        {value.length > 0 && (
          <div className="border-t p-1.5 flex justify-between">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange([])}>
              <X className="h-3 w-3 mr-1" /> Clear
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpen(false)}>Done</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}