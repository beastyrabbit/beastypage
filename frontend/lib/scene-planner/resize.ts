// Carries a plan over to a new grid size.

import { ELEMENTS_BY_ID } from "./catalog";
import { type Placement, type Rect, withHosts } from "./generate";

interface Grid {
  cols: number;
  rows: number;
}

interface Point {
  x: number;
  y: number;
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
 * Samples blocks under each new cell's centre, preserving their area.
 */
function sampleCentres(placements: Placement[], from: Grid, to: Grid) {
  const owner = new Map<number, string>();
  for (const p of placements)
    for (const cell of p.cells) owner.set(cell, p.key);
  const cells = new Map<string, number[]>(placements.map((p) => [p.key, []]));
  for (let row = 0; row < to.rows; row++) {
    for (let col = 0; col < to.cols; col++) {
      const oldCol = Math.floor(((col + 0.5) * from.cols) / to.cols);
      const oldRow = Math.floor(((row + 0.5) * from.rows) / to.rows);
      const old = oldRow * from.cols + oldCol;
      const key = owner.get(old);
      if (!key) continue;
      cells.get(key)?.push(row * to.cols + col);
    }
  }
  return cells;
}

/** The new cell under an old cell's top-left corner, for thin elements. */
function cornerCell(cell: number, from: Grid, to: Grid) {
  const col = Math.floor(((cell % from.cols) * to.cols) / from.cols);
  const row = Math.floor((Math.floor(cell / from.cols) * to.rows) / from.rows);
  return row * to.cols + col;
}

function nearestCell(cells: number[], point: Point, cols: number) {
  const distance = (cell: number) =>
    ((cell % cols) - point.x) ** 2 + (Math.floor(cell / cols) - point.y) ** 2;
  return cells.reduce((best, next) => {
    const delta = distance(next) - distance(best);
    return delta < 0 || (delta === 0 && next > best) ? next : best;
  }, cells[0]);
}

/** Every original end keeps a representative, even if it was not sampled. */
function movedPlacement(p: Placement, cells: number[], from: Grid, to: Grid) {
  const moved = withCells(p, cells, to.cols);
  if (p.ends)
    moved.ends = [
      ...new Set(
        p.ends.map((end) => nearestCell(cells, scaled(end, from, to), to.cols)),
      ),
    ];
  return moved;
}

function freeCells(taken: Set<number>, grid: Grid) {
  return Array.from(
    { length: grid.cols * grid.rows },
    (_, cell) => cell,
  ).filter((cell) => !taken.has(cell));
}

/** Blocks take their samples, apart from cells already taken. */
function sampleBlocks(
  blocks: Placement[],
  from: Grid,
  to: Grid,
  taken: Set<number>,
) {
  const sampled = sampleCentres(blocks, from, to);
  const cells = new Map(
    [...sampled].map(([key, list]) => [
      key,
      list.filter((cell) => !taken.has(cell)),
    ]),
  );
  for (const cell of [...cells.values()].flat()) taken.add(cell);
  return cells;
}

/**
 * The first cell for an element the samples missed. A block takes the cell
 * under its corner if free; a shrink may drop it otherwise, unless it is
 * locked. Everything else takes the free cell nearest its old place, and a
 * locked element may take it from a block that keeps other cells.
 */
function firstCell(
  p: Placement,
  block: boolean,
  blocks: Map<string, number[]>,
  taken: Set<number>,
  from: Grid,
  to: Grid,
) {
  if (block) {
    const corner = cornerCell(p.cells[0], from, to);
    if (!taken.has(corner)) return corner;
    if (!p.locked) return undefined;
  }
  const shared = p.locked
    ? [...blocks.values()].filter((list) => list.length > 1).flat()
    : [];
  const options = [...freeCells(taken, to), ...shared];
  if (options.length === 0) return undefined;
  const cell = nearestCell(options, scaled(p.cells[0], from, to), to.cols);
  for (const [key, list] of blocks)
    blocks.set(
      key,
      list.filter((c) => c !== cell),
    );
  return cell;
}

function neighbours(cell: number, grid: Grid) {
  const col = cell % grid.cols;
  const row = Math.floor(cell / grid.cols);
  const next: number[] = [];
  if (col > 0) next.push(cell - 1);
  if (col + 1 < grid.cols) next.push(cell + 1);
  if (row > 0) next.push(cell - grid.cols);
  if (row + 1 < grid.rows) next.push(cell + grid.cols);
  return next;
}

/** Walk adjacent source cells, returning along branches before continuing. */
function pathWalk(cells: number[], grid: Grid) {
  const unvisited = new Set(cells);
  const walk: number[] = [];
  for (const start of cells) {
    if (!unvisited.delete(start)) continue;
    const stack = [start];
    while (stack.length > 0) {
      const cell = stack.at(-1) as number;
      walk.push(cell);
      const next = neighbours(cell, grid).find((n) => unvisited.has(n));
      if (next === undefined) stack.pop();
      else {
        unvisited.delete(next);
        stack.push(next);
      }
    }
  }
  return walk;
}

/** Route to the mapped step, or the nearest cell reachable around obstacles. */
function connectStep(
  cells: Set<number>,
  start: number,
  target: number,
  taken: Set<number>,
  grid: Grid,
) {
  if (cells.has(target)) return target;
  const queue = [start];
  const previous = new Map([[start, start]]);
  // The iterator also visits cells pushed while it runs.
  for (const cell of queue) {
    if (cell === target) break;
    for (const next of neighbours(cell, grid)) {
      if (taken.has(next) || previous.has(next)) continue;
      previous.set(next, cell);
      queue.push(next);
    }
  }
  const point = { x: target % grid.cols, y: Math.floor(target / grid.cols) };
  const end = previous.has(target)
    ? target
    : nearestCell(queue, point, grid.cols);
  // Backtracking runs from the end; add the route in walking order.
  const route: number[] = [];
  for (let cell = end; cell !== start; cell = previous.get(cell) as number)
    route.push(cell);
  for (const cell of route.toReversed()) cells.add(cell);
  return end;
}

function remapPath(
  p: Placement,
  start: number,
  taken: Set<number>,
  from: Grid,
  to: Grid,
) {
  let current = start;
  const cells = new Set([current]);
  for (const step of pathWalk(p.cells, from)) {
    const { x, y } = scaled(step, from, to);
    const col = Math.min(to.cols - 1, Math.max(0, Math.round(x)));
    const row = Math.min(to.rows - 1, Math.max(0, Math.round(y)));
    current = connectStep(cells, current, row * to.cols + col, taken, to);
  }
  return [...cells];
}

/** Locked elements first, all on the whole grid; unlocked ones fit around. */
const lockedFirst = (placements: Placement[]) => [
  placements.filter((p) => p.locked),
  placements.filter((p) => !p.locked),
];

const shapeOf = (p: Placement) => ELEMENTS_BY_ID.get(p.elementId)?.shape;
const isBlock = (p: Placement) => !["point", "path"].includes(shapeOf(p) ?? "");

/**
 * Every element the samples missed claims its first cell before any path
 * routes, so each locked element keeps at least one cell.
 */
function remapGroup(
  group: Placement[],
  from: Grid,
  to: Grid,
  taken: Set<number>,
  result: Map<string, Placement>,
) {
  const blocks = sampleBlocks(group.filter(isBlock), from, to, taken);
  const first = new Map<string, number>();
  for (const p of group) {
    if (blocks.get(p.key)?.length) continue;
    const cell = firstCell(p, isBlock(p), blocks, taken, from, to);
    if (cell === undefined) continue;
    taken.add(cell);
    first.set(p.key, cell);
  }
  for (const p of group) {
    const start = first.get(p.key);
    let cells = blocks.get(p.key) ?? [];
    if (start !== undefined)
      cells =
        shapeOf(p) === "path" ? remapPath(p, start, taken, from, to) : [start];
    if (cells.length === 0) continue;
    for (const cell of cells) taken.add(cell);
    result.set(p.key, movedPlacement(p, cells, from, to));
  }
}

function remapGrounded(placements: Placement[], from: Grid, to: Grid) {
  const taken = new Set<number>();
  const result = new Map<string, Placement>();
  for (const group of lockedFirst(placements))
    remapGroup(group, from, to, taken, result);
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
  for (const p of lockedFirst(riders).flat()) {
    const host = hosts.find((h) => h.cells.includes(p.cells[0]));
    const free = (host ? (moved.get(host.key)?.cells ?? []) : []).filter(
      (cell) => !ridden.has(cell),
    );
    if (free.length === 0) continue;
    const cell = nearestCell(free, scaled(p.cells[0], from, to), to.cols);
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
