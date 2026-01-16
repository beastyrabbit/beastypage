/**
 * K-Means color extraction algorithm
 */

import type {
  ExtractedColor,
  KMeansOptions,
  PixelData,
  Centroid,
  RGB,
} from "./types";
import { rgbToHex, rgbToHsl, isBlackOrWhite, colorDistance } from "./color-utils";
import { getImagePixels } from "./image-processing";

const DEFAULT_OPTIONS: Required<KMeansOptions> = {
  k: 6,
  maxIterations: 20,
  sampleStep: 5,
  filterBlackWhite: true,
  blackWhiteThreshold: 15,
};

/**
 * Count unique colors in pixel array
 */
function countUniqueColors(pixels: PixelData[]): number {
  const uniqueKeys = new Set(pixels.map((p) => `${p.r},${p.g},${p.b}`));
  return uniqueKeys.size;
}

/**
 * Extract dominant colors from an image using K-Means clustering
 */
export function extractColors(
  img: HTMLImageElement,
  options: KMeansOptions
): ExtractedColor[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { data, width, height } = getImagePixels(img);

  // Sample pixels
  const pixels = samplePixels(data, width, height, opts);

  // Check unique color count, not just pixel count
  const uniqueCount = countUniqueColors(pixels);
  if (uniqueCount < 2) {
    throw new Error("Not enough unique colors in image");
  }

  // Reduce k if more than unique colors available
  const effectiveK = Math.min(opts.k, uniqueCount);

  // Run K-Means
  const centroids = kMeans(pixels, effectiveK, opts.maxIterations);

  // Convert centroids to ExtractedColor format
  const totalPixels = pixels.length;
  const colors = centroids
    .map((c) => ({
      hex: rgbToHex({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) }),
      rgb: {
        r: Math.round(c.r),
        g: Math.round(c.g),
        b: Math.round(c.b),
      },
      hsl: rgbToHsl({
        r: Math.round(c.r),
        g: Math.round(c.g),
        b: Math.round(c.b),
      }),
      position: { x: c.x, y: c.y },
      prevalence: Math.round((c.count / totalPixels) * 100),
    }))
    .sort((a, b) => b.prevalence - a.prevalence);

  return colors;
}

/**
 * Sample pixels from image data
 * @throws Error if sampleStep is not a positive integer
 */
function samplePixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: Required<KMeansOptions>
): PixelData[] {
  // Validate sampleStep to prevent infinite loops
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

      // Skip transparent pixels
      if (a < 128) continue;

      // Optionally skip black/white
      if (
        opts.filterBlackWhite &&
        isBlackOrWhite({ r, g, b }, opts.blackWhiteThreshold)
      ) {
        continue;
      }

      pixels.push({ r, g, b, x, y });
    }
  }

  return pixels;
}

/**
 * K-Means++ initialization for better starting centroids
 */
function initializeCentroids(pixels: PixelData[], k: number): Centroid[] {
  const centroids: Centroid[] = [];

  // Choose first centroid randomly
  const firstIdx = Math.floor(Math.random() * pixels.length);
  const first = pixels[firstIdx];
  centroids.push({ ...first, count: 0 });

  // Choose remaining centroids using weighted probability
  for (let i = 1; i < k; i++) {
    const distances = pixels.map((p) => {
      const minDist = Math.min(
        ...centroids.map((c) =>
          colorDistance({ r: p.r, g: p.g, b: p.b }, { r: c.r, g: c.g, b: c.b })
        )
      );
      return minDist * minDist; // Square for probability weighting
    });

    const totalDist = distances.reduce((sum, d) => sum + d, 0);
    let random = Math.random() * totalDist;

    for (let j = 0; j < pixels.length; j++) {
      random -= distances[j];
      if (random <= 0) {
        centroids.push({ ...pixels[j], count: 0 });
        break;
      }
    }

    // Fallback if we didn't pick one
    if (centroids.length === i) {
      const idx = Math.floor(Math.random() * pixels.length);
      centroids.push({ ...pixels[idx], count: 0 });
    }
  }

  return centroids;
}

/**
 * Assign pixels to nearest centroid
 */
function assignPixels(
  pixels: PixelData[],
  centroids: Centroid[]
): Map<number, PixelData[]> {
  const clusters = new Map<number, PixelData[]>();

  for (let i = 0; i < centroids.length; i++) {
    clusters.set(i, []);
  }

  for (const pixel of pixels) {
    let minDist = Infinity;
    let closestIdx = 0;

    for (let i = 0; i < centroids.length; i++) {
      const dist = colorDistance(
        { r: pixel.r, g: pixel.g, b: pixel.b },
        { r: centroids[i].r, g: centroids[i].g, b: centroids[i].b }
      );
      if (dist < minDist) {
        minDist = dist;
        closestIdx = i;
      }
    }

    clusters.get(closestIdx)!.push(pixel);
  }

  return clusters;
}

/**
 * Update centroids based on cluster assignments
 * For empty clusters, reuse the previous centroid instead of injecting gray
 */
function updateCentroids(
  clusters: Map<number, PixelData[]>,
  previousCentroids: Centroid[]
): Centroid[] {
  const newCentroids: Centroid[] = [];

  clusters.forEach((pixels, idx) => {
    if (pixels.length === 0) {
      // Reuse previous centroid for empty clusters (preserves real image colors)
      if (previousCentroids[idx]) {
        newCentroids.push({ ...previousCentroids[idx], count: 0 });
      } else {
        // Fallback: shouldn't happen, but use first non-empty cluster's mean if it does
        newCentroids.push({ r: 128, g: 128, b: 128, x: 0, y: 0, count: 0 });
      }
      return;
    }

    const sumR = pixels.reduce((s, p) => s + p.r, 0);
    const sumG = pixels.reduce((s, p) => s + p.g, 0);
    const sumB = pixels.reduce((s, p) => s + p.b, 0);
    const sumX = pixels.reduce((s, p) => s + p.x, 0);
    const sumY = pixels.reduce((s, p) => s + p.y, 0);
    const count = pixels.length;

    newCentroids.push({
      r: sumR / count,
      g: sumG / count,
      b: sumB / count,
      x: sumX / count,
      y: sumY / count,
      count,
    });
  });

  return newCentroids;
}

/**
 * Check if centroids have converged
 */
function hasConverged(
  oldCentroids: Centroid[],
  newCentroids: Centroid[],
  threshold = 1
): boolean {
  for (let i = 0; i < oldCentroids.length; i++) {
    const dist = colorDistance(
      { r: oldCentroids[i].r, g: oldCentroids[i].g, b: oldCentroids[i].b },
      { r: newCentroids[i].r, g: newCentroids[i].g, b: newCentroids[i].b }
    );
    if (dist > threshold) return false;
  }
  return true;
}

/**
 * Main K-Means algorithm
 */
function kMeans(
  pixels: PixelData[],
  k: number,
  maxIterations: number
): Centroid[] {
  let centroids = initializeCentroids(pixels, k);

  for (let i = 0; i < maxIterations; i++) {
    const clusters = assignPixels(pixels, centroids);
    const newCentroids = updateCentroids(clusters, centroids);

    if (hasConverged(centroids, newCentroids)) {
      return newCentroids;
    }

    centroids = newCentroids;
  }

  // Final assignment to get correct counts
  const finalClusters = assignPixels(pixels, centroids);
  return updateCentroids(finalClusters, centroids);
}

/**
 * Find pixels that match a given color within a threshold
 */
export function findMatchingPixels(
  img: HTMLImageElement,
  targetColor: RGB,
  threshold = 30
): { x: number; y: number }[] {
  const { data, width, height } = getImagePixels(img);
  const matches: { x: number; y: number }[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const pixelColor = { r: data[i], g: data[i + 1], b: data[i + 2] };

      if (colorDistance(pixelColor, targetColor) <= threshold) {
        matches.push({ x, y });
      }
    }
  }

  return matches;
}

/**
 * Create a spotlight mask for highlighting colors
 * Preserves transparency from the original image
 */
export function createSpotlightMask(
  img: HTMLImageElement,
  targetColor: RGB,
  threshold = 30
): ImageData {
  const { data, width, height } = getImagePixels(img);
  const maskData = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const sourceAlpha = data[i + 3];

      // Skip fully transparent pixels - preserve transparency
      if (sourceAlpha === 0) {
        maskData[i] = 0;
        maskData[i + 1] = 0;
        maskData[i + 2] = 0;
        maskData[i + 3] = 0;
        continue;
      }

      const pixelColor = { r: data[i], g: data[i + 1], b: data[i + 2] };
      const dist = colorDistance(pixelColor, targetColor);

      // If pixel matches target color, make it transparent (visible)
      // Otherwise, add dark overlay scaled by source alpha
      if (dist <= threshold) {
        maskData[i] = 0;
        maskData[i + 1] = 0;
        maskData[i + 2] = 0;
        maskData[i + 3] = 0; // Fully transparent
      } else {
        maskData[i] = 0;
        maskData[i + 1] = 0;
        maskData[i + 2] = 0;
        // Scale overlay alpha by source alpha for partially transparent pixels
        maskData[i + 3] = Math.round((178 * sourceAlpha) / 255); // ~70% opacity scaled
      }
    }
  }

  return new ImageData(maskData, width, height);
}

/**
 * Create a spotlight image (original + overlay) as a data URL
 * Shows the original image with non-matching areas dimmed
 */
export function createSpotlightImage(
  img: HTMLImageElement,
  targetColor: RGB,
  threshold = 30
): string {
  const { data, width, height } = getImagePixels(img);

  // Create canvas for the result
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  // Draw original image first
  ctx.drawImage(img, 0, 0, width, height);

  // Get the image data to modify
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const sourceAlpha = data[i + 3];

      // Skip fully transparent pixels
      if (sourceAlpha === 0) continue;

      const pixelColor = { r: data[i], g: data[i + 1], b: data[i + 2] };
      const dist = colorDistance(pixelColor, targetColor);

      // If pixel doesn't match target color, darken it
      if (dist > threshold) {
        // Blend with black at ~70% opacity
        const dimFactor = 0.3; // Keep 30% of original brightness
        pixels[i] = Math.round(pixels[i] * dimFactor);
        pixels[i + 1] = Math.round(pixels[i + 1] * dimFactor);
        pixels[i + 2] = Math.round(pixels[i + 2] * dimFactor);
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * Extract family colors (accent/minor colors) that are different from top colors
 * These are colors present in the image but distinct from the dominant colors
 */
export function extractFamilyColors(
  img: HTMLImageElement,
  topColors: ExtractedColor[],
  options: KMeansOptions,
  similarityThreshold = 50
): ExtractedColor[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { data, width, height } = getImagePixels(img);

  // Validate sampleStep
  const step = opts.sampleStep;
  if (!Number.isInteger(step) || step < 1) {
    throw new Error(`sampleStep must be a positive integer, got: ${step}`);
  }

  // Sample pixels, excluding those too similar to top colors
  const pixels: PixelData[] = [];

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      // Skip transparent pixels
      if (a < 128) continue;

      // Skip black/white if filtering
      if (
        opts.filterBlackWhite &&
        isBlackOrWhite({ r, g, b }, opts.blackWhiteThreshold)
      ) {
        continue;
      }

      // Skip pixels too similar to any top color
      const pixelColor = { r, g, b };
      const isTooSimilar = topColors.some(
        (topColor) => colorDistance(pixelColor, topColor.rgb) < similarityThreshold
      );

      if (!isTooSimilar) {
        pixels.push({ r, g, b, x, y });
      }
    }
  }

  // Check unique color count, not just pixel count
  const uniqueCount = countUniqueColors(pixels);
  if (uniqueCount < 2) {
    return [];
  }

  // Reduce k if more than unique colors available
  const effectiveK = Math.min(opts.k, uniqueCount);

  // Run K-Means on remaining pixels
  const centroids = kMeans(pixels, effectiveK, opts.maxIterations);

  // Convert centroids to ExtractedColor format
  const totalPixels = pixels.length;
  const colors = centroids
    .map((c) => ({
      hex: rgbToHex({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) }),
      rgb: {
        r: Math.round(c.r),
        g: Math.round(c.g),
        b: Math.round(c.b),
      },
      hsl: rgbToHsl({
        r: Math.round(c.r),
        g: Math.round(c.g),
        b: Math.round(c.b),
      }),
      position: { x: c.x, y: c.y },
      prevalence: Math.round((c.count / totalPixels) * 100),
    }))
    .sort((a, b) => b.prevalence - a.prevalence);

  return colors;
}
