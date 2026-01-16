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
 * Extracts dominant colors from an image using K-Means clustering.
 *
 * @param img - Source image element to analyze
 * @param options - K-Means and sampling options (e.g. `k`, `maxIterations`, `sampleStep`, `filterBlackWhite`, `blackWhiteThreshold`)
 * @returns An array of extracted colors sorted by prevalence. Each entry contains `hex`, `rgb`, `hsl`, `position`, and `prevalence` (percentage of sampled pixels)
 * @throws Error - If the sampled pixels are fewer than `k` ("Not enough unique colors in image")
 */
export function extractColors(
  img: HTMLImageElement,
  options: KMeansOptions
): ExtractedColor[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { data, width, height } = getImagePixels(img);

  // Sample pixels
  const pixels = samplePixels(data, width, height, opts);

  if (pixels.length < opts.k) {
    throw new Error("Not enough unique colors in image");
  }

  // Run K-Means
  const centroids = kMeans(pixels, opts.k, opts.maxIterations);

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
 * Collects a sampled set of non-transparent pixels from raw image data, optionally filtering out near-black and near-white colors.
 *
 * Iterates through the image using `opts.sampleStep` in both axes, reads RGBA values for each sampled coordinate, skips pixels with alpha < 128, and (when `opts.filterBlackWhite` is true) skips pixels identified as black or white using `opts.blackWhiteThreshold`.
 *
 * @param data - The image pixel buffer in RGBA order.
 * @param width - The image width in pixels.
 * @param height - The image height in pixels.
 * @param opts - K-Means options (required). Uses `sampleStep` to determine sampling stride, `filterBlackWhite` to enable black/white filtering, and `blackWhiteThreshold` as the threshold for that filtering.
 * @returns An array of `PixelData` entries for each sampled pixel containing `{ r, g, b, x, y }`.
 */
function samplePixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: Required<KMeansOptions>
): PixelData[] {
  const pixels: PixelData[] = [];

  for (let y = 0; y < height; y += opts.sampleStep) {
    for (let x = 0; x < width; x += opts.sampleStep) {
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
 * Selects initial centroids for K-Means using the K-Means++ probabilistic seeding.
 *
 * @param pixels - Array of sampled pixels (each with `r`, `g`, `b`, and position fields) to choose centroids from
 * @param k - The number of centroids to produce
 * @returns An array of `k` Centroid objects (each with `r`, `g`, `b`, `x`, `y`) with `count` initialized to 0
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
 * Group sampled pixels by the nearest centroid based on color distance.
 *
 * @param pixels - Array of sampled pixel color and position data to assign
 * @param centroids - Current centroid color and position estimates used for assignment
 * @returns A map from centroid index to the array of pixels assigned to that centroid
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
 * Compute new centroids by averaging pixel color and position for each cluster.
 *
 * @param clusters - Map from cluster index to the array of pixels assigned to that cluster
 * @returns An array of centroids where each centroid's `r`, `g`, `b`, `x`, and `y` are the mean values of the pixels in that cluster and `count` is the number of pixels. For empty clusters a centroid with `{ r: 128, g: 128, b: 128, x: 0, y: 0, count: 0 }` is returned.
 */
function updateCentroids(clusters: Map<number, PixelData[]>): Centroid[] {
  const newCentroids: Centroid[] = [];

  clusters.forEach((pixels, _idx) => {
    if (pixels.length === 0) {
      // Keep a random position for empty clusters
      newCentroids.push({ r: 128, g: 128, b: 128, x: 0, y: 0, count: 0 });
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
 * Determines whether all centroids moved no more than the specified color-distance threshold.
 *
 * @param oldCentroids - Centroids from the previous iteration.
 * @param newCentroids - Centroids from the current iteration.
 * @param threshold - Maximum allowed color distance (in RGB space) between corresponding centroids to consider them converged.
 * @returns `true` if the color distance between each corresponding old and new centroid is less than or equal to `threshold`, `false` otherwise.
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
 * Compute K-Means centroids for the provided pixels.
 *
 * Runs iterative K-Means clustering up to the specified iteration limit or until centroids converge.
 *
 * @param pixels - Sampled pixel objects to cluster (each with `r`, `g`, `b`, `x`, `y`).
 * @param k - Number of clusters to produce.
 * @param maxIterations - Maximum number of iterations to perform.
 * @returns An array of centroids representing cluster centers; each centroid includes averaged `r`, `g`, `b`, `x`, `y` and a `count` of assigned pixels.
 */
function kMeans(
  pixels: PixelData[],
  k: number,
  maxIterations: number
): Centroid[] {
  let centroids = initializeCentroids(pixels, k);

  for (let i = 0; i < maxIterations; i++) {
    const clusters = assignPixels(pixels, centroids);
    const newCentroids = updateCentroids(clusters);

    if (hasConverged(centroids, newCentroids)) {
      return newCentroids;
    }

    centroids = newCentroids;
  }

  // Final assignment to get correct counts
  const finalClusters = assignPixels(pixels, centroids);
  return updateCentroids(finalClusters);
}

/**
 * Locate all pixel coordinates whose color is within a color-distance threshold of a target color.
 *
 * @param img - Source image to inspect.
 * @param targetColor - RGB color to match.
 * @param threshold - Maximum color distance (inclusive) to consider a pixel a match; defaults to 30.
 * @returns An array of coordinate objects `{ x, y }` for every matching pixel.
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
 * Create an ImageData mask that preserves pixels close to a target color and darkens all others.
 *
 * @param img - Source image to analyze
 * @param targetColor - RGB color used as the target for matching
 * @param threshold - Maximum color distance (inclusive) considered a match; pixels within this distance are made transparent
 * @returns An ImageData mask where pixels whose color distance to `targetColor` is <= `threshold` are fully transparent, and all other pixels are black with approximately 70% opacity
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
      const pixelColor = { r: data[i], g: data[i + 1], b: data[i + 2] };
      const dist = colorDistance(pixelColor, targetColor);

      // If pixel matches target color, make it transparent (visible)
      // Otherwise, add dark overlay
      if (dist <= threshold) {
        maskData[i] = 0;
        maskData[i + 1] = 0;
        maskData[i + 2] = 0;
        maskData[i + 3] = 0; // Fully transparent
      } else {
        maskData[i] = 0;
        maskData[i + 1] = 0;
        maskData[i + 2] = 0;
        maskData[i + 3] = 178; // ~70% opacity
      }
    }
  }

  return new ImageData(maskData, width, height);
}

/**
 * Extracts secondary (accent/minor) colors from an image that are distinct from the provided dominant colors.
 *
 * Filters out pixels similar to any color in `topColors`, runs K-Means on the remaining pixels, and returns the resulting colors sorted by prevalence.
 *
 * @param img - Image to sample pixels from.
 * @param topColors - Dominant colors to exclude; any pixel within `similarityThreshold` of a top color is ignored.
 * @param options - K-Means and sampling options; merged with defaults (`k`, `maxIterations`, `sampleStep`, `filterBlackWhite`, `blackWhiteThreshold`).
 * @param similarityThreshold - Maximum color-distance (RGB space) for a pixel to be considered "similar" to a top color; smaller values make exclusion stricter. Defaults to 50.
 * @returns An array of extracted colors sorted by prevalence. Each entry contains `hex`, `rgb`, `hsl`, `position`, and `prevalence` (percentage). Returns an empty array if there are fewer unique pixels than `k`.
 */
export function extractFamilyColors(
  img: HTMLImageElement,
  topColors: ExtractedColor[],
  options: KMeansOptions,
  similarityThreshold = 50
): ExtractedColor[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { data, width, height } = getImagePixels(img);

  // Sample pixels, excluding those too similar to top colors
  const pixels: PixelData[] = [];

  for (let y = 0; y < height; y += opts.sampleStep) {
    for (let x = 0; x < width; x += opts.sampleStep) {
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

  // If not enough unique pixels remain, return empty
  if (pixels.length < opts.k) {
    return [];
  }

  // Run K-Means on remaining pixels
  const centroids = kMeans(pixels, opts.k, opts.maxIterations);

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