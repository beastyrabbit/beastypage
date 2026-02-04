/**
 * Types for the Color Palette Creator
 */

/** RGB color with channels in 0-255 integer range */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** HSL color: h 0-360 degrees, s 0-100 percent, l 0-100 percent */
export interface HSL {
  h: number;
  s: number;
  l: number;
}

/** HSV color: h 0-360 degrees, s 0-100 percent, v 0-100 percent */
export interface HSV {
  h: number;
  s: number;
  v: number;
}

/** CMYK color: all channels 0-100 percent */
export interface CMYK {
  c: number;
  m: number;
  y: number;
  k: number;
}

/** OKLCH color: l 0-1 lightness, c 0-~0.4 chroma, h 0-360 degrees */
export interface OKLCH {
  l: number;
  c: number;
  h: number;
}

export interface ExtractedColor {
  hex: string;
  rgb: RGB;
  hsl: HSL;
  position: { x: number; y: number };
  prevalence: number;
  name?: string; // Human-readable color name from thecolorapi.com
}

export interface PaletteState {
  image: HTMLImageElement | null;
  imageDataUrl: string | null;
  topColors: ExtractedColor[];      // Renamed from extractedColors - dominant colors
  familyColors: ExtractedColor[];   // NEW - accent/minor colors
  topColorCount: number;            // Slider value for top colors (1-20)
  familyColorCount: number;         // Slider value for family colors (1-20)
  brightnessFactors: number[];      // [0.5, 0.75, 1.0, 1.25, 1.5]
  hueShifts: number[];              // [0, 10, 20, 30]
  filterBlackWhite: boolean;
  isProcessing: boolean;
  error: string | null;
  hoveredColorIndex: number | null;
  hoveredColorType: 'top' | 'family' | null; // Track which color set is hovered
}

export interface KMeansOptions {
  k: number;
  maxIterations?: number;
  sampleStep?: number;
  filterBlackWhite?: boolean;
  blackWhiteThreshold?: number;
}

export interface PixelData {
  r: number;
  g: number;
  b: number;
  x: number;
  y: number;
}

export interface Centroid {
  r: number;
  g: number;
  b: number;
  x: number;
  y: number;
  count: number;
}
