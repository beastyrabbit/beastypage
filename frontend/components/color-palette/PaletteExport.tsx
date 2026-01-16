"use client";

import { useCallback, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
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
  id: "png" | "cls" | "aco";
  label: string;
  extension: string;
}

const EXPORT_FORMATS: ExportFormat[] = [
  { id: "png", label: "PNG (Image)", extension: ".png" },
  { id: "cls", label: "CLS (Clip Studio)", extension: ".cls" },
  { id: "aco", label: "ACO (Adobe Photoshop)", extension: ".aco" },
];

// Fixed canvas size matching Python output
const SECTION_SIZE = 1000;

/**
 * Collect all colors with names for export (base + brightness + hue variations)
 */
function collectAllColorsForExport(
  topColors: ExtractedColor[],
  familyColors: ExtractedColor[],
  brightnessFactors: number[],
  hueShifts: number[]
): Array<{ rgb: RGB; name: string }> {
  const result: Array<{ rgb: RGB; name: string }> = [];

  // Process a color set (dominant or accent)
  const processColorSet = (
    colors: ExtractedColor[],
    type: "dominant" | "accent"
  ) => {
    colors.forEach((color, index) => {
      // Base color
      result.push({
        rgb: color.rgb,
        name: generateColorDisplayName(index, color.name || "Color", type),
      });

      // Brightness variations
      brightnessFactors.forEach((factor) => {
        if (factor !== 1.0) {
          const adjustment = (factor - 1) * 50;
          const adjusted = adjustBrightness(color.rgb, adjustment);
          result.push({
            rgb: adjusted,
            name: generateColorDisplayName(index, color.name || "Color", type, {
              brightnessMultiplier: factor,
            }),
          });
        }
      });

      // Hue variations
      hueShifts.forEach((shift) => {
        if (shift !== 0) {
          const adjusted = adjustHue(color.rgb, shift);
          result.push({
            rgb: adjusted,
            name: generateColorDisplayName(index, color.name || "Color", type, {
              hueShift: shift,
            }),
          });
        }
      });
    });
  };

  processColorSet(topColors, "dominant");
  processColorSet(familyColors, "accent");

  return result;
}

/**
 * Generate CLS binary data (Clip Studio Paint Color Set)
 * Uses the unnamed color format (8 bytes per color) for simplicity
 */
function generateCLS(
  colors: Array<{ rgb: RGB; name: string }>,
  setName: string
): ArrayBuffer {
  // CLS format structure (simplified - unnamed colors):
  // Header:
  //   - Magic: "SLCC" (4 bytes)
  //   - Version: 1 (2 bytes, little-endian)
  //   - Color count: (4 bytes, little-endian)
  //   - Name length: (2 bytes, little-endian)
  //   - Name: ASCII string + null terminator
  //   - Padding to align
  //   - Group data
  // Colors:
  //   - Entry size: 8 (4 bytes)
  //   - RGBA: 4 bytes
  //   - Padding: 4 bytes zeros

  // For simplicity, we'll use a fixed structure similar to observed CLS files
  const nameBytes = new TextEncoder().encode(setName);

  // Calculate approximate header size (including padding)
  // This is simplified - actual CLS files have more complex headers
  const headerSize = 64; // Conservative fixed header
  const colorDataSize = colors.length * 12; // 4 (size) + 4 (rgba) + 4 (padding)

  const totalSize = headerSize + colorDataSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);

  let offset = 0;

  // Magic "SLCC"
  uint8[offset++] = 0x53; // S
  uint8[offset++] = 0x4c; // L
  uint8[offset++] = 0x43; // C
  uint8[offset++] = 0x43; // C

  // Version 1 (little-endian)
  view.setUint16(offset, 1, true);
  offset += 2;

  // Color count (little-endian)
  view.setUint32(offset, colors.length, true);
  offset += 4;

  // Name length (little-endian)
  view.setUint16(offset, nameBytes.length, true);
  offset += 2;

  // Name (ASCII)
  for (let i = 0; i < nameBytes.length; i++) {
    uint8[offset++] = nameBytes[i];
  }
  uint8[offset++] = 0; // null terminator

  // Pad to header size
  offset = headerSize;

  // Write colors
  for (const color of colors) {
    // Entry size: 8 bytes (4 for RGBA + 4 padding, but we write 12 total with size prefix)
    view.setUint32(offset, 8, true);
    offset += 4;

    // RGBA
    uint8[offset++] = color.rgb.r;
    uint8[offset++] = color.rgb.g;
    uint8[offset++] = color.rgb.b;
    uint8[offset++] = 0xff; // Alpha

    // Padding
    view.setUint32(offset, 0, true);
    offset += 4;
  }

  return buffer;
}

/**
 * Generate ACO binary data (Adobe Photoshop Color Swatch)
 * Version 2 format with color names
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

export function PaletteExport({
  topColors,
  familyColors,
  brightnessFactors,
  hueShifts,
  isProcessing,
}: PaletteExportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>(
    EXPORT_FORMATS[0]
  );

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
        case "cls":
          buffer = generateCLS(allColors, "Color Palette");
          mimeType = "application/octet-stream";
          break;
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

  const handleFormatChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const format = EXPORT_FORMATS.find(f => f.id === e.target.value);
    if (format) {
      setSelectedFormat(format);
    }
  }, []);

  const hasColors = topColors.length > 0 || familyColors.length > 0;

  return (
    <>
      {/* Hidden canvas for rendering PNG */}
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Export controls */}
      <div className="flex items-center gap-2">
        {/* Format selector */}
        <select
          value={selectedFormat.id}
          onChange={handleFormatChange}
          disabled={isProcessing || !hasColors}
          className="h-10 rounded-lg border border-border/50 bg-card px-3 pr-8 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {EXPORT_FORMATS.map((format) => (
            <option key={format.id} value={format.id}>
              {format.label}
            </option>
          ))}
        </select>

        {/* Download button */}
        <button
          onClick={handleExport}
          disabled={isProcessing || !hasColors}
          className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isProcessing ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Download className="size-4" />
              Download
            </>
          )}
        </button>
      </div>
    </>
  );
}
