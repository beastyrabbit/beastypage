"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, ChevronDown, Check } from "lucide-react";
import { toast } from "sonner";

import type { ExtractedColor, RGB } from "@/lib/color-extraction/types";
import {
  adjustBrightness,
  adjustHue,
  rgbToHex,
} from "@/lib/color-extraction/color-utils";
import { generateColorDisplayName } from "@/lib/color-extraction/color-names";

interface PaletteExportProps {
  topColors: ExtractedColor[];
  familyColors: ExtractedColor[];
  brightnessFactors: number[];
  hueShifts: number[];
  isProcessing: boolean;
}

interface ExportFormat {
  id: "png" | "aco";
  label: string;
  extension: string;
}

const EXPORT_FORMATS: ExportFormat[] = [
  { id: "png", label: "PNG (Image)", extension: ".png" },
  { id: "aco", label: "ACO (Adobe Photoshop)", extension: ".aco" },
];

// Fixed canvas size matching Python output
const SECTION_SIZE = 1000;

// Threshold for considering a color as black or white
const BLACK_WHITE_THRESHOLD = 15;

/**
 * Determines whether an RGB color is close to pure black.
 *
 * @param rgb - Object with `r`, `g`, and `b` channels in the range 0–255
 * @returns `true` if all channels are less than or equal to the black threshold, `false` otherwise.
 */
function isNearBlack(rgb: RGB): boolean {
  return rgb.r <= BLACK_WHITE_THRESHOLD &&
         rgb.g <= BLACK_WHITE_THRESHOLD &&
         rgb.b <= BLACK_WHITE_THRESHOLD;
}

/**
 * Determines whether a color is within BLACK_WHITE_THRESHOLD of pure white.
 *
 * @returns `true` if red, green, and blue channels are each greater than or equal to 255 - BLACK_WHITE_THRESHOLD, `false` otherwise.
 */
function isNearWhite(rgb: RGB): boolean {
  return rgb.r >= 255 - BLACK_WHITE_THRESHOLD &&
         rgb.g >= 255 - BLACK_WHITE_THRESHOLD &&
         rgb.b >= 255 - BLACK_WHITE_THRESHOLD;
}

/**
 * Produce a string key for an RGB color suitable for deduplication.
 *
 * @returns The color encoded as `r,g,b`, where `r`, `g`, and `b` are the red, green, and blue channel values (0–255).
 */
function colorKey(rgb: RGB): string {
  return `${rgb.r},${rgb.g},${rgb.b}`;
}

/**
 * Produce a deduplicated list of color entries (base colors plus brightness and hue variants) suitable for export.
 *
 * @param topColors - Dominant palette colors to include.
 * @param familyColors - Accent/family palette colors to include.
 * @param brightnessFactors - Multipliers used to generate brightness variants (factor 1.0 is ignored).
 * @param hueShifts - Hue shift values in degrees used to generate hue variants (shift 0 is ignored).
 * @returns An array of objects each containing `rgb` and a generated `name` for export; excludes colors that are near-black, near-white, or duplicates. 
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

/**
 * Builds an ArrayBuffer containing an Adobe Color Swatch (ACO) file in version 2 format for the provided colors.
 *
 * @param colors - Array of entries where each item has `rgb` (with `r`, `g`, `b` values in 0–255) and `name`; each entry becomes a swatch in the ACO.
 * @returns An ArrayBuffer representing a valid ACO v2 file with big-endian fields and color names encoded in UTF-16BE.
 */
function generateACO(colors: Array<{ rgb: RGB; name: string }>): ArrayBuffer {
  // ACO v2 format:
  // - Version: 2 (2 bytes, big-endian)
  // - Color count: (2 bytes, big-endian)
  // - For each color:
  //   - Color space: 0 for RGB (2 bytes)
  //   - R: 0-65535 (2 bytes)
  //   - G: 0-65535 (2 bytes)
  //   - B: 0-65535 (2 bytes)
  //   - Unused: 0 (2 bytes)
  //   - Name length: char count + 1 (4 bytes, big-endian)
  //   - Name: UTF-16BE string + null terminator

  // Calculate total size
  let totalSize = 4; // version (2) + count (2)
  for (const color of colors) {
    totalSize += 10; // color data
    totalSize += 4; // name length
    totalSize += (color.name.length + 1) * 2; // UTF-16BE + null
  }

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // Version 2 header (big-endian)
  view.setUint16(0, 2, false);
  view.setUint16(2, colors.length, false);

  let offset = 4;
  for (const color of colors) {
    // Color space: 0 = RGB
    view.setUint16(offset, 0, false);
    offset += 2;

    // RGB values scaled from 0-255 to 0-65535
    view.setUint16(offset, color.rgb.r * 257, false);
    offset += 2;
    view.setUint16(offset, color.rgb.g * 257, false);
    offset += 2;
    view.setUint16(offset, color.rgb.b * 257, false);
    offset += 2;

    // Unused
    view.setUint16(offset, 0, false);
    offset += 2;

    // Name length (including null terminator)
    view.setUint32(offset, color.name.length + 1, false);
    offset += 4;

    // Name as UTF-16BE
    for (let i = 0; i < color.name.length; i++) {
      view.setUint16(offset, color.name.charCodeAt(i), false);
      offset += 2;
    }
    // Null terminator
    view.setUint16(offset, 0, false);
    offset += 2;
  }

  return buffer;
}

/**
 * Render split export controls and a hidden canvas for exporting color palettes as PNG or ACO.
 *
 * The component provides a main download button (exports in the selected format) and a dropdown to switch formats,
 * renders the composed PNG to a hidden canvas when exporting images, generates ACO binary data for color-set exports,
 * and shows toast notifications for success and error states. The controls are disabled while `isProcessing` is true or when no colors are available.
 *
 * @returns A JSX element containing the export UI (split button + dropdown) and the hidden canvas used for PNG generation.
 */
export function PaletteExport({
  topColors,
  familyColors,
  brightnessFactors,
  hueShifts,
  isProcessing,
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

    // Calculate number of sections
    // Each color set has: palette strip + brightness grid + hue grid
    const topSections = topColors.length > 0 ? 3 : 0;
    const familySections = familyColors.length > 0 ? 3 : 0;
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
    if (topColors.length > 0) {
      yOffset = drawColorStrip(topColors, yOffset);
      yOffset = drawBrightnessGrid(topColors, yOffset);
      yOffset = drawHueGrid(topColors, yOffset);
    }

    // Draw family colors sections
    if (familyColors.length > 0) {
      yOffset = drawColorStrip(familyColors, yOffset);
      yOffset = drawBrightnessGrid(familyColors, yOffset);
      yOffset = drawHueGrid(familyColors, yOffset);
    }

    // Trigger download
    const link = document.createElement("a");
    link.download = `color-palette-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();

    toast.success("Palette PNG downloaded!");
  }, [topColors, familyColors, brightnessFactors, hueShifts]);

  const downloadColorSet = useCallback(
    (format: ExportFormat) => {
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

      let buffer: ArrayBuffer;
      let mimeType: string;

      switch (format.id) {
        case "aco":
          buffer = generateACO(allColors);
          mimeType = "application/octet-stream";
          break;
        default:
          return;
      }

      // Create and trigger download
      const blob = new Blob([buffer], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `color-palette-${Date.now()}${format.extension}`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);

      toast.success(`Color set downloaded as ${format.extension.toUpperCase()}`);
    },
    [topColors, familyColors, brightnessFactors, hueShifts]
  );

  const handleExport = useCallback(() => {
    if (selectedFormat.id === "png") {
      generatePalettePNG();
    } else {
      downloadColorSet(selectedFormat);
    }
  }, [selectedFormat, generatePalettePNG, downloadColorSet]);

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
                <Download className="size-4" />
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
            <ChevronDown className={`size-4 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} />
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
              <Check
                className={`size-4 ${selectedFormat.id === format.id ? "text-primary" : "text-transparent"}`}
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