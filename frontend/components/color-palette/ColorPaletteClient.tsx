"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";

import type { ExtractedColor, PaletteState, RGB } from "@/lib/color-extraction/types";
import { extractColors } from "@/lib/color-extraction/kmeans";
import {
  loadImageFromFile,
  loadImageFromUrl,
  imageToDataUrl,
  getColorAtPosition,
  getScaledDimensions,
} from "@/lib/color-extraction/image-processing";
import { rgbToHex, rgbToHsl } from "@/lib/color-extraction/color-utils";

import { ImageUploader } from "./ImageUploader";
import { ImageCanvas } from "./ImageCanvas";
import { PaletteControls } from "./PaletteControls";
import { PaletteDisplay } from "./PaletteDisplay";
import { ColorVariations } from "./ColorVariations";

const INITIAL_STATE: PaletteState = {
  image: null,
  imageDataUrl: null,
  extractedColors: [],
  colorCount: 6,
  filterBlackWhite: true,
  isProcessing: false,
  error: null,
  hoveredColorIndex: null,
};

export function ColorPaletteClient() {
  const [state, setState] = useState<PaletteState>(INITIAL_STATE);
  const [selectedColorIndex, setSelectedColorIndex] = useState<number | null>(null);

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
        extractedColors: [],
        isProcessing: false,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isProcessing: false,
        error: err instanceof Error ? err.message : "Failed to load image",
      }));
      toast.error(err instanceof Error ? err.message : "Failed to load image");
    }
  }, []);

  const handleExtract = useCallback(() => {
    if (!state.image) return;

    setState((prev) => ({ ...prev, isProcessing: true, error: null }));

    // Use requestAnimationFrame to let UI update first
    requestAnimationFrame(() => {
      try {
        const colors = extractColors(state.image!, {
          k: state.colorCount,
          filterBlackWhite: state.filterBlackWhite,
        });

        setState((prev) => ({
          ...prev,
          extractedColors: colors,
          isProcessing: false,
        }));

        toast.success(`Extracted ${colors.length} colors`);
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
  }, [state.image, state.colorCount, state.filterBlackWhite]);

  const handleColorCountChange = useCallback((count: number) => {
    setState((prev) => ({ ...prev, colorCount: count }));
  }, []);

  const handleFilterToggle = useCallback((filter: boolean) => {
    setState((prev) => ({ ...prev, filterBlackWhite: filter }));
  }, []);

  const handleReset = useCallback(() => {
    setState(INITIAL_STATE);
    setSelectedColorIndex(null);
  }, []);

  const handleColorHover = useCallback((index: number | null) => {
    setState((prev) => ({ ...prev, hoveredColorIndex: index }));
  }, []);

  const handleCrosshairMove = useCallback(
    (index: number, x: number, y: number) => {
      if (!state.image) return;

      const { width, height } = getScaledDimensions(state.image);
      // Clamp coordinates to image bounds
      const clampedX = Math.max(0, Math.min(width - 1, x));
      const clampedY = Math.max(0, Math.min(height - 1, y));

      const rgb = getColorAtPosition(state.image, clampedX, clampedY);
      const hex = rgbToHex(rgb);
      const hsl = rgbToHsl(rgb);

      setState((prev) => {
        const newColors = [...prev.extractedColors];
        if (newColors[index]) {
          newColors[index] = {
            ...newColors[index],
            hex,
            rgb,
            hsl,
            position: { x: clampedX, y: clampedY },
          };
        }
        return { ...prev, extractedColors: newColors };
      });
    },
    [state.image]
  );

  const hoveredColor = state.hoveredColorIndex !== null
    ? state.extractedColors[state.hoveredColorIndex]?.rgb
    : null;

  const selectedColor = selectedColorIndex !== null
    ? state.extractedColors[selectedColorIndex]
    : null;

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
          {/* Controls */}
          <PaletteControls
            colorCount={state.colorCount}
            filterBlackWhite={state.filterBlackWhite}
            isProcessing={state.isProcessing}
            hasColors={state.extractedColors.length > 0}
            onColorCountChange={handleColorCountChange}
            onFilterToggle={handleFilterToggle}
            onExtract={handleExtract}
            onReset={handleReset}
          />

          {/* Image and palette display */}
          <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
            {/* Image canvas with crosshairs */}
            <ImageCanvas
              imageDataUrl={state.imageDataUrl!}
              imageDimensions={getScaledDimensions(state.image)}
              colors={state.extractedColors}
              hoveredColor={hoveredColor}
              onCrosshairMove={handleCrosshairMove}
            />

            {/* Palette display */}
            <div className="flex flex-col gap-6">
              <PaletteDisplay
                colors={state.extractedColors}
                onColorHover={handleColorHover}
                selectedIndex={selectedColorIndex}
                onColorSelect={setSelectedColorIndex}
              />
            </div>
          </div>

          {/* Color variations */}
          {selectedColor && (
            <ColorVariations color={selectedColor} />
          )}
        </>
      )}
    </div>
  );
}
