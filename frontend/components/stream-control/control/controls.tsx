"use client";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// SliderControl — labeled slider with value readout
// ---------------------------------------------------------------------------

export function SliderControl({
  label,
  value,
  min,
  max,
  step,
  format,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "text-xs text-muted-foreground",
            disabled && "text-muted-foreground/50",
          )}
        >
          {label}
        </span>
        <span className="tabular-nums text-sm font-semibold text-foreground">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          "h-1.5 w-full appearance-none rounded-full bg-border/40 accent-amber-500",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "[&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full",
          "[&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:shadow-amber-900/30",
          !disabled && "cursor-pointer",
        )}
      />
    </label>
  );
}

export function ToggleControl({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-background/40 px-3 py-2">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground">{label}</div>
        {description ? (
          <div className="text-[11px] text-muted-foreground">{description}</div>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition",
          checked
            ? "border-amber-500/60 bg-amber-500/20"
            : "border-border/50 bg-muted/40",
        )}
      >
        <span
          className={cn(
            "block size-4 rounded-full transition-transform",
            checked
              ? "translate-x-5 bg-amber-400"
              : "translate-x-1 bg-zinc-300",
          )}
        />
      </button>
    </div>
  );
}
