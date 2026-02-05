import sharp from "sharp";

interface GridDetectionResult {
  detected: boolean;
  gridSize: number | null;
  confidence: number;
}

interface PeriodResult {
  size: number;
  consistency: number;
}

/**
 * Detect pixel art grid size by measuring spacing between edge columns/rows.
 *
 * In pixel art, blocks of identical pixels are separated by sharp color
 * boundaries. We find those boundary positions and measure the gaps between
 * consecutive boundaries — the dominant gap is the grid size.
 *
 * Works at full resolution (no resize) to avoid fractional-pixel artifacts
 * that destroy the periodic pattern.
 */
export async function detectGrid(buffer: Buffer): Promise<GridDetectionResult> {
  // Force sRGB (3 channels) so grayscale/RGBA images work correctly
  const { data, info } = await sharp(buffer).toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  const px = new Uint8Array(data.buffer);
  const w = info.width;
  const h = info.height;
  const ch = info.channels;

  const hPeriod = findPeriod(px, w, h, ch, "horizontal");
  const vPeriod = findPeriod(px, w, h, ch, "vertical");

  if (hPeriod === null && vPeriod === null) {
    return { detected: false, gridSize: null, confidence: 0 };
  }

  const { gridSize, confidence } = combinePeriods(hPeriod, vPeriod);

  return {
    detected: true,
    gridSize,
    confidence: Math.max(0.1, Math.min(1, confidence)),
  };
}

/**
 * Combine horizontal and vertical period measurements into a single
 * grid size and confidence value.
 *
 * When both axes agree (within +-1), averages them for accuracy.
 * When they disagree, picks the more consistent axis with a penalty.
 * When only one axis detected a period, uses it with a small penalty.
 */
function combinePeriods(
  hPeriod: PeriodResult | null,
  vPeriod: PeriodResult | null,
): { gridSize: number; confidence: number } {
  if (hPeriod !== null && vPeriod !== null) {
    if (Math.abs(hPeriod.size - vPeriod.size) <= 1) {
      return {
        gridSize: Math.round((hPeriod.size + vPeriod.size) / 2),
        confidence: (hPeriod.consistency + vPeriod.consistency) / 2,
      };
    }
    // Disagreement -- pick the axis with higher consistency
    const pick = hPeriod.consistency >= vPeriod.consistency ? hPeriod : vPeriod;
    return { gridSize: pick.size, confidence: pick.consistency * 0.7 };
  }

  // Only one axis detected a period
  const pick = (hPeriod ?? vPeriod)!;
  return { gridSize: pick.size, confidence: pick.consistency * 0.8 };
}

/**
 * Find the dominant period in one direction (horizontal or vertical).
 *
 * 1. Compute the edge rate for each column (horizontal) or row (vertical):
 *    what fraction of the perpendicular lines have a color change there.
 * 2. Identify "edge positions" where the rate exceeds a threshold.
 * 3. Measure gaps between consecutive edge positions.
 * 4. The most common gap (±1 tolerance) is the grid size.
 */
function findPeriod(
  px: Uint8Array,
  w: number,
  h: number,
  ch: number,
  dir: "horizontal" | "vertical",
): PeriodResult | null {
  const length = dir === "horizontal" ? w : h;
  const other = dir === "horizontal" ? h : w;

  if (length < 6) return null;

  // Step 1: Compute edge rate for each position along the scanning axis.
  // For very large images, subsample the perpendicular axis (e.g., check
  // every Nth row instead of all rows) to keep compute bounded while
  // preserving exact column/row positions for accurate spacing measurement.
  const maxScanLines = 2000;
  const scanStep = Math.max(1, Math.floor(other / maxScanLines));
  const scanCount = Math.ceil(other / scanStep);

  // Precompute strides so the hot inner loop is branch-free.
  // Horizontal: adjacent columns in the same row  (step between neighbors = ch)
  // Vertical:   adjacent rows in the same column  (step between neighbors = w * ch)
  const isHorizontal = dir === "horizontal";
  const neighborStride = isHorizontal ? ch : w * ch;

  const edgeRate = new Float64Array(length);
  for (let i = 1; i < length; i++) {
    let changes = 0;
    for (let j = 0; j < other; j += scanStep) {
      const o1 = isHorizontal
        ? (j * w + (i - 1)) * ch
        : ((i - 1) * w + j) * ch;
      const o2 = o1 + neighborStride;
      if (
        px[o1] !== px[o2] ||
        px[o1 + 1] !== px[o2 + 1] ||
        px[o1 + 2] !== px[o2 + 2]
      ) {
        changes++;
      }
    }
    edgeRate[i] = changes / scanCount;
  }

  // Step 2: Find edge positions using an adaptive threshold.
  // In pixel art, edge rates are bimodal: near 0 within blocks, near 1 at boundaries.
  // Use 25% of the max edge rate as the dividing line.
  let maxRate = 0;
  for (let i = 1; i < length; i++) {
    if (edgeRate[i]! > maxRate) maxRate = edgeRate[i]!;
  }
  if (maxRate < 0.05) return null; // No significant edges

  const threshold = maxRate * 0.25;

  const edges: number[] = [];
  for (let i = 1; i < length; i++) {
    if (edgeRate[i]! > threshold) edges.push(i);
  }

  if (edges.length < 3) return null;

  // Step 3: Compute gaps between consecutive edge positions
  const gaps: number[] = [];
  for (let i = 1; i < edges.length; i++) {
    gaps.push(edges[i]! - edges[i - 1]!);
  }

  // Step 4: Find the dominant gap size.
  // Build histogram and find mode (minimum gap = 2 to exclude noise).
  const gapCounts = new Map<number, number>();
  for (const g of gaps) {
    gapCounts.set(g, (gapCounts.get(g) || 0) + 1);
  }

  let modeGap = 0;
  let modeCount = 0;
  for (const [gap, cnt] of gapCounts) {
    if (gap >= 2 && cnt > modeCount) {
      modeGap = gap;
      modeCount = cnt;
    }
  }

  if (modeGap < 2) return null;

  // Step 5: Count how many gaps fall within ±1 of the mode.
  // This handles the rounding effect where blocks alternate between
  // N and N+1 pixels (e.g., blockSize=12 on a 256px image gives
  // blocks of 12 and 13 pixels).
  let nearModeCount = 0;
  let nearModeSum = 0;
  for (const g of gaps) {
    if (Math.abs(g - modeGap) <= 1) {
      nearModeCount++;
      nearModeSum += g;
    }
  }

  const consistency = nearModeCount / gaps.length;
  if (consistency < 0.5) return null;

  // Use the average of gaps near the mode for a more accurate size.
  // E.g., if gaps are [12, 13, 12, 12, 13], average ≈ 12.4 → rounds to 12.
  const avgGap = Math.round(nearModeSum / nearModeCount);
  if (avgGap < 2) return null;

  return { size: avgGap, consistency };
}
