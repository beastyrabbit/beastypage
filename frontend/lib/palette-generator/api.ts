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

/** Deterministic hex-only harmonies; callers can resolve names when displayed. */
export function generateColorScheme(
  seed: string,
  mode: string,
  count: number,
): string[] {
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

  const levels = offsets ? Math.ceil(count / offsets.length) : 1;

  function build(neutral: boolean): string[] {
    const halfSpan = levels > 1 || neutral ? 12 : 0;
    // Move the whole lightness range inside 5–95 instead of clipping its steps.
    const center = Math.max(5 + halfSpan, Math.min(95 - halfSpan, base.l));

    return Array.from({ length: count }, (_, index) => {
      const hsl = { ...base };
      if (monochrome && count > 1) {
        hsl.l =
          minLightness + ((maxLightness - minLightness) * index) / (count - 1);
      } else if (neutral && count > 1) {
        // Neutral seeds and quantized hue collisions use distinct lightness
        // steps while retaining the seed's hue and saturation.
        hsl.l = center - halfSpan + (2 * halfSpan * index) / (count - 1);
      } else if (offsets && count > 1) {
        hsl.h = (base.h + offsets[index % offsets.length] + 360) % 360;
        // Repeat each harmony's hue families with different lightness levels.
        const shift =
          levels > 1
            ? (Math.floor(index / offsets.length) / (levels - 1) - 0.5) * 24
            : 0;
        hsl.l = center + shift;
      }
      return count === 1
        ? `#${seed.replace(/^#/, "").toUpperCase()}`
        : rgbToHex(hslToRgb(hsl)).toUpperCase();
    });
  }

  const colors = build(base.s === 0);
  return new Set(colors).size === colors.length ? colors : build(true);
}

/** Keep the existing async entry point for the generator UI. */
export async function fetchPaletteFromAPI(
  mode: string,
  count: number,
): Promise<GeneratedPalette> {
  const seed = randomHexSeed();
  const started = performance.now();
  const colors = generateColorScheme(seed, mode, count);
  return {
    id: crypto.randomUUID(),
    seed,
    mode,
    colors,
    ms: Math.round(performance.now() - started),
    source: "local",
    timestamp: Date.now(),
  };
}
