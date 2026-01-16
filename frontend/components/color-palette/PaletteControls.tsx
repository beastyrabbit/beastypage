"use client";

import { Loader2, Sparkles, RotateCcw } from "lucide-react";

interface PaletteControlsProps {
  colorCount: number;
  filterBlackWhite: boolean;
  isProcessing: boolean;
  hasColors: boolean;
  onColorCountChange: (count: number) => void;
  onFilterToggle: (filter: boolean) => void;
  onExtract: () => void;
  onReset: () => void;
}

/**
 * Renders UI controls for configuring and triggering color palette extraction.
 *
 * @param colorCount - Current number of colors to extract (3–12)
 * @param filterBlackWhite - Whether to exclude black and white from extraction
 * @param isProcessing - When true, disables inputs and shows a processing state
 * @param hasColors - Whether a palette already exists (affects extract button label)
 * @param onColorCountChange - Called with the new color count when the slider changes
 * @param onFilterToggle - Called with the new filter state when the toggle changes
 * @param onExtract - Invoked when the extract button is pressed
 * @param onReset - Invoked when the reset button is pressed
 * @returns The PaletteControls UI element
 */
export function PaletteControls({
  colorCount,
  filterBlackWhite,
  isProcessing,
  hasColors,
  onColorCountChange,
  onFilterToggle,
  onExtract,
  onReset,
}: PaletteControlsProps) {
  return (
    <div className="glass-card flex flex-wrap items-center gap-4 p-4 sm:gap-6 sm:p-6">
      {/* Color count slider */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-muted-foreground">
          Colors: {colorCount}
        </label>
        <input
          type="range"
          min={3}
          max={12}
          value={colorCount}
          onChange={(e) => onColorCountChange(parseInt(e.target.value))}
          className="h-2 w-32 cursor-pointer appearance-none rounded-lg bg-border/50 accent-primary [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
          disabled={isProcessing}
        />
      </div>

      {/* Filter toggle */}
      <div className="flex items-center gap-3">
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={filterBlackWhite}
            onChange={(e) => onFilterToggle(e.target.checked)}
            className="peer sr-only"
            disabled={isProcessing}
          />
          <div className="peer h-6 w-11 rounded-full bg-border/50 after:absolute after:start-[2px] after:top-[2px] after:size-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-focus:outline-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50" />
        </label>
        <span className="text-sm text-muted-foreground">Filter black/white</span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={onReset}
          className="flex items-center gap-2 rounded-xl border border-border/50 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:border-foreground/30 hover:text-foreground"
          disabled={isProcessing}
        >
          <RotateCcw className="size-4" />
          <span className="hidden sm:inline">Reset</span>
        </button>
        <button
          onClick={onExtract}
          disabled={isProcessing}
          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isProcessing ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              {hasColors ? "Re-extract" : "Extract Colors"}
            </>
          )}
        </button>
      </div>
    </div>
  );
}