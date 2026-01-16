"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { RotateCcw, Loader2 } from "lucide-react";

import type { ExtractedColor, PaletteState, RGB } from "@/lib/color-extraction/types";
import { extractColors, extractFamilyColors } from "@/lib/color-extraction/kmeans";
import {
  loadImageFromFile,
  loadImageFromUrl,
  imageToDataUrl,
  getColorAtPosition,
  getScaledDimensions,
} from "@/lib/color-extraction/image-processing";
import { rgbToHex, rgbToHsl } from "@/lib/color-extraction/color-utils";
import { fetchColorNames } from "@/lib/color-extraction/color-names";

import { ImageUploader } from "./ImageUploader";
import { ImageCanvas } from "./ImageCanvas";
import { PaletteSliders } from "./PaletteSliders";
import { PaletteGrid } from "./PaletteGrid";
import { PaletteSettings } from "./PaletteSettings";
import { PaletteExport } from "./PaletteExport";

const DEFAULT_BRIGHTNESS_FACTORS = [0.5, 0.75, 1.0, 1.25, 1.5];
const DEFAULT_HUE_SHIFTS = [0, 10, 20, 30];

const INITIAL_STATE: PaletteState = {
  image: null,
  imageDataUrl: null,
  topColors: [],
  familyColors: [],
  topColorCount: 6,
  familyColorCount: 6,
  brightnessFactors: DEFAULT_BRIGHTNESS_FACTORS,
  hueShifts: DEFAULT_HUE_SHIFTS,
  filterBlackWhite: true,
  isProcessing: false,
  error: null,
  hoveredColorIndex: null,
  hoveredColorType: null,
};

// Selection state for connecting dots to swatches
interface SelectionState {
  selectedDotIndex: number | null;
  selectedDotType: "dominant" | "accent" | null;
  highlightedDotIndex: number | null;
  highlightedDotType: "dominant" | "accent" | null;
  hoveredColorRgb: RGB | null; // Actual color being hovered (may be a variation)
}

const INITIAL_SELECTION: SelectionState = {
  selectedDotIndex: null,
  selectedDotType: null,
  highlightedDotIndex: null,
  highlightedDotType: null,
  hoveredColorRgb: null,
};

export function ColorPaletteClient() {
  const [state, setState] = useState<PaletteState>(INITIAL_STATE);
  const [selection, setSelection] = useState<SelectionState>(INITIAL_SELECTION);
  const extractionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (extractionTimeoutRef.current) {
        clearTimeout(extractionTimeoutRef.current);
      }
    };
  }, []);

  const handleImageLoad = useCallback(async (source: File | string) => {
    setState((prev) => ({ ...prev, isProcessing: true, error: null }));

    try {
      const img =
        typeof source === "string"
          ? await loadImageFromUrl(source)
          : await loadImageFromFile(source);

      const dataUrl = imageToDataUrl(img);

      setState((prev) => ({
        ...prev,
        image: img,
        imageDataUrl: dataUrl,
        topColors: [],
        familyColors: [],
        isProcessing: false,
      }));
      setSelection(INITIAL_SELECTION);
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isProcessing: false,
        error: err instanceof Error ? err.message : "Failed to load image",
      }));
      toast.error(err instanceof Error ? err.message : "Failed to load image");
    }
  }, []);

  // Fetch color names from API and update state
  const fetchAndUpdateColorNames = useCallback(async (
    topColors: ExtractedColor[],
    familyColors: ExtractedColor[]
  ) => {
    try {
      // Combine all colors for name fetching
      const allColors = [...topColors, ...familyColors];
      const nameMap = await fetchColorNames(allColors);

      // Update colors with names
      setState((prev) => ({
        ...prev,
        topColors: prev.topColors.map((color) => ({
          ...color,
          name: nameMap.get(color.hex.toUpperCase()) || "Unknown",
        })),
        familyColors: prev.familyColors.map((color) => ({
          ...color,
          name: nameMap.get(color.hex.toUpperCase()) || "Unknown",
        })),
      }));
    } catch (error) {
      console.error("Failed to fetch color names:", error);
    }
  }, []);

  // Extract colors function that handles both top and family colors
  const performExtraction = useCallback(() => {
    if (!state.image) return;

    setState((prev) => ({ ...prev, isProcessing: true, error: null }));

    requestAnimationFrame(() => {
      try {
        const topColors = extractColors(state.image!, {
          k: state.topColorCount,
          filterBlackWhite: state.filterBlackWhite,
        });

        const familyColors = extractFamilyColors(
          state.image!,
          topColors,
          {
            k: state.familyColorCount,
            filterBlackWhite: state.filterBlackWhite,
          },
          50
        );

        setState((prev) => ({
          ...prev,
          topColors,
          familyColors,
          isProcessing: false,
        }));

        setSelection(INITIAL_SELECTION);

        const familyMsg = familyColors.length > 0 ? ` and ${familyColors.length} family colors` : "";
        toast.success(`Extracted ${topColors.length} top colors${familyMsg}`);

        // Fetch color names in the background (don't block UI)
        fetchAndUpdateColorNames(topColors, familyColors);
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isProcessing: false,
          error: err instanceof Error ? err.message : "Failed to extract colors",
        }));
        toast.error(
          err instanceof Error ? err.message : "Failed to extract colors"
        );
      }
    });
  }, [state.image, state.topColorCount, state.familyColorCount, state.filterBlackWhite, fetchAndUpdateColorNames]);

  // Debounced extraction when sliders change
  const debouncedExtraction = useCallback(() => {
    if (!state.image) return;

    if (extractionTimeoutRef.current) {
      clearTimeout(extractionTimeoutRef.current);
    }

    extractionTimeoutRef.current = setTimeout(() => {
      performExtraction();
    }, 300);
  }, [state.image, performExtraction]);

  const handleTopColorCountChange = useCallback((count: number) => {
    setState((prev) => ({ ...prev, topColorCount: count }));
  }, []);

  const handleFamilyColorCountChange = useCallback((count: number) => {
    setState((prev) => ({ ...prev, familyColorCount: count }));
  }, []);

  // Auto-extract immediately when image is loaded
  useEffect(() => {
    if (state.image && state.topColors.length === 0) {
      performExtraction();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.image]);

  // Auto-extract when slider values or filter changes
  useEffect(() => {
    if (state.image && (state.topColors.length > 0 || state.familyColors.length > 0)) {
      debouncedExtraction();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.topColorCount, state.familyColorCount, state.filterBlackWhite]);

  const handleBrightnessFactorsChange = useCallback((factors: number[]) => {
    setState((prev) => ({ ...prev, brightnessFactors: factors }));
  }, []);

  const handleHueShiftsChange = useCallback((shifts: number[]) => {
    setState((prev) => ({ ...prev, hueShifts: shifts }));
  }, []);

  const handleFilterToggle = useCallback((filter: boolean) => {
    setState((prev) => ({ ...prev, filterBlackWhite: filter }));
  }, []);

  const handleReset = useCallback(() => {
    if (extractionTimeoutRef.current) {
      clearTimeout(extractionTimeoutRef.current);
    }
    setState(INITIAL_STATE);
    setSelection(INITIAL_SELECTION);
  }, []);

  // Handle crosshair move (updates color at new position)
  const handleCrosshairMove = useCallback(
    (index: number, x: number, y: number, type: "dominant" | "accent") => {
      if (!state.image) return;

      const { width, height } = getScaledDimensions(state.image);
      const clampedX = Math.max(0, Math.min(width - 1, x));
      const clampedY = Math.max(0, Math.min(height - 1, y));

      const rgb = getColorAtPosition(state.image, clampedX, clampedY);
      const hex = rgbToHex(rgb);
      const hsl = rgbToHsl(rgb);

      setState((prev) => {
        if (type === "dominant") {
          const newColors = [...prev.topColors];
          if (newColors[index]) {
            newColors[index] = {
              ...newColors[index],
              hex,
              rgb,
              hsl,
              position: { x: clampedX, y: clampedY },
            };
          }
          return { ...prev, topColors: newColors };
        } else {
          const newColors = [...prev.familyColors];
          if (newColors[index]) {
            newColors[index] = {
              ...newColors[index],
              hex,
              rgb,
              hsl,
              position: { x: clampedX, y: clampedY },
            };
          }
          return { ...prev, familyColors: newColors };
        }
      });
    },
    [state.image]
  );

  // Handle dot selection (from clicking on dot or swatch)
  const handleDotSelect = useCallback((index: number, type: "dominant" | "accent") => {
    setSelection((prev) => {
      // Toggle off if clicking the same one
      if (prev.selectedDotIndex === index && prev.selectedDotType === type) {
        return { ...prev, selectedDotIndex: null, selectedDotType: null };
      }
      return { ...prev, selectedDotIndex: index, selectedDotType: type };
    });
  }, []);

  // Handle swatch hover (highlights corresponding dot)
  const handleDominantHover = useCallback((index: number | null, rgb?: RGB) => {
    setSelection((prev) => ({
      ...prev,
      highlightedDotIndex: index,
      highlightedDotType: index !== null ? "dominant" : null,
      hoveredColorRgb: rgb ?? null,
    }));
  }, []);

  const handleAccentHover = useCallback((index: number | null, rgb?: RGB) => {
    setSelection((prev) => ({
      ...prev,
      highlightedDotIndex: index,
      highlightedDotType: index !== null ? "accent" : null,
      hoveredColorRgb: rgb ?? null,
    }));
  }, []);

  // Handle swatch selection
  const handleDominantSelect = useCallback((index: number) => {
    handleDotSelect(index, "dominant");
  }, [handleDotSelect]);

  const handleAccentSelect = useCallback((index: number) => {
    handleDotSelect(index, "accent");
  }, [handleDotSelect]);

  // Get hovered color for spotlight overlay (uses the actual variation color if available)
  const hoveredColor: RGB | null = selection.hoveredColorRgb;

  const hasColors = state.topColors.length > 0;

  return (
    <div className="flex flex-col gap-8">
      {/* Upload area - show when no image */}
      {!state.image && (
        <ImageUploader
          onImageLoad={handleImageLoad}
          isLoading={state.isProcessing}
          error={state.error}
        />
      )}

      {/* Main content area - show when image loaded */}
      {state.image && (
        <>
          {/* Image canvas - FULL WIDTH */}
          <ImageCanvas
            imageDataUrl={state.imageDataUrl!}
            imageDimensions={getScaledDimensions(state.image)}
            colors={state.topColors}
            familyColors={state.familyColors}
            hoveredColor={hoveredColor}
            selectedDotIndex={selection.selectedDotIndex}
            selectedDotType={selection.selectedDotType}
            highlightedDotIndex={selection.highlightedDotIndex}
            highlightedDotType={selection.highlightedDotType}
            onCrosshairMove={handleCrosshairMove}
            onDotSelect={handleDotSelect}
          />

          {/* Controls bar with sliders */}
          <div className="glass-card flex flex-wrap items-center gap-4 p-4 sm:gap-6 sm:p-6">
            <PaletteSliders
              topColorCount={state.topColorCount}
              familyColorCount={state.familyColorCount}
              isProcessing={state.isProcessing}
              onTopColorCountChange={handleTopColorCountChange}
              onFamilyColorCountChange={handleFamilyColorCountChange}
            />

            <div className="flex-1" />

            <div className="flex gap-3">
              <button
                onClick={handleReset}
                className="flex items-center gap-2 rounded-xl border border-border/50 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:border-foreground/30 hover:text-foreground"
                disabled={state.isProcessing}
              >
                <RotateCcw className="size-4" />
                <span className="hidden sm:inline">Reset</span>
              </button>

              {!hasColors ? (
                <button
                  onClick={performExtraction}
                  disabled={state.isProcessing}
                  className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {state.isProcessing ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Extract Colors"
                  )}
                </button>
              ) : (
                <PaletteExport
                  topColors={state.topColors}
                  familyColors={state.familyColors}
                  brightnessFactors={state.brightnessFactors}
                  hueShifts={state.hueShifts}
                  isProcessing={state.isProcessing}
                />
              )}
            </div>
          </div>

          {/* Palette section - FULL WIDTH with side-by-side grids */}
          {hasColors && (
            <div className="glass-card p-6">
              {/* Settings accordion above the palettes */}
              <div className="mb-6 pb-6 border-b border-border/30">
                <PaletteSettings
                  brightnessFactors={state.brightnessFactors}
                  hueShifts={state.hueShifts}
                  filterBlackWhite={state.filterBlackWhite}
                  onBrightnessFactorsChange={handleBrightnessFactorsChange}
                  onHueShiftsChange={handleHueShiftsChange}
                  onFilterToggle={handleFilterToggle}
                />
              </div>

              <div className="grid gap-8 lg:grid-cols-2">
                {/* Dominant Colors */}
                <PaletteGrid
                  colors={state.topColors}
                  brightnessFactors={state.brightnessFactors}
                  hueShifts={state.hueShifts}
                  title="Dominant Colors"
                  type="dominant"
                  selectedIndex={selection.selectedDotType === "dominant" ? selection.selectedDotIndex : null}
                  highlightedIndex={selection.highlightedDotType === "dominant" ? selection.highlightedDotIndex : null}
                  onColorHover={handleDominantHover}
                  onColorSelect={handleDominantSelect}
                />

                {/* Accent Colors */}
                {state.familyColors.length > 0 && (
                  <PaletteGrid
                    colors={state.familyColors}
                    brightnessFactors={state.brightnessFactors}
                    hueShifts={state.hueShifts}
                    title="Accent Colors"
                    type="accent"
                    selectedIndex={selection.selectedDotType === "accent" ? selection.selectedDotIndex : null}
                    highlightedIndex={selection.highlightedDotType === "accent" ? selection.highlightedDotIndex : null}
                    onColorHover={handleAccentHover}
                    onColorSelect={handleAccentSelect}
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
