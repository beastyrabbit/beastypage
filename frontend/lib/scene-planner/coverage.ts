/**
 * Share of opaque pixels per grid cell, read from RGBA pixel data. A pixel
 * counts as opaque when its alpha is at least half.
 */
export function cellCoverage(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cols: number,
  rows: number,
): number[] {
  const opaque = new Array<number>(cols * rows).fill(0);
  const total = new Array<number>(cols * rows).fill(0);
  for (let y = 0; y < height; y++) {
    const row = Math.min(rows - 1, Math.floor((y * rows) / height));
    for (let x = 0; x < width; x++) {
      const cell =
        row * cols + Math.min(cols - 1, Math.floor((x * cols) / width));
      total[cell]++;
      if (data[(y * width + x) * 4 + 3] >= 128) opaque[cell]++;
    }
  }
  return opaque.map((count, i) => (total[i] ? count / total[i] : 0));
}

/** True when at least one pixel is clearly see-through. */
export function hasTransparency(data: Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 128) return true;
  }
  return false;
}
