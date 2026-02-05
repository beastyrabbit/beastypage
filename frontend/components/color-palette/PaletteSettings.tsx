"use client";

import { useState, useCallback } from "react";
import { Sun, Filter } from "lucide-react";
import GearIcon from "@/components/ui/gear-icon";
import DownChevron from "@/components/ui/down-chevron";
import RefreshIcon from "@/components/ui/refresh-icon";
import PaintIcon from "@/components/ui/paint-icon";
import PenIcon from "@/components/ui/pen-icon";

interface PaletteSettingsProps {
  brightnessFactors: number[];
  hueShifts: number[];
  filterBlackWhite: boolean;
  onBrightnessFactorsChange: (factors: number[]) => void;
  onHueShiftsChange: (shifts: number[]) => void;
  onFilterToggle: (filter: boolean) => void;
}

const DEFAULT_BRIGHTNESS = [0.5, 0.75, 1.0, 1.25, 1.5];
const DEFAULT_HUE = [0, 10, 20, 30];

// Preset configurations
const BRIGHTNESS_PRESETS = [
  { label: "Subtle", values: [0.8, 0.9, 1.0, 1.1, 1.2] },
  { label: "Normal", values: [0.5, 0.75, 1.0, 1.25, 1.5] },
  { label: "Dramatic", values: [0.25, 0.5, 1.0, 1.5, 2.0] },
];

const HUE_PRESETS = [
  { label: "Subtle", values: [0, 5, 10, 15] },
  { label: "Normal", values: [0, 10, 20, 30] },
  { label: "Wide", values: [-30, -15, 0, 15, 30] },
  { label: "Complementary", values: [0, 60, 120, 180] },
];

export function PaletteSettings({
  brightnessFactors,
  hueShifts,
  filterBlackWhite,
  onBrightnessFactorsChange,
  onHueShiftsChange,
  onFilterToggle,
}: PaletteSettingsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCustomBrightness, setShowCustomBrightness] = useState(false);
  const [showCustomHue, setShowCustomHue] = useState(false);
  const [customBrightnessInput, setCustomBrightnessInput] = useState("");
  const [customHueInput, setCustomHueInput] = useState("");

  const resetToDefaults = () => {
    onBrightnessFactorsChange(DEFAULT_BRIGHTNESS);
    onHueShiftsChange(DEFAULT_HUE);
    setShowCustomBrightness(false);
    setShowCustomHue(false);
  };

  const isBrightnessPreset = (values: number[]) => {
    return JSON.stringify(brightnessFactors) === JSON.stringify(values);
  };

  const isHuePreset = (values: number[]) => {
    return JSON.stringify(hueShifts) === JSON.stringify(values);
  };

  const isCustomBrightness = !BRIGHTNESS_PRESETS.some(p => isBrightnessPreset(p.values));
  const isCustomHue = !HUE_PRESETS.some(p => isHuePreset(p.values));

  const handleCustomBrightnessSubmit = useCallback(() => {
    const values = customBrightnessInput
      .split(/[,\/\s]+/)
      .map(v => parseFloat(v.trim()))
      .filter(v => !isNaN(v) && v > 0 && v <= 5);

    if (values.length > 0) {
      onBrightnessFactorsChange(values.sort((a, b) => a - b));
      setShowCustomBrightness(false);
    }
  }, [customBrightnessInput, onBrightnessFactorsChange]);

  const handleCustomHueSubmit = useCallback(() => {
    const values = customHueInput
      .split(/[,\/\s]+/)
      .map(v => parseFloat(v.trim()))
      .filter(v => !isNaN(v) && v >= -180 && v <= 360);

    if (values.length > 0) {
      onHueShiftsChange(values.sort((a, b) => a - b));
      setShowCustomHue(false);
    }
  }, [customHueInput, onHueShiftsChange]);

  const openCustomBrightness = () => {
    setCustomBrightnessInput(brightnessFactors.join(", "));
    setShowCustomBrightness(true);
  };

  const openCustomHue = () => {
    setCustomHueInput(hueShifts.join(", "));
    setShowCustomHue(true);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border/30 bg-background/30">
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-primary/5"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-muted/50 p-1.5">
            <GearIcon size={16} className="text-muted-foreground" />
          </div>
          <div>
            <span className="text-sm font-medium">Variation Settings</span>
            <p className="text-xs text-muted-foreground">
              Customize brightness and hue variations
            </p>
          </div>
        </div>
        <DownChevron
          size={20}
          className={`text-muted-foreground transition-transform duration-200 ${
            isExpanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Collapsible content */}
      <div
        className={`grid transition-all duration-200 ease-out ${
          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-6 border-t border-border/30 p-4">
            {/* Brightness Presets */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Sun className="size-3.5" />
                Brightness Variation
              </div>
              <div className="flex flex-wrap gap-2">
                {BRIGHTNESS_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => {
                      onBrightnessFactorsChange(preset.values);
                      setShowCustomBrightness(false);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      isBrightnessPreset(preset.values)
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
                <button
                  onClick={openCustomBrightness}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    isCustomBrightness && !showCustomBrightness
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <PenIcon size={12} />
                  Custom
                </button>
              </div>

              {/* Custom brightness input */}
              {showCustomBrightness && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customBrightnessInput}
                    onChange={(e) => setCustomBrightnessInput(e.target.value)}
                    placeholder="e.g., 0.5, 0.75, 1.0, 1.25, 1.5"
                    className="flex-1 rounded-lg border border-border/50 bg-background/50 px-3 py-1.5 text-xs placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCustomBrightnessSubmit();
                      }
                    }}
                  />
                  <button
                    onClick={handleCustomBrightnessSubmit}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => setShowCustomBrightness(false)}
                    className="rounded-lg bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
                <span>Current:</span>
                <code className="rounded bg-muted/50 px-1.5 py-0.5 font-mono">
                  {brightnessFactors.map((f) => `${f}x`).join(" → ")}
                </code>
              </div>
            </div>

            {/* Hue Presets */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <PaintIcon size={14} />
                Hue Shift Variation
              </div>
              <div className="flex flex-wrap gap-2">
                {HUE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => {
                      onHueShiftsChange(preset.values);
                      setShowCustomHue(false);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      isHuePreset(preset.values)
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
                <button
                  onClick={openCustomHue}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    isCustomHue && !showCustomHue
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <PenIcon size={12} />
                  Custom
                </button>
              </div>

              {/* Custom hue input */}
              {showCustomHue && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customHueInput}
                    onChange={(e) => setCustomHueInput(e.target.value)}
                    placeholder="e.g., 0, 10, 20, 30 (degrees)"
                    className="flex-1 rounded-lg border border-border/50 bg-background/50 px-3 py-1.5 text-xs placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCustomHueSubmit();
                      }
                    }}
                  />
                  <button
                    onClick={handleCustomHueSubmit}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => setShowCustomHue(false)}
                    className="rounded-lg bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
                <span>Current:</span>
                <code className="rounded bg-muted/50 px-1.5 py-0.5 font-mono">
                  {hueShifts.map((s) => `${s >= 0 ? "+" : ""}${s}°`).join(" → ")}
                </code>
              </div>
            </div>

            {/* Filter Toggle */}
            <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
              <div className="flex items-center gap-2">
                <Filter className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">Filter Black & White</span>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={filterBlackWhite}
                  onChange={(e) => onFilterToggle(e.target.checked)}
                  className="peer sr-only"
                  aria-label="Filter Black & White"
                />
                <div className="peer h-5 w-9 rounded-full bg-border/50 after:absolute after:start-[2px] after:top-[2px] after:size-4 after:rounded-full after:bg-white after:shadow-sm after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-focus:outline-none" />
              </label>
            </div>

            {/* Reset button */}
            <button
              onClick={resetToDefaults}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border/50 py-2 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <RefreshIcon size={12} />
              Reset to Defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
