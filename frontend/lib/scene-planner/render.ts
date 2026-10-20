// Pixel art for the Scene Planner at 16 px per cell on a 12 fps clock, so the
// board moves in steps like a sprite sheet. Elements use the Blender tile
// sheets (tileset.ts) once they have loaded; the procedural painters below
// draw anything the sheets lack, and everything before they arrive.

import { ELEMENTS_BY_ID, elementLabel, type TimeOfDay } from "./catalog";
import {
  type Atmosphere,
  type Placement,
  type ZoneStarts,
  zoneOfRow,
} from "./generate";
import {
  currentTileSet,
  type Grade,
  gradedSheet,
  type TileSet,
} from "./tile-sheets";
import {
  cellMask,
  E,
  groupTiles,
  MATERIALS,
  type Material,
  N,
  S,
  type TileGroup,
  tileMask,
  W,
} from "./tiles";
import {
  COMBOS,
  type Combo,
  comboKey,
  EDGE_ORDER,
  edgeKey,
  GROUND_ALTS,
  type GROUND_ZONES,
  groundKey,
  SIDES,
  type Side,
  TILE_SPECS,
  tileKey,
  tileShape,
  tileVariant,
} from "./tileset";

export const CELL = 16;
export const FPS = 12;
export const TICK_MS = 1000 / FPS;
/** Stamp-in and dissolve duration of a placement. */
export const PLACE_MS = 420;

export interface Ghost {
  placement: Placement;
  start: number;
}

export interface SceneFrame {
  cols: number;
  rows: number;
  starts: ZoneStarts;
  placements: Placement[];
  atmosphere: Atmosphere;
  /** Placement key → time its stamp-in started. */
  appearing: Map<string, number>;
  /** Removed placements that are still dissolving. */
  ghosts: Ghost[];
  now: number;
  /** Frame counter on the 12 fps clock; frozen under reduced motion. */
  tick: number;
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

type Rgb = [number, number, number];

function hex(value: string): Rgb {
  const n = Number.parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function css([r, g, b]: Rgb) {
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

const BASE = {
  meadow: "#4f9a46",
  grass: "#3f8a3a",
  grassLight: "#66b94f",
  farLand: "#6d8f6a",
  foliageDark: "#2d5e2f",
  foliage: "#3f7d3a",
  foliageLight: "#5fa04a",
  trunk: "#5b3a25",
  rock: "#6b6f7c",
  rockLight: "#9097a6",
  rockDark: "#474b57",
  water: "#3a78c2",
  waterLight: "#8cc8f0",
  waterDark: "#24508a",
  foam: "#e6f4ff",
  sand: "#e3c58c",
  sandDark: "#c9a66b",
  dirt: "#a07c52",
  dirtLight: "#c29d6c",
  asphalt: "#4a4e5a",
  paint: "#e8e2c8",
  built: "#6a6f86",
  builtLight: "#8d93ab",
  builtDark: "#4b4f63",
  roof: "#a8504a",
  wood: "#8a5a34",
  woodLight: "#b07a48",
  red: "#d9534f",
  white: "#eef1f6",
  snow: "#e4ebf5",
  cloud: "#f2f4fa",
  cloudShade: "#c6cbe0",
  petal1: "#f472b6",
  petal2: "#facc15",
  petal3: "#c4b5fd",
};

type ColorName = keyof typeof BASE;

const SKY: Record<TimeOfDay, { top: string; bottom: string; light: number }> = {
  dawn: { top: "#3b3a6b", bottom: "#f4a38c", light: 0.86 },
  midday: { top: "#3d7fd6", bottom: "#a9d8f5", light: 1 },
  golden: { top: "#5b4a8a", bottom: "#f7b267", light: 0.92 },
  dusk: { top: "#1d1b3f", bottom: "#8a4f7d", light: 0.66 },
  night: { top: "#070a1c", bottom: "#1c2547", light: 0.46 },
};

const SEASON_SHIFT: Record<string, Partial<Record<ColorName, string>>> = {
  Spring: { foliageLight: "#7fcf6a", grassLight: "#7fcf6a" },
  Summer: {},
  Autumn: {
    foliageDark: "#7a3b1e",
    foliage: "#b0572a",
    foliageLight: "#e0a040",
    meadow: "#8a9a46",
    grass: "#7a8a3a",
    grassLight: "#b0a050",
  },
  Winter: {
    foliageDark: "#24443f",
    foliage: "#2f5a50",
    foliageLight: "#e4ebf5",
    meadow: "#cfd9e6",
    grass: "#bccadb",
    grassLight: "#e4ebf5",
    farLand: "#b7c1d6",
  },
};

export interface Palette {
  c: Record<ColorName, string>;
  /** What white turns into under this light, for tinting tile sheets. */
  light: Rgb;
  haze: number;
  skyTop: Rgb;
  skyBottom: Rgb;
  night: boolean;
  dark: boolean;
}

const paletteCache = new Map<string, Palette>();

/** Colours for one atmosphere; `haze` mixes them towards the sky for distance. */
export function palette(atmosphere: Atmosphere, haze = 0): Palette {
  const key = `${atmosphere.time}|${atmosphere.season}|${atmosphere.weather}|${haze}`;
  const cached = paletteCache.get(key);
  if (cached) return cached;
  const sky = SKY[atmosphere.time];
  const gloomy =
    atmosphere.weather === "Storm" || atmosphere.weather === "Rain";
  const light = sky.light * (gloomy ? 0.82 : 1);
  const skyBottom = hex(sky.bottom);
  const tint = mix([255, 255, 255], skyBottom, 0.25);
  const shift = SEASON_SHIFT[atmosphere.season] ?? {};
  const c = {} as Record<ColorName, string>;
  for (const name of Object.keys(BASE) as ColorName[]) {
    const base = hex(shift[name] ?? BASE[name]);
    let rgb: Rgb = [
      (base[0] * light * tint[0]) / 255,
      (base[1] * light * tint[1]) / 255,
      (base[2] * light * tint[2]) / 255,
    ];
    if (haze > 0) rgb = mix(rgb, skyBottom, haze);
    c[name] = css(rgb);
  }
  const result: Palette = {
    c,
    light: [light * tint[0], light * tint[1], light * tint[2]],
    haze,
    skyTop: gloomy ? mix(hex(sky.top), [90, 96, 110], 0.4) : hex(sky.top),
    skyBottom: gloomy ? mix(skyBottom, [120, 126, 140], 0.4) : skyBottom,
    night: atmosphere.time === "night" || atmosphere.time === "dusk",
    dark: atmosphere.time === "night",
  };
  paletteCache.set(key, result);
  return result;
}

const GLOW = "#ffd27a";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hash(n: number) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function seedOf(text: string) {
  let h = 7;
  for (let i = 0; i < text.length; i++)
    h = Math.imul(h ^ (text.codePointAt(i) ?? 0), 16777619);
  return h >>> 0;
}

/** Triangle wave between -1 and 1 with the given period in ticks. */
function tri(tick: number, period: number) {
  const t = (tick % period) / period;
  return t < 0.5 ? t * 4 - 1 : 3 - t * 4;
}

interface Paint {
  ctx: CanvasRenderingContext2D;
  g: TileGroup;
  /** Bounding box in pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  cols: number;
  rows: number;
  tick: number;
  p: Palette;
  atm: Atmosphere;
  seed: number;
  rnd: (i: number) => number;
}

function rect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
) {
  ctx.fillStyle = fill;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function disc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  fill: string,
) {
  ctx.fillStyle = fill;
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy));
    ctx.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2 + 1, 1);
  }
}

/** Calls `fn` with the pixel origin, column, row and mask of every cell. */
function eachCell(
  pt: Paint,
  fn: (px: number, py: number, mask: number, cell: number) => void,
) {
  for (const cell of pt.g.cells) {
    const mask = cellMask(pt.g.set, cell, pt.cols, pt.rows);
    fn((cell % pt.cols) * CELL, Math.floor(cell / pt.cols) * CELL, mask, cell);
  }
}

/** Canopy blob made of overlapping discs along the top edge. */
function canopy(
  pt: Paint,
  top: number,
  left: number,
  width: number,
  bottom: number,
  sway: number,
) {
  const { ctx, p } = pt;
  rect(ctx, left, top + 5, width, bottom - top - 5, p.c.foliageDark);
  const count = Math.max(2, Math.round(width / 7));
  for (let i = 0; i < count; i++) {
    const cx = left + ((i + 0.5) * width) / count + (i % 2 ? sway : 0);
    const r = 4 + Math.floor(pt.rnd(i) * 3);
    const cy = top + r + Math.floor(pt.rnd(i + 40) * 3);
    disc(ctx, cx, cy, r, p.c.foliage);
    disc(ctx, cx - 1, cy - 1, Math.max(1, r - 3), p.c.foliageLight);
  }
}

function conifer(
  pt: Paint,
  cx: number,
  base: number,
  height: number,
  sway: number,
) {
  const { ctx, p } = pt;
  const width = Math.max(3, Math.round(height * 0.55));
  rect(ctx, cx - 1, base - 3, 2, 3, p.c.trunk);
  for (let i = 0; i < height - 3; i++) {
    const t = i / (height - 3);
    const half = Math.max(0, Math.round((width / 2) * t));
    const shift = i < (height - 3) / 2 ? sway : 0;
    rect(
      ctx,
      cx - half + shift,
      base - height + i,
      half * 2 + 1,
      1,
      i % 3 === 0 ? p.c.foliage : p.c.foliageDark,
    );
  }
  if (pt.atm.season === "Winter")
    rect(ctx, cx - 1 + sway, base - height, 2, 2, p.c.snow);
}

function windowLit(pt: Paint, i: number) {
  const r = pt.rnd(i);
  if (!pt.p.night) return false;
  // One in seven windows flickers on the clock.
  if (r > 0.86) return (pt.tick + i) % 23 > 2;
  return r > 0.35;
}

// ---------------------------------------------------------------------------
// Painters
// ---------------------------------------------------------------------------

type Painter = (pt: Paint) => void;

const waterBody: Painter = (pt) => {
  const { ctx, p, tick } = pt;
  eachCell(pt, (px, py, mask, cell) => {
    rect(ctx, px, py, CELL, CELL, p.c.water);
    if (!(mask & N)) rect(ctx, px, py, CELL, 2, p.c.waterLight);
    for (let i = 0; i < 3; i++) {
      const lx =
        (Math.floor(pt.rnd(cell * 3 + i) * 12) + Math.floor(tick / 3)) % 14;
      rect(ctx, px + lx, py + 4 + i * 4, 3, 1, p.c.waterLight);
    }
    if (!(mask & S)) rect(ctx, px, py + CELL - 2, CELL, 2, p.c.waterDark);
    // Rounded outer corners.
    const cut = (cx: number, cy: number) =>
      rect(ctx, px + cx, py + cy, 2, 2, p.c.meadow);
    if (!(mask & N) && !(mask & W)) cut(0, 0);
    if (!(mask & N) && !(mask & E)) cut(CELL - 2, 0);
    if (!(mask & S) && !(mask & W)) cut(0, CELL - 2);
    if (!(mask & S) && !(mask & E)) cut(CELL - 2, CELL - 2);
  });
};

const flowingPath =
  (
    fill: ColorName,
    light: ColorName,
    dark: ColorName,
    kind: "water" | "dirt" | "road",
  ): Painter =>
  (pt) => {
    const { ctx, p } = pt;
    eachCell(pt, (px, py, mask, cell) => {
      rect(ctx, px, py, CELL, CELL, p.c[fill]);
      PATH_MARKS[kind](pt, p.c[light], px, py, mask, cell);
      // Banks on open sides.
      if (!(mask & W)) rect(ctx, px, py, 2, CELL, p.c[dark]);
      if (!(mask & E)) rect(ctx, px + CELL - 2, py, 2, CELL, p.c[dark]);
    });
  };

type PathMarks = (
  pt: Paint,
  light: string,
  px: number,
  py: number,
  mask: number,
  cell: number,
) => void;

const PATH_MARKS: Record<"water" | "dirt" | "road", PathMarks> = {
  // Highlights run downstream, one pixel per tick.
  water(pt, light, px, py, _mask, cell) {
    for (let i = 0; i < 4; i++) {
      const ly = (Math.floor(pt.rnd(cell + i * 97) * 16) + pt.tick) % 16;
      const lx = 2 + Math.floor(pt.rnd(cell * 5 + i) * 11);
      rect(pt.ctx, px + lx, py + ly, 1, 3, light);
    }
  },
  dirt(pt, light, px, py, _mask, cell) {
    for (let i = 0; i < 4; i++) {
      rect(
        pt.ctx,
        px + Math.floor(pt.rnd(cell * 7 + i) * 15),
        py + Math.floor(pt.rnd(cell * 11 + i) * 15),
        1,
        1,
        light,
      );
    }
  },
  // Centre line along the road's direction.
  road(pt, _light, px, py, mask) {
    const { ctx, p } = pt;
    if (mask & (N | S)) {
      for (let y = 1; y < CELL; y += 6)
        rect(ctx, px + 7, py + y, 2, 3, p.c.paint);
    } else if (mask & (E | W)) {
      for (let x = 1; x < CELL; x += 6)
        rect(ctx, px + x, py + 7, 3, 2, p.c.paint);
    }
  },
};

/** Rain clouds go grey; night clouds go blue. */
function cloudColors(atm: Atmosphere, p: Palette) {
  if (atm.weather === "Storm" || atm.weather === "Rain")
    return { body: "#8a90a3", shade: "#646a7d" };
  if (p.dark) return { body: "#4a5272", shade: "#363d59" };
  return { body: p.c.cloud, shade: p.c.cloudShade };
}

/** Stand-in for elements without a painter until their tiles load. */
const swatch: Painter = (pt) => {
  const color = ELEMENTS_BY_ID.get(pt.g.elementId)?.color ?? "#888888";
  eachCell(pt, (px, py, mask) => {
    const l = mask & W ? 0 : 2;
    const r = mask & E ? 0 : 2;
    const t = mask & N ? 0 : 2;
    const b = mask & S ? 0 : 2;
    rect(pt.ctx, px + l, py + t, CELL - l - r, CELL - t - b, color);
  });
};

const PAINTERS: Record<string, Painter> = {
  celestial(pt) {
    const { ctx, x, y, w, h, tick, atm } = pt;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.max(3, Math.floor(Math.min(w, h) / 2) - 3);
    const element = ELEMENTS_BY_ID.get("celestial");
    const moon = element && elementLabel(element, atm.time).label === "Moon";
    if (moon) {
      disc(ctx, cx, cy, r + 2, "rgba(220,228,255,0.12)");
      disc(ctx, cx, cy, r, "#e8ecf7");
      disc(
        ctx,
        cx + r * 0.45,
        cy - r * 0.35,
        Math.max(1, r * 0.75),
        "rgba(28,37,71,0.92)",
      );
      rect(ctx, cx - r * 0.5, cy + r * 0.2, 2, 2, "#c9d0e2");
      return;
    }
    const step = Math.floor(tick / 4) % 2;
    ctx.fillStyle = "rgba(255,226,122,0.6)";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + step * (Math.PI / 8);
      const d = r + 3;
      ctx.fillRect(
        Math.round(cx + Math.cos(a) * d),
        Math.round(cy + Math.sin(a) * d),
        2,
        2,
      );
    }
    disc(ctx, cx, cy, r + 1, "#ffcf4a");
    disc(ctx, cx, cy, r, "#ffe27a");
    disc(ctx, cx - r / 3, cy - r / 3, Math.max(1, r / 3), "#fff3c0");
  },

  clouds(pt) {
    const { ctx, x, y, w, h, tick, p, atm } = pt;
    const drift = Math.round(tri(tick + (pt.seed % 40), 96) * 3);
    const { body, shade } = cloudColors(atm, p);
    const puffs = Math.max(2, Math.round(w / 9));
    const base = y + h - 3;
    for (let i = 0; i < puffs; i++) {
      const r = Math.max(3, Math.min(h / 2 - 1, 4 + pt.rnd(i) * 5));
      const cx = x + 4 + ((i + 0.5) * (w - 8)) / puffs + drift;
      disc(ctx, cx, base - r + 2, r, shade);
      disc(ctx, cx, base - r, r, body);
    }
    rect(ctx, x + 4 + drift, base - 3, w - 8, 3, body);
    rect(ctx, x + 4 + drift, base - 1, w - 8, 1, shade);
  },

  birds(pt) {
    const { ctx, x, y, tick, p } = pt;
    const color = p.dark ? "#c9d0e2" : "#2a2f3d";
    for (let i = 0; i < 3; i++) {
      const bx = x + 3 + i * 4 + Math.round(tri(tick + i * 5, 48) * 1);
      const by = y + 5 + (i % 2) * 4;
      const up = (tick + i * 2) % 6 < 3;
      rect(ctx, bx, by, 1, 1, color);
      rect(ctx, bx - 1, by - (up ? 1 : 0), 1, 1, color);
      rect(ctx, bx + 1, by - (up ? 1 : 0), 1, 1, color);
      rect(ctx, bx - 2, by - (up ? 2 : -1), 1, 1, color);
      rect(ctx, bx + 2, by - (up ? 2 : -1), 1, 1, color);
    }
  },

  rainbow(pt) {
    const { ctx, x, y, w, h, tick, atm } = pt;
    if (atm.time === "night") {
      // Aurora: vertical curtains that wave on the clock.
      const colors = [
        "rgba(74,222,128,0.55)",
        "rgba(45,212,191,0.45)",
        "rgba(167,139,250,0.4)",
      ];
      for (let i = 0; i < w; i += 2) {
        const wave = Math.sin(i / 6 + tick / 6) * (h / 5);
        const len = h * (0.5 + 0.3 * Math.sin(i / 9 + tick / 10));
        rect(
          ctx,
          x + i,
          y + h / 4 + wave,
          2,
          len,
          colors[Math.floor(i / 6) % 3],
        );
      }
      return;
    }
    const colors = [
      "#ef4444",
      "#f97316",
      "#facc15",
      "#4ade80",
      "#60a5fa",
      "#a78bfa",
    ];
    const cx = x + w / 2;
    const r0 = Math.min(w / 2, h * 1.4);
    ctx.globalAlpha = 0.7;
    colors.forEach((color, i) => {
      const r = r0 - i * 2;
      ctx.fillStyle = color;
      for (let dx = -r; dx <= r; dx++) {
        const dy = Math.sqrt(Math.max(0, r * r - dx * dx));
        ctx.fillRect(
          Math.round(cx + dx),
          Math.round(y + h - dy * (h / r0) * 0.95),
          1,
          2,
        );
      }
    });
    ctx.globalAlpha = 1;
  },

  balloon(pt) {
    const { ctx, x, y, tick } = pt;
    const bob = Math.round(tri(tick, 36));
    const cx = x + 8;
    const cy = y + 6 + bob;
    disc(ctx, cx, cy, 5, "#fb7185");
    rect(ctx, cx - 1, cy - 5, 2, 10, "#fde68a");
    rect(ctx, cx - 4, cy - 1, 1, 4, "#be123c");
    rect(ctx, cx - 1, cy + 6, 1, 2, "#57534e");
    rect(ctx, cx + 1, cy + 6, 1, 2, "#57534e");
    rect(ctx, cx - 2, cy + 8, 5, 3, "#a16207");
  },

  mountains(pt) {
    const { ctx, x, y, w, h, p, atm } = pt;
    const peaks = Math.max(2, Math.round(w / 22));
    const heights: number[] = [];
    for (let i = 0; i < w; i++) {
      let best = 0;
      for (let k = 0; k < peaks; k++) {
        const px = ((k + 0.5) / peaks) * w + (pt.rnd(k) - 0.5) * 10;
        const ph = h * (0.6 + pt.rnd(k + 9) * 0.4);
        best = Math.max(best, ph - Math.abs(i - px) * 0.9);
      }
      heights.push(Math.max(0, Math.round(best)));
    }
    const snowy = atm.season === "Winter" ? 0.45 : 0.18;
    heights.forEach((hh, i) => {
      const top = y + h - hh;
      const shade = i > 0 && heights[i - 1] > hh ? p.c.rockDark : p.c.rock;
      rect(ctx, x + i, top, 1, hh, shade);
      if (hh > h * 0.6)
        rect(ctx, x + i, top, 1, Math.max(1, Math.round(hh * snowy)), p.c.snow);
      else rect(ctx, x + i, top, 1, 1, p.c.rockLight);
    });
  },

  hills(pt) {
    const { ctx, x, y, w, h, p } = pt;
    for (let i = 0; i < w; i++) {
      const top = Math.round(
        h * (0.45 - 0.3 * Math.sin(i / (w / 3) + pt.rnd(1) * 6)),
      );
      rect(ctx, x + i, y + top, 1, h - top, p.c.grass);
      rect(ctx, x + i, y + top, 1, 2, p.c.grassLight);
      if ((i + top) % 5 === 0)
        rect(ctx, x + i, y + top + 4 + (i % 3), 1, 1, p.c.foliageDark);
    }
  },

  treeline(pt) {
    const { x, y, w, h, tick } = pt;
    const sway = Math.floor(tick / 8) % 2;
    for (let i = 0; i < w; i += 5) {
      const height = Math.min(h, 8 + Math.floor(pt.rnd(i) * 8));
      conifer(pt, x + i + 2, y + h, height, (i / 5) % 2 ? sway : 0);
    }
  },

  forest(pt) {
    const { x, y, w, h, tick, g } = pt;
    const sway = Math.floor(tick / 8) % 2;
    if (g.shape === "row" || g.shape === "single") {
      // A strip reads as a row of single trees.
      for (let i = 0; i < w; i += 6)
        conifer(
          pt,
          x + i + 3,
          y + h,
          Math.min(h, 10 + Math.floor(pt.rnd(i) * 5)),
          sway,
        );
      return;
    }
    if (g.shape === "column") {
      for (let row = 0; row < g.rect.h; row++) {
        conifer(
          pt,
          x + w / 2,
          y + (row + 1) * CELL,
          CELL - 1,
          row % 2 ? sway : 0,
        );
      }
      return;
    }
    // Squares and masses read as one canopy with trunks underneath.
    canopy(pt, y + 1, x, w, y + h - 4, sway);
    for (let i = 3; i < w; i += 6)
      rect(pt.ctx, x + i, y + h - 4, 2, 4, pt.p.c.trunk);
  },

  "tall-tree"(pt) {
    const { ctx, x, y, w, h, tick, p } = pt;
    const sway = Math.floor(tick / 8) % 2;
    const cx = x + w / 2;
    rect(ctx, cx - 2, y + h * 0.4, 4, h * 0.6, p.c.trunk);
    rect(ctx, cx - 2, y + h * 0.4, 1, h * 0.6, p.c.wood);
    const r = Math.max(5, Math.min(w / 2 + 3, h * 0.25));
    disc(ctx, cx + sway, y + r + 1, r, p.c.foliageDark);
    disc(ctx, cx - 3 + sway, y + r + 3, r - 2, p.c.foliage);
    disc(ctx, cx + 3 + sway, y + r * 1.6, r - 2, p.c.foliage);
    disc(ctx, cx - 2 + sway, y + r - 1, Math.max(1, r - 4), p.c.foliageLight);
  },

  rocks(pt) {
    const { ctx, x, y, w, h, p } = pt;
    const count = Math.max(1, Math.round((w * h) / 200));
    for (let i = 0; i < count; i++) {
      const r = Math.max(3, Math.min(h / 2, 4 + pt.rnd(i) * 5));
      const cx = x + r + pt.rnd(i + 3) * Math.max(1, w - r * 2);
      const cy = y + h - r;
      disc(ctx, cx, cy, r, p.c.rockDark);
      disc(ctx, cx - 1, cy - 1, r - 1, p.c.rock);
      rect(ctx, cx - r / 2, cy - r / 2, 2, 1, p.c.rockLight);
    }
  },

  bushes(pt) {
    const { ctx, x, y, w, h, tick, p } = pt;
    const sway = Math.floor(tick / 10) % 2;
    for (let i = 0; i < w; i += 8) {
      const r = Math.min(h / 2, 5 + pt.rnd(i) * 2);
      disc(ctx, x + i + 5 + (i % 16 ? sway : 0), y + h - r, r, p.c.foliage);
      disc(ctx, x + i + 4, y + h - r - 1, r - 2, p.c.foliageLight);
      rect(ctx, x + i + 7, y + h - r, 1, 1, "#e11d48");
    }
  },

  flowers(pt) {
    const { ctx, x, y, tick, p } = pt;
    const petals = [p.c.petal1, p.c.petal2, p.c.petal3];
    for (let i = 0; i < 4; i++) {
      const fx = x + 2 + i * 4;
      const fy = y + 7 + Math.floor(pt.rnd(i) * 4);
      const sway = (tick + i * 3) % 16 < 8 ? 0 : 1;
      rect(ctx, fx, fy + 2, 1, CELL - fy + y - 2, p.c.foliage);
      rect(ctx, fx - 1 + sway, fy, 3, 3, petals[i % 3]);
      rect(ctx, fx + sway, fy + 1, 1, 1, "#fff7d6");
    }
  },

  mushrooms(pt) {
    const { ctx, x, y } = pt;
    for (let i = 0; i < 3; i++) {
      const mx = x + 2 + i * 5;
      const size = 2 + (i % 2);
      rect(ctx, mx + 1, y + 11, 2, 5, "#f5ecd7");
      rect(ctx, mx - size + 2, y + 11 - size, size * 2, size, "#dc2626");
      rect(ctx, mx + 1, y + 10 - size, 1, 1, "#fff");
    }
  },

  trail: flowingPath("dirt", "dirtLight", "sandDark", "dirt"),
  river: flowingPath("water", "waterLight", "waterDark", "water"),
  stream: flowingPath("water", "foam", "waterDark", "water"),
  road: flowingPath("asphalt", "paint", "builtDark", "road"),
  lake: waterBody,
  pond: waterBody,

  waterfall(pt) {
    const { ctx, tick, p } = pt;
    eachCell(pt, (px, py, mask, cell) => {
      rect(ctx, px, py, CELL, CELL, p.c.water);
      for (let i = 0; i < 5; i++) {
        const lx = 1 + i * 3 + Math.floor(pt.rnd(cell + i) * 2);
        const ly = (Math.floor(pt.rnd(cell * 13 + i) * 16) + tick * 2) % 16;
        rect(ctx, px + lx, py + ly, 1, 4, p.c.foam);
        rect(ctx, px + lx, py + ((ly + 8) % 16), 1, 2, p.c.waterLight);
      }
      // Rock lips on the open sides; merged waterfalls lose the lip between them.
      if (!(mask & W)) rect(ctx, px, py, 2, CELL, p.c.rockDark);
      if (!(mask & E)) rect(ctx, px + CELL - 2, py, 2, CELL, p.c.rockDark);
      if (!(mask & N)) rect(ctx, px, py, CELL, 2, p.c.rock);
      if (!(mask & S)) {
        // Mist pool at the foot.
        for (let i = 0; i < 6; i++) {
          const fx = (i * 3 + (tick % 2)) % CELL;
          rect(ctx, px + fx, py + CELL - 3 - (i % 2), 2, 2, p.c.foam);
        }
      }
    });
  },

  sea(pt) {
    const { ctx, x, y, w, h, tick, p } = pt;
    rect(ctx, x, y, w, h, p.c.water);
    rect(ctx, x, y, w, 1, p.c.waterLight);
    for (let row = 3; row < h; row += 4) {
      const offset = (Math.floor(tick / 2) + row * 3) % 8;
      for (let i = -8 + offset; i < w; i += 8)
        rect(ctx, x + i, y + row, 3, 1, p.c.waterLight);
    }
    rect(ctx, x, y + h - 2, w, 2, p.c.waterDark);
  },

  beach(pt) {
    const { ctx, x, y, w, h, tick, p } = pt;
    rect(ctx, x, y, w, h, p.c.sand);
    const reach = Math.round((tri(tick, 60) + 1) * 1.5);
    rect(ctx, x, y, w, 2 + reach, p.c.sandDark);
    for (let i = 0; i < w; i += 3)
      if ((i + reach) % 4 === 0)
        rect(ctx, x + i, y + 2 + reach, 2, 1, p.c.foam);
    for (let i = 0; i < (w * h) / 40; i++)
      rect(
        ctx,
        x + pt.rnd(i) * w,
        y + 5 + pt.rnd(i + 99) * (h - 6),
        1,
        1,
        p.c.sandDark,
      );
  },

  cliffs(pt) {
    const { ctx, x, y, w, h, p } = pt;
    rect(ctx, x, y, w, h, p.c.rock);
    for (let i = 0; i < w; i += 4)
      rect(ctx, x + i, y + 3, 1, h - 3, p.c.rockDark);
    for (let j = 6; j < h; j += 7) rect(ctx, x, y + j, w, 1, p.c.rockLight);
    rect(ctx, x, y, w, 3, p.c.grass);
    for (let i = 0; i < w; i += 3)
      rect(ctx, x + i, y + 3, 1, 1 + (i % 2), p.c.grass);
  },

  lighthouse(pt) {
    const { ctx, x, y, w, h, tick, p } = pt;
    const cx = x + w / 2;
    const tw = Math.max(4, Math.min(8, w - 4));
    const top = y + 8;
    for (let j = top; j < y + h; j++) {
      const band = Math.floor((j - top) / 5) % 2 === 0;
      rect(ctx, cx - tw / 2, j, tw, 1, band ? p.c.white : p.c.red);
    }
    rect(ctx, cx - tw / 2 - 1, top - 1, tw + 2, 2, p.c.builtDark);
    rect(ctx, cx - 2, top - 5, 4, 4, p.night ? GLOW : "#fde68a");
    rect(ctx, cx - 3, top - 7, 6, 2, p.c.red);
    if (p.night) {
      const frame = Math.floor(tick / 3) % 4;
      const dir = frame < 2 ? 1 : -1;
      const len = frame % 2 ? 14 : 24;
      ctx.fillStyle = "rgba(255,210,122,0.35)";
      ctx.fillRect(
        Math.round(dir > 0 ? cx + 2 : cx - 2 - len),
        top - 4,
        len,
        2,
      );
    }
  },

  palm(pt) {
    const { ctx, x, y, w, h, tick, p } = pt;
    const sway = Math.round(tri(tick, 40));
    const cx = x + w / 2;
    for (let j = 0; j < h - 6; j++) {
      const bend = Math.round(Math.sin((j / h) * 1.6) * 3);
      rect(
        ctx,
        cx - 1 + bend,
        y + h - j,
        3,
        1,
        j % 3 === 0 ? p.c.trunk : p.c.wood,
      );
    }
    const tx = cx + 2 + sway;
    const ty = y + 6;
    for (let k = -1; k <= 1; k += 2) {
      for (let i = 0; i < 8; i++) {
        rect(
          ctx,
          tx + k * i,
          ty + Math.floor((i * i) / 12),
          2,
          2,
          i < 4 ? p.c.foliage : p.c.foliageDark,
        );
        rect(
          ctx,
          tx + k * i * 0.6,
          ty - 2 + Math.floor((i * i) / 20),
          1,
          1,
          p.c.foliageLight,
        );
      }
    }
    disc(ctx, tx, ty + 2, 2, p.c.trunk);
  },

  boat(pt) {
    const { ctx, x, y, tick, p } = pt;
    const bob = tick % 24 < 12 ? 0 : 1;
    rect(ctx, x, y + 9, CELL, 7, p.c.water);
    rect(ctx, x + 2, y + 10 + bob, 12, 2, p.c.wood);
    rect(ctx, x + 3, y + 12 + bob, 10, 1, p.c.trunk);
    rect(ctx, x + 7, y + 2 + bob, 1, 8, p.c.trunk);
    rect(ctx, x + 8, y + 3 + bob, 4, 5, p.c.white);
    rect(ctx, x, y + 14, CELL, 1, p.c.waterLight);
  },

  pier(pt) {
    const { ctx, x, y, w, h, p } = pt;
    const deck = y + Math.max(2, h - 9);
    for (let i = 2; i < w; i += 6)
      rect(ctx, x + i, deck, 2, y + h - deck, p.c.trunk);
    rect(ctx, x, deck, w, 3, p.c.woodLight);
    for (let i = 0; i < w; i += 4) rect(ctx, x + i, deck, 1, 3, p.c.wood);
  },

  skyline(pt) {
    const { ctx, x, y, w, h, p } = pt;
    let i = 0;
    let n = 0;
    while (i < w) {
      const bw = 5 + Math.floor(pt.rnd(n) * 7);
      const bh = Math.round(h * (0.35 + pt.rnd(n + 50) * 0.65));
      rect(
        ctx,
        x + i,
        y + h - bh,
        bw - 1,
        bh,
        n % 2 ? p.c.builtDark : p.c.built,
      );
      for (let wy = y + h - bh + 2; wy < y + h - 2; wy += 3) {
        for (let wx = x + i + 1; wx < x + i + bw - 2; wx += 2) {
          if (windowLit(pt, wx * 31 + wy)) rect(ctx, wx, wy, 1, 1, GLOW);
        }
      }
      i += bw;
      n++;
    }
  },

  building(pt) {
    const { ctx, x, y, w, h, p } = pt;
    rect(ctx, x + 1, y + 2, w - 2, h - 2, p.c.built);
    rect(ctx, x + 1, y + 2, w - 2, 2, p.c.builtLight);
    rect(ctx, x + w - 3, y + 4, 2, h - 4, p.c.builtDark);
    for (let wy = y + 6; wy < y + h - 4; wy += 5) {
      for (let wx = x + 4; wx < x + w - 5; wx += 5) {
        rect(
          ctx,
          wx,
          wy,
          3,
          3,
          windowLit(pt, wx * 17 + wy) ? GLOW : p.c.builtDark,
        );
      }
    }
    rect(ctx, x + w / 2 - 2, y + h - 5, 4, 5, p.c.builtDark);
  },

  house(pt) {
    const { ctx, x, y, w, h, tick, p } = pt;
    const roofH = Math.max(4, Math.round(h * 0.4));
    const wallTop = y + roofH;
    rect(ctx, x + 2, wallTop, w - 4, h - roofH, p.c.woodLight);
    for (let j = 0; j < roofH; j++) {
      const inset = Math.round(((roofH - j) / roofH) * (w / 2 - 1));
      rect(
        ctx,
        x + inset,
        y + j,
        Math.max(1, w - inset * 2),
        1,
        j % 2 ? p.c.roof : p.c.red,
      );
    }
    rect(ctx, x + w / 2 - 2, y + h - 6, 4, 6, p.c.trunk);
    for (let wx = x + 4; wx < x + w - 6; wx += 8)
      rect(
        ctx,
        wx,
        wallTop + 3,
        3,
        3,
        windowLit(pt, wx) || p.night ? GLOW : "#9cc4e4",
      );
    // Chimney smoke rises and resets.
    rect(ctx, x + w - 6, y + 1, 2, 4, p.c.builtDark);
    const puff = tick % 18;
    if (puff < 12)
      rect(
        ctx,
        x + w - 6 + Math.floor(puff / 6),
        y - Math.floor(puff / 3) + 1,
        2,
        2,
        "rgba(220,224,235,0.6)",
      );
  },

  "street-lamp"(pt) {
    const { ctx, x, y, w, h, tick, p } = pt;
    const cx = x + w / 2;
    rect(ctx, cx - 1, y + 4, 2, h - 4, p.c.builtDark);
    rect(ctx, cx - 3, y + h - 2, 6, 2, p.c.builtDark);
    rect(ctx, cx - 3, y + 2, 6, 3, p.c.builtDark);
    const on = p.night && tick % 53 !== 0;
    rect(ctx, cx - 2, y + 4, 4, 2, on ? GLOW : "#cbd5e1");
    if (on) disc(ctx, cx, y + 6, 6, "rgba(255,210,122,0.18)");
  },

  fence(pt) {
    const { ctx, x, y, w, h, p } = pt;
    const base = y + h;
    for (let i = 1; i < w; i += 5)
      rect(ctx, x + i, base - 9, 2, 9, p.c.woodLight);
    rect(ctx, x, base - 7, w, 1, p.c.wood);
    rect(ctx, x, base - 4, w, 1, p.c.wood);
  },

  bench(pt) {
    const { ctx, x, y, p } = pt;
    rect(ctx, x + 2, y + 8, 12, 2, p.c.woodLight);
    rect(ctx, x + 2, y + 5, 12, 2, p.c.wood);
    rect(ctx, x + 3, y + 10, 1, 5, p.c.builtDark);
    rect(ctx, x + 12, y + 10, 1, 5, p.c.builtDark);
  },
};

// ---------------------------------------------------------------------------
// Background and weather
// ---------------------------------------------------------------------------

function paintBackground(ctx: CanvasRenderingContext2D, frame: SceneFrame) {
  const p = palette(frame.atmosphere);
  const skyEnd = frame.starts.far * CELL;
  // Sky in two-pixel bands for a stepped gradient.
  for (let y = 0; y < skyEnd + CELL; y += 2) {
    const t = Math.min(1, y / Math.max(1, skyEnd));
    rect(
      ctx,
      0,
      y,
      frame.cols * CELL,
      2,
      css(mix(p.skyTop, p.skyBottom, Math.round(t * 8) / 8)),
    );
  }
  if (p.night) paintStars(ctx, frame, p);
  if (!paintGround(ctx, frame)) paintPlainLand(ctx, frame, p);
}

/** Twinkling stars; fewer are lit while the sky is still light. */
function paintStars(
  ctx: CanvasRenderingContext2D,
  frame: SceneFrame,
  p: Palette,
) {
  const { cols, starts, tick } = frame;
  const width = cols * CELL;
  const skyEnd = starts.far * CELL;
  const threshold = p.dark ? 4 : 30;
  for (let i = 0; i < cols * starts.far * 2; i++) {
    if ((tick + i * 7) % 48 <= threshold) continue;
    const sx = Math.floor(hash(i) * width);
    const sy = Math.floor(hash(i + 999) * skyEnd);
    const color = i % 9 === 0 ? "#ffffff" : "rgba(226,232,255,0.7)";
    rect(ctx, sx, sy, 1, 1, color);
  }
}

/** Flat land in three bands with swaying tufts, until ground tiles load. */
function paintPlainLand(
  ctx: CanvasRenderingContext2D,
  frame: SceneFrame,
  p: Palette,
) {
  const { cols, rows, starts, atmosphere, tick } = frame;
  const width = cols * CELL;
  const skyEnd = starts.far * CELL;
  const far = palette(atmosphere, 0.25);
  rect(ctx, 0, skyEnd, width, (starts.mid - starts.far) * CELL, far.c.farLand);
  rect(ctx, 0, skyEnd, width, 1, css(mix(p.skyBottom, [255, 255, 255], 0.3)));
  rect(
    ctx,
    0,
    starts.mid * CELL,
    width,
    (starts.front - starts.mid) * CELL,
    p.c.meadow,
  );
  rect(
    ctx,
    0,
    starts.front * CELL,
    width,
    (rows - starts.front) * CELL,
    p.c.grass,
  );
  // Grass tufts sway on the clock.
  for (let i = 0; i < cols * (rows - starts.mid) * 3; i++) {
    const gx = Math.floor(hash(i + 5000) * width);
    const gy =
      starts.mid * CELL +
      Math.floor(hash(i + 7000) * (rows - starts.mid) * CELL);
    const sway = (tick + i) % 24 < 12 ? 0 : 1;
    rect(
      ctx,
      gx + sway,
      gy,
      1,
      2,
      gy > starts.front * CELL ? p.c.grassLight : p.c.grass,
    );
  }
}

/** Land from the ground tile sheet; false when it has not loaded. */
function paintGround(ctx: CanvasRenderingContext2D, frame: SceneFrame) {
  const set = currentTileSet();
  if (!set?.index.sheets.ground) return false;
  const { cols, rows, starts, atmosphere, tick } = frame;
  const near = gradeFor(palette(atmosphere), atmosphere, true);
  // Lighter haze than far elements get: the land itself is already muted.
  const far = gradeFor(palette(atmosphere, 0.12), atmosphere, true);
  for (let row = starts.far; row < rows; row++) {
    const zone = zoneOfRow(row, starts) as (typeof GROUND_ZONES)[number];
    for (let col = 0; col < cols; col++) {
      const cell = row * cols + col;
      drawTile({
        ctx,
        set,
        sheet: "ground",
        key: groundKey(zone, Math.floor(hash(cell * 13 + 7) * GROUND_ALTS)),
        px: col * CELL,
        py: row * CELL,
        tick,
        grade: zone === "far" ? far : near,
      });
    }
  }
  return true;
}

function paintWeather(ctx: CanvasRenderingContext2D, frame: SceneFrame) {
  const { cols, rows, atmosphere, tick } = frame;
  const width = cols * CELL;
  const height = rows * CELL;
  const { weather } = atmosphere;
  if (weather === "Rain" || weather === "Storm") {
    ctx.fillStyle = "rgba(186,206,235,0.45)";
    const count = cols * rows * 0.6;
    for (let i = 0; i < count; i++) {
      const rx = Math.floor(hash(i) * width);
      const ry = (Math.floor(hash(i + 3) * height) + tick * 6) % height;
      ctx.fillRect(rx, ry, 1, 3);
    }
    // A flash now and then on the running clock; tick 0, which exports and
    // reduced motion show, is never one.
    if (weather === "Storm" && tick % 97 >= 95) {
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(0, 0, width, height);
    }
  } else if (weather === "Snow") {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = 0; i < cols * rows * 0.4; i++) {
      const sx =
        (Math.floor(hash(i) * width) + Math.round(tri(tick + i, 24))) % width;
      const sy = (Math.floor(hash(i + 3) * height) + tick) % height;
      ctx.fillRect(sx, sy, 1, 1);
    }
  } else if (weather === "Fog") {
    for (let band = 0; band < 3; band++) {
      const y = ((band * height) / 3 + Math.floor(tick / 4)) % height;
      ctx.fillStyle = "rgba(220,226,238,0.12)";
      ctx.fillRect(0, y, width, height / 5);
    }
  } else if (weather === "Wind") {
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i < rows; i++) {
      const wx = ((Math.floor(hash(i) * width) + tick * 4) % (width + 20)) - 20;
      ctx.fillRect(wx, Math.floor(hash(i + 8) * height), 8, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Seams between neighbours
// ---------------------------------------------------------------------------

/** Elements that fill their cells completely, and the colour they bleed. */
const FILL_SEAM: Record<string, ColorName> = {
  river: "water",
  stream: "water",
  waterfall: "water",
  lake: "water",
  pond: "water",
  sea: "water",
  beach: "sand",
  trail: "dirt",
  road: "asphalt",
  cliffs: "rockDark",
};

/**
 * Connects a group to its surroundings. Ground-covering elements bleed their
 * colour two pixels into open neighbours in a thinning dither, so water and
 * sand fray into the meadow instead of ending in a hard line. Objects that
 * stand on the ground cast a short contact shadow instead.
 */
function paintSeams(
  ctx: CanvasRenderingContext2D,
  g: TileGroup,
  frame: SceneFrame,
  p: Palette,
  overlays: boolean,
) {
  const material = MATERIALS[g.elementId];
  if (material === "air" || material === "cloud") return;
  // Riders float on their host; it already has its seams.
  if (ELEMENTS_BY_ID.get(g.elementId)?.on) return;
  const { cols, rows, tick } = frame;
  const fill = FILL_SEAM[g.elementId];
  // With tile overlays loaded, edge and combo tiles replace the dither.
  if (fill && overlays) return;
  for (const cell of g.cells) {
    const open = openSides(g, cell, cols, rows);
    const px = (cell % cols) * CELL;
    const py = Math.floor(cell / cols) * CELL;
    if (!fill) {
      if (open.s) contactShadow(ctx, px, py);
      continue;
    }
    ctx.fillStyle = p.c[fill];
    bleed(ctx, open, px, py);
    // Waterfalls throw spray onto whatever is below their foot.
    if (g.elementId === "waterfall" && open.s) spray(ctx, p, px, py, tick);
  }
}

interface OpenSides {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

/** Sides of a group cell that face another grid cell outside the group. */
function openSides(
  g: TileGroup,
  cell: number,
  cols: number,
  rows: number,
): OpenSides {
  const mask = cellMask(g.set, cell, cols, rows);
  const col = cell % cols;
  const row = Math.floor(cell / cols);
  return {
    n: !(mask & N) && row > 0,
    e: !(mask & E) && col < cols - 1,
    s: !(mask & S) && row < rows - 1,
    w: !(mask & W) && col > 0,
  };
}

function spray(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  px: number,
  py: number,
  tick: number,
) {
  ctx.fillStyle = p.c.foam;
  for (let i = 0; i < 5; i++) {
    const sx = px + ((i * 5 + tick) % CELL);
    ctx.fillRect(sx, py + CELL + 1 + ((i + tick) % 3), 1, 1);
  }
}

/** Short dithered shadow under an object standing on the ground. */
function contactShadow(ctx: CanvasRenderingContext2D, px: number, py: number) {
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(px + 1, py + CELL, CELL - 2, 1);
  for (let i = 2; i < CELL - 2; i += 2)
    ctx.fillRect(px + i, py + CELL + 1, 1, 1);
}

const even = (i: number) => i % 2 === 0;
const odd = (i: number) => i % 2 === 1;

/**
 * Bleeds the current fill colour two pixels past each open side: every
 * other pixel next to the cell, every fourth one pixel further out.
 */
function bleed(
  ctx: CanvasRenderingContext2D,
  open: OpenSides,
  px: number,
  py: number,
) {
  const dots = (
    x: number,
    y: number,
    along: "x" | "y",
    keep: (i: number) => boolean,
  ) => {
    for (let i = 0; i < CELL; i++)
      if (keep(i))
        ctx.fillRect(
          along === "x" ? x + i : x,
          along === "y" ? y + i : y,
          1,
          1,
        );
  };
  if (open.w) {
    dots(px - 1, py, "y", even);
    dots(px - 2, py, "y", (i) => i % 4 === 1);
  }
  if (open.e) {
    dots(px + CELL, py, "y", odd);
    dots(px + CELL + 1, py, "y", (i) => i % 4 === 3);
  }
  if (open.s) {
    dots(px, py + CELL, "x", even);
    dots(px, py + CELL + 1, "x", (i) => i % 4 === 1);
  }
  if (open.n) dots(px, py - 1, "x", odd);
}

// ---------------------------------------------------------------------------
// Blender tiles
// ---------------------------------------------------------------------------

/** Tile animations step every third tick: 4 fps on the 12 fps clock. */
const TILE_STEP = 3;

const SEASON_FILTER: Record<string, string> = {
  Spring: "saturate(1.15) brightness(1.04)",
  Summer: "none",
  Autumn: "hue-rotate(-48deg) saturate(1.35)",
  Winter: "saturate(0.35) brightness(1.22)",
};

function gradeFor(p: Palette, atm: Atmosphere, seasonal: boolean): Grade {
  return {
    light: p.light,
    haze: p.skyBottom,
    hazeAmount: p.haze,
    filter: seasonal ? (SEASON_FILTER[atm.season] ?? "none") : "none",
  };
}

interface TileDraw {
  ctx: CanvasRenderingContext2D;
  set: TileSet;
  sheet: string;
  key: string;
  px: number;
  py: number;
  tick: number;
  grade: Grade;
}

/** Draws one tile; false when the sheet does not have it. */
function drawTile({ ctx, set, sheet, key, px, py, tick, grade }: TileDraw) {
  const entry = set.index.sheets[sheet]?.tiles[key];
  const image = set.images.get(sheet);
  if (!entry || !image) return false;
  const [row, frames] = entry;
  const sx = (Math.floor(tick / TILE_STEP) % frames) * CELL;
  const sy = row * CELL;
  ctx.drawImage(
    gradedSheet(image, sheet, grade),
    sx,
    sy,
    CELL,
    CELL,
    px,
    py,
    CELL,
    CELL,
  );
  const glow = set.glows.get(sheet);
  if (glow) ctx.drawImage(glow, sx, sy, CELL, CELL, px, py, CELL, CELL);
  return true;
}

/** Whether every cell of a group has a tile, so it can skip its painter. */
function canTile(set: TileSet, g: TileGroup) {
  return Boolean(TILE_SPECS[g.elementId] && set.index.sheets[g.elementId]);
}

function paintTiles(
  ctx: CanvasRenderingContext2D,
  set: TileSet,
  g: TileGroup,
  frame: SceneFrame,
  p: Palette,
) {
  const spec = TILE_SPECS[g.elementId];
  const shape = tileShape(spec, g.shape);
  const variant = tileVariant(g.elementId, frame.atmosphere.time);
  const grade = gradeFor(
    p,
    frame.atmosphere,
    SEASONAL.has(MATERIALS[g.elementId]),
  );
  const alts = spec.alts ?? 1;
  const salt = seedOf(g.elementId);
  for (const cell of g.cells) {
    const mask =
      shape === "single" ? 0 : tileMask(g, cell, frame.cols, frame.rows);
    const pickBy = spec.altByRow ? Math.floor(cell / frame.cols) * 97 : cell;
    const alt = Math.floor(hash(salt + pickBy * 31) * alts);
    const draw = {
      ctx,
      set,
      sheet: g.elementId,
      px: (cell % frame.cols) * CELL,
      py: Math.floor(cell / frame.cols) * CELL,
      tick: frame.tick,
      grade,
    };
    if (!drawTile({ ...draw, key: tileKey(shape, mask, variant, alt) }))
      drawTile({ ...draw, key: tileKey(shape, mask, "base", alt) });
  }
}

const SEASONAL = new Set<Material>(["foliage", "ground"]);

const SIDE_STEP: Record<Side, [number, number]> = {
  N: [0, -1],
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0],
};

/** Whether a group cell is its column's top or foot, or a path's end. */
function atEdge(
  g: TileGroup,
  cell: number,
  at: NonNullable<Combo["at"]>,
  frame: SceneFrame,
) {
  const { cols, rows } = frame;
  if (at === "end") return atPathEnd(g, cell, frame.placements, cols, rows);
  return !g.set.has(at === "top" ? cell - cols : cell + cols);
}

/**
 * Whether a cell is at a path's start or stop. Paths record those cross-
 * sections, so a river two cells wide ends in both of its last cells; one
 * without them (from before ends were kept) falls back to cells with at
 * most one neighbour.
 */
export function atPathEnd(
  g: TileGroup,
  cell: number,
  placements: Placement[],
  cols: number,
  rows: number,
) {
  const path = placements.find(
    (p) => g.keys.includes(p.key) && p.cells.includes(cell),
  );
  if (path?.ends) return path.ends.includes(cell);
  const mask = cellMask(g.set, cell, cols, rows);
  return [N, E, S, W].filter((bit) => mask & bit).length <= 1;
}

/**
 * Overlays where neighbours meet: material edges (grass over a shore) and
 * combos (a waterfall splashing into a lake). Each is drawn on the receiving
 * cell; only settled groups take part, so stamp-ins stay clean. They are
 * drawn before objects, so on an object's cell a combo such as lamplight
 * under a bench lies on the ground beneath it.
 */
function paintOverlays(
  ctx: CanvasRenderingContext2D,
  set: TileSet,
  frame: SceneFrame,
  groupOf: Map<number, TileGroup>,
  riderOf: Map<number, TileGroup>,
  settled: Set<TileGroup>,
) {
  const { cols, rows, starts, atmosphere } = frame;
  for (let cell = 0; cell < cols * rows; cell++) {
    const target = groupOf.get(cell);
    if (target && !settled.has(target)) continue;
    const row = Math.floor(cell / cols);
    const far = row < starts.mid;
    const spot: OverlaySpot = {
      ctx,
      set,
      frame,
      target,
      onObject: TILE_SPECS[target?.elementId ?? ""]?.layer === "object",
      sky: zoneOfRow(row, starts) === "sky",
      p: palette(atmosphere, far ? 0.25 : 0),
      px: (cell % cols) * CELL,
      py: row * CELL,
    };
    for (const side of SIDES) {
      const from = neighbourOf(cell, side, cols, rows);
      if (from !== null)
        paintFrom(
          spot,
          from,
          side,
          groupOf.get(from),
          riderOf.get(from),
          settled,
        );
    }
  }
}

/** Overlays the groups on a neighbouring cell throw onto the spot. */
function paintFrom(
  spot: OverlaySpot,
  from: number,
  side: Side,
  source: TileGroup | undefined,
  rider: TileGroup | undefined,
  settled: Set<TileGroup>,
) {
  if (source && spills(source, spot.target, settled))
    drawSide(spot, source, from, side);
  // Riders throw combos too, such as a boat's wake on the water around it.
  if (rider && settled.has(rider) && spot.set.index.sheets.combos)
    drawCombos(spot, rider, from, side);
}

/** Whether a settled neighbouring group overlaps onto the target cell. */
function spills(
  source: TileGroup,
  target: TileGroup | undefined,
  settled: Set<TileGroup>,
) {
  return source !== target && settled.has(source);
}

/** Combos first, then the material edge, for one side of a spot. */
function drawSide(
  spot: OverlaySpot,
  source: TileGroup,
  from: number,
  side: Side,
) {
  const { sheets } = spot.set.index;
  if (sheets.combos) drawCombos(spot, source, from, side);
  // Materials spill over ground cover only; objects stand above it.
  if (sheets.edges && !spot.onObject) drawEdge(spot, source, side);
}

/** A cell receiving overlays, with what it needs to draw them. */
interface OverlaySpot {
  ctx: CanvasRenderingContext2D;
  set: TileSet;
  frame: SceneFrame;
  /** Group on the cell, or undefined for empty land or sky. */
  target: TileGroup | undefined;
  /** The target is an object, which takes combos but no material edges. */
  onObject: boolean;
  sky: boolean;
  p: Palette;
  px: number;
  py: number;
}

/** The cell next to `cell` on a side, or null at the grid's edge. */
function neighbourOf(cell: number, side: Side, cols: number, rows: number) {
  const [dx, dy] = SIDE_STEP[side];
  const col = (cell % cols) + dx;
  const row = Math.floor(cell / cols) + dy;
  if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
  return row * cols + col;
}

/** Combo overlays a source group throws onto the spot from one side. */
function drawCombos(
  spot: OverlaySpot,
  source: TileGroup,
  from: number,
  side: Side,
) {
  const { atmosphere, tick } = spot.frame;
  const variant = tileVariant(source.elementId, atmosphere.time);
  const receiver =
    spot.target?.elementId ?? (spot.sky ? "empty-sky" : "empty-ground");
  for (const combo of COMBOS) {
    const applies =
      combo.from.includes(source.elementId) &&
      combo.onto.includes(receiver) &&
      combo.sides.includes(side) &&
      (!combo.variant || combo.variant === variant);
    if (!applies) continue;
    if (combo.at && !atEdge(source, from, combo.at, spot.frame)) continue;
    drawTile({
      ctx: spot.ctx,
      set: spot.set,
      sheet: "combos",
      key: comboKey(combo.id, side),
      px: spot.px,
      py: spot.py,
      tick,
      grade: gradeFor(spot.p, atmosphere, false),
    });
  }
}

/** Material the spot's cell shows to its neighbours. */
function ontoMaterial(spot: OverlaySpot): Material {
  if (spot.target) return MATERIALS[spot.target.elementId] ?? "ground";
  return spot.sky ? "air" : "ground";
}

/** The source's material spilling over the side, when it ranks above. */
function drawEdge(spot: OverlaySpot, source: TileGroup, side: Side) {
  const { atmosphere, tick } = spot.frame;
  const onto = ontoMaterial(spot);
  const from = MATERIALS[source.elementId];
  const fromRank = EDGE_ORDER.indexOf(from);
  const ontoRank = EDGE_ORDER.indexOf(onto);
  if (fromRank <= ontoRank || ontoRank < 0) return;
  drawTile({
    ctx: spot.ctx,
    set: spot.set,
    sheet: "edges",
    key: edgeKey(from, onto, side),
    px: spot.px,
    py: spot.py,
    tick,
    grade: gradeFor(spot.p, atmosphere, SEASONAL.has(from)),
  });
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

/** 0 → nothing shown, 1 → fully placed. Quantised to the pixel clock. */
function revealOf(frame: SceneFrame, key: string, ghost?: Ghost) {
  if (ghost) {
    const t = (frame.now - ghost.start) / PLACE_MS;
    return 1 - Math.min(1, Math.floor(t * 5) / 5);
  }
  const start = frame.appearing.get(key);
  if (start === undefined) return 1;
  const t = (frame.now - start) / PLACE_MS;
  return t >= 1 ? 1 : Math.max(0, Math.floor(t * 5) / 5);
}

interface Owner {
  key: string;
  ghost?: Ghost;
  /** Position of the cell in its placement, for paths. */
  order: number;
  total: number;
  /** Pixel rows the placement spans. */
  top: number;
  bottom: number;
}

/** Owner of each cell per element, keyed `${elementId}:${cell}`. */
function ownersOf(placements: Placement[], ghosts: Ghost[], cols: number) {
  const owners = new Map<string, Owner>();
  const add = (p: Placement, ghost?: Ghost) => {
    const rowsOf = p.cells.map((c) => Math.floor(c / cols));
    const top = Math.min(...rowsOf) * CELL;
    const bottom = (Math.max(...rowsOf) + 1) * CELL;
    for (const [order, cell] of p.cells.entries()) {
      owners.set(`${p.elementId}:${cell}`, {
        key: p.key,
        ghost,
        order,
        total: p.cells.length,
        top,
        bottom,
      });
    }
  };
  // Ghosts first: a fresh placement on the same cells owns them, so a
  // same-seed re-roll stamps in instead of dissolving.
  for (const ghost of ghosts) add(ghost.placement, ghost);
  for (const p of placements) add(p);
  return owners;
}

/**
 * Clip for a group. While a placement stamps in, it shows from the bottom up
 * (paths draw on from their start, cell by cell); a dissolving one shrinks the
 * same way back.
 */
function groupClip(
  g: TileGroup,
  frame: SceneFrame,
  owners: Map<string, Owner>,
) {
  const path = new Path2D();
  const { cols } = frame;
  const isPath = ELEMENTS_BY_ID.get(g.elementId)?.shape === "path";
  for (const cell of g.cells) {
    const owner = owners.get(`${g.elementId}:${cell}`);
    const reveal = owner ? revealOf(frame, owner.key, owner.ghost) : 1;
    if (reveal <= 0) continue;
    const px = (cell % cols) * CELL;
    const py = Math.floor(cell / cols) * CELL;
    if (reveal >= 1 || !owner) {
      path.rect(px, py, CELL, CELL);
    } else if (isPath) {
      if (owner.order / owner.total < reveal) path.rect(px, py, CELL, CELL);
    } else {
      const line = owner.bottom - (owner.bottom - owner.top) * reveal;
      const from = Math.max(py, Math.round(line));
      if (from < py + CELL) path.rect(px, from, CELL, py + CELL - from);
    }
  }
  return path;
}

export function renderScene(ctx: CanvasRenderingContext2D, frame: SceneFrame) {
  const { cols, rows, placements, ghosts } = frame;
  ctx.imageSmoothingEnabled = false;
  paintBackground(ctx, frame);

  // Live placements last, so they own cells they share with a ghost.
  const all = [...ghosts.map((g) => g.placement), ...placements];
  const owners = ownersOf(placements, ghosts, cols);

  const groups = groupTiles(all, cols, rows);
  // Far groups first so nearer ones overlap their seams.
  groups.sort((a, b) => a.rect.row + a.rect.h - (b.rect.row + b.rect.h));
  const tiles = currentTileSet();
  const settled = new Set(
    groups.filter((g) =>
      g.keys.every(
        (key) =>
          !frame.appearing.has(key) &&
          !ghosts.some((gh) => gh.placement.key === key),
      ),
    ),
  );
  const isRider = (g: TileGroup) =>
    Boolean(ELEMENTS_BY_ID.get(g.elementId)?.on);
  const groupOf = new Map<number, TileGroup>();
  const riderOf = new Map<number, TileGroup>();
  for (const g of groups)
    for (const cell of g.cells) (isRider(g) ? riderOf : groupOf).set(cell, g);
  const isObject = (g: TileGroup) =>
    !isRider(g) && TILE_SPECS[g.elementId]?.layer === "object";
  // Ground cover first, then where it meets its neighbours, then everything
  // that stands on it, then riders such as ducks on a pond.
  const passes = [
    groups.filter((g) => !isObject(g) && !isRider(g)),
    groups.filter(isObject),
    groups.filter(isRider),
  ];

  for (const [pass, list] of passes.entries()) {
    if (pass === 1 && tiles)
      paintOverlays(ctx, tiles, frame, groupOf, riderOf, settled);
    for (const g of list)
      paintGroup(ctx, g, frame, owners, settled.has(g), tiles);
  }

  paintWeather(ctx, frame);
}

function paintGroup(
  ctx: CanvasRenderingContext2D,
  g: TileGroup,
  frame: SceneFrame,
  owners: Map<string, Owner>,
  settled: boolean,
  tiles: TileSet | null,
) {
  const { cols, rows, starts, atmosphere, tick } = frame;
  const bottom = g.rect.row + g.rect.h - 1;
  const haze = bottom < starts.mid ? 0.25 : 0;
  const p = palette(atmosphere, haze);
  const tiled = tiles !== null && canTile(tiles, g);
  const overlays = tiles !== null && Boolean(tiles.index.sheets.edges);
  if (settled) paintSeams(ctx, g, frame, p, overlays);
  ctx.save();
  ctx.clip(groupClip(g, frame, owners));
  if (tiled) {
    paintTiles(ctx, tiles, g, frame, p);
  } else {
    const painter = PAINTERS[g.elementId] ?? swatch;
    const seed = seedOf(g.id);
    painter({
      ctx,
      g,
      x: g.rect.col * CELL,
      y: g.rect.row * CELL,
      w: g.rect.w * CELL,
      h: g.rect.h * CELL,
      cols,
      rows,
      tick,
      p,
      atm: atmosphere,
      seed,
      rnd: (i) => hash(seed + i * 7919),
    });
  }
  ctx.restore();
}

/** The scene at a larger size with a light grid, for export. */
export function exportCanvas(frame: SceneFrame, scale: number, grid: boolean) {
  const base = document.createElement("canvas");
  base.width = frame.cols * CELL;
  base.height = frame.rows * CELL;
  const baseCtx = base.getContext("2d");
  if (!baseCtx) throw new Error("Canvas is not available");
  renderScene(baseCtx, frame);

  const out = document.createElement("canvas");
  out.width = base.width * scale;
  out.height = base.height * scale;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(base, 0, 0, out.width, out.height);
  if (grid) {
    const size = CELL * scale;
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    for (let c = 1; c < frame.cols; c++) {
      ctx.beginPath();
      ctx.moveTo(c * size + 0.5, 0);
      ctx.lineTo(c * size + 0.5, out.height);
      ctx.stroke();
    }
    for (let r = 1; r < frame.rows; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * size + 0.5);
      ctx.lineTo(out.width, r * size + 0.5);
      ctx.stroke();
    }
  }
  return out;
}

/** One tile cell drawn on its own, for the atlas. */
export function sampleTile(
  source: HTMLCanvasElement,
  target: HTMLCanvasElement,
  cell: number,
  cols: number,
) {
  const ctx = target.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(
    source,
    (cell % cols) * CELL,
    Math.floor(cell / cols) * CELL,
    CELL,
    CELL,
    0,
    0,
    target.width,
    target.height,
  );
}
