/**
 * Server-side color extraction using @napi-rs/canvas.
 *
 * Replicates the browser-based k-means pipeline from kmeans.ts but uses
 * @napi-rs/canvas instead of HTMLImageElement / DOM canvas for pixel access.
 */

import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';
import type { ExtractedColor, KMeansOptions, PixelData, Centroid, RGB } from './types';
import { rgbToHex, rgbToHsl, isBlackOrWhite, colorDistance } from './color-utils';

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
