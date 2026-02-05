import sharp from "sharp";

interface GridDetectionResult {
  detected: boolean;
  gridSize: number | null;
  confidence: number;
}

/**
 * Detect pixel art grid size via autocorrelation.
 * Works by computing the horizontal autocorrelation of pixel differences
 * and looking for periodic peaks that indicate a repeating grid pattern.
 */
export async function detectGrid(buffer: Buffer): Promise<GridDetectionResult> {
  // Downscale to manageable size for analysis while preserving grid structure
  const analysisSize = 512;
  const image = sharp(buffer).resize(analysisSize, analysisSize, {
    fit: "inside",
    withoutEnlargement: true,
    kernel: "nearest",
  });

  const { data, info } = await image.greyscale().raw().toBuffer({ resolveWithObject: true });
  const grey = new Uint8Array(data.buffer);
  const w = info.width;
  const h = info.height;

  // Compute horizontal difference signal
  const maxLag = Math.min(64, Math.floor(w / 4));
  const correlation = new Float64Array(maxLag);

  for (let lag = 1; lag < maxLag; lag++) {
    let sum = 0;
    let count = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w - lag; x++) {
        const a = grey[y * w + x]!;
        const b = grey[y * w + x + lag]!;
        const diff = Math.abs(a - b);
        sum += diff;
        count++;
      }
    }

    correlation[lag] = count > 0 ? sum / count : 0;
  }

  // Look for periodic minima (grid boundaries produce similar pixel patterns)
  // Find the first strong minimum after lag 2
  let bestLag = 0;
  let bestScore = Infinity;

  for (let lag = 2; lag < maxLag; lag++) {
    const prev = correlation[lag - 1] ?? 0;
    const curr = correlation[lag] ?? 0;
    const next = correlation[lag + 1] ?? correlation[lag] ?? 0;

    // Local minimum
    if (curr < prev && curr < next && curr < bestScore) {
      bestScore = curr;
      bestLag = lag;
    }
  }

  if (bestLag === 0) {
    return { detected: false, gridSize: null, confidence: 0 };
  }

  // Verify: check that multiples of the lag are also minima (periodic pattern)
  let verifyCount = 0;
  const maxMultiple = Math.floor(maxLag / bestLag);
  for (let m = 2; m <= Math.min(4, maxMultiple); m++) {
    const checkLag = bestLag * m;
    if (checkLag >= maxLag) break;

    const corr = correlation[checkLag] ?? Infinity;
    const threshold = (correlation[1] ?? 1) * 0.7;
    if (corr < threshold) verifyCount++;
  }

  // Scale back to original image dimensions
  const meta = await sharp(buffer).metadata();
  const originalW = meta.width ?? w;
  const scale = originalW / w;
  const gridSize = Math.round(bestLag * scale);

  // Confidence based on verification
  const maxVerify = Math.min(3, maxMultiple - 1);
  const confidence = maxVerify > 0
    ? Math.min(1, verifyCount / maxVerify)
    : bestScore < (correlation[1] ?? 1) * 0.5
      ? 0.5
      : 0.3;

  return {
    detected: confidence > 0.4,
    gridSize: confidence > 0.4 ? gridSize : null,
    confidence: Math.round(confidence * 100) / 100,
  };
}
