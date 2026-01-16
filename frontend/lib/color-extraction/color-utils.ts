/**
 * Color utility functions for conversions and adjustments
 */

import type { RGB, HSL } from "./types";

/**
 * Convert an RGB color to a hexadecimal CSS color string.
 *
 * This clamps each channel to the range 0–255, rounds to the nearest integer,
 * converts each channel to a two-digit hexadecimal component, and returns the
 * concatenated string prefixed with `#`.
 *
 * @returns The color as a `#RRGGBB` hex string
 */
export function rgbToHex(rgb: RGB): string {
  const toHex = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/**
 * Convert a 6-digit HEX color string to an RGB object.
 *
 * @param hex - The HEX color in `#RRGGBB` or `RRGGBB` format (case-insensitive).
 * @returns An object with `r`, `g`, and `b` channels in the range 0–255. If `hex` is invalid, returns `{ r: 0, g: 0, b: 0 }`.
 */
export function hexToRgb(hex: string): RGB {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/**
 * Converts an RGB color to its HSL representation.
 *
 * @param rgb - The RGB color with `r`, `g`, and `b` channel values in the range 0–255.
 * @returns An HSL object where `h` is hue in degrees [0–360], and `s` and `l` are saturation and lightness as percentages [0–100]. For achromatic colors (no hue), `h` and `s` are `0`.
 */
export function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: Math.round(l * 100) };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    case b:
      h = ((r - g) / d + 4) / 6;
      break;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Convert an HSL color to its RGB representation.
 *
 * @param hsl - Hue in degrees [0–360], saturation and lightness as percentages [0–100]
 * @returns An `RGB` object with `r`, `g`, and `b` channels as integers in the range 0–255
 */
export function hslToRgb(hsl: HSL): RGB {
  const h = hsl.h / 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;

  if (s === 0) {
    const val = Math.round(l * 255);
    return { r: val, g: val, b: val };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

/**
 * Adjusts a color's perceived brightness by modifying its HSL lightness.
 *
 * Adds `amount` (in percentage points) to the color's lightness, clamps the result to 0–100, and returns the corresponding RGB color.
 *
 * @param amount - Percentage points to add to lightness (range: -100 to 100)
 * @returns The RGB color with adjusted brightness
 */
export function adjustBrightness(rgb: RGB, amount: number): RGB {
  const hsl = rgbToHsl(rgb);
  const newL = Math.max(0, Math.min(100, hsl.l + amount));
  return hslToRgb({ ...hsl, l: newL });
}

/**
 * Shifts the hue of an RGB color by a specified number of degrees.
 *
 * @param rgb - The source RGB color
 * @param degrees - Signed degree offset to add to the hue; positive values rotate forward, negative rotate backward. The resulting hue is wrapped into the range [0, 360)
 * @returns The RGB color with its hue adjusted by `degrees`
 */
export function adjustHue(rgb: RGB, degrees: number): RGB {
  const hsl = rgbToHsl(rgb);
  let newH = (hsl.h + degrees) % 360;
  if (newH < 0) newH += 360;
  return hslToRgb({ ...hsl, h: newH });
}

/**
 * Compute the Euclidean distance between two colors in RGB space.
 *
 * @param c1 - The first RGB color
 * @param c2 - The second RGB color
 * @returns The Euclidean distance between `c1` and `c2` (a non-negative number)
 */
export function colorDistance(c1: RGB, c2: RGB): number {
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
      Math.pow(c1.g - c2.g, 2) +
      Math.pow(c1.b - c2.b, 2)
  );
}

/**
 * Determines whether an RGB color is close to pure black or pure white.
 *
 * @param rgb - The color to evaluate
 * @param threshold - Channel distance from black (0) or white (255) used to decide closeness; defaults to 15
 * @returns `true` if all channels are less than `threshold` (near black) or all channels are greater than `255 - threshold` (near white), `false` otherwise
 */
export function isBlackOrWhite(rgb: RGB, threshold = 15): boolean {
  // Check if close to black
  if (rgb.r < threshold && rgb.g < threshold && rgb.b < threshold) {
    return true;
  }
  // Check if close to white
  if (
    rgb.r > 255 - threshold &&
    rgb.g > 255 - threshold &&
    rgb.b > 255 - threshold
  ) {
    return true;
  }
  return false;
}

/**
 * Choose a high-contrast text color (black or white) for the given background color.
 *
 * @param rgb - Background color with `r`, `g`, `b` channels in the range 0–255
 * @returns `#000000` for black text or `#ffffff` for white text, selected by relative luminance
 */
export function getContrastColor(rgb: RGB): string {
  // Using relative luminance formula
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

/**
 * Create a CSS rgb() color string from an RGB object.
 *
 * @param rgb - RGB color with `r`, `g`, and `b` channel values in the range 0–255
 * @returns The CSS color string in the form `rgb(r, g, b)`
 */
export function rgbToCss(rgb: RGB): string {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

/**
 * Convert an HSL color value to a CSS `hsl(...)` string.
 *
 * @param hsl - HSL color where `h` is hue in degrees and `s`/`l` are saturation and lightness as percentages
 * @returns A CSS `hsl(h, s%, l%)` string
 */
export function hslToCss(hsl: HSL): string {
  return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
}