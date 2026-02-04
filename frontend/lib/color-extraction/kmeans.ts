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
  const { centroids, clusters } = kMeans(pixels, effectiveK, opts.maxIterations);

  // Convert centroids to ExtractedColor format
  const totalPixels = pixels.length;
  const colors = centroids
    .map((c, idx) => ({
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
      position: findBestPosition(c, clusters.get(idx) || [], width, height),
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

interface KMeansResult {
  centroids: Centroid[];
  clusters: Map<number, PixelData[]>;
}

/**
 * Main K-Means algorithm
 */
function kMeans(
  pixels: PixelData[],
  k: number,
  maxIterations: number
): KMeansResult {
  let centroids = initializeCentroids(pixels, k);

  for (let i = 0; i < maxIterations; i++) {
    const clusters = assignPixels(pixels, centroids);
    const newCentroids = updateCentroids(clusters, centroids);

    if (hasConverged(centroids, newCentroids)) {
      return { centroids: newCentroids, clusters };
    }

    centroids = newCentroids;
  }

  // Final assignment to get correct counts
  const finalClusters = assignPixels(pixels, centroids);
  return {
    centroids: updateCentroids(finalClusters, centroids),
    clusters: finalClusters,
  };
}

/**
 * Find the best dot position for a centroid.
 * Uses a combined score of spatial proximity (to centroid center)
 * and color similarity (to centroid average color).
 * This ensures dots land on actual pixels of the matched color
 * rather than the averaged center-of-mass which may fall on
 * unrelated pixels (especially common with pixel art).
 */
function findBestPosition(
  centroid: Centroid,
  clusterPixels: PixelData[],
  imageWidth: number,
  imageHeight: number
): { x: number; y: number } {
  if (clusterPixels.length === 0) {
    return { x: centroid.x, y: centroid.y };
  }

  // Normalize spatial distance by image diagonal (guard against 0 for degenerate images)
  const maxSpatialDist =
    Math.sqrt(imageWidth * imageWidth + imageHeight * imageHeight) || 1;
  // Max possible color distance (black to white)
  const maxColorDist = Math.sqrt(255 * 255 * 3);

  let bestScore = Infinity;
  let bestPixel = clusterPixels[0];

  for (const p of clusterPixels) {
    // Spatial distance to centroid center (normalized 0-1)
    const dx = p.x - centroid.x;
    const dy = p.y - centroid.y;
    const spatialDist = Math.sqrt(dx * dx + dy * dy) / maxSpatialDist;

    // Color distance to centroid average color (normalized 0-1)
    const dr = p.r - centroid.r;
    const dg = p.g - centroid.g;
    const db = p.b - centroid.b;
    const colorDist = Math.sqrt(dr * dr + dg * dg + db * db) / maxColorDist;

    // Combined score: weight spatial proximity more (0.6) than color match (0.4)
    // since k-means already grouped by color similarity
    const score = 0.6 * spatialDist + 0.4 * colorDist;

    if (score < bestScore) {
      bestScore = score;
      bestPixel = p;
    }
  }

  return { x: bestPixel.x, y: bestPixel.y };
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
 * Create a spotlight image with multiple colors highlighted as layers
 * Each color's matching areas are painted with that color, with later colors
 * layered on top (dominant 1 at bottom, then dominant 2, ..., accent colors on top)
 * Non-matching areas are dimmed
 */
export function createMultiColorSpotlightImage(
  img: HTMLImageElement,
  targetColors: RGB[],
  threshold = 30
): string {
  const { data, width, height } = getImagePixels(img);

  // Create canvas for the result
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  // Start with dimmed version of the original image
  ctx.drawImage(img, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  // First pass: dim all pixels
  for (let i = 0; i < pixels.length; i += 4) {
    const dimFactor = 0.3;
    pixels[i] = Math.round(pixels[i] * dimFactor);
    pixels[i + 1] = Math.round(pixels[i + 1] * dimFactor);
    pixels[i + 2] = Math.round(pixels[i + 2] * dimFactor);
  }

  // Second pass: paint matching colors in order (later colors overlay earlier ones)
  for (const targetColor of targetColors) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const sourceAlpha = data[i + 3];

        // Skip fully transparent pixels
        if (sourceAlpha === 0) continue;

        const pixelColor = { r: data[i], g: data[i + 1], b: data[i + 2] };
        const dist = colorDistance(pixelColor, targetColor);

        // If pixel matches this target color, paint it with the target color
        if (dist <= threshold) {
          pixels[i] = targetColor.r;
          pixels[i + 1] = targetColor.g;
          pixels[i + 2] = targetColor.b;
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * Calculate brightness of a color (perceived luminance)
 */
function colorBrightness(color: RGB): number {
  return Math.sqrt(
    0.299 * (color.r ** 2) + 0.587 * (color.g ** 2) + 0.114 * (color.b ** 2)
  );
}

/**
 * Extract family colors (accent/minor colors) that are different from top colors
 * Uses the same approach as the Python version:
 * 1. Extract MORE clusters initially (k * 2)
 * 2. Sort by brightness (highlight colors)
 * 3. Filter out colors similar to top colors
 * 4. Recursively retry with lower threshold if not enough colors found
 */
export function extractFamilyColors(
  img: HTMLImageElement,
  topColors: ExtractedColor[],
  options: KMeansOptions,
  similarityThreshold = 50
): ExtractedColor[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { data, width, height } = getImagePixels(img);

  // Recursive inner function (matches Python's recursive_group_colors)
  function recursiveExtract(threshold: number): ExtractedColor[] {
    // Validate sampleStep
    const step = opts.sampleStep;
    if (!Number.isInteger(step) || step < 1) {
      throw new Error(`sampleStep must be a positive integer, got: ${step}`);
    }

    // Sample ALL pixels (don't filter by similarity yet - that comes after k-means)
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

        pixels.push({ r, g, b, x, y });
      }
    }

    // Check unique color count
    const uniqueCount = countUniqueColors(pixels);
    if (uniqueCount < 2) {
      return [];
    }

    // Extract MORE clusters initially (k * 2) to allow for filtering
    const clusterCount = Math.min(opts.k * 2, uniqueCount);

    // Run K-Means
    const { centroids, clusters } = kMeans(pixels, clusterCount, opts.maxIterations);

    // Convert to colors and sort by brightness (brightest first, like Python version)
    const allColors = centroids.map((c, idx) => ({
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
      position: findBestPosition(c, clusters.get(idx) || [], width, height),
      prevalence: Math.round((c.count / pixels.length) * 100),
      brightness: colorBrightness({
        r: Math.round(c.r),
        g: Math.round(c.g),
        b: Math.round(c.b),
      }),
    }));

    // Sort by brightness (brightest first)
    allColors.sort((a, b) => b.brightness - a.brightness);

    // Filter out colors that are too similar to top colors
    const familyColors: ExtractedColor[] = [];
    for (const color of allColors) {
      const isTooSimilar = topColors.some(
        (topColor) => colorDistance(color.rgb, topColor.rgb) < threshold
      );

      if (!isTooSimilar) {
        // Remove brightness property before adding
        const { brightness, ...colorWithoutBrightness } = color;
        familyColors.push(colorWithoutBrightness);
      }

      // Stop once we have enough colors
      if (familyColors.length >= opts.k) {
        break;
      }
    }

    // If not enough colors found and threshold > 0, retry with lower threshold
    if (familyColors.length < opts.k && threshold > 5) {
      return recursiveExtract(threshold - 5);
    }

    return familyColors;
  }

  return recursiveExtract(similarityThreshold);
}
