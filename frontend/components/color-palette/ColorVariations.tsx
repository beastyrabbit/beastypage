"use client";

import { useCallback, useMemo } from "react";
import { Sun } from "lucide-react";
import CopyIcon from "@/components/ui/copy-icon";
import PaintIcon from "@/components/ui/paint-icon";
import { toast } from "sonner";

import type { ExtractedColor } from "@/lib/color-extraction/types";
import {
  adjustBrightness,
  adjustHue,
  rgbToHex,
  getContrastColor,
  hexToRgb,
} from "@/lib/color-extraction/color-utils";

interface ColorVariationsProps {
  color: ExtractedColor;
}

const BRIGHTNESS_STEPS = [-30, -15, 0, 15, 30];
const HUE_STEPS = [-30, -20, -10, 0, 10, 20, 30];

export function ColorVariations({ color }: ColorVariationsProps) {
  const brightnessVariations = useMemo(
    () =>
      BRIGHTNESS_STEPS.map((step) => {
        const adjusted = adjustBrightness(color.rgb, step);
        return {
          hex: rgbToHex(adjusted),
          label: step === 0 ? "Original" : `${step > 0 ? "+" : ""}${step}%`,
        };
      }),
    [color.rgb]
  );

  const hueVariations = useMemo(
    () =>
      HUE_STEPS.map((step) => {
        const adjusted = adjustHue(color.rgb, step);
        return {
          hex: rgbToHex(adjusted),
          label: step === 0 ? "Original" : `${step > 0 ? "+" : ""}${step}°`,
        };
      }),
    [color.rgb]
  );

  const copyToClipboard = useCallback(async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      toast.success(`Copied: ${hex}`);
    } catch {
      toast.error("Failed to copy");
    }
  }, []);

  return (
    <div className="glass-card animate-in fade-in slide-in-from-bottom-4 p-6">
      <div className="mb-6 flex items-center gap-3">
        <div
          className="size-8 rounded-lg"
          style={{ backgroundColor: color.hex }}
        />
        <div>
          <h3 className="font-semibold text-foreground">Color Variations</h3>
          <p className="text-sm text-muted-foreground">{color.hex.toUpperCase()}</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Brightness variations */}
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <Sun className="size-4" />
            Brightness
          </div>
          <div className="flex flex-wrap gap-2">
            {brightnessVariations.map((variation, index) => (
              <button
                key={index}
                onClick={() => copyToClipboard(variation.hex)}
                className="group flex flex-col items-center gap-1.5 rounded-lg p-2 transition-all hover:bg-primary/10"
                title={`Click to copy ${variation.hex}`}
              >
                <div
                  className="size-12 rounded-lg shadow-sm transition-transform group-hover:scale-110"
                  style={{ backgroundColor: variation.hex }}
                >
                  <div className="flex size-full items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                    <CopyIcon
                      size={16}
                      color={getContrastColor(hexToRgb(variation.hex))}
                    />
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {variation.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Hue variations */}
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <PaintIcon size={16} />
            Hue Shift
          </div>
          <div className="flex flex-wrap gap-2">
            {hueVariations.map((variation, index) => (
              <button
                key={index}
                onClick={() => copyToClipboard(variation.hex)}
                className="group flex flex-col items-center gap-1.5 rounded-lg p-2 transition-all hover:bg-primary/10"
                title={`Click to copy ${variation.hex}`}
              >
                <div
                  className="size-12 rounded-lg shadow-sm transition-transform group-hover:scale-110"
                  style={{ backgroundColor: variation.hex }}
                >
                  <div className="flex size-full items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                    <CopyIcon
                      size={16}
                      color={getContrastColor(hexToRgb(variation.hex))}
                    />
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {variation.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
