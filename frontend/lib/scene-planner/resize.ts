// Carries a plan over to a new grid size.

import { ELEMENTS_BY_ID } from "./catalog";
import { type Placement, type Rect, withHosts } from "./generate";

interface Grid {
  cols: number;
  rows: number;
}

const rides = (p: Placement) => Boolean(ELEMENTS_BY_ID.get(p.elementId)?.on);

function boundingRect(cells: number[], cols: number): Rect {
  const colsOf = cells.map((c) => c % cols);
  const rowsOf = cells.map((c) => Math.floor(c / cols));
  const col = Math.min(...colsOf);
  const row = Math.min(...rowsOf);
  return {
    col,
    row,
    w: Math.max(...colsOf) - col + 1,
    h: Math.max(...rowsOf) - row + 1,
  };
}

function withCells(p: Placement, cells: number[], cols: number): Placement {
  return p.rect
    ? { ...p, cells, rect: boundingRect(cells, cols) }
    : { ...p, cells };
}

/** Where the centre of an old cell lands on the new grid, in cell units. */
function scaled(cell: number, from: Grid, to: Grid) {
  return {
    x: (((cell % from.cols) + 0.5) * to.cols) / from.cols - 0.5,
    y: ((Math.floor(cell / from.cols) + 0.5) * to.rows) / from.rows - 0.5,
  };
}

/**
 * Samples the old grid under each new cell's centre. Returns each
 * placement's new cells and the old cell every new cell sampled.
 */
function sampleCentres(placements: Placement[], from: Grid, to: Grid) {
  const owner = new Map<number, string>();
  for (const p of placements)
    for (const cell of p.cells) owner.set(cell, p.key);
  const cells = new Map<string, number[]>(placements.map((p) => [p.key, []]));
  const sampled = new Map<number, number>();
  for (let row = 0; row < to.rows; row++) {
    for (let col = 0; col < to.cols; col++) {
      const oldCol = Math.floor(((col + 0.5) * from.cols) / to.cols);
      const oldRow = Math.floor(((row + 0.5) * from.rows) / to.rows);
      const old = oldRow * from.cols + oldCol;
      const key = owner.get(old);
      if (!key) continue;
      cells.get(key)?.push(row * to.cols + col);
      sampled.set(row * to.cols + col, old);
    }
  }
  return { cells, sampled };
}

/** The new cell under an old cell's top-left corner, for thin elements. */
function cornerCell(cell: number, from: Grid, to: Grid) {
  const col = Math.floor(((cell % from.cols) * to.cols) / from.cols);
  const row = Math.floor((Math.floor(cell / from.cols) * to.rows) / from.rows);
  return row * to.cols + col;
}

/**
 * Elements that stand on the ground: a new cell belongs to the placement
 * that owned the old cell under its centre, so shapes keep their share of
 * the picture. Elements too thin to cover any centre keep one cell, unless
 * another element already has it. A path's ends move to the new cells that
 * sampled them.
 */
function remapGrounded(placements: Placement[], from: Grid, to: Grid) {
  const { cells, sampled } = sampleCentres(placements, from, to);
  const taken = new Set([...cells.values()].flat());
  const result = new Map<string, Placement>();
  for (const p of placements) {
    let next = cells.get(p.key) ?? [];
    if (next.length === 0) {
      const cell = cornerCell(p.cells[0], from, to);
      if (taken.has(cell)) continue;
      taken.add(cell);
      sampled.set(cell, p.cells[0]);
      next = [cell];
    }
    const moved = withCells(p, next, to.cols);
    if (p.ends) moved.ends = movedEnds(p.ends, next, sampled);
    result.set(p.key, moved);
  }
  return result;
}

/** New cells that sampled an old end; none falls back to the neighbour rule. */
function movedEnds(
  ends: number[],
  cells: number[],
  sampled: Map<number, number>,
) {
  const next = cells.filter((cell) => ends.includes(sampled.get(cell) ?? -1));
  return next.length > 0 ? next : undefined;
}

/**
 * A rider follows its host: it moves to the host's new cell nearest its own
 * old position that no other rider has taken, or goes with the host.
 */
function remapRiders(
  riders: Placement[],
  hosts: Placement[],
  moved: Map<string, Placement>,
  from: Grid,
  to: Grid,
) {
  const ridden = new Set<number>();
  const result = new Map<string, Placement>();
  for (const p of riders) {
    const host = hosts.find((h) => h.cells.includes(p.cells[0]));
    const free = (host ? (moved.get(host.key)?.cells ?? []) : []).filter(
      (cell) => !ridden.has(cell),
    );
    if (free.length === 0) continue;
    const { x, y } = scaled(p.cells[0], from, to);
    const distance = (cell: number) =>
      ((cell % to.cols) - x) ** 2 + (Math.floor(cell / to.cols) - y) ** 2;
    const cell = free.reduce(
      (best, next) => (distance(next) < distance(best) ? next : best),
      free[0],
    );
    ridden.add(cell);
    result.set(p.key, withCells(p, [cell], to.cols));
  }
  return result;
}

/** The plan on a grid of a new size, in the same order. */
export function remapPlacements(placements: Placement[], from: Grid, to: Grid) {
  const hosts = placements.filter((p) => !rides(p));
  const grounded = remapGrounded(hosts, from, to);
  const riders = remapRiders(
    placements.filter(rides),
    hosts,
    grounded,
    from,
    to,
  );
  const next = placements.flatMap((p) => {
    const moved = grounded.get(p.key) ?? riders.get(p.key);
    return moved ? [moved] : [];
  });
  return withHosts(next);
}
