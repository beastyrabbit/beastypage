"use client";

import { useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

import type { ExtractedColor } from "@/lib/color-extraction/types";
import { getContrastColor, rgbToCss, hslToCss } from "@/lib/color-extraction/color-utils";

interface ColorSwatchProps {
  color: ExtractedColor;
  index: number;
  isSelected: boolean;
  onHover: (index: number | null) => void;
  onSelect: (index: number) => void;
}

export function ColorSwatch({
  color,
  index,
  isSelected,
  onHover,
  onSelect,
}: ColorSwatchProps) {
  const textColor = getContrastColor(color.rgb);

  const copyToClipboard = useCallback(
    async (text: string, format: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast.success(`Copied ${format}: ${text}`);
      } catch {
        toast.error("Failed to copy to clipboard");
      }
    },
    []
  );

  return (
    <div
      className={`group relative cursor-pointer overflow-hidden rounded-xl transition-all duration-200 hover:scale-105 hover:shadow-lg ${
        isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
      }`}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(index)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect(index)}
      aria-label={`Color ${index + 1}: ${color.hex}`}
    >
      {/* Color preview */}
      <div
        className="flex h-24 flex-col items-center justify-center p-2"
        style={{ backgroundColor: color.hex }}
      >
        <span
          className="text-lg font-bold opacity-80"
          style={{ color: textColor }}
        >
          {index + 1}
        </span>
        <span
          className="text-xs font-medium"
          style={{ color: textColor }}
        >
          {color.prevalence}%
        </span>
      </div>

      {/* Color info */}
      <div className="space-y-1.5 bg-background/90 p-3 backdrop-blur-sm">
        {/* HEX */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            copyToClipboard(color.hex, "HEX");
          }}
          className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-primary/10"
        >
          <span className="font-mono font-semibold">{color.hex.toUpperCase()}</span>
          <Copy className="size-3 opacity-50 group-hover:opacity-100" />
        </button>

        {/* RGB */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            copyToClipboard(rgbToCss(color.rgb), "RGB");
          }}
          className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
        >
          <span className="font-mono">
            {color.rgb.r}, {color.rgb.g}, {color.rgb.b}
          </span>
          <Copy className="size-3 opacity-0 group-hover:opacity-50" />
        </button>

        {/* HSL */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            copyToClipboard(hslToCss(color.hsl), "HSL");
          }}
          className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
        >
          <span className="font-mono">
            {color.hsl.h}°, {color.hsl.s}%, {color.hsl.l}%
          </span>
          <Copy className="size-3 opacity-0 group-hover:opacity-50" />
        </button>
      </div>

      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute right-2 top-2 rounded-full bg-primary p-1">
          <Check className="size-3 text-primary-foreground" />
        </div>
      )}
    </div>
  );
}
