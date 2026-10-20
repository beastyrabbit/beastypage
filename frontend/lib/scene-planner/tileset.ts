// The tile list for the Blender sprite run, and how the renderer picks a tile.
//
// Every element is drawn per cell from 16 px tiles keyed by the group's shape
// class, the cell's neighbour mask, a variant (night, moon, aurora) and an
// alternative for variety. Edges are overlays where one material spills into
// a neighbouring cell; combos are special overlays where two particular
// elements meet, such as a waterfall splashing into a lake.

import type { TimeOfDay } from "./catalog";
import { FILL, type Material, type ShapeClass } from "./tiles";

export type TileLayer = "ground" | "object";

export interface TileSpec {
  /** Shape classes with their own look. Other shapes fall back in order. */
  shapes: ShapeClass[];
  /** Variants besides "base", such as "night" for lit windows. */
  variants?: string[];
  /** Interchangeable versions of every tile, picked per cell. */
  alts?: number;
  /** Pick the alternative per grid row instead, so a row stays one look,
   * such as one tulip colour per row. */
  altByRow?: boolean;
  /** Animation frames per tile; 1 for still elements. */
  frames: number;
  /** Ground tiles fill their cells and take edges; objects stand on them. */
  layer: TileLayer;
}

const LOOP = 4;
const TREE: ShapeClass[] = ["single", "square", "row", "mass"];
const FIELD: ShapeClass[] = ["square", "mass", "row", "single"];
const ANIMAL: TileSpec = {
  shapes: ["single"],
  alts: 2,
  frames: LOOP,
  layer: "object",
};

export const TILE_SPECS: Record<string, TileSpec> = {
  celestial: {
    shapes: ["single", "square"],
    variants: ["moon"],
    frames: LOOP,
    layer: "object",
  },
  clouds: {
    shapes: ["row", "mass", "single"],
    alts: 2,
    frames: LOOP,
    layer: "object",
  },
  birds: { shapes: ["single"], frames: LOOP, layer: "object" },
  rainbow: {
    shapes: ["row", "mass"],
    variants: ["aurora"],
    frames: LOOP,
    layer: "object",
  },
  balloon: { shapes: ["single"], frames: LOOP, layer: "object" },

  mountains: { shapes: ["row", "mass"], alts: 3, frames: 1, layer: "object" },
  hills: { shapes: ["row", "mass"], alts: 2, frames: 1, layer: "ground" },
  treeline: { shapes: ["row", "mass"], alts: 2, frames: LOOP, layer: "object" },
  forest: {
    shapes: ["square", "mass", "row", "column", "single"],
    alts: 2,
    frames: LOOP,
    layer: "object",
  },
  "tall-tree": { shapes: ["column", "single"], frames: LOOP, layer: "object" },
  rocks: {
    shapes: ["single", "square", "mass", "row"],
    alts: 2,
    frames: 1,
    layer: "object",
  },
  bushes: {
    shapes: ["single", "row", "square", "mass"],
    alts: 2,
    frames: LOOP,
    layer: "object",
  },
  flowers: { shapes: ["single"], alts: 3, frames: LOOP, layer: "object" },
  mushrooms: { shapes: ["single"], alts: 2, frames: 1, layer: "object" },
  trail: { shapes: ["path"], alts: 2, frames: 1, layer: "ground" },

  river: { shapes: ["path"], frames: LOOP, layer: "ground" },
  stream: { shapes: ["path"], frames: LOOP, layer: "ground" },
  waterfall: {
    shapes: ["column", "mass", "single"],
    frames: LOOP,
    layer: "ground",
  },
  lake: {
    shapes: ["square", "mass", "row", "single"],
    frames: LOOP,
    layer: "ground",
  },
  pond: {
    shapes: ["square", "mass", "row", "single"],
    frames: LOOP,
    layer: "ground",
  },

  sea: { shapes: ["row", "mass"], frames: LOOP, layer: "ground" },
  beach: { shapes: ["row", "mass"], alts: 2, frames: 1, layer: "ground" },
  cliffs: {
    shapes: ["square", "mass", "column", "row"],
    alts: 2,
    frames: 1,
    layer: "ground",
  },
  lighthouse: {
    shapes: ["column", "single"],
    variants: ["night"],
    frames: LOOP,
    layer: "object",
  },
  palm: { shapes: ["column", "single"], frames: LOOP, layer: "object" },
  boat: { shapes: ["single"], frames: LOOP, layer: "object" },
  pier: { shapes: ["row", "single"], frames: 1, layer: "object" },

  skyline: {
    shapes: ["row", "mass"],
    variants: ["night"],
    alts: 3,
    frames: LOOP,
    layer: "object",
  },
  building: {
    shapes: ["column", "square", "mass"],
    variants: ["night"],
    alts: 2,
    frames: LOOP,
    layer: "object",
  },
  house: {
    shapes: ["square", "mass", "row", "single"],
    variants: ["night"],
    alts: 2,
    frames: LOOP,
    layer: "object",
  },
  "street-lamp": {
    shapes: ["column", "single"],
    variants: ["night"],
    frames: LOOP,
    layer: "object",
  },
  fence: { shapes: ["row", "single"], frames: 1, layer: "object" },
  bench: { shapes: ["single"], frames: 1, layer: "object" },
  road: { shapes: ["path"], frames: 1, layer: "ground" },

  // Woods
  oak: { shapes: TREE, alts: 2, frames: LOOP, layer: "object" },
  birch: { shapes: TREE, alts: 2, frames: LOOP, layer: "object" },
  pine: { shapes: TREE, alts: 2, frames: LOOP, layer: "object" },
  willow: { shapes: TREE, alts: 2, frames: LOOP, layer: "object" },
  cherry: { shapes: TREE, alts: 2, frames: LOOP, layer: "object" },
  maple: { shapes: TREE, alts: 2, frames: LOOP, layer: "object" },
  "dead-tree": { shapes: ["column", "single"], frames: 1, layer: "object" },
  ferns: { shapes: ["single"], alts: 3, frames: LOOP, layer: "object" },
  "berry-bush": { shapes: ["single"], alts: 2, frames: LOOP, layer: "object" },
  "tall-grass": {
    shapes: ["row", "mass", "single"],
    alts: 2,
    frames: LOOP,
    layer: "object",
  },
  "fallen-log": { shapes: ["row", "single"], frames: 1, layer: "object" },

  // Fields
  meadow: {
    shapes: ["row", "mass", "single"],
    alts: 4,
    frames: LOOP,
    layer: "ground",
  },
  cornfield: { shapes: FIELD, alts: 2, frames: LOOP, layer: "ground" },
  wheat: { shapes: ["row", "mass"], alts: 2, frames: LOOP, layer: "ground" },
  sunflowers: { shapes: FIELD, alts: 2, frames: LOOP, layer: "ground" },
  lavender: { shapes: ["row", "mass"], frames: LOOP, layer: "ground" },
  tulips: {
    shapes: ["row", "mass"],
    alts: 4,
    altByRow: true,
    frames: LOOP,
    layer: "ground",
  },
  pumpkins: { shapes: FIELD, frames: 1, layer: "ground" },
  vineyard: { shapes: ["row", "mass"], frames: 1, layer: "ground" },
  orchard: { shapes: FIELD, alts: 2, frames: LOOP, layer: "object" },
  "hay-bales": {
    shapes: ["row", "single"],
    alts: 2,
    frames: 1,
    layer: "object",
  },
  scarecrow: { shapes: ["single"], frames: LOOP, layer: "object" },
  garden: { shapes: FIELD, frames: 1, layer: "ground" },

  // Animals: one cell each, two looks, always moving a little.
  deer: ANIMAL,
  rabbits: ANIMAL,
  fox: ANIMAL,
  hedgehog: ANIMAL,
  squirrel: ANIMAL,
  owl: ANIMAL,
  butterflies: ANIMAL,
  heron: ANIMAL,
  cows: ANIMAL,
  sheep: ANIMAL,
  horses: ANIMAL,
  chickens: ANIMAL,
  ducks: ANIMAL,
  swans: ANIMAL,
  fish: ANIMAL,
  frog: ANIMAL,

  // Water life
  reeds: { shapes: ["row", "single"], alts: 2, frames: LOOP, layer: "object" },
  "lily-pads": { shapes: ["single"], alts: 2, frames: LOOP, layer: "object" },

  // Village
  church: {
    shapes: ["column", "single"],
    variants: ["night"],
    frames: 1,
    layer: "object",
  },
  windmill: {
    shapes: ["column", "single"],
    variants: ["night"],
    frames: LOOP,
    layer: "object",
  },
  barn: { shapes: FIELD, variants: ["night"], frames: 1, layer: "object" },
  well: { shapes: ["single"], frames: 1, layer: "object" },
  market: { shapes: ["row", "single"], frames: LOOP, layer: "object" },

  // City
  skyscraper: {
    shapes: ["column", "single"],
    variants: ["night"],
    alts: 3,
    frames: LOOP,
    layer: "object",
  },
  "tv-tower": {
    shapes: ["column", "single"],
    variants: ["night"],
    frames: LOOP,
    layer: "object",
  },
  office: {
    shapes: ["square", "mass", "single"],
    variants: ["night"],
    alts: 2,
    frames: LOOP,
    layer: "object",
  },
  fountain: { shapes: ["single"], frames: LOOP, layer: "object" },
};

/** Fallback order when an element has no tiles for a group's shape. */
const SHAPE_FALLBACK: Record<ShapeClass, ShapeClass[]> = {
  single: ["single", "square", "row", "column", "mass", "path"],
  row: ["row", "mass", "square", "single", "column", "path"],
  column: ["column", "mass", "square", "single", "row", "path"],
  square: ["square", "mass", "row", "column", "single", "path"],
  mass: ["mass", "square", "row", "column", "single", "path"],
  path: ["path", "mass", "row", "column", "square", "single"],
};

export function tileShape(spec: TileSpec, shape: ShapeClass): ShapeClass {
  return (
    SHAPE_FALLBACK[shape].find((s) => spec.shapes.includes(s)) ?? spec.shapes[0]
  );
}

/**
 * Masks a shape class can show. A single cell has no neighbours. Paths also
 * get FILL, the inside of a stretch two or more cells wide.
 */
export function masksFor(shape: ShapeClass) {
  if (shape === "single") return [0];
  const masks = Array.from({ length: 16 }, (_, mask) => mask);
  return shape === "path" ? [...masks, FILL] : masks;
}

const NIGHT = new Set<TimeOfDay>(["dusk", "night"]);

/** Variant an element shows in an atmosphere. */
export function tileVariant(elementId: string, time: TimeOfDay) {
  const variants = TILE_SPECS[elementId]?.variants ?? [];
  if (!NIGHT.has(time)) return "base";
  if (variants.includes("moon")) return "moon";
  if (variants.includes("night")) return "night";
  if (variants.includes("aurora") && time === "night") return "aurora";
  return "base";
}

export function tileKey(
  shape: ShapeClass,
  mask: number,
  variant: string,
  alt: number,
) {
  return `${shape}:${mask}:${variant}:${alt}`;
}

// ---------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------

/** Empty land is drawn from these tiles: distant fields, meadow, front grass. */
export const GROUND_ZONES = ["far", "mid", "front"] as const;
export const GROUND_ALTS = 4;

export function groundKey(zone: (typeof GROUND_ZONES)[number], alt: number) {
  return `${zone}:${alt}`;
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

/**
 * Materials that spill into their neighbours, lowest first. A material only
 * spills onto one below it, so grass tufts grow over a shore, sand drifts into
 * shallow water and nothing spills onto a road but the verge.
 */
export const EDGE_ORDER: Material[] = [
  "built",
  "water",
  "sand",
  "rock",
  "ground",
  "foliage",
];

export type Side = "N" | "E" | "S" | "W";

export const SIDES: Side[] = ["N", "E", "S", "W"];

/** Edge tiles are frames of animation only where water moves. */
export function edgeFrames(from: Material, onto: Material) {
  return from === "water" || onto === "water" ? LOOP : 1;
}

/** Key of the overlay drawn on a cell whose `side` touches `from`. */
export function edgeKey(from: Material, onto: Material, side: Side) {
  return `${from}>${onto}:${side}`;
}

export function edgePairs() {
  const pairs: { from: Material; onto: Material }[] = [];
  for (const [i, from] of EDGE_ORDER.entries())
    for (const onto of EDGE_ORDER.slice(0, i)) pairs.push({ from, onto });
  return pairs;
}

// ---------------------------------------------------------------------------
// Combos
// ---------------------------------------------------------------------------

export interface Combo {
  id: string;
  label: string;
  /** Element whose cell causes the overlay. */
  from: string[];
  /**
   * Elements whose cell shows the overlay; "empty-ground" and "empty-sky"
   * stand for empty land and sky.
   */
  onto: string[];
  /** Sides of the receiving cell the source may touch. */
  sides: Side[];
  frames: number;
  /** Only shown in this tile variant of the source, such as "night". */
  variant?: string;
  /** Only next to the source group's top or foot cells, so a tall lamp post
   * casts one pool of light instead of one per cell, or next to the end of a
   * path, so a stream running alongside a river does not foam all the way. */
  at?: "top" | "foot" | "end";
}

const WATERS = ["river", "stream", "lake", "pond", "sea"];

export const COMBOS: Combo[] = [
  {
    id: "fall-splash",
    label: "Waterfall plunges into water",
    from: ["waterfall"],
    onto: WATERS,
    sides: ["N"],
    frames: LOOP,
  },
  {
    id: "fall-spray",
    label: "Waterfall spray on the ground",
    from: ["waterfall"],
    onto: ["empty-ground", "rocks", "trail", "beach"],
    sides: ["N"],
    frames: LOOP,
  },
  {
    id: "surf",
    label: "Surf runs up the beach",
    from: ["sea"],
    onto: ["beach"],
    sides: SIDES,
    frames: LOOP,
  },
  {
    id: "cliff-surf",
    label: "Waves break on the cliffs",
    from: ["cliffs"],
    onto: ["sea", "lake"],
    sides: SIDES,
    frames: LOOP,
  },
  {
    id: "mouth",
    label: "River flows into open water",
    from: ["river", "stream"],
    onto: ["lake", "pond", "sea"],
    sides: SIDES,
    frames: LOOP,
    at: "end",
  },
  {
    id: "confluence",
    label: "Stream joins a river",
    from: ["stream"],
    onto: ["river"],
    sides: SIDES,
    frames: LOOP,
    at: "end",
  },
  {
    id: "pier-posts",
    label: "Pier posts stand in the water",
    from: ["pier"],
    onto: ["sea", "lake", "pond", "river"],
    sides: ["N"],
    frames: LOOP,
  },
  {
    id: "wake",
    label: "Boat wake",
    from: ["boat"],
    onto: ["sea", "lake", "river"],
    sides: ["E", "W", "N"],
    frames: LOOP,
  },
  {
    id: "lamp-pool",
    label: "Pool of lamplight",
    from: ["street-lamp"],
    onto: ["empty-ground", "road", "trail", "bench", "fence"],
    sides: ["N", "E", "W"],
    frames: LOOP,
    variant: "night",
    at: "foot",
  },
  {
    id: "lighthouse-beam",
    label: "Lighthouse beam",
    from: ["lighthouse"],
    onto: ["empty-sky", "clouds", "sea"],
    sides: ["E", "W"],
    frames: LOOP,
    variant: "night",
    at: "top",
  },
];

export function comboKey(id: string, side: Side) {
  return `${id}:${side}`;
}

// ---------------------------------------------------------------------------
// Rendered sheets (public/scene-planner/tiles/tiles.json)
// ---------------------------------------------------------------------------

export interface TileSheet {
  file: string;
  /** Self-lit pixels, drawn after the time-of-day tint. */
  glow?: string;
  /** Frame columns in the sheet. */
  columns: number;
  /** Tile key → [row, frames]. */
  tiles: Record<string, [number, number]>;
}

export interface TileIndex {
  cell: number;
  version: string;
  sheets: Record<string, TileSheet>;
}

// ---------------------------------------------------------------------------
// The full list
// ---------------------------------------------------------------------------

export interface TileJob {
  kind: "tile" | "ground" | "edge" | "combo";
  /** Sheet the tile goes into: an element id, "ground", "edges" or "combos". */
  sheet: string;
  key: string;
  frames: number;
  /** Builder parameters. */
  params: Record<string, string | number>;
}

export function tileJobs(): TileJob[] {
  return [
    ...Object.entries(TILE_SPECS).flatMap(([id, spec]) =>
      elementJobs(id, spec),
    ),
    ...groundJobs(),
    ...edgeJobs(),
    ...comboJobs(),
  ];
}

function elementJobs(elementId: string, spec: TileSpec): TileJob[] {
  const jobs: TileJob[] = [];
  const variants = ["base", ...(spec.variants ?? [])];
  for (const shape of spec.shapes)
    for (const mask of masksFor(shape))
      for (const variant of variants)
        for (let alt = 0; alt < (spec.alts ?? 1); alt++)
          jobs.push({
            kind: "tile",
            sheet: elementId,
            key: tileKey(shape, mask, variant, alt),
            frames: spec.frames,
            params: { element: elementId, shape, mask, variant, alt },
          });
  return jobs;
}

function groundJobs(): TileJob[] {
  return GROUND_ZONES.flatMap((zone) =>
    Array.from({ length: GROUND_ALTS }, (_, alt) => ({
      kind: "ground" as const,
      sheet: "ground",
      key: groundKey(zone, alt),
      frames: LOOP,
      params: { zone, alt },
    })),
  );
}

function edgeJobs(): TileJob[] {
  return edgePairs().flatMap(({ from, onto }) =>
    SIDES.map((side) => ({
      kind: "edge" as const,
      sheet: "edges",
      key: edgeKey(from, onto, side),
      frames: edgeFrames(from, onto),
      params: { from, onto, side },
    })),
  );
}

function comboJobs(): TileJob[] {
  return COMBOS.flatMap((combo) =>
    combo.sides.map((side) => ({
      kind: "combo" as const,
      sheet: "combos",
      key: comboKey(combo.id, side),
      frames: combo.frames,
      params: { combo: combo.id, side },
    })),
  );
}
