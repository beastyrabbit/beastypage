/**
 * Color utility functions for conversions and adjustments
 */

import type { RGB, HSL } from "./types";

/**
 * Convert RGB to HEX
 */
export function rgbToHex(rgb: RGB): string {
  const toHex = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/**
 * Convert HEX to RGB
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
 * Convert RGB to HSL
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
 * Convert HSL to RGB
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
 * Adjust brightness of a color
 * @param rgb - RGB color
 * @param amount - Percentage change (-100 to 100)
 */
export function adjustBrightness(rgb: RGB, amount: number): RGB {
  const hsl = rgbToHsl(rgb);
  const newL = Math.max(0, Math.min(100, hsl.l + amount));
  return hslToRgb({ ...hsl, l: newL });
}

/**
 * Adjust hue of a color
 * @param rgb - RGB color
 * @param degrees - Hue shift in degrees
 */
export function adjustHue(rgb: RGB, degrees: number): RGB {
  const hsl = rgbToHsl(rgb);
  let newH = (hsl.h + degrees) % 360;
  if (newH < 0) newH += 360;
  return hslToRgb({ ...hsl, h: newH });
}

/**
 * Calculate color distance (Euclidean in RGB space)
 */
export function colorDistance(c1: RGB, c2: RGB): number {
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
      Math.pow(c1.g - c2.g, 2) +
      Math.pow(c1.b - c2.b, 2)
  );
}

/**
 * Check if color is close to black or white
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
 * Get contrasting text color (black or white) for a background
 */
export function getContrastColor(rgb: RGB): string {
  // Using relative luminance formula
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

/**
 * Format RGB as CSS string
 */
export function rgbToCss(rgb: RGB): string {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

/**
 * Format HSL as CSS string
 */
export function hslToCss(hsl: HSL): string {
  return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
}
