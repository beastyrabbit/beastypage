"use client";

import { Palette, Sparkles } from "lucide-react";

interface PaletteSlidersProps {
  topColorCount: number;
  familyColorCount: number;
  isProcessing: boolean;
  onTopColorCountChange: (count: number) => void;
  onFamilyColorCountChange: (count: number) => void;
}

/**
 * Render two labeled range sliders for adjusting the palette's top and family color counts.
 *
 * Each slider displays its current count, allows selecting values from 1 to 20, and is disabled when processing.
 *
 * @param topColorCount - Current number of top colors shown by the Top Colors slider
 * @param familyColorCount - Current number of family colors shown by the Family Colors slider
 * @param isProcessing - When `true`, both sliders are disabled
 * @param onTopColorCountChange - Called with the new top color count when the Top Colors slider changes
 * @param onFamilyColorCountChange - Called with the new family color count when the Family Colors slider changes
 * @returns A React element containing two labeled range inputs for adjusting the palette counts
 */
export function PaletteSliders({
  topColorCount,
  familyColorCount,
  isProcessing,
  onTopColorCountChange,
  onFamilyColorCountChange,
}: PaletteSlidersProps) {
  return (
    <div className="flex flex-wrap items-center gap-6">
      {/* Top Colors slider */}
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Sparkles className="size-3.5" />
          Top Colors: {topColorCount}
        </label>
        <input
          type="range"
          min={1}
          max={20}
          value={topColorCount}
          onChange={(e) => onTopColorCountChange(parseInt(e.target.value))}
          className="h-2 w-40 cursor-pointer appearance-none rounded-lg bg-border/50 accent-primary [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
          disabled={isProcessing}
        />
      </div>

      {/* Family Colors slider */}
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Palette className="size-3.5" />
          Family Colors: {familyColorCount}
        </label>
        <input
          type="range"
          min={1}
          max={20}
          value={familyColorCount}
          onChange={(e) => onFamilyColorCountChange(parseInt(e.target.value))}
          className="h-2 w-40 cursor-pointer appearance-none rounded-lg bg-border/50 accent-violet-500 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-500"
          disabled={isProcessing}
        />
      </div>
    </div>
  );
}