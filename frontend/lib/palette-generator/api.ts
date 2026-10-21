import { fetchColorName } from "../color-extraction/color-names";
import {
  hexToRgb,
  hslToRgb,
  rgbToHex,
  rgbToHsl,
} from "../color-extraction/color-utils";
import type { GeneratedPalette } from "./types";

export function randomHexSeed(): string {
  return Math.floor(Math.random() * 0x1000000)
    .toString(16)
    .padStart(6, "0");
}

const HUE_OFFSETS: Record<string, number[]> = {
  analogic: [-30, 0, 30],
  complement: [0, 180],
  "analogic-complement": [-30, 0, 30, 150, 180, 210],
  triad: [0, 120, 240],
  quad: [0, 90, 180, 270],
};

/** Deterministic local harmonies, with names resolved from the bundled dataset. */
export async function generateColorScheme(
  seed: string,
  mode: string,
  count: number,
): Promise<{ hex: string; name: string }[]> {
  if (!/^#?[\da-f]{6}$/i.test(seed)) throw new Error("Invalid hex seed");
  if (!Number.isInteger(count) || count < 1 || count > 12) {
    throw new RangeError("Palette size must be an integer between 1 and 12");
  }
  const safeMode = mode === "tetrad" || mode === "square" ? "quad" : mode;
  const monochrome = [
    "monochrome",
    "monochrome-dark",
    "monochrome-light",
  ].includes(safeMode);
  const offsets = Object.hasOwn(HUE_OFFSETS, safeMode)
    ? HUE_OFFSETS[safeMode]
    : undefined;
  if (!monochrome && !offsets) throw new Error(`Unknown harmony mode: ${mode}`);

  const base = rgbToHsl(hexToRgb(seed));
  let minLightness = Math.max(5, base.l - 35);
  let maxLightness = Math.min(95, base.l + 35);
  if (safeMode === "monochrome-dark") {
    minLightness = Math.max(2, base.l * 0.15);
    maxLightness = Math.max(12, base.l * 0.85);
  } else if (safeMode === "monochrome-light") {
    minLightness = Math.min(88, base.l + (100 - base.l) * 0.15);
    maxLightness = Math.min(98, base.l + (100 - base.l) * 0.85);
  }

  return Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const hsl = { ...base };
      if (monochrome && count > 1) {
        hsl.l =
          minLightness + ((maxLightness - minLightness) * index) / (count - 1);
      } else if (offsets && count > 1) {
        hsl.h = (base.h + offsets[index % offsets.length] + 360) % 360;
        // Repeat each harmony's hue families with different lightness levels.
        const levels = Math.ceil(count / offsets.length);
        const shift =
          levels > 1
            ? (Math.floor(index / offsets.length) / (levels - 1) - 0.5) * 24
            : 0;
        hsl.l = Math.max(5, Math.min(95, base.l + shift));
      }
      const hex =
        count === 1
          ? `#${seed.replace(/^#/, "").toUpperCase()}`
          : rgbToHex(hslToRgb(hsl)).toUpperCase();
      return { hex, name: await fetchColorName(hex) };
    }),
  );
}

/** Keep the existing async entry point for the generator UI. */
export async function fetchPaletteFromAPI(
  mode: string,
  count: number,
): Promise<GeneratedPalette> {
  const seed = randomHexSeed();
  const started = performance.now();
  const scheme = await generateColorScheme(seed, mode, count);
  return {
    id: crypto.randomUUID(),
    seed,
    mode,
    colors: scheme.map(({ hex }) => hex),
    ms: Math.round(performance.now() - started),
    source: "local",
    timestamp: Date.now(),
  };
}
