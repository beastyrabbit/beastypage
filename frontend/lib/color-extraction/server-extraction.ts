/**
 * Server-side color extraction using @napi-rs/canvas.
 *
 * Replicates the browser-based k-means pipeline from kmeans.ts but uses
 * @napi-rs/canvas instead of HTMLImageElement / DOM canvas for pixel access.
 */

import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';
import type { ExtractedColor, KMeansOptions, PixelData, Centroid, RGB } from './types';
import { rgbToHex, rgbToHsl, isBlackOrWhite, colorDistance, adjustBrightness, adjustHue, getContrastColor } from './color-utils';

const MAX_DIMENSION = 1200;

const DEFAULT_OPTIONS: Required<KMeansOptions> = {
  k: 6,
  maxIterations: 20,
  sampleStep: 5,
  filterBlackWhite: true,
  blackWhiteThreshold: 15,
};

// ---------------------------------------------------------------------------
// Image pixel access (server-side replacement for image-processing.ts)
// ---------------------------------------------------------------------------

export async function getImagePixelsServer(buffer: Buffer): Promise<{
  data: Uint8ClampedArray;
  width: number;
  height: number;
}> {
  const img = await loadImage(buffer);
  let width = img.width;
  let height = img.height;

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img as Image, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  return {
    data: new Uint8ClampedArray(imageData.data),
    width,
    height,
  };
}

// ---------------------------------------------------------------------------
// K-means pipeline (mirrors kmeans.ts internal functions)
// ---------------------------------------------------------------------------

function countUniqueColors(pixels: PixelData[]): number {
  const keys = new Set(pixels.map((p) => `${p.r},${p.g},${p.b}`));
  return keys.size;
}

function samplePixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: Required<KMeansOptions>,
): PixelData[] {
  const step = opts.sampleStep;
  if (!Number.isInteger(step) || step < 1) {
    throw new Error(`sampleStep must be a positive integer, got: ${step}`);
  }

  const pixels: PixelData[] = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 128) continue;
      if (opts.filterBlackWhite && isBlackOrWhite({ r, g, b }, opts.blackWhiteThreshold)) continue;
      pixels.push({ r, g, b, x, y });
    }
  }
  return pixels;
}

function initializeCentroids(pixels: PixelData[], k: number): Centroid[] {
  const centroids: Centroid[] = [];
  const first = pixels[Math.floor(Math.random() * pixels.length)];
  centroids.push({ ...first, count: 0 });

  for (let i = 1; i < k; i++) {
    const distances = pixels.map((p) => {
      const minDist = Math.min(
        ...centroids.map((c) => colorDistance({ r: p.r, g: p.g, b: p.b }, { r: c.r, g: c.g, b: c.b })),
      );
      return minDist * minDist;
    });
    const total = distances.reduce((s, d) => s + d, 0);
    let random = Math.random() * total;
    for (let j = 0; j < pixels.length; j++) {
      random -= distances[j];
      if (random <= 0) {
        centroids.push({ ...pixels[j], count: 0 });
        break;
      }
    }
    if (centroids.length === i) {
      centroids.push({ ...pixels[Math.floor(Math.random() * pixels.length)], count: 0 });
    }
  }
  return centroids;
}

function assignPixels(pixels: PixelData[], centroids: Centroid[]): Map<number, PixelData[]> {
  const clusters = new Map<number, PixelData[]>();
  for (let i = 0; i < centroids.length; i++) clusters.set(i, []);
  for (const pixel of pixels) {
    let minDist = Infinity;
    let closest = 0;
    for (let i = 0; i < centroids.length; i++) {
      const dist = colorDistance(
        { r: pixel.r, g: pixel.g, b: pixel.b },
        { r: centroids[i].r, g: centroids[i].g, b: centroids[i].b },
      );
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    }
    clusters.get(closest)!.push(pixel);
  }
  return clusters;
}

function updateCentroids(clusters: Map<number, PixelData[]>, prev: Centroid[]): Centroid[] {
  const result: Centroid[] = [];
  clusters.forEach((pixels, idx) => {
    if (pixels.length === 0) {
      result.push(prev[idx] ? { ...prev[idx], count: 0 } : { r: 128, g: 128, b: 128, x: 0, y: 0, count: 0 });
      return;
    }
    const count = pixels.length;
    result.push({
      r: pixels.reduce((s, p) => s + p.r, 0) / count,
      g: pixels.reduce((s, p) => s + p.g, 0) / count,
      b: pixels.reduce((s, p) => s + p.b, 0) / count,
      x: pixels.reduce((s, p) => s + p.x, 0) / count,
      y: pixels.reduce((s, p) => s + p.y, 0) / count,
      count,
    });
  });
  return result;
}

function hasConverged(old: Centroid[], next: Centroid[], threshold = 1): boolean {
  for (let i = 0; i < old.length; i++) {
    if (colorDistance({ r: old[i].r, g: old[i].g, b: old[i].b }, { r: next[i].r, g: next[i].g, b: next[i].b }) > threshold) {
      return false;
    }
  }
  return true;
}

interface KMeansCluster {
  readonly centroid: Centroid;
  readonly members: readonly PixelData[];
}

function kMeans(pixels: PixelData[], k: number, maxIter: number): { clusters: readonly KMeansCluster[] } {
  let centroids = initializeCentroids(pixels, k);
  for (let i = 0; i < maxIter; i++) {
    const assigned = assignPixels(pixels, centroids);
    const next = updateCentroids(assigned, centroids);
    if (hasConverged(centroids, next)) {
      return { clusters: next.map((c, idx) => ({ centroid: c, members: assigned.get(idx) ?? [] })) };
    }
    centroids = next;
  }
  const final = assignPixels(pixels, centroids);
  const finalCentroids = updateCentroids(final, centroids);
  return { clusters: finalCentroids.map((c, idx) => ({ centroid: c, members: final.get(idx) ?? [] })) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function extractColorsServer(
  imageBuffer: Buffer,
  options: KMeansOptions = { k: 6 },
): Promise<ExtractedColor[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { data, width, height } = await getImagePixelsServer(imageBuffer);
  const pixels = samplePixels(data, width, height, opts);

  const uniqueCount = countUniqueColors(pixels);
  if (uniqueCount < 2) throw new Error('Not enough unique colors in image');

  const effectiveK = Math.min(opts.k, uniqueCount);
  const { clusters } = kMeans(pixels, effectiveK, opts.maxIterations);
  const totalPixels = pixels.length;

  return clusters
    .map(({ centroid: c }) => {
      const rgb = { r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) };
      return {
        hex: rgbToHex(rgb),
        rgb,
        hsl: rgbToHsl(rgb),
        position: { x: Math.round(c.x), y: Math.round(c.y) },
        prevalence: Math.round((c.count / totalPixels) * 100),
      };
    })
    .sort((a, b) => b.prevalence - a.prevalence);
}

export function generatePaletteImage(
  colors: Array<{ hex: string; rgb: RGB }>,
  swatchWidth = 60,
  swatchHeight = 60,
): string {
  if (colors.length === 0) throw new Error('Cannot generate palette image with zero colors');
  const width = swatchWidth * colors.length;
  const height = swatchHeight;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  for (let i = 0; i < colors.length; i++) {
    ctx.fillStyle = colors[i].hex;
    ctx.fillRect(i * swatchWidth, 0, swatchWidth, height);
  }

  return canvas.toDataURL('image/png');
}

/**
 * Generate a full palette grid image with brightness and hue variations.
 * Matches the layout of the PaletteGrid component (rows = colors, cols = factors/shifts).
 *
 * Row 0:        Main swatches          — N columns × 1 row (60×60px each)
 * Rows 1..N:    Brightness variations  — 5 columns (one per factor) × N rows (one per color)
 * Rows N+1..2N: Hue shift variations   — 4 columns (one per shift) × N rows (one per color)
 */
export function generatePaletteGridImage(
  colors: Array<{ hex: string; rgb: RGB }>,
  swatchWidth = 60,
): string {
  if (colors.length === 0) throw new Error('Cannot generate palette grid with zero colors');

  const mainSwatchHeight = 60;
  const variantCellHeight = 40;
  const brightnessFactors = [0.5, 0.75, 1.0, 1.25, 1.5];
  const hueShifts = [0, 10, 20, 30];
  const labelGap = 20;
  const sectionGap = 16;
  const factorLabelHeight = 14; // space for column labels below grids

  const mainWidth = swatchWidth * colors.length;
  const brightnessWidth = swatchWidth * brightnessFactors.length;
  const hueWidth = swatchWidth * hueShifts.length;
  const totalWidth = Math.max(mainWidth, brightnessWidth, hueWidth);

  const totalHeight =
    mainSwatchHeight +
    sectionGap + labelGap + (colors.length * variantCellHeight) + factorLabelHeight +
    sectionGap + labelGap + (colors.length * variantCellHeight) + factorLabelHeight;

  const canvas = createCanvas(totalWidth, totalHeight);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // Row 0: Main swatches with hex labels
  for (let i = 0; i < colors.length; i++) {
    const x = i * swatchWidth;
    ctx.fillStyle = colors[i].hex;
    ctx.fillRect(x, 0, swatchWidth, mainSwatchHeight);

    // Hex label
    const textColor = getContrastColor(colors[i].rgb);
    ctx.fillStyle = textColor;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(colors[i].hex, x + swatchWidth / 2, mainSwatchHeight / 2);
  }

  // Brightness section — rows = colors, cols = factors
  let yOffset = mainSwatchHeight + sectionGap;
  ctx.fillStyle = '#aaaacc';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Brightness', 4, yOffset);
  yOffset += labelGap;

  for (let i = 0; i < colors.length; i++) {
    for (let f = 0; f < brightnessFactors.length; f++) {
      const factor = brightnessFactors[f];
      const adjustment = (factor - 1) * 50;
      const adjusted = adjustBrightness(colors[i].rgb, adjustment);
      const hex = rgbToHex(adjusted);
      const x = f * swatchWidth;
      ctx.fillStyle = hex;
      ctx.fillRect(x, yOffset, swatchWidth, variantCellHeight);
    }
    yOffset += variantCellHeight;
  }

  // Factor column labels
  for (let f = 0; f < brightnessFactors.length; f++) {
    ctx.fillStyle = '#aaaacc';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${brightnessFactors[f]}x`, f * swatchWidth + swatchWidth / 2, yOffset + 2);
  }
  yOffset += factorLabelHeight;

  // Hue shift section — rows = colors, cols = shifts
  yOffset += sectionGap;
  ctx.fillStyle = '#aaaacc';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Hue Shift', 4, yOffset);
  yOffset += labelGap;

  for (let i = 0; i < colors.length; i++) {
    for (let h = 0; h < hueShifts.length; h++) {
      const shift = hueShifts[h];
      const adjusted = adjustHue(colors[i].rgb, shift);
      const hex = rgbToHex(adjusted);
      const x = h * swatchWidth;
      ctx.fillStyle = hex;
      ctx.fillRect(x, yOffset, swatchWidth, variantCellHeight);
    }
    yOffset += variantCellHeight;
  }

  // Shift column labels
  for (let h = 0; h < hueShifts.length; h++) {
    ctx.fillStyle = '#aaaacc';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`+${hueShifts[h]}°`, h * swatchWidth + swatchWidth / 2, yOffset + 2);
  }

  return canvas.toDataURL('image/png');
}
