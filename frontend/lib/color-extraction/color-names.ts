/**
 * Local color naming with color-name-list/short (MIT).
 * See public/third-party-licenses.txt for the full license notice.
 */

import { hexToRgb } from "./color-utils";
import type { ExtractedColor, RGB } from "./types";

type Lab = [number, number, number];
type NamedColor = { name: string; lab: Lab };
let namedColors: Promise<NamedColor[]> | undefined;
const nameCache = new Map<string, string>();

// sRGB -> CIE XYZ -> CIE Lab, using the D65 reference white.
function rgbToLab(rgb: RGB): Lab {
  const linearize = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const r = linearize(rgb.r);
  const g = linearize(rgb.g);
  const b = linearize(rgb.b);
  const transform = (value: number) =>
    value > (6 / 29) ** 3
      ? Math.cbrt(value)
      : value / (3 * (6 / 29) ** 2) + 4 / 29;
  const x = transform(
    (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047,
  );
  const y = transform(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const z = transform((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function loadNamedColors(): Promise<NamedColor[]> {
  // The dataset is a separate chunk, loaded only on the first name lookup.
  namedColors ??= import("color-name-list/short")
    .then(({ colornames }) =>
      colornames.map(({ name, hex }) => ({
        name,
        lab: rgbToLab(hexToRgb(hex)),
      })),
    )
    .catch((error) => {
      namedColors = undefined;
      throw error;
    });
  return namedColors;
}

/** Resolve the nearest name by CIE Lab ΔE76; retain the async caller contract. */
export async function fetchColorName(hex: string): Promise<string> {
  let cleanHex = normalizeHex(hex);
  if (/^[\dA-F]{3}$/.test(cleanHex)) {
    cleanHex = [...cleanHex].map((channel) => channel.repeat(2)).join("");
  }
  if (!/^[\dA-F]{6}$/.test(cleanHex)) return "Unknown";
  const cached = nameCache.get(cleanHex);
  if (cached) return cached;

  try {
    const colors = await loadNamedColors();
    const lab = rgbToLab(hexToRgb(cleanHex));
    let nearest = "Unknown";
    let distance = Number.POSITIVE_INFINITY;
    for (const color of colors) {
      // Squared ΔE76 gives the same ordering without a square root per entry.
      const delta = color.lab.reduce(
        (sum, channel, index) => sum + (channel - lab[index]) ** 2,
        0,
      );
      if (delta < distance) {
        distance = delta;
        nearest = color.name;
        if (delta === 0) break;
      }
    }
    if (nameCache.size >= 512) nameCache.clear();
    nameCache.set(cleanHex, nearest);
    return nearest;
  } catch (error) {
    console.error(`Failed to resolve color name for ${hex}:`, error);
    return "Unknown";
  }
}

/**
 * Normalize hex to canonical form: uppercase without # prefix
 */
function normalizeHex(hex: string): string {
  return hex.replace(/^#/, "").toUpperCase();
}

/**
 * Resolve names locally, deduplicating normalized hex values.
 * Returns a Map of normalized hex (uppercase, no #) -> name
 */
export async function fetchColorNames(
  colors: ExtractedColor[],
): Promise<Map<string, string>> {
  // Dedupe hexes using normalized form
  const uniqueHexes = [...new Set(colors.map((c) => normalizeHex(c.hex)))];

  return new Map(
    await Promise.all(
      uniqueHexes.map(async (hex) => [hex, await fetchColorName(hex)] as const),
    ),
  );
}

/**
 * Generate display name for a color with context
 * Supports combined brightness and hue variations
 */
export function generateColorDisplayName(
  index: number,
  colorName: string,
  type: "dominant" | "accent",
  variation?: { brightnessMultiplier?: number; hueShift?: number },
): string {
  const prefix = type === "dominant" ? "dom" : "acc";

  // Build variation parts
  const parts: string[] = [];

  if (
    variation?.brightnessMultiplier !== undefined &&
    variation.brightnessMultiplier !== 1.0
  ) {
    parts.push(`${variation.brightnessMultiplier}x`);
  }

  if (variation?.hueShift !== undefined && variation.hueShift !== 0) {
    const sign = variation.hueShift >= 0 ? "+" : "";
    parts.push(`${sign}${variation.hueShift}°`);
  }

  // Combine into final name
  if (parts.length > 0) {
    return `${prefix} #${index + 1} (${parts.join(", ")}) - ${colorName}`;
  }

  return `${prefix} #${index + 1} - ${colorName}`;
}
