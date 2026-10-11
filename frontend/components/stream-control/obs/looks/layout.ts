/**
 * Pure layout helpers shared by the show looks: packing N cats into a
 * region, ring positions for the Gathering, column splits for rosters.
 */

export interface PackedGrid {
  columns: number;
  rows: number;
  /** Square cell size (px) that fits `count` cells in the region. */
  cell: number;
}

/**
 * Pick the column count that maximises the square cell size for `count`
 * items inside width×height with `gap` between cells. `maxCell` caps the
 * result so a tiny pool does not blow sprites up past their pixel grid.
 */
export function packGrid(
  count: number,
  width: number,
  height: number,
  gap = 0,
  maxCell = Number.POSITIVE_INFINITY,
): PackedGrid {
  const n = Math.max(1, count);
  let best: PackedGrid = { columns: 1, rows: n, cell: 0 };
  for (let columns = 1; columns <= n; columns++) {
    const rows = Math.ceil(n / columns);
    const cellWidth = (width - (columns - 1) * gap) / columns;
    const cellHeight = (height - (rows - 1) * gap) / rows;
    const cell = Math.floor(Math.min(cellWidth, cellHeight));
    if (cell > best.cell) best = { columns, rows, cell };
  }
  best.cell = Math.min(best.cell, maxCell);
  return best;
}

export interface RingPoint {
  x: number;
  y: number;
  /** Degrees, 0 = right, clockwise (screen coordinates). */
  angle: number;
}

/** `count` points evenly spaced on an ellipse, starting at `startAngle`. */
export function ringPositions(
  count: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  startAngle = -90,
): RingPoint[] {
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, i) => {
    const angle = startAngle + (360 / count) * i;
    const rad = (angle * Math.PI) / 180;
    // Rounded so server and client render byte-identical coordinates.
    return {
      x: Math.round(cx + rx * Math.cos(rad)),
      y: Math.round(cy + ry * Math.sin(rad)),
      angle,
    };
  });
}

/**
 * Split `count` items into the fewest columns of at most `maxPerColumn`,
 * then balance the columns so the last one is not nearly empty.
 */
export function splitColumns(count: number, maxPerColumn: number): number[] {
  if (count <= 0) return [];
  const columns = Math.max(1, Math.ceil(count / Math.max(1, maxPerColumn)));
  const base = Math.floor(count / columns);
  const extra = count % columns;
  return Array.from({ length: columns }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Slice `items` into groups sized by `sizes` (from splitColumns). */
export function chunkBySizes<T>(items: readonly T[], sizes: number[]): T[][] {
  const out: T[][] = [];
  let offset = 0;
  for (const size of sizes) {
    out.push(items.slice(offset, offset + size));
    offset += size;
  }
  return out;
}

/** Position of the t-th (0..1) point along a quadratic bezier. */
export function quadraticPoint(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  t: number,
): [number, number] {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
  ];
}
