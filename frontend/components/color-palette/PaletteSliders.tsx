"use client";

import PaintIcon from "@/components/ui/paint-icon";
import SparklesIcon from "@/components/ui/sparkles-icon";

interface PaletteSlidersProps {
  topColorCount: number;
  familyColorCount: number;
  isProcessing: boolean;
  onTopColorCountChange: (count: number) => void;
  onFamilyColorCountChange: (count: number) => void;
}

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
          <SparklesIcon size={14} />
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
          <PaintIcon size={14} />
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
