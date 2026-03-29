"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { MAX_LAYER_VALUE, clampLayerValue } from "@/utils/catSettingsHelpers";
import type { LayerRange } from "@/utils/singleCatVariants";

// ---------------------------------------------------------------------------
// Row (single min or max selector)
// ---------------------------------------------------------------------------

interface LayerRangeSelectorRowProps {
  label: string;
  type: "min" | "max";
  selectedValue: number;
  options: number[];
  minValue: number;
  onSelect: (next: number) => void;
}

function LayerRangeSelectorRow({
  label,
  type,
  selectedValue,
  options,
  minValue,
  onSelect,
}: LayerRangeSelectorRowProps) {
  return (
    <div className="flex items-center gap-2" role="radiogroup" aria-label={`${label} ${type}`}>
      <span className="w-10 text-[10px] uppercase tracking-wide text-muted-foreground/70">
        {type === "min" ? "Min" : "Max"}
      </span>
      <div className="flex flex-1 items-center gap-1 rounded-full border border-border/60 bg-background/70 p-1">
        {options.map((option) => {
          const isActive = selectedValue === option;
          const isDisabled = type === "max" && option < minValue;
          return (
            <button
              key={`${label}-${type}-${option}`}
              type="button"
              role="radio"
              aria-checked={isActive}
              disabled={isDisabled}
              onClick={() => onSelect(option)}
              className={cn(
                "h-8 flex-1 rounded-md text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                isDisabled && "cursor-not-allowed opacity-40",
                !isActive && !isDisabled && "bg-background text-muted-foreground hover:bg-primary/10",
                isActive && "bg-primary text-primary-foreground shadow-inner",
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface LayerRangeSelectorProps {
  label: string;
  value: LayerRange;
  onChange: (next: LayerRange) => void;
  /** Render min/max side-by-side instead of stacked */
  compact?: boolean;
}

export function LayerRangeSelector({ label, value, onChange, compact }: LayerRangeSelectorProps) {
  const summary = value.min === value.max ? `${value.min}` : `${value.min} – ${value.max}`;
  const options = useMemo(() => Array.from({ length: MAX_LAYER_VALUE + 1 }, (_, index) => index), []);

  const handleMinSelect = (nextMin: number) => {
    const clampedMin = clampLayerValue(nextMin);
    const clampedMax = clampLayerValue(value.max);
    const adjustedMax = Math.max(clampedMin, clampedMax);
    onChange({ min: clampedMin, max: adjustedMax });
  };

  const handleMaxSelect = (nextMax: number) => {
    const clampedMax = clampLayerValue(nextMax);
    const clampedMin = clampLayerValue(value.min);
    if (clampedMax < clampedMin) {
      onChange({ min: clampedMax, max: clampedMax });
    } else {
      onChange({ min: clampedMin, max: clampedMax });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground/80">
        <span>{label}</span>
        <span className="font-mono text-muted-foreground/70">{summary}</span>
      </div>
      <div className={compact ? "grid grid-cols-2 gap-3" : "space-y-2"}>
        <LayerRangeSelectorRow
          label={label}
          type="min"
          selectedValue={clampLayerValue(value.min)}
          options={options}
          minValue={value.min}
          onSelect={handleMinSelect}
        />
        <LayerRangeSelectorRow
          label={label}
          type="max"
          selectedValue={clampLayerValue(value.max)}
          options={options}
          minValue={value.min}
          onSelect={handleMaxSelect}
        />
      </div>
    </div>
  );
}
