/**
 * Server-side color extraction using @napi-rs/canvas.
 *
 * Replicates the browser-based k-means pipeline from kmeans.ts but uses
 * @napi-rs/canvas instead of HTMLImageElement / DOM canvas for pixel access.
 */

import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';
import type { ExtractedColor, KMeansOptions, PixelData, Centroid, RGB } from './types';
import { rgbToHex, rgbToHsl, isBlackOrWhite, colorDistance, adjustBrightness, adjustHue } from './color-utils';

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
// Helpers
// ---------------------------------------------------------------------------

function colorBrightness(color: RGB): number {
  return Math.sqrt(
    0.299 * (color.r ** 2) + 0.587 * (color.g ** 2) + 0.114 * (color.b ** 2),
  );
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

export async function extractFamilyColorsServer(
  imageBuffer: Buffer,
  topColors: ExtractedColor[],
  options: KMeansOptions = { k: 6 },
  similarityThreshold = 50,
): Promise<ExtractedColor[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { data, width, height } = await getImagePixelsServer(imageBuffer);

  function recursiveExtract(threshold: number): ExtractedColor[] {
    const pixels = samplePixels(data, width, height, opts);

    const uniqueCount = countUniqueColors(pixels);
    if (uniqueCount < 2) return [];

    const clusterCount = Math.min(opts.k * 2, uniqueCount);
    const { clusters } = kMeans(pixels, clusterCount, opts.maxIterations);
    const totalPixels = pixels.length;

    const allColors = clusters.map(({ centroid: c }) => {
      const rgb = { r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) };
      return {
        hex: rgbToHex(rgb),
        rgb,
        hsl: rgbToHsl(rgb),
        position: { x: Math.round(c.x), y: Math.round(c.y) },
        prevalence: Math.round((c.count / totalPixels) * 100),
        brightness: colorBrightness(rgb),
      };
    });

    // Sort by brightness (brightest first)
    allColors.sort((a, b) => b.brightness - a.brightness);

    // Filter out colors too similar to top colors
    const familyColors: ExtractedColor[] = [];
    for (const color of allColors) {
      const isTooSimilar = topColors.some(
        (topColor) => colorDistance(color.rgb, topColor.rgb) < threshold,
      );
      if (!isTooSimilar) {
        const { brightness, ...colorWithoutBrightness } = color;
        familyColors.push(colorWithoutBrightness);
      }
      if (familyColors.length >= opts.k) break;
    }

    // Retry with lower threshold if not enough colors
    if (familyColors.length < opts.k && threshold > 5) {
      return recursiveExtract(threshold - 5);
    }

    return familyColors;
  }

  return recursiveExtract(similarityThreshold);
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

// Threshold for considering a color as near-black or near-white
const BLACK_WHITE_THRESHOLD = 15;

function isNearBlack(rgb: RGB): boolean {
  return rgb.r <= BLACK_WHITE_THRESHOLD &&
         rgb.g <= BLACK_WHITE_THRESHOLD &&
         rgb.b <= BLACK_WHITE_THRESHOLD;
}

function isNearWhite(rgb: RGB): boolean {
  return rgb.r >= 255 - BLACK_WHITE_THRESHOLD &&
         rgb.g >= 255 - BLACK_WHITE_THRESHOLD &&
         rgb.b >= 255 - BLACK_WHITE_THRESHOLD;
}

function filterColors(
  colors: Array<{ hex: string; rgb: RGB }>,
  seen: Set<string> = new Set<string>(),
): Array<{ hex: string; rgb: RGB }> {
  return colors.filter((c) => {
    if (isNearBlack(c.rgb) || isNearWhite(c.rgb)) return false;
    const key = `${c.rgb.r},${c.rgb.g},${c.rgb.b}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Generate a palette grid image matching the website PNG export.
 *
 * Layout per color group: 3 sections (each SECTION_SIZE × SECTION_SIZE):
 *   1. Color strip — each color full-width, stacked vertically (reversed)
 *   2. Brightness grid — rows = colors (reversed), cols = brightness factors
 *   3. Hue grid — rows = colors (reversed), cols = hue shifts
 *
 * If familyColors is provided, its 3 sections are appended after the top colors.
 */
export function generatePaletteGridImage(
  colors: Array<{ hex: string; rgb: RGB }>,
  familyColors?: Array<{ hex: string; rgb: RGB }>,
): string {
  // Use shared set for cross-group dedup (matching PaletteExport.tsx)
  const seen = new Set<string>();
  const filteredTop = filterColors(colors, seen);
  const filteredFamily = familyColors ? filterColors(familyColors, seen) : [];

  if (filteredTop.length === 0 && filteredFamily.length === 0) {
    throw new Error('Cannot generate palette grid with zero colors');
  }

  const SECTION_SIZE = 1000;
  const brightnessFactors = [0.5, 0.75, 1.0, 1.25, 1.5];
  const hueShifts = [0, 10, 20, 30];

  const topSections = filteredTop.length > 0 ? 3 : 0;
  const familySections = filteredFamily.length > 0 ? 3 : 0;
  const totalSections = topSections + familySections;

  const canvas = createCanvas(SECTION_SIZE, SECTION_SIZE * totalSections);
  const ctx = canvas.getContext('2d');

  let yOffset = 0;

  const drawGroupSections = (group: Array<{ hex: string; rgb: RGB }>) => {
    // Section: Vertical color strip (colors reversed, each full width)
    const colorHeight = SECTION_SIZE / group.length;
    group
      .slice()
      .reverse()
      .forEach((color, index) => {
        ctx.fillStyle = color.hex;
        ctx.fillRect(0, yOffset + index * colorHeight, SECTION_SIZE, colorHeight);
      });
    yOffset += SECTION_SIZE;

    // Section: Brightness grid (rows = colors reversed, cols = factors)
    const bRowHeight = SECTION_SIZE / group.length;
    const bColWidth = SECTION_SIZE / brightnessFactors.length;
    group
      .slice()
      .reverse()
      .forEach((color, rowIndex) => {
        brightnessFactors.forEach((factor, colIndex) => {
          const adjustment = (factor - 1) * 50;
          const adjusted = adjustBrightness(color.rgb, adjustment);
          ctx.fillStyle = rgbToHex(adjusted);
          ctx.fillRect(
            colIndex * bColWidth,
            yOffset + rowIndex * bRowHeight,
            bColWidth,
            bRowHeight,
          );
        });
      });
    yOffset += SECTION_SIZE;

    // Section: Hue grid (rows = colors reversed, cols = shifts)
    const hRowHeight = SECTION_SIZE / group.length;
    const hColWidth = SECTION_SIZE / hueShifts.length;
    group
      .slice()
      .reverse()
      .forEach((color, rowIndex) => {
        hueShifts.forEach((shift, colIndex) => {
          const adjusted = adjustHue(color.rgb, shift);
          ctx.fillStyle = rgbToHex(adjusted);
          ctx.fillRect(
            colIndex * hColWidth,
            yOffset + rowIndex * hRowHeight,
            hColWidth,
            hRowHeight,
          );
        });
      });
    yOffset += SECTION_SIZE;
  };

  if (filteredTop.length > 0) drawGroupSections(filteredTop);
  if (filteredFamily.length > 0) drawGroupSections(filteredFamily);

  return canvas.toDataURL('image/png');
}
