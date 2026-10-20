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
 * Elements that stand on the ground: a new cell belongs to the placement
 * that owned the old cell under its centre, so shapes keep their share of
 * the picture. Elements too thin to cover any centre keep one cell, unless
 * another element already has it.
 */
function remapGrounded(placements: Placement[], from: Grid, to: Grid) {
  const owner = new Map<number, string>();
  for (const p of placements)
    for (const cell of p.cells) owner.set(cell, p.key);
  const cells = new Map<string, number[]>(placements.map((p) => [p.key, []]));
  for (let row = 0; row < to.rows; row++) {
    for (let col = 0; col < to.cols; col++) {
      const oldCol = Math.floor(((col + 0.5) * from.cols) / to.cols);
      const oldRow = Math.floor(((row + 0.5) * from.rows) / to.rows);
      const key = owner.get(oldRow * from.cols + oldCol);
      if (key) cells.get(key)?.push(row * to.cols + col);
    }
  }
  const taken = new Set([...cells.values()].flat());
  const result = new Map<string, Placement>();
  for (const p of placements) {
    let next = cells.get(p.key) ?? [];
    if (next.length === 0) {
      const first = p.cells[0];
      const col = Math.floor(((first % from.cols) * to.cols) / from.cols);
      const row = Math.floor(
        (Math.floor(first / from.cols) * to.rows) / from.rows,
      );
      const cell = row * to.cols + col;
      if (taken.has(cell)) continue;
      taken.add(cell);
      next = [cell];
    }
    result.set(p.key, withCells(p, next, to.cols));
  }
  return result;
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
    const cell = free.reduce((a, b) => (distance(b) < distance(a) ? b : a));
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
