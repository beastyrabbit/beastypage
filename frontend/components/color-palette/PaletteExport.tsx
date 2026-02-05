"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import ArrowBigDownDashIcon from "@/components/ui/arrow-big-down-dash-icon";
import DownChevron from "@/components/ui/down-chevron";
import CheckedIcon from "@/components/ui/checked-icon";
import { toast } from "sonner";
import { track } from "@/lib/analytics";

import type { ExtractedColor, RGB } from "@/lib/color-extraction/types";
import {
  adjustBrightness,
  adjustHue,
  rgbToHex,
} from "@/lib/color-extraction/color-utils";
import { generateColorDisplayName } from "@/lib/color-extraction/color-names";
import { createMultiColorSpotlightImage } from "@/lib/color-extraction/kmeans";
import { generateACO } from "@/lib/color-extraction/palette-formats";

interface PaletteExportProps {
  topColors: ExtractedColor[];
  familyColors: ExtractedColor[];
  brightnessFactors: number[];
  hueShifts: number[];
  isProcessing: boolean;
  image: HTMLImageElement | null;
}

interface ExportFormat {
  id: "png" | "aco" | "spotlight";
  label: string;
  extension: string;
}

const EXPORT_FORMATS: ExportFormat[] = [
  { id: "png", label: "PNG (Palette Grid)", extension: ".png" },
  { id: "spotlight", label: "PNG (Color Spotlight)", extension: ".png" },
  { id: "aco", label: "ACO (Adobe Photoshop)", extension: ".aco" },
];

// Fixed canvas size matching Python output
const SECTION_SIZE = 1000;

// Threshold for considering a color as black or white
const BLACK_WHITE_THRESHOLD = 15;

/**
 * Check if a color is nearly black
 */
function isNearBlack(rgb: RGB): boolean {
  return rgb.r <= BLACK_WHITE_THRESHOLD &&
         rgb.g <= BLACK_WHITE_THRESHOLD &&
         rgb.b <= BLACK_WHITE_THRESHOLD;
}

/**
 * Check if a color is nearly white
 */
function isNearWhite(rgb: RGB): boolean {
  return rgb.r >= 255 - BLACK_WHITE_THRESHOLD &&
         rgb.g >= 255 - BLACK_WHITE_THRESHOLD &&
         rgb.b >= 255 - BLACK_WHITE_THRESHOLD;
}

/**
 * Create a unique key for a color to detect duplicates
 */
function colorKey(rgb: RGB): string {
  return `${rgb.r},${rgb.g},${rgb.b}`;
}

/**
 * Filter ExtractedColor array to remove black, white, and duplicates
 */
function filterExtractedColors(
  colors: ExtractedColor[],
  seenColors?: Set<string>
): ExtractedColor[] {
  const seen = seenColors ?? new Set<string>();
  return colors.filter((color) => {
    if (isNearBlack(color.rgb) || isNearWhite(color.rgb)) return false;
    const key = colorKey(color.rgb);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Collect all colors with names for export (base + brightness + hue variations)
 * Filters out black, white, and duplicate colors
 */
function collectAllColorsForExport(
  topColors: ExtractedColor[],
  familyColors: ExtractedColor[],
  brightnessFactors: number[],
  hueShifts: number[]
): Array<{ rgb: RGB; name: string }> {
  const result: Array<{ rgb: RGB; name: string }> = [];
  const seenColors = new Set<string>();

  // Helper to add color if not black/white/duplicate
  const addColor = (rgb: RGB, name: string) => {
    if (isNearBlack(rgb) || isNearWhite(rgb)) return;

    const key = colorKey(rgb);
    if (seenColors.has(key)) return;

    seenColors.add(key);
    result.push({ rgb, name });
  };

  // Process a color set (dominant or accent)
  const processColorSet = (
    colors: ExtractedColor[],
    type: "dominant" | "accent"
  ) => {
    colors.forEach((color, index) => {
      // Base color
      addColor(
        color.rgb,
        generateColorDisplayName(index, color.name || "Color", type)
      );

      // Brightness variations
      brightnessFactors.forEach((factor) => {
        if (factor !== 1.0) {
          const adjustment = (factor - 1) * 50;
          const adjusted = adjustBrightness(color.rgb, adjustment);
          addColor(
            adjusted,
            generateColorDisplayName(index, color.name || "Color", type, {
              brightnessMultiplier: factor,
            })
          );
        }
      });

      // Hue variations
      hueShifts.forEach((shift) => {
        if (shift !== 0) {
          const adjusted = adjustHue(color.rgb, shift);
          addColor(
            adjusted,
            generateColorDisplayName(index, color.name || "Color", type, {
              hueShift: shift,
            })
          );
        }
      });
    });
  };

  processColorSet(topColors, "dominant");
  processColorSet(familyColors, "accent");

  return result;
}

export function PaletteExport({
  topColors,
  familyColors,
  brightnessFactors,
  hueShifts,
  isProcessing,
  image,
}: PaletteExportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>(
    EXPORT_FORMATS[0]
  );
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isDropdownOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
  }, [isDropdownOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const generatePalettePNG = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Filter out black, white, and duplicate colors
    const seenColors = new Set<string>();
    const filteredTopColors = filterExtractedColors(topColors, seenColors);
    const filteredFamilyColors = filterExtractedColors(familyColors, seenColors);

    // Calculate number of sections
    // Each color set has: palette strip + brightness grid + hue grid
    const topSections = filteredTopColors.length > 0 ? 3 : 0;
    const familySections = filteredFamilyColors.length > 0 ? 3 : 0;
    const totalSections = topSections + familySections;

    if (totalSections === 0) return;

    // Set canvas size
    canvas.width = SECTION_SIZE;
    canvas.height = SECTION_SIZE * totalSections;

    let yOffset = 0;

    // Helper: Draw vertical color strip (each color full width, stacked vertically)
    const drawColorStrip = (colors: ExtractedColor[], startY: number) => {
      const colorHeight = SECTION_SIZE / colors.length;

      // Draw colors from bottom to top (reversed like Python)
      colors
        .slice()
        .reverse()
        .forEach((color, index) => {
          ctx.fillStyle = color.hex;
          ctx.fillRect(0, startY + index * colorHeight, SECTION_SIZE, colorHeight);
        });

      return startY + SECTION_SIZE;
    };

    // Helper: Draw brightness grid (rows = colors, cols = factors)
    const drawBrightnessGrid = (colors: ExtractedColor[], startY: number) => {
      const colorHeight = SECTION_SIZE / colors.length;
      const factorWidth = SECTION_SIZE / brightnessFactors.length;

      // Draw colors from bottom to top (reversed like Python)
      colors
        .slice()
        .reverse()
        .forEach((color, rowIndex) => {
          brightnessFactors.forEach((factor, colIndex) => {
            // Convert factor to lightness adjustment (same as PaletteGrid)
            const adjustment = (factor - 1) * 50;
            const adjusted = adjustBrightness(color.rgb, adjustment);
            ctx.fillStyle = rgbToHex(adjusted);
            ctx.fillRect(
              colIndex * factorWidth,
              startY + rowIndex * colorHeight,
              factorWidth,
              colorHeight
            );
          });
        });

      return startY + SECTION_SIZE;
    };

    // Helper: Draw hue grid (rows = colors, cols = shifts)
    const drawHueGrid = (colors: ExtractedColor[], startY: number) => {
      const colorHeight = SECTION_SIZE / colors.length;
      const shiftWidth = SECTION_SIZE / hueShifts.length;

      // Draw colors from bottom to top (reversed like Python)
      colors
        .slice()
        .reverse()
        .forEach((color, rowIndex) => {
          hueShifts.forEach((shift, colIndex) => {
            const adjusted = adjustHue(color.rgb, shift);
            ctx.fillStyle = rgbToHex(adjusted);
            ctx.fillRect(
              colIndex * shiftWidth,
              startY + rowIndex * colorHeight,
              shiftWidth,
              colorHeight
            );
          });
        });

      return startY + SECTION_SIZE;
    };

    // Draw top colors sections
    if (filteredTopColors.length > 0) {
      yOffset = drawColorStrip(filteredTopColors, yOffset);
      yOffset = drawBrightnessGrid(filteredTopColors, yOffset);
      yOffset = drawHueGrid(filteredTopColors, yOffset);
    }

    // Draw family colors sections
    if (filteredFamilyColors.length > 0) {
      yOffset = drawColorStrip(filteredFamilyColors, yOffset);
      yOffset = drawBrightnessGrid(filteredFamilyColors, yOffset);
      yOffset = drawHueGrid(filteredFamilyColors, yOffset);
    }

    // Trigger download
    const link = document.createElement("a");
    link.download = `color-palette-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();

    toast.success("Palette PNG downloaded!");
  }, [topColors, familyColors, brightnessFactors, hueShifts]);

  const downloadACO = useCallback(() => {
    const allColors = collectAllColorsForExport(
      topColors,
      familyColors,
      brightnessFactors,
      hueShifts
    );

    if (allColors.length === 0) {
      toast.error("No colors to export");
      return;
    }

    const buffer = generateACO(allColors);

    const blob = new Blob([buffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `color-palette-${Date.now()}.aco`;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    toast.success("Color set downloaded as ACO");
  }, [topColors, familyColors, brightnessFactors, hueShifts]);

  const generateSpotlightPNG = useCallback(() => {
    if (!image) {
      toast.error("No image loaded");
      return;
    }

    // Collect all colors (dominant + accent)
    const allColors = [...topColors, ...familyColors].map((c) => c.rgb);
    if (allColors.length === 0) {
      toast.error("No colors to highlight");
      return;
    }

    try {
      const dataUrl = createMultiColorSpotlightImage(image, allColors);

      // Trigger download
      const link = document.createElement("a");
      link.download = `color-spotlight-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();

      toast.success("Spotlight image downloaded!");
    } catch (err) {
      toast.error("Failed to create spotlight image");
    }
  }, [image, topColors, familyColors]);

  const handleExport = useCallback(() => {
    track("palette_creator_exported", { format: selectedFormat.id });
    if (selectedFormat.id === "png") {
      generatePalettePNG();
    } else if (selectedFormat.id === "spotlight") {
      generateSpotlightPNG();
    } else {
      downloadACO();
    }
  }, [selectedFormat, generatePalettePNG, generateSpotlightPNG, downloadACO]);

  const handleFormatSelect = useCallback((format: ExportFormat) => {
    setSelectedFormat(format);
    setIsDropdownOpen(false);
  }, []);

  const toggleDropdown = useCallback(() => {
    setIsDropdownOpen((prev) => !prev);
  }, []);

  const hasColors = topColors.length > 0 || familyColors.length > 0;

  return (
    <>
      {/* Hidden canvas for rendering PNG */}
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Export controls - split button */}
      <div ref={buttonRef}>
        <div className="flex">
          {/* Main download button */}
          <button
            onClick={handleExport}
            disabled={isProcessing || !hasColors}
            className="flex h-10 items-center gap-2 rounded-l-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <ArrowBigDownDashIcon size={16} />
                {selectedFormat.label}
              </>
            )}
          </button>

          {/* Dropdown toggle */}
          <button
            onClick={toggleDropdown}
            disabled={isProcessing || !hasColors}
            className="flex h-10 items-center justify-center rounded-r-lg border-l border-primary-foreground/20 bg-primary px-2 text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <DownChevron size={16} className={`transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {/* Dropdown menu - rendered via portal to avoid z-index issues */}
      {isDropdownOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed min-w-[180px] overflow-hidden rounded-lg border border-border/50 bg-card shadow-xl"
          style={{
            top: dropdownPosition.top,
            right: dropdownPosition.right,
            zIndex: 9999,
          }}
        >
          {EXPORT_FORMATS.map((format) => (
            <button
              key={format.id}
              onClick={() => handleFormatSelect(format)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
            >
              <CheckedIcon
                size={16}
                className={selectedFormat.id === format.id ? "text-primary" : "text-transparent"}
              />
              <span className={selectedFormat.id === format.id ? "font-medium text-foreground" : "text-muted-foreground"}>
                {format.label}
              </span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
