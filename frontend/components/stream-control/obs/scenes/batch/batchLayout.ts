/**
 * Pure layout helpers shared by the batch show looks. Every look lays its
 * cats out on the overlay's 1280×1080 canvas; these pick grid shapes so a
 * 30-cat starting pool and a 10-cat finale both fill their area.
 */

export interface PackedGrid {
  columns: number;
  rows: number;
  /** Square cell size in px (sprite + caption fit inside). */
  cell: number;
}

/**
 * Pick the column count that maximises the square cell size for `count`
 * items in a `width`×`height` box with `gap` between cells. `maxCell` caps
 * the result so a 10-cat finale doesn't become comically large.
 */
export function packSquares(
  count: number,
  width: number,
  height: number,
  gap = 8,
  maxCell = 320,
): PackedGrid {
  const n = Math.max(1, count);
  let best: PackedGrid = { columns: 1, rows: n, cell: 0 };
  for (let columns = 1; columns <= n; columns++) {
    const rows = Math.ceil(n / columns);
    const cellW = (width - (columns - 1) * gap) / columns;
    const cellH = (height - (rows - 1) * gap) / rows;
    const cell = Math.floor(Math.min(cellW, cellH));
    if (cell > best.cell) best = { columns, rows, cell };
  }
  best.cell = Math.min(best.cell, maxCell);
  return best;
}

/**
 * Fixed-position grids (sticker sheet, seed tray) keep every pool slot,
 * including culled ones, so numbers never move. Columns grow with the pool.
 */
export function fixedGridColumns(poolSize: number): number {
  if (poolSize <= 25) return 5;
  if (poolSize <= 30) return 6;
  if (poolSize <= 35) return 7;
  return 8;
}

/** Spread `count` items over rows of at most `perRow`, centred in `width`. */
export function centredRows(
  count: number,
  perRow: number,
  width: number,
  itemWidth: number,
): { index: number; row: number; x: number }[] {
  const out: { index: number; row: number; x: number }[] = [];
  const rows = Math.ceil(Math.max(0, count) / Math.max(1, perRow));
  for (let row = 0; row < rows; row++) {
    const start = row * perRow;
    const inRow = Math.min(perRow, count - start);
    const step = inRow > 1 ? (width - itemWidth) / (perRow - 1) : 0;
    const rowWidth = itemWidth + step * (inRow - 1);
    const x0 = (width - rowWidth) / 2;
    for (let k = 0; k < inRow; k++) {
      out.push({ index: start + k, row, x: Math.round(x0 + k * step) });
    }
  }
  return out;
}
