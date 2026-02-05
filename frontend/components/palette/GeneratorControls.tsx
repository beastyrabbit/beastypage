"use client";

import { cn } from "@/lib/utils";
import { MODE_OPTIONS, DISPLAY_FORMATS, type DisplayFormat } from "@/lib/palette-generator/types";
import SparklesIcon from "@/components/ui/sparkles-icon";

interface GeneratorControlsProps {
  paletteSize: number;
  onPaletteSizeChange: (val: number) => void;
  displayFormat: DisplayFormat;
  onFormatChange: (fmt: DisplayFormat) => void;
  onGenerate: (mode: string) => void;
  generatingMode: string | null;
}

const SLIDER_MIN = 1;
const SLIDER_MAX = 12;

export function GeneratorControls({
  paletteSize,
  onPaletteSizeChange,
  displayFormat,
  onFormatChange,
  onGenerate,
  generatingMode,
}: GeneratorControlsProps) {
  const percent = ((paletteSize - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100;

  return (
    <div className="glass-card sticky top-4 z-20 space-y-4 p-5">
      {/* Row 1: Mode generate buttons */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-muted-foreground/80">Generate by Mode</span>
          <div className="inline-flex items-center gap-1 rounded-full border border-border/30 bg-muted/30 p-1">
            {DISPLAY_FORMATS.map((fmt) => (
              <button
                key={fmt}
                type="button"
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition",
                  displayFormat === fmt
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => onFormatChange(fmt)}
              >
                {fmt}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {MODE_OPTIONS.map((option) => {
            const isLoading = generatingMode === option.key;
            const isDisabled = generatingMode !== null && !isLoading;

            let stateClasses: string;
            if (isLoading) {
              stateClasses = "border-primary/60 bg-primary/20 text-primary";
            } else if (isDisabled) {
              stateClasses = "border-border/30 text-muted-foreground/50";
            } else {
              stateClasses = "border-primary/40 bg-primary/5 text-primary hover:border-primary/60 hover:bg-primary/15";
            }

            return (
              <button
                key={option.key}
                type="button"
                disabled={generatingMode !== null}
                onClick={() => onGenerate(option.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition",
                  stateClasses,
                )}
              >
                {isLoading ? (
                  <svg className="size-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="10" />
                  </svg>
                ) : (
                  <SparklesIcon size={12} />
                )}
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 2: Palette size — single slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-muted-foreground/80">Palette size</span>
          <span className="font-mono text-sm font-medium text-foreground">
            {paletteSize} {paletteSize === 1 ? "color" : "colors"}
          </span>
        </div>

        <div className="relative h-6 select-none">
          {/* Track background */}
          <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-white/10" />
          {/* Active track fill */}
          <div
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-amber-500 to-amber-400"
            style={{ width: `${percent}%` }}
          />
          <input
            type="range"
            min={SLIDER_MIN}
            max={SLIDER_MAX}
            value={paletteSize}
            onChange={(e) => onPaletteSizeChange(Number(e.target.value))}
            className="palette-slider absolute top-0 h-6 w-full appearance-none bg-transparent"
            aria-label="Palette size"
          />
        </div>

        {/* Scale markers */}
        <div className="flex justify-between px-0.5">
          {Array.from({ length: SLIDER_MAX }, (_, i) => (
            <span
              key={i + 1}
              className={cn(
                "text-[9px] tabular-nums",
                i + 1 <= paletteSize
                  ? "text-amber-400/80"
                  : "text-muted-foreground/40",
              )}
            >
              {i + 1}
            </span>
          ))}
        </div>
      </div>

      {/* Slider CSS */}
      <style>{`
        .palette-slider {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
        }
        .palette-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(245, 158, 11, 0.4);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .palette-slider::-webkit-slider-thumb:hover {
          transform: scale(1.15);
          box-shadow: 0 3px 10px rgba(245, 158, 11, 0.5);
        }
        .palette-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          border: none;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(245, 158, 11, 0.4);
        }
        .palette-slider::-moz-range-thumb:hover {
          transform: scale(1.15);
          box-shadow: 0 3px 10px rgba(245, 158, 11, 0.5);
        }
        .palette-slider::-moz-range-track {
          background: transparent;
        }
      `}</style>
    </div>
  );
}
