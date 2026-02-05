import { DISPLAY_FORMATS, type DisplayFormat, type GeneratedPalette } from "@/lib/palette-generator/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaletteGeneratorSettings {
  v: 1;
  paletteSize: number;
  displayFormat: DisplayFormat;
  collection: GeneratedPalette[];
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_PALETTE_GENERATOR_SETTINGS: PaletteGeneratorSettings = {
  v: 1,
  paletteSize: 5,
  displayFormat: "hex",
  collection: [],
};

// ---------------------------------------------------------------------------
// Payload parsing
// ---------------------------------------------------------------------------

export function parsePaletteGeneratorPayload(payload: unknown): PaletteGeneratorSettings {
  if (!payload || typeof payload !== "object") {
    return { ...DEFAULT_PALETTE_GENERATOR_SETTINGS };
  }
  const data = payload as Record<string, unknown>;

  const paletteSize =
    typeof data.paletteSize === "number" && Number.isFinite(data.paletteSize)
      ? Math.max(1, Math.min(12, Math.round(data.paletteSize)))
      : DEFAULT_PALETTE_GENERATOR_SETTINGS.paletteSize;

  const displayFormat =
    typeof data.displayFormat === "string" &&
    (DISPLAY_FORMATS as readonly string[]).includes(data.displayFormat)
      ? (data.displayFormat as DisplayFormat)
      : DEFAULT_PALETTE_GENERATOR_SETTINGS.displayFormat;

  const collection = Array.isArray(data.collection)
    ? data.collection.filter(
        (item): item is GeneratedPalette =>
          item != null &&
          typeof item === "object" &&
          typeof (item as Record<string, unknown>).id === "string" &&
          Array.isArray((item as Record<string, unknown>).colors),
      )
    : [];

  return { v: 1, paletteSize, displayFormat, collection };
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export function paletteGeneratorSettingsEqual(
  a: PaletteGeneratorSettings,
  b: PaletteGeneratorSettings,
): boolean {
  if (a.paletteSize !== b.paletteSize || a.displayFormat !== b.displayFormat) return false;
  if (a.collection.length !== b.collection.length) return false;
  for (let i = 0; i < a.collection.length; i++) {
    if (a.collection[i].id !== b.collection[i].id) return false;
    const aColors = a.collection[i].colors;
    const bColors = b.collection[i].colors;
    if (aColors.length !== bColors.length || aColors.some((c, j) => c !== bColors[j])) return false;
  }
  return true;
}
