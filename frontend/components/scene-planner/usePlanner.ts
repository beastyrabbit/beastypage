"use client";

import { useReducedMotion } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ELEMENTS_BY_ID,
  THEMES,
  type Theme,
  type Zone,
} from "@/lib/scene-planner/catalog";
import {
  type Atmosphere,
  canPlace,
  createRng,
  generatePlan,
  type Placement,
  PlanBuilder,
  type Rect,
  type RollChain,
  randomSeed,
  rollAtmosphere,
  zoneOfRow,
  zoneStarts,
} from "@/lib/scene-planner/generate";
import type { Ghost } from "@/lib/scene-planner/render";

import { Director, TEMPOS, type Tempo } from "./motion";

export interface Settings {
  cols: number;
  rows: number;
  skyShare: number;
  themes: Theme[];
  density: number;
  seed: string;
}

export interface Overlay {
  src: string;
  name: string;
  /** Width divided by height. */
  aspect: number;
  visible: boolean;
  opacity: number;
  /** Share of a cell the subject must cover to ignore it. */
  threshold: number;
  coverage: number[] | null;
}

/** What the stage highlights while a roll runs. */
export interface Cue {
  zones?: Zone[];
  /** Locator box; `locked` once the location is final. */
  box?: Rect & { locked?: boolean };
  /** Cells of a path being drawn. */
  trail?: number[];
}

export type StageTool =
  | { kind: "inspect" }
  | { kind: "paint" }
  | { kind: "place"; elementId: string }
  | { kind: "erase" };

export type ViewMode = "flat" | "diorama";

export interface StageHandle {
  /** Screen rectangle of a cell range, for card flights. */
  cellRect: (rect: Rect) => DOMRect | null;
  /** The rendered scene at 16 px per cell. */
  canvas: () => HTMLCanvasElement | null;
}

const DEFAULT_SETTINGS: Settings = {
  cols: 12,
  rows: 12,
  skyShare: 0.3,
  themes: THEMES.map((t) => t.id),
  density: 0.5,
  seed: "meadow",
};

const STAGGER_MS = 70;

/**
 * Maps placements onto a new grid: a new cell belongs to the placement that
 * owned the old cell under its centre, so shapes keep their share of the
 * picture. Elements too thin to cover any centre keep one cell.
 */
function remap(
  placements: Placement[],
  from: Settings,
  cols: number,
  rows: number,
) {
  const rides = (p: Placement) => Boolean(ELEMENTS_BY_ID.get(p.elementId)?.on);
  // Riders keep their own cell below; they would hide their host here.
  const owner = new Map<number, string>();
  for (const p of placements)
    if (!rides(p)) for (const cell of p.cells) owner.set(cell, p.key);
  const cells = new Map<string, number[]>(placements.map((p) => [p.key, []]));
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const oldCol = Math.floor(((col + 0.5) * from.cols) / cols);
      const oldRow = Math.floor(((row + 0.5) * from.rows) / rows);
      const key = owner.get(oldRow * from.cols + oldCol);
      if (key) cells.get(key)?.push(row * cols + col);
    }
  }
  const taken = new Set(placements.flatMap((p) => cells.get(p.key) ?? []));
  return placements.flatMap((p) => {
    let next = cells.get(p.key) ?? [];
    if (next.length === 0) {
      const first = p.cells[0];
      const col = Math.floor(((first % from.cols) * cols) / from.cols);
      const row = Math.floor(
        (Math.floor(first / from.cols) * rows) / from.rows,
      );
      const cell = row * cols + col;
      if (!rides(p) && taken.has(cell)) return [];
      taken.add(cell);
      next = [cell];
    }
    if (!p.rect) return [{ ...p, cells: next }];
    const colsOf = next.map((c) => c % cols);
    const rowsOf = next.map((c) => Math.floor(c / cols));
    const rect = {
      col: Math.min(...colsOf),
      row: Math.min(...rowsOf),
      w: Math.max(...colsOf) - Math.min(...colsOf) + 1,
      h: Math.max(...rowsOf) - Math.min(...rowsOf) + 1,
    };
    return [{ ...p, cells: next, rect }];
  });
}

export function usePlannerState() {
  const reduced = useReducedMotion() ?? false;
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [atmosphere, setAtmosphere] = useState<Atmosphere>({
    time: "golden",
    season: "Summer",
    weather: "Clear",
  });
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [painted, setPainted] = useState<Map<number, boolean>>(new Map());
  const [cue, setCue] = useState<Cue | null>(null);
  const [tool, setTool] = useState<StageTool>({ kind: "inspect" });
  const [view, setView] = useState<ViewMode>("flat");
  const [tempo, setTempo] = useState<Tempo>("cinematic");
  const [rolling, setRolling] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const turn = useRef(0);
  /** Makes placement keys unique across rolls and turns. */
  const keySpace = useRef(0);
  const manual = useRef(0);
  const stage = useRef<StageHandle | null>(null);
  /** Read by the render loop every frame. */
  const anim = useRef({
    appearing: new Map<string, number>(),
    ghosts: [] as Ghost[],
  });

  const tempoRef = useRef(tempo);
  tempoRef.current = tempo;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const director = useMemo(
    () =>
      new Director(
        () => TEMPOS.find((t) => t.id === tempoRef.current)?.factor ?? 1,
        () => reducedRef.current,
      ),
    [],
  );

  const { cols, rows } = settings;
  const starts = useMemo(
    () => zoneStarts(rows, settings.skyShare),
    [rows, settings.skyShare],
  );

  const ignored = useMemo(() => {
    const result = new Array<boolean>(cols * rows).fill(false);
    if (overlay?.coverage && overlay.coverage.length === cols * rows) {
      overlay.coverage.forEach((share, cell) => {
        result[cell] = share >= overlay.threshold;
      });
    }
    for (const [cell, value] of painted)
      if (cell < result.length) result[cell] = value;
    return result;
  }, [cols, rows, overlay, painted]);

  const appear = useCallback((list: Placement[], stagger = 0) => {
    const now = performance.now();
    for (const [i, p] of list.entries()) {
      anim.current.appearing.set(p.key, now + i * stagger);
    }
  }, []);

  const vanish = useCallback((list: Placement[]) => {
    const now = performance.now();
    for (const p of list) {
      anim.current.appearing.delete(p.key);
      anim.current.ghosts.push({ placement: p, start: now });
    }
  }, []);

  /** Rolls the whole scene at once from the seed, keeping locked elements. */
  const rollScene = useCallback(
    (seed = settings.seed) => {
      const locked = placements.filter((p) => p.locked);
      const plan = generatePlan({ ...settings, seed, ignored, locked });
      // A locked rider whose host was re-rolled away is dropped by the plan.
      const kept = plan.placements.filter((p) => p.locked);
      const keptKeys = new Set(kept.map((p) => p.key));
      vanish(placements.filter((p) => !keptKeys.has(p.key)));
      // The same seed gives the same keys; keep them apart from the old ones.
      const space = keySpace.current++;
      const fresh = plan.placements
        .filter((p) => !p.locked)
        .map((p) => ({ ...p, key: `${p.key}~${space}` }));
      appear(fresh, STAGGER_MS);
      setPlacements([...kept, ...fresh]);
      setAtmosphere(plan.atmosphere);
      setSettings((s) => ({ ...s, seed }));
      turn.current = 0;
    },
    [settings, placements, ignored, appear, vanish],
  );

  // Roll sequences are async and outlive renders; they read the board here.
  const latest = useRef({ settings, ignored, placements });
  latest.current = { settings, ignored, placements };

  /** A builder that knows the current board, plus the next turn's dice. */
  const nextTurn = useCallback(() => {
    const { settings: s, ignored: ig, placements: current } = latest.current;
    // The builder's seed only names keys; every turn gets its own.
    const builder = new PlanBuilder({
      ...s,
      seed: `${s.seed}~${keySpace.current++}`,
      ignored: ig,
      locked: [],
    });
    for (const p of current) builder.keep(p);
    const rng = createRng(`${s.seed}:${s.cols}x${s.rows}:t${turn.current++}`);
    return { builder, rng };
  }, []);

  /** Whether the board has reached its density, without spending a turn. */
  const boardStatus = useCallback(() => {
    const { settings: s, ignored: ig, placements: current } = latest.current;
    const builder = new PlanBuilder({ ...s, ignored: ig, locked: [] });
    for (const p of current) builder.keep(p);
    return { full: builder.full, open: builder.openThemes() };
  }, []);

  const addChain = useCallback(
    (chain: RollChain) => {
      const list = chain.fed
        ? [chain.placement, chain.fed.placement]
        : [chain.placement];
      appear(list, 260);
      latest.current.placements = [...latest.current.placements, ...list];
      setPlacements((current) => [...current, ...list]);
    },
    [appear],
  );

  const remove = useCallback(
    (keys: string[]) => {
      const current = latest.current.placements;
      vanish(current.filter((p) => keys.includes(p.key)));
      latest.current.placements = current.filter((p) => !keys.includes(p.key));
      setPlacements((list) => list.filter((p) => !keys.includes(p.key)));
    },
    [vanish],
  );

  const toggleLock = useCallback((key: string) => {
    setPlacements((current) =>
      current.map((p) => (p.key === key ? { ...p, locked: !p.locked } : p)),
    );
  }, []);

  const clearUnlocked = useCallback(() => {
    vanish(placements.filter((p) => !p.locked));
    setPlacements((current) => current.filter((p) => p.locked));
  }, [placements, vanish]);

  /** Places an element by hand. Returns false when a cell is taken. */
  const placeManual = useCallback(
    (elementId: string, cells: number[], rect?: Rect) => {
      if (!canPlace(placements, elementId, cells)) return false;
      const placement: Placement = {
        key: `${elementId}-hand-${manual.current++}`,
        elementId,
        cells,
        rect,
      };
      appear([placement]);
      latest.current.placements = [...latest.current.placements, placement];
      setPlacements((current) => [...current, placement]);
      return true;
    },
    [placements, appear],
  );

  const resizeGrid = useCallback(
    (nextCols: number, nextRows: number) => {
      if (nextCols === cols && nextRows === rows) return;
      const next = remap(placements, settings, nextCols, nextRows);
      appear(next);
      setPlacements(next);
      setPainted(new Map());
      setSettings((s) => ({ ...s, cols: nextCols, rows: nextRows }));
    },
    [cols, rows, settings, placements, appear],
  );

  const paintCell = useCallback(
    (cell: number, value: boolean) => {
      setPainted((current) => {
        if (current.get(cell) === value && ignored[cell] === value)
          return current;
        const next = new Map(current);
        next.set(cell, value);
        return next;
      });
    },
    [ignored],
  );

  /** Elements whose bottom row left their zones after a horizon change. */
  const misplaced = useMemo(() => {
    const result = new Set<string>();
    for (const p of placements) {
      const element = ELEMENTS_BY_ID.get(p.elementId);
      if (!element || !p.rect || p.key.includes("-hand-")) continue;
      const zone = zoneOfRow(p.rect.row + p.rect.h - 1, starts);
      if (!element.zones.includes(zone)) result.add(p.key);
    }
    return result;
  }, [placements, starts]);

  return {
    reduced,
    settings,
    setSettings,
    starts,
    placements,
    atmosphere,
    setAtmosphere,
    rollAtmosphere: () =>
      setAtmosphere(rollAtmosphere(createRng(randomSeed()))),
    overlay,
    setOverlay,
    painted,
    setPainted,
    paintCell,
    ignored,
    cue,
    setCue,
    tool,
    setTool,
    view,
    setView,
    tempo,
    setTempo,
    rolling,
    setRolling,
    selected,
    setSelected,
    director,
    stage,
    anim,
    latest,
    rollScene,
    nextTurn,
    boardStatus,
    addChain,
    remove,
    toggleLock,
    clearUnlocked,
    placeManual,
    resizeGrid,
    misplaced,
  };
}

export type Planner = ReturnType<typeof usePlannerState>;

export const PlannerContext = createContext<Planner | null>(null);

export function usePlanner() {
  const planner = useContext(PlannerContext);
  if (!planner) throw new Error("usePlanner needs a PlannerContext");
  return planner;
}
