import {
  ELEMENTS_BY_ID,
  RISING,
  SCENE_ELEMENTS,
  type SceneElement,
  SEASONS,
  type Theme,
  TIMES_OF_DAY,
  type TimeOfDay,
  WEATHER,
  type Zone,
} from "./catalog";

export interface Rect {
  col: number;
  row: number;
  w: number;
  h: number;
}

export interface Placement {
  key: string;
  elementId: string;
  /** Cell indices (row * cols + col) the element occupies. */
  cells: number[];
  /** Bounding box for block-like shapes; absent for paths. */
  rect?: Rect;
  locked?: boolean;
  /** Placed by hand, so it may stand outside its zones. */
  manual?: boolean;
  /**
   * Key of the element this one flows from, such as the waterfall above a
   * stream. It starts where its source ends, not in its own zone.
   */
  fedBy?: string;
}

export interface Atmosphere {
  time: TimeOfDay;
  season: (typeof SEASONS)[number];
  weather: (typeof WEATHER)[number];
}

export interface PlanOptions {
  cols: number;
  rows: number;
  seed: string;
  themes: Theme[];
  /** Share of usable cells the plan tries to fill. */
  density: number;
  /** Share of rows that belong to the sky. */
  skyShare: number;
  /** Cells that are hidden by the foreground and must not be rolled for. */
  ignored: boolean[];
  /** Placements kept from the previous roll. */
  locked: Placement[];
}

export interface Plan {
  placements: Placement[];
  atmosphere: Atmosphere;
}

export const DENSITIES = [
  { id: "sparse", label: "Sparse", value: 0.3 },
  { id: "balanced", label: "Balanced", value: 0.5 },
  { id: "busy", label: "Busy", value: 0.7 },
] as const;

// ---------------------------------------------------------------------------
// Random numbers
// ---------------------------------------------------------------------------

export type Rng = () => number;

export function createRng(seed: string): Rng {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ (seed.codePointAt(i) ?? 0), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    // Wraps to 32 bits; every later step only reads those bits.
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8); // NOSONAR: a scene seed, not a secret
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function between(rng: Rng, [min, max]: [number, number]) {
  return min + rng() * (max - min);
}

export function rollAtmosphere(rng: Rng): Atmosphere {
  const season = pick(rng, SEASONS);
  const weather = pick(
    rng,
    WEATHER.filter((w) => w !== "Snow" || season === "Winter"),
  );
  return { time: pick(rng, TIMES_OF_DAY).id, season, weather };
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

/** First row of each zone below the sky. Every zone keeps at least one row. */
export function zoneStarts(rows: number, skyShare: number) {
  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));
  const far = clamp(Math.round(rows * skyShare), 1, rows - 3);
  const rest = rows - far;
  const mid = far + clamp(Math.round(rest * 0.25), 1, rest - 2);
  const front = mid + clamp(Math.round(rest * 0.35), 1, rows - mid - 1);
  return { far, mid, front };
}

export type ZoneStarts = ReturnType<typeof zoneStarts>;

export function zoneOfRow(row: number, starts: ZoneStarts): Zone {
  if (row >= starts.front) return "front";
  if (row >= starts.mid) return "mid";
  if (row >= starts.far) return "far";
  return "sky";
}

/** First row and row count of each zone, top to bottom. */
export function zoneBands(rows: number, starts: ZoneStarts) {
  return [
    { zone: "sky" as const, start: 0, rows: starts.far },
    { zone: "far" as const, start: starts.far, rows: starts.mid - starts.far },
    {
      zone: "mid" as const,
      start: starts.mid,
      rows: starts.front - starts.mid,
    },
    { zone: "front" as const, start: starts.front, rows: rows - starts.front },
  ];
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export function columnName(col: number): string {
  let name = "";
  let n = col + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCodePoint(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

export function cellName(index: number, cols: number) {
  return `${columnName(index % cols)}${Math.floor(index / cols) + 1}`;
}

export function describeCells(placement: Placement, cols: number): string {
  if (placement.rect) {
    const { col, row, w, h } = placement.rect;
    const start = cellName(row * cols + col, cols);
    if (w === 1 && h === 1) return start;
    return `${start}–${cellName((row + h - 1) * cols + col + w - 1, cols)}`;
  }
  const first = placement.cells[0];
  const last = placement.cells.at(-1) ?? first;
  return `${cellName(first, cols)} → ${cellName(last, cols)}`;
}

export function rectCells({ col, row, w, h }: Rect, cols: number) {
  const cells: number[] = [];
  for (let r = row; r < row + h; r++) {
    for (let c = col; c < col + w; c++) cells.push(r * cols + c);
  }
  return cells;
}

// ---------------------------------------------------------------------------
// Rolling
// ---------------------------------------------------------------------------

/**
 * Whether an element can go on these cells by hand: free cells for most
 * elements, cells of a host without another rider for riders.
 */
export function canPlace(
  placements: Placement[],
  elementId: string,
  cells: number[],
) {
  const on = ELEMENTS_BY_ID.get(elementId)?.on;
  const host = new Map<number, string>();
  const ridden = new Set<number>();
  for (const p of placements) {
    const rider = ELEMENTS_BY_ID.get(p.elementId)?.on !== undefined;
    for (const cell of p.cells)
      if (rider) ridden.add(cell);
      else host.set(cell, p.elementId);
  }
  if (cells.length === 0) return false;
  if (!on) return cells.every((c) => !host.has(c));
  return cells.every((c) => !ridden.has(c) && on.includes(host.get(c) ?? ""));
}

/**
 * The grid between 5 and 20 cells a side closest to an image's shape. Of
 * grids that match about equally well, the one nearest the current size wins.
 */
export function gridFor(
  aspect: number,
  current: { cols: number; rows: number },
) {
  let best = { cols: current.cols, rows: current.rows };
  let bestScore = Number.POSITIVE_INFINITY;
  for (let cols = 5; cols <= 20; cols++) {
    for (let rows = 5; rows <= 20; rows++) {
      const miss = Math.abs(Math.log(cols / rows / aspect));
      const change =
        Math.abs(cols - current.cols) + Math.abs(rows - current.rows);
      // Shape first; the size change only breaks near-ties.
      const score = miss * 1000 + change;
      if (score < bestScore) {
        bestScore = score;
        best = { cols, rows };
      }
    }
  }
  return best;
}

/**
 * Whether a block's position suits its zones: its bottom row stands in one
 * of them, and its top stays out of the sky unless it may rise into it.
 */
export function zoneAllows(
  element: SceneElement,
  rect: Rect,
  starts: ZoneStarts,
) {
  const bottom = rect.row + rect.h - 1;
  if (!element.zones.includes(zoneOfRow(bottom, starts))) return false;
  const inSky = zoneOfRow(rect.row, starts) === "sky";
  return !inSky || element.zones.includes("sky") || RISING.has(element.id);
}

/**
 * Whether a placement no longer suits its zones, as after the horizon moves.
 * Paths are judged by the row they start on; riders follow their host.
 */
export function outOfZone(p: Placement, starts: ZoneStarts, cols: number) {
  const element = ELEMENTS_BY_ID.get(p.elementId);
  // Riders follow their host; fed paths start where their source ends.
  if (!element || element.on || p.fedBy) return false;
  if (p.rect) return !zoneAllows(element, p.rect, starts);
  const row = Math.floor(Math.min(...p.cells) / cols);
  return !element.zones.includes(zoneOfRow(row, starts));
}

/**
 * The placements that can stay once hosts are gone: a rider such as a duck
 * needs an allowed host under every cell, and one rider per cell.
 */
export function withHosts(placements: Placement[]) {
  const host = new Map<number, string>();
  for (const p of placements)
    if (!ELEMENTS_BY_ID.get(p.elementId)?.on)
      for (const cell of p.cells) host.set(cell, p.elementId);
  const ridden = new Set<number>();
  return placements.filter((p) => {
    const on = ELEMENTS_BY_ID.get(p.elementId)?.on;
    if (!on) return true;
    const fits = p.cells.every(
      (c) => !ridden.has(c) && on.includes(host.get(c) ?? ""),
    );
    if (fits) for (const cell of p.cells) ridden.add(cell);
    return fits;
  });
}

export type PathDrift = "left" | "straight" | "right";

/** Everything one roll decided, in the order it was decided. */
export interface RollChain {
  theme: Theme;
  element: SceneElement;
  /**
   * Cells the location roll chose from: top-left corners for blocks, start
   * cells for paths.
   */
  candidates: number[];
  placement: Placement;
  /** Paths only: steps walked and the overall direction. */
  path?: { length: number; drift: PathDrift };
  /** Path that starts under the element, such as a waterfall's stream. */
  fed?: RollChain;
}

export interface RollRequest {
  /** Roll only within this theme (a board square). */
  theme?: Theme;
  /** Favour paths so blocks settle around them instead of cutting them off. */
  preferPaths?: boolean;
}

/**
 * Builds a plan one roll at a time. `generatePlan` rolls until the density
 * target is met; the interactive modes call `roll` once per turn.
 */
export class PlanBuilder {
  readonly placements: Placement[] = [];
  readonly starts: ZoneStarts;
  private readonly occupied: boolean[];
  /** Element on each cell, so riders such as ducks can find their host. */
  private readonly host: (string | undefined)[];
  private readonly ridden: boolean[];
  private readonly counts = new Map<string, number>();
  private readonly exhausted = new Set<string>();
  private readonly pool: SceneElement[];
  private readonly target: number;
  private covered = 0;
  private serial = 0;

  constructor(private readonly options: PlanOptions) {
    const { cols, rows, ignored, density, themes } = options;
    this.starts = zoneStarts(rows, options.skyShare);
    this.occupied = new Array(cols * rows).fill(false);
    this.host = new Array(cols * rows).fill(undefined);
    this.ridden = new Array(cols * rows).fill(false);
    this.pool = SCENE_ELEMENTS.filter((e) => themes.includes(e.theme));
    this.target = ignored.filter((cell) => !cell).length * density;
    for (const p of options.locked) this.keep({ ...p, locked: true });
  }

  /** Adds an existing placement without rolling for it. */
  keep(placement: Placement) {
    const { cols, rows } = this.options;
    const on = ELEMENTS_BY_ID.get(placement.elementId)?.on;
    if (placement.cells.some((c) => c < 0 || c >= cols * rows)) return false;
    const blocked = on
      ? placement.cells.some((c) => this.ridden[c] || !this.hosts(on, c))
      : placement.cells.some((c) => this.occupied[c]);
    if (blocked) return false;
    this.add(placement);
    return true;
  }

  private hosts(on: string[], cell: number) {
    const host = this.host[cell];
    return host !== undefined && on.includes(host);
  }

  get full() {
    return this.covered >= this.target;
  }

  /** Themes that still have an element left to roll. */
  openThemes(): Theme[] {
    return [
      ...new Set(
        this.pool.filter((e) => this.available(e)).map((e) => e.theme),
      ),
    ];
  }

  isFree(cell: number) {
    return !this.occupied[cell];
  }

  roll(rng: Rng, request: RollRequest = {}): RollChain | null {
    for (;;) {
      const candidates = this.pool.filter(
        (e) =>
          this.available(e) && (!request.theme || e.theme === request.theme),
      );
      if (candidates.length === 0) return null;
      const paths = candidates.filter((e) => e.shape === "path");
      const list =
        request.preferPaths && paths.length > 0 && rng() < 0.6
          ? paths
          : candidates;
      const weight = (e: SceneElement) =>
        e.weight / (1 + (this.counts.get(e.id) ?? 0));
      let roll = rng() * list.reduce((sum, e) => sum + weight(e), 0);
      const element =
        list.find((e) => {
          roll -= weight(e);
          return roll <= 0;
        }) ?? (list.at(-1) as SceneElement);

      const chain = this.place(element, rng);
      if (chain) return chain;
      this.exhausted.add(element.id);
    }
  }

  private available(e: SceneElement) {
    return !this.exhausted.has(e.id) && (this.counts.get(e.id) ?? 0) < e.max;
  }

  private place(element: SceneElement, rng: Rng): RollChain | null {
    if (element.shape === "path") {
      const result = this.placePath(element, rng);
      if (!result) return null;
      return {
        theme: element.theme,
        element,
        candidates: result.candidates,
        placement: this.record(element, result.cells),
        path: { length: result.length, drift: result.drift },
      };
    }

    const result = this.placeRect(element, rng);
    if (!result) return null;
    const { rect, options } = result;
    const chain: RollChain = {
      theme: element.theme,
      element,
      candidates: options.map((r) => r.row * this.options.cols + r.col),
      placement: this.record(element, rectCells(rect, this.options.cols), rect),
    };

    const fed = element.feeds ? ELEMENTS_BY_ID.get(element.feeds) : undefined;
    if (fed && (this.counts.get(fed.id) ?? 0) < fed.max) {
      const start = {
        col: rect.col + Math.floor(rect.w / 2),
        row: rect.row + rect.h,
      };
      const stream = this.placePath(fed, rng, start);
      if (stream) {
        chain.fed = {
          theme: fed.theme,
          element: fed,
          candidates: stream.candidates,
          placement: this.record(fed, stream.cells, undefined, {
            fedBy: chain.placement.key,
          }),
          path: { length: stream.length, drift: stream.drift },
        };
      }
    }
    return chain;
  }

  private record(
    element: SceneElement,
    cells: number[],
    rect?: Rect,
    extra?: Pick<Placement, "fedBy">,
  ) {
    const placement: Placement = {
      key: `${element.id}-${this.options.seed}-${this.serial++}`,
      elementId: element.id,
      cells,
      rect,
      ...extra,
    };
    this.add(placement);
    return placement;
  }

  private add(placement: Placement) {
    const rider = ELEMENTS_BY_ID.get(placement.elementId)?.on !== undefined;
    for (const cell of placement.cells) {
      if (rider) {
        this.ridden[cell] = true;
      } else {
        this.occupied[cell] = true;
        this.host[cell] = placement.elementId;
      }
    }
    this.counts.set(
      placement.elementId,
      (this.counts.get(placement.elementId) ?? 0) + 1,
    );
    // Riders sit on cells their host already covers.
    if (!rider)
      this.covered += placement.cells.filter(
        (cell) => !this.options.ignored[cell],
      ).length;
    this.placements.push(placement);
  }

  private footprint(element: SceneElement, rng: Rng, scale: number) {
    if (element.shape === "point") return { w: 1, h: 1 };
    const { cols, rows } = this.options;
    const size = (range: [number, number], total: number) =>
      Math.min(
        total,
        Math.max(1, Math.round(between(rng, range) * total * scale)),
      );
    const w = size(element.width, cols);
    const h = size(element.height, rows);
    if (element.square) return { w: Math.min(w, h), h: Math.min(w, h) };
    return { w, h };
  }

  private rectFits(rect: Rect, element: SceneElement) {
    const { on } = element;
    // Riders ignore zones: their host decides where they can go.
    if (on)
      return rectCells(rect, this.options.cols).every(
        (cell) =>
          !this.options.ignored[cell] &&
          !this.ridden[cell] &&
          this.hosts(on, cell),
      );
    if (!zoneAllows(element, rect, this.starts)) return false;
    for (const cell of rectCells(rect, this.options.cols)) {
      if (this.options.ignored[cell] || this.occupied[cell]) return false;
    }
    return true;
  }

  private placeRect(element: SceneElement, rng: Rng) {
    const { cols, rows } = this.options;
    for (const scale of [1, 0.7, 0.45]) {
      const { w, h } = this.footprint(element, rng, scale);
      const options: Rect[] = [];
      for (let row = 0; row + h <= rows; row++) {
        for (let col = 0; col + w <= cols; col++) {
          const rect = { col, row, w, h };
          if (this.rectFits(rect, element)) options.push(rect);
        }
      }
      if (options.length > 0) return { rect: pick(rng, options), options };
      if (w === 1 && h === 1) return null;
    }
    return null;
  }

  /**
   * Walks a path downward from `start`, drifting sideways. Paths may run
   * behind the foreground, so ignored cells do not block them; other
   * elements do.
   */
  private placePath(
    element: SceneElement,
    rng: Rng,
    start?: { col: number; row: number },
  ) {
    const { cols, rows } = this.options;
    const begin = this.pathOrigin(element, rng, start);
    if (!begin) return null;
    const { origin, candidates } = begin;
    if (origin.row >= rows) return null;

    const thickness = Math.max(
      1,
      Math.round(between(rng, element.width) * cols),
    );
    const maxSteps = Math.max(
      2,
      Math.round(between(rng, element.height) * rows * 1.5),
    );
    let { col, row } = origin;
    let drift = rng() < 0.5 ? -1 : 1;
    const cells = new Set<number>();
    // The walk never steps back onto its own track, so its length counts
    // distinct cells.
    const track = new Set([row * cols + col]);
    const blocked = (c: number, r: number) =>
      c < 0 ||
      c >= cols ||
      r >= rows ||
      this.occupied[r * cols + c] ||
      track.has(r * cols + c);

    this.stampPath(cells, element, thickness, col, row);
    let length = 1;
    for (let step = 0; step < maxSteps; step++) {
      if (rng() < 0.3) drift = -drift;
      const next = pathMoves(rng, drift).find(
        ([dc, dr]) => !blocked(col + dc, row + dr),
      );
      if (!next) break;
      col += next[0];
      row += next[1];
      track.add(row * cols + col);
      length++;
      this.stampPath(cells, element, thickness, col, row);
      if (row === rows - 1 && rng() < 0.5) break;
    }
    if (cells.size <= 1) return null;
    return {
      cells: [...cells],
      candidates,
      length,
      drift: driftOf(col - origin.col),
    };
  }

  /**
   * Where a path starts: the given cell, or a free cell on the first row of
   * its zone. `candidates` are the cells the locator may hop between.
   */
  private pathOrigin(
    element: SceneElement,
    rng: Rng,
    start?: { col: number; row: number },
  ) {
    const { cols, ignored } = this.options;
    if (start) {
      // A fed stream starts right below its source or not at all.
      const cell = start.row * cols + start.col;
      if (this.occupied[cell]) return null;
      return { origin: start, candidates: [cell] };
    }
    // Any of its zones may hold the start, such as a road in the far or the
    // middle distance.
    const rows = [
      ...new Set(element.zones.map((z) => pathStartRow(z, this.starts))),
    ];
    const free = rows.flatMap((row) =>
      Array.from({ length: cols }, (_, col) => row * cols + col).filter(
        (cell) => !this.occupied[cell] && !ignored[cell],
      ),
    );
    if (free.length === 0) return null;
    const cell = pick(rng, free);
    return {
      origin: { col: cell % cols, row: Math.floor(cell / cols) },
      candidates: free,
    };
  }

  /** Adds a path's cross-section around column `c` on row `r`. */
  private stampPath(
    cells: Set<number>,
    element: SceneElement,
    thickness: number,
    c: number,
    r: number,
  ) {
    const { cols } = this.options;
    const widen =
      element.widens && zoneOfRow(r, this.starts) === "front" ? 1 : 0;
    const width = thickness + widen;
    const left = Math.min(
      Math.max(0, c - Math.floor((width - 1) / 2)),
      cols - width,
    );
    for (let x = Math.max(0, left); x < Math.min(cols, left + width); x++) {
      if (!this.occupied[r * cols + x]) cells.add(r * cols + x);
    }
  }
}

/** First row of a zone, where paths start. */
function pathStartRow(zone: Zone, starts: ZoneStarts) {
  if (zone === "far") return starts.far;
  if (zone === "mid") return starts.mid;
  return starts.front;
}

/** Moves a path tries in order: usually down first, sometimes sideways. */
function pathMoves(rng: Rng, drift: number) {
  if (rng() < 0.55)
    return [
      [0, 1],
      [drift, 0],
      [-drift, 0],
    ];
  return [
    [drift, 0],
    [0, 1],
    [-drift, 0],
  ];
}

/** Which way a path leans overall. */
function driftOf(shift: number): PathDrift {
  if (shift < 0) return "left";
  return shift > 0 ? "right" : "straight";
}

export function generatePlan(options: PlanOptions): Plan {
  const rng = createRng(`${options.seed}:${options.cols}x${options.rows}`);
  const atmosphere = rollAtmosphere(rng);
  const builder = new PlanBuilder(options);
  let turn = 0;
  while (!builder.full && builder.roll(rng, { preferPaths: turn < 2 })) turn++;
  return { placements: builder.placements, atmosphere };
}
