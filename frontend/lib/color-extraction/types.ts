/**
 * Types for the Color Palette Creator
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export interface ExtractedColor {
  hex: string;
  rgb: RGB;
  hsl: HSL;
  position: { x: number; y: number };
  prevalence: number;
}

export interface PaletteState {
  image: HTMLImageElement | null;
  imageDataUrl: string | null;
  extractedColors: ExtractedColor[];
  colorCount: number;
  filterBlackWhite: boolean;
  isProcessing: boolean;
  error: string | null;
  hoveredColorIndex: number | null;
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
