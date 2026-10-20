// Auto-tiling: which tile variant each cell needs. Neighbouring cells of the
// same element join into one group, so two waterfalls side by side merge and a
// forest's look depends on the group's shape. Edges between different groups
// meet through their edge materials; those pairs are the transitions a tile
// set has to cover.

import { ELEMENTS_BY_ID, type Zone } from "./catalog";
import {
  type Placement,
  type Rect,
  type ZoneStarts,
  zoneOfRow,
} from "./generate";

export type Material =
  | "air"
  | "cloud"
  | "foliage"
  | "ground"
  | "rock"
  | "sand"
  | "water"
  | "built"
  | "wood"
  | "crop"
  | "fauna";

export const MATERIALS: Record<string, Material> = {
  celestial: "air",
  clouds: "cloud",
  birds: "air",
  rainbow: "air",
  balloon: "air",
  mountains: "rock",
  hills: "ground",
  treeline: "foliage",
  forest: "foliage",
  "tall-tree": "foliage",
  rocks: "rock",
  bushes: "foliage",
  flowers: "ground",
  mushrooms: "ground",
  trail: "ground",
  river: "water",
  stream: "water",
  waterfall: "water",
  lake: "water",
  pond: "water",
  sea: "water",
  beach: "sand",
  cliffs: "rock",
  lighthouse: "built",
  palm: "foliage",
  boat: "wood",
  pier: "wood",
  skyline: "built",
  building: "built",
  house: "built",
  "street-lamp": "built",
  fence: "wood",
  bench: "wood",
  road: "built",
  oak: "foliage",
  birch: "foliage",
  pine: "foliage",
  willow: "foliage",
  cherry: "foliage",
  maple: "foliage",
  "dead-tree": "wood",
  ferns: "foliage",
  "berry-bush": "foliage",
  "tall-grass": "foliage",
  "fallen-log": "wood",
  meadow: "ground",
  cornfield: "crop",
  wheat: "crop",
  sunflowers: "crop",
  lavender: "crop",
  tulips: "crop",
  pumpkins: "crop",
  vineyard: "crop",
  orchard: "foliage",
  "hay-bales": "crop",
  scarecrow: "wood",
  garden: "crop",
  deer: "fauna",
  rabbits: "fauna",
  fox: "fauna",
  hedgehog: "fauna",
  squirrel: "fauna",
  owl: "fauna",
  butterflies: "fauna",
  heron: "fauna",
  cows: "fauna",
  sheep: "fauna",
  horses: "fauna",
  chickens: "fauna",
  ducks: "fauna",
  swans: "fauna",
  fish: "fauna",
  frog: "fauna",
  reeds: "foliage",
  "lily-pads": "foliage",
  church: "built",
  windmill: "built",
  barn: "wood",
  well: "built",
  market: "wood",
  skyscraper: "built",
  "tv-tower": "built",
  office: "built",
  fountain: "built",
};

/** Material of an empty cell in a zone. */
export function zoneMaterial(zone: Zone): Material {
  return zone === "sky" ? "air" : "ground";
}

/** How a group's outline reads, which picks its silhouette. */
export type ShapeClass =
  | "single"
  | "row"
  | "column"
  | "square"
  | "mass"
  | "path";

export const SHAPE_LABELS: Record<ShapeClass, string> = {
  single: "Single",
  row: "Strip",
  column: "Column",
  square: "Square",
  mass: "Mass",
  path: "Path",
};

export interface TileGroup {
  id: string;
  elementId: string;
  cells: number[];
  set: Set<number>;
  /** Bounding box in cells. */
  rect: Rect;
  shape: ShapeClass;
  /** Placements merged into this group. */
  keys: string[];
}

// Neighbour bits, clockwise from the top.
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

export function cellMask(
  set: Set<number>,
  cell: number,
  cols: number,
  rows: number,
) {
  const col = cell % cols;
  const row = Math.floor(cell / cols);
  let mask = 0;
  if (row > 0 && set.has(cell - cols)) mask |= N;
  if (col < cols - 1 && set.has(cell + 1)) mask |= E;
  if (row < rows - 1 && set.has(cell + cols)) mask |= S;
  if (col > 0 && set.has(cell - 1)) mask |= W;
  return mask;
}

/** Whether a cell is a corner of a 2 × 2 block of its group. */
function inBlock(set: Set<number>, cell: number, cols: number, rows: number) {
  const col = cell % cols;
  const row = Math.floor(cell / cols);
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const x = col + dx;
    const y = row + dy;
    if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
    if (
      set.has(y * cols + x) &&
      set.has(row * cols + x) &&
      set.has(y * cols + col)
    )
      return true;
  }
  return false;
}

/**
 * The mask a cell's tile is drawn with. Where a path runs two cells wide its
 * cells would each draw a bend or a junction and the strip would show rings
 * with holes, so cells inside a 2 × 2 block of a path use the fill tile:
 * surface only, no banks.
 */
export function tileMask(
  g: TileGroup,
  cell: number,
  cols: number,
  rows: number,
) {
  if (g.shape === "path" && inBlock(g.set, cell, cols, rows)) return FILL;
  return cellMask(g.set, cell, cols, rows);
}

/** Mask of a path cell inside a wide stretch. */
export const FILL = 16;

function shapeOf(elementId: string, rect: Rect, count: number): ShapeClass {
  if (ELEMENTS_BY_ID.get(elementId)?.shape === "path") return "path";
  if (count === 1) return "single";
  if (rect.h === 1 || rect.w >= rect.h * 2.5) return "row";
  if (rect.w === 1 || rect.h >= rect.w * 2.5) return "column";
  const ratio = rect.w / rect.h;
  return ratio > 0.75 && ratio < 1.34 ? "square" : "mass";
}

/** Joins touching cells of the same element into groups. */
export function groupTiles(
  placements: Placement[],
  cols: number,
  rows: number,
) {
  // Riders share cells with their host, so cells are looked up per element.
  const owner = new Map<string, Placement>();
  for (const p of placements)
    for (const cell of p.cells) owner.set(`${p.elementId}:${cell}`, p);

  const seen = new Set<string>();
  const groups: TileGroup[] = [];
  for (const p of placements) {
    const id = (cell: number) => `${p.elementId}:${cell}`;
    for (const first of p.cells) {
      if (seen.has(id(first))) continue;
      const cells: number[] = [];
      const keys = new Set<string>();
      const queue = [first];
      seen.add(id(first));
      while (queue.length > 0) {
        const cell = queue.pop() as number;
        cells.push(cell);
        keys.add((owner.get(id(cell)) as Placement).key);
        const col = cell % cols;
        const next = [
          cell >= cols ? cell - cols : -1,
          col < cols - 1 ? cell + 1 : -1,
          cell + cols < cols * rows ? cell + cols : -1,
          col > 0 ? cell - 1 : -1,
        ];
        for (const n of next) {
          if (n < 0 || seen.has(id(n)) || !owner.has(id(n))) continue;
          seen.add(id(n));
          queue.push(n);
        }
      }
      cells.sort((a, b) => a - b);
      const colsOf = cells.map((c) => c % cols);
      const rowsOf = cells.map((c) => Math.floor(c / cols));
      const rect = {
        col: Math.min(...colsOf),
        row: Math.min(...rowsOf),
        w: Math.max(...colsOf) - Math.min(...colsOf) + 1,
        h: Math.max(...rowsOf) - Math.min(...rowsOf) + 1,
      };
      groups.push({
        id: [...keys].sort().join("+"),
        elementId: p.elementId,
        cells,
        set: new Set(cells),
        rect,
        shape: shapeOf(p.elementId, rect, cells.length),
        keys: [...keys],
      });
    }
  }
  return groups;
}

export interface AtlasEntry {
  key: string;
  elementId: string;
  shape: ShapeClass;
  mask: number;
  /** One cell that uses this tile, to sample it from the live board. */
  cell: number;
  count: number;
}

/** Every distinct tile (element, silhouette, neighbour mask) on the board. */
export function atlasEntries(groups: TileGroup[], cols: number, rows: number) {
  const entries = new Map<string, AtlasEntry>();
  for (const g of groups) {
    for (const cell of g.cells) {
      const mask = tileMask(g, cell, cols, rows);
      const key = `${g.elementId}:${g.shape}:${mask}`;
      const entry = entries.get(key);
      if (entry) entry.count++;
      else
        entries.set(key, {
          key,
          elementId: g.elementId,
          shape: g.shape,
          mask,
          cell,
          count: 1,
        });
    }
  }
  return [...entries.values()];
}

export interface Transition {
  key: string;
  a: Material;
  b: Material;
  count: number;
}

/** Material pairs that meet on the board, including empty ground and sky. */
export function transitions(
  groups: TileGroup[],
  cols: number,
  rows: number,
  starts: ZoneStarts,
) {
  const material = new Map<number, Material>();
  const group = new Map<number, string>();
  for (const g of groups) {
    if (ELEMENTS_BY_ID.get(g.elementId)?.on) continue;
    const m = MATERIALS[g.elementId] ?? "ground";
    for (const cell of g.cells) {
      material.set(cell, m);
      group.set(cell, g.id);
    }
  }
  const at = (cell: number) =>
    material.get(cell) ??
    zoneMaterial(zoneOfRow(Math.floor(cell / cols), starts));

  const pairs = new Map<string, Transition>();
  for (let cell = 0; cell < cols * rows; cell++) {
    const right = cell % cols < cols - 1 ? cell + 1 : -1;
    const below = cell + cols < cols * rows ? cell + cols : -1;
    for (const n of [right, below]) {
      if (n < 0 || group.get(cell) === group.get(n)) continue;
      if (!group.has(cell) && !group.has(n)) continue;
      const [a, b] = [at(cell), at(n)].sort() as [Material, Material];
      if (a === b && a === "ground") continue;
      const key = `${a}|${b}`;
      const pair = pairs.get(key);
      if (pair) pair.count++;
      else pairs.set(key, { key, a, b, count: 1 });
    }
  }
  return [...pairs.values()].sort((x, y) => y.count - x.count);
}
