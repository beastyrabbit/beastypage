/**
 * Color naming utilities using thecolorapi.com
 */

import type { ExtractedColor } from "./types";

interface ColorApiResponse {
  name: {
    value: string;
    closest_named_hex: string;
    exact_match_name: boolean;
    distance: number;
  };
}

/**
 * Fetch color name from thecolorapi.com
 */
export async function fetchColorName(hex: string): Promise<string> {
  // Remove # if present
  const cleanHex = hex.replace(/^#/, "");

  try {
    const response = await fetch(
      `https://www.thecolorapi.com/id?hex=${cleanHex}`,
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data: ColorApiResponse = await response.json();
    return data.name.value;
  } catch (error) {
    console.error(`Failed to fetch color name for ${hex}:`, error);
    return "Unknown";
  }
}

/**
 * Batch fetch color names for multiple colors with rate limiting
 * Returns a Map of hex -> name
 */
export async function fetchColorNames(
  colors: ExtractedColor[]
): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();

  // Dedupe hexes
  const uniqueHexes = [...new Set(colors.map((c) => c.hex.toUpperCase()))];

  // Fetch in parallel with a small batch size to avoid rate limiting
  const BATCH_SIZE = 5;

  for (let i = 0; i < uniqueHexes.length; i += BATCH_SIZE) {
    const batch = uniqueHexes.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (hex) => {
        const name = await fetchColorName(hex);
        return { hex, name };
      })
    );

    for (const { hex, name } of results) {
      nameMap.set(hex.toUpperCase(), name);
    }

    // Small delay between batches to be nice to the API
    if (i + BATCH_SIZE < uniqueHexes.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return nameMap;
}

/**
 * Generate display name for a color with context
 */
export function generateColorDisplayName(
  index: number,
  colorName: string,
  type: "dominant" | "accent",
  variation?: { brightnessMultiplier?: number; hueShift?: number }
): string {
  const prefix = type === "dominant" ? "dom" : "acc";
  let name = `${prefix} #${index + 1} - ${colorName}`;

  if (variation?.brightnessMultiplier !== undefined && variation.brightnessMultiplier !== 1.0) {
    name = `${prefix} #${index + 1} (${variation.brightnessMultiplier}x) - ${colorName}`;
  } else if (variation?.hueShift !== undefined && variation.hueShift !== 0) {
    const sign = variation.hueShift >= 0 ? "+" : "";
    name = `${prefix} #${index + 1} (${sign}${variation.hueShift}°) - ${colorName}`;
  }

  return name;
}
