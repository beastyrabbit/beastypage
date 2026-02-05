import { hexToRgb } from "@/lib/color-extraction/color-utils";
import { generateACO, type PaletteColor } from "@/lib/color-extraction/palette-formats";
import { formatColor } from "./format-color";
import type { GeneratedPalette, DisplayFormat, ExportFormat } from "./types";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Delay revocation to give the browser time to start the download
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// PNG export — renders palette strips onto a canvas
// ---------------------------------------------------------------------------

export function exportPalettePNG(
  palettes: GeneratedPalette[],
  filename = "palettes.png",
) {
  if (palettes.length === 0) return;

  const SWATCH_W = 80;
  const SWATCH_H = 60;
  const GAP = 8;
  const PAD = 16;

  const maxColors = Math.max(...palettes.map((p) => p.colors.length));
  const canvasW = PAD * 2 + maxColors * SWATCH_W + (maxColors - 1) * GAP;
  const canvasH = PAD * 2 + palettes.length * SWATCH_H + (palettes.length - 1) * GAP;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable — cannot export PNG");

  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, canvasW, canvasH);

  palettes.forEach((palette, row) => {
    const y = PAD + row * (SWATCH_H + GAP);
    palette.colors.forEach((hex, col) => {
      const x = PAD + col * (SWATCH_W + GAP);
      ctx.fillStyle = hex;
      ctx.fillRect(x, y, SWATCH_W, SWATCH_H);
    });
  });

  canvas.toBlob((blob) => {
    if (blob) triggerDownload(blob, filename);
  }, "image/png");
}

// ---------------------------------------------------------------------------
// ACO export — Adobe Photoshop Color Swatch
// ---------------------------------------------------------------------------

export function exportPaletteACO(
  palettes: GeneratedPalette[],
  filename = "palettes.aco",
) {
  const seen = new Set<string>();
  const colors: PaletteColor[] = [];
  for (const palette of palettes) {
    for (const hex of palette.colors) {
      const upper = hex.toUpperCase();
      if (seen.has(upper)) continue;
      seen.add(upper);
      colors.push({ rgb: hexToRgb(hex), name: upper });
    }
  }
  const buffer = generateACO(colors);
  triggerDownload(new Blob([buffer], { type: "application/octet-stream" }), filename);
}

// ---------------------------------------------------------------------------
// JSON export
// ---------------------------------------------------------------------------

export function exportPaletteJSON(
  palettes: GeneratedPalette[],
  filename = "palettes.json",
) {
  const data = palettes.map((p) => ({
    seed: p.seed,
    mode: p.mode,
    colors: p.colors,
    source: p.source,
    timestamp: p.timestamp,
  }));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  triggerDownload(blob, filename);
}

// ---------------------------------------------------------------------------
// CSS export
// ---------------------------------------------------------------------------

/**
 * Export palettes as CSS custom properties.
 * Single palette: --color-1, --color-2, ...
 * Multiple palettes: --palette-1-color-1, --palette-2-color-1, ...
 */
export function exportPaletteCSS(
  palettes: GeneratedPalette[],
  format: DisplayFormat = "hex",
  filename = "palettes.css",
) {
  const lines = [":root {"];
  palettes.forEach((palette, pi) => {
    const prefix = palettes.length === 1 ? "" : `palette-${pi + 1}-`;
    palette.colors.forEach((hex, ci) => {
      const { clipboard } = formatColor(hex, format);
      lines.push(`  --${prefix}color-${ci + 1}: ${clipboard};`);
    });
    if (pi < palettes.length - 1) lines.push("");
  });
  lines.push("}");
  const blob = new Blob([lines.join("\n")], { type: "text/css" });
  triggerDownload(blob, filename);
}

// ---------------------------------------------------------------------------
// Unified export — dispatches to the correct format exporter
// ---------------------------------------------------------------------------

export function exportPalettes(
  palettes: GeneratedPalette[],
  format: ExportFormat,
  displayFormat: DisplayFormat,
  filenameBase?: string,
): void {
  const suffix = filenameBase ? `${filenameBase}.${format}` : undefined;
  switch (format) {
    case "png":
      exportPalettePNG(palettes, suffix);
      break;
    case "aco":
      exportPaletteACO(palettes, suffix);
      break;
    case "json":
      exportPaletteJSON(palettes, suffix);
      break;
    case "css":
      exportPaletteCSS(palettes, displayFormat, suffix);
      break;
    default: {
      const _exhaustive: never = format;
      throw new Error(`Unknown export format: ${_exhaustive}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Clipboard — copy formatted color list
// ---------------------------------------------------------------------------

export function buildClipboardText(
  palettes: GeneratedPalette[],
  format: DisplayFormat,
): string {
  if (palettes.length === 1) {
    return palettes[0].colors.map((hex) => formatColor(hex, format).clipboard).join("\n");
  }
  return palettes
    .map((p, i) => {
      const header = `Palette ${i + 1} (${p.mode}, #${p.seed.toUpperCase()})`;
      const values = p.colors.map((hex) => formatColor(hex, format).clipboard).join("\n");
      return `${header}\n${values}`;
    })
    .join("\n\n");
}
