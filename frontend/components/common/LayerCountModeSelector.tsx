"use client";

import { cn } from "@/lib/utils";

interface LayerCountModeSelectorProps {
  value: boolean;
  onChange: (value: boolean) => void;
  compact?: boolean;
}

export function LayerCountModeSelector({
  value,
  onChange,
  compact = false,
}: LayerCountModeSelectorProps) {
  return (
    <div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={cn(
          "flex w-full items-center justify-between rounded-xl border p-3 text-left transition",
          value
            ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
            : "border-border/40 bg-background/50 hover:border-primary/30 hover:bg-primary/5",
          compact && "p-2.5",
        )}
      >
        <span
          className={cn(
            "text-sm font-semibold",
            value ? "text-foreground" : "text-muted-foreground",
          )}
        >
          Exact rolled count
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition",
            value
              ? "border-primary/50 bg-primary/80"
              : "border-border/60 bg-muted/40",
          )}
        >
          <span
            className={cn(
              "inline-block size-4 rounded-full bg-white transition",
              value ? "translate-x-5" : "translate-x-1",
            )}
          />
        </span>
      </button>
    </div>
  );
}
