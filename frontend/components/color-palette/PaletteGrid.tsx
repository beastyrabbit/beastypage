"use client";

import { useMemo, useCallback } from "react";
import { Copy, Sun, Palette } from "lucide-react";
import { toast } from "sonner";
import { track } from "@/lib/analytics";

import type { ExtractedColor } from "@/lib/color-extraction/types";
import {
  adjustBrightness,
  adjustHue,
  rgbToHex,
  getContrastColor,
  hexToRgb,
} from "@/lib/color-extraction/color-utils";
import { generateColorDisplayName } from "@/lib/color-extraction/color-names";

interface PaletteGridProps {
  colors: ExtractedColor[];
  brightnessFactors: number[];
  hueShifts: number[];
  title: string;
  type: "dominant" | "accent";
  selectedIndex: number | null;
  highlightedIndex: number | null;
  onColorHover: (index: number | null, rgb?: { r: number; g: number; b: number }) => void;
  onColorSelect: (index: number) => void;
}

export function PaletteGrid({
  colors,
  brightnessFactors,
  hueShifts,
  title,
  type,
  selectedIndex,
  highlightedIndex,
  onColorHover,
  onColorSelect,
}: PaletteGridProps) {
  const ringColor = type === "dominant" ? "#8B5CF6" : "#38BDF8";

  const copyToClipboard = useCallback(async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      toast.success(`Copied: ${hex}`);
      track("palette_color_copied", {});
    } catch {
      toast.error("Failed to copy");
    }
  }, []);

  // Generate brightness variations for all colors (grid: rows=colors, cols=factors)
  const brightnessGrid = useMemo(() => {
    return colors.map((color) =>
      brightnessFactors.map((factor) => {
        const adjustment = (factor - 1) * 50;
        const adjusted = adjustBrightness(color.rgb, adjustment);
        return {
          hex: rgbToHex(adjusted),
          factor,
        };
      })
    );
  }, [colors, brightnessFactors]);

  // Generate hue variations for all colors (grid: rows=colors, cols=shifts)
  const hueGrid = useMemo(() => {
    return colors.map((color) =>
      hueShifts.map((shift) => {
        const adjusted = adjustHue(color.rgb, shift);
        return {
          hex: rgbToHex(adjusted),
          shift,
        };
      })
    );
  }, [colors, hueShifts]);

  if (colors.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <div
          className="h-1 w-8 rounded-full"
          style={{ backgroundColor: ringColor }}
        />
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <div className="flex-1 h-px bg-border/30" />
      </div>

      {/* Color strip - main colors - full width grid */}
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${colors.length}, 1fr)`,
        }}
      >
        {colors.map((color, index) => {
          const isSelected = selectedIndex === index;
          const isHighlighted = highlightedIndex === index;

          return (
            <button
              key={index}
              onClick={() => onColorSelect(index)}
              onMouseEnter={() => onColorHover(index, color.rgb)}
              onMouseLeave={() => onColorHover(null)}
              className={`group relative aspect-square rounded-xl shadow-md transition-all duration-200 ${
                isSelected ? "ring-2 ring-offset-2 ring-offset-background z-10" : "hover:scale-105"
              }`}
              style={{
                backgroundColor: color.hex,
                boxShadow: isSelected || isHighlighted
                  ? `0 0 0 3px ${ringColor}, 0 4px 12px rgba(0,0,0,0.2)`
                  : "0 2px 8px rgba(0,0,0,0.15)",
              }}
              title={`${generateColorDisplayName(index, color.name || "Loading...", type)} - ${color.hex}\nClick to select, right-click to copy`}
              onContextMenu={(e) => {
                e.preventDefault();
                copyToClipboard(color.hex);
              }}
            >
              {/* Pulse animation for highlighted */}
              {isHighlighted && !isSelected && (
                <div
                  className="absolute inset-0 rounded-xl animate-ping"
                  style={{
                    boxShadow: `0 0 0 2px ${ringColor}`,
                    opacity: 0.5,
                  }}
                />
              )}

              {/* Index badge */}
              <span
                className="absolute inset-0 flex items-center justify-center text-sm font-bold opacity-80 transition-opacity group-hover:opacity-100"
                style={{ color: getContrastColor(color.rgb) }}
              >
                {index + 1}
              </span>

              {/* Copy icon on hover */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-xl">
                <Copy
                  className="size-4"
                  style={{ color: getContrastColor(color.rgb) }}
                />
              </div>

              {/* Selection indicator */}
              {isSelected && (
                <div
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: ringColor }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Brightness variations grid - full width */}
      <div>
        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Sun className="size-3.5" />
          Brightness
        </div>
        <div className="flex flex-col gap-1">
          {brightnessGrid.map((row, rowIndex) => {
            const isRowSelected = selectedIndex === rowIndex;
            const isRowHighlighted = highlightedIndex === rowIndex;

            return (
              <div
                key={rowIndex}
                className={`grid gap-1 p-1 -m-1 rounded-lg transition-all duration-200 ${
                  isRowSelected
                    ? "bg-primary/10"
                    : isRowHighlighted
                    ? "bg-primary/5"
                    : ""
                }`}
                style={{
                  gridTemplateColumns: `repeat(${brightnessFactors.length}, 1fr)`,
                  boxShadow: isRowSelected
                    ? `inset 0 0 0 1px ${ringColor}40`
                    : isRowHighlighted
                    ? `inset 0 0 0 1px ${ringColor}20`
                    : "none",
                }}
              >
                {row.map((cell, colIndex) => {
                  const cellRgb = hexToRgb(cell.hex);
                  return (
                  <button
                    key={colIndex}
                    onClick={() => copyToClipboard(cell.hex)}
                    onMouseEnter={() => onColorHover(rowIndex, cellRgb)}
                    onMouseLeave={() => onColorHover(null)}
                    className="group relative aspect-[2/1] rounded transition-transform hover:scale-105 hover:z-10"
                    style={{ backgroundColor: cell.hex }}
                    title={`${generateColorDisplayName(rowIndex, colors[rowIndex].name || "Loading...", type, { brightnessMultiplier: cell.factor })} - ${cell.hex}\nClick to copy`}
                  >
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                      <Copy
                        className="size-3"
                        style={{ color: getContrastColor(cellRgb) }}
                      />
                    </div>
                  </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div
          className="mt-2 grid text-[10px] text-muted-foreground"
          style={{
            gridTemplateColumns: `repeat(${brightnessFactors.length}, 1fr)`,
          }}
        >
          {brightnessFactors.map((factor, index) => (
            <span key={index} className="text-center">
              {factor}x
            </span>
          ))}
        </div>
      </div>

      {/* Hue variations grid - full width */}
      <div>
        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Palette className="size-3.5" />
          Hue Shift
        </div>
        <div className="flex flex-col gap-1">
          {hueGrid.map((row, rowIndex) => {
            const isRowSelected = selectedIndex === rowIndex;
            const isRowHighlighted = highlightedIndex === rowIndex;

            return (
              <div
                key={rowIndex}
                className={`grid gap-1 p-1 -m-1 rounded-lg transition-all duration-200 ${
                  isRowSelected
                    ? "bg-primary/10"
                    : isRowHighlighted
                    ? "bg-primary/5"
                    : ""
                }`}
                style={{
                  gridTemplateColumns: `repeat(${hueShifts.length}, 1fr)`,
                  boxShadow: isRowSelected
                    ? `inset 0 0 0 1px ${ringColor}40`
                    : isRowHighlighted
                    ? `inset 0 0 0 1px ${ringColor}20`
                    : "none",
                }}
              >
                {row.map((cell, colIndex) => {
                  const cellRgb = hexToRgb(cell.hex);
                  return (
                  <button
                    key={colIndex}
                    onClick={() => copyToClipboard(cell.hex)}
                    onMouseEnter={() => onColorHover(rowIndex, cellRgb)}
                    onMouseLeave={() => onColorHover(null)}
                    className="group relative aspect-[2/1] rounded transition-transform hover:scale-105 hover:z-10"
                    style={{ backgroundColor: cell.hex }}
                    title={`${generateColorDisplayName(rowIndex, colors[rowIndex].name || "Loading...", type, { hueShift: cell.shift })} - ${cell.hex}\nClick to copy`}
                  >
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                      <Copy
                        className="size-3"
                        style={{ color: getContrastColor(cellRgb) }}
                      />
                    </div>
                  </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div
          className="mt-2 grid text-[10px] text-muted-foreground"
          style={{
            gridTemplateColumns: `repeat(${hueShifts.length}, 1fr)`,
          }}
        >
          {hueShifts.map((shift, index) => (
            <span key={index} className="text-center">
              {shift >= 0 ? "+" : ""}{shift}°
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
