import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_TIMING_CONFIG, type SpinTimingConfig, type ParamTimingKey, isParamTimingKey } from "./spinTiming";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AfterlifeOption = "off" | "dark10" | "star10" | "both10" | "darkForce" | "starForce";

export type ExtendedMode =
  | "base"
  | "mood"
  | "bold"
  | "darker"
  | "blackout"
  | "mononoke"
  | "howl"
  | "demonslayer"
  | "titanic"
  | "deathnote"
  | "slime"
  | "ghostintheshell"
  | "mushishi"
  | "chisweethome"
  | "fma";

export interface LayerRange {
  min: number;
  max: number;
}

/** Full variant config (v2) — all settings in one object. */
export interface PageVariantSettings {
  v: 2;
  mode: "flashy" | "calm";
  timing: SpinTimingConfig;
  speedMultiplier: number;
  accessoryRange: LayerRange;
  scarRange: LayerRange;
  tortieRange: LayerRange;
  afterlifeMode: AfterlifeOption;
  extendedModes: string[]; // Set<ExtendedMode> serialized as sorted array
  includeBaseColours: boolean;
  catName: string;
  creatorName: string;
}

export interface PageVariant {
  id: string;
  name: string;
  settings: PageVariantSettings;
  createdAt: number;
  updatedAt: number;
}

export interface VariantStore {
  activeId: string | null;
  variants: PageVariant[];
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_VARIANT_SETTINGS: PageVariantSettings = {
  v: 2,
  mode: "flashy",
  timing: DEFAULT_TIMING_CONFIG,
  speedMultiplier: 1.0,
  accessoryRange: { min: 1, max: 4 },
  scarRange: { min: 1, max: 1 },
  tortieRange: { min: 1, max: 4 },
  afterlifeMode: "dark10",
  extendedModes: [],
  includeBaseColours: true,
  catName: "",
  creatorName: "",
};

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const VARIANT_STORE_KEY = "singleCatPlus.variants";
const OLD_TIMING_KEY = "singleCatPlus.paramTiming";

// ---------------------------------------------------------------------------
// v1 migration
// ---------------------------------------------------------------------------

interface V1Payload {
  v: number;
  timing: SpinTimingConfig;
}

function clampPauseMs(value: unknown, fallback: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  const clamped = Math.round(num);
  return Math.min(10000, Math.max(1000, clamped));
}

function sanitizeTiming(raw: unknown): SpinTimingConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_TIMING_CONFIG;
  const t = raw as Partial<SpinTimingConfig>;

  const delays: Partial<Record<ParamTimingKey, number>> = {};
  if (t.delays && typeof t.delays === "object") {
    for (const [key, value] of Object.entries(t.delays)) {
      if (isParamTimingKey(key) && typeof value === "number" && Number.isFinite(value)) {
        delays[key] = Math.max(0, value);
      }
    }
  }

  const subsetLimits: Partial<Record<ParamTimingKey, boolean>> = {};
  if (t.subsetLimits && typeof t.subsetLimits === "object") {
    for (const [key, value] of Object.entries(t.subsetLimits)) {
      if (isParamTimingKey(key) && Boolean(value)) {
        subsetLimits[key] = true;
      }
    }
  }

  const defaultFlashy = DEFAULT_TIMING_CONFIG.pauseDelays?.flashyMs ?? 1000;
  const defaultCalm = DEFAULT_TIMING_CONFIG.pauseDelays?.calmMs ?? 1000;
  const incomingPause = (t.pauseDelays && typeof t.pauseDelays === "object") ? t.pauseDelays : {};
  const pauseDelays = {
    flashyMs: clampPauseMs((incomingPause as Record<string, unknown>).flashyMs, defaultFlashy),
    calmMs: clampPauseMs((incomingPause as Record<string, unknown>).calmMs, defaultCalm),
  };

  return {
    allowFastFlips: Boolean(t.allowFastFlips),
    delays: { ...DEFAULT_TIMING_CONFIG.delays, ...delays },
    subsetLimits,
    pauseDelays,
  };
}

/** Wraps a v1 timing-only config into a v2 PageVariantSettings with defaults for non-timing fields. */
export function migrateV1ToV2(v1Payload: unknown): PageVariantSettings {
  const data = (v1Payload && typeof v1Payload === "object") ? v1Payload as V1Payload : { v: 1, timing: DEFAULT_TIMING_CONFIG };
  return {
    ...DEFAULT_VARIANT_SETTINGS,
    timing: sanitizeTiming(data.timing),
  };
}

/** Detects v1 vs v2 payloads from Convex and returns a valid PageVariantSettings. */
export function parseConvexPayload(payload: unknown): PageVariantSettings {
  if (!payload || typeof payload !== "object") {
    return { ...DEFAULT_VARIANT_SETTINGS };
  }
  const data = payload as Record<string, unknown>;

  // v2 payload has v === 2 and all top-level keys
  if (data.v === 2 && "mode" in data && "timing" in data) {
    const modes = data.extendedModes;
    return {
      v: 2,
      mode: data.mode === "calm" ? "calm" : "flashy",
      timing: sanitizeTiming(data.timing),
      speedMultiplier: typeof data.speedMultiplier === "number" && Number.isFinite(data.speedMultiplier) ? data.speedMultiplier : 1.0,
      accessoryRange: isValidRange(data.accessoryRange) ? data.accessoryRange as LayerRange : DEFAULT_VARIANT_SETTINGS.accessoryRange,
      scarRange: isValidRange(data.scarRange) ? data.scarRange as LayerRange : DEFAULT_VARIANT_SETTINGS.scarRange,
      tortieRange: isValidRange(data.tortieRange) ? data.tortieRange as LayerRange : DEFAULT_VARIANT_SETTINGS.tortieRange,
      afterlifeMode: isAfterlifeOption(data.afterlifeMode) ? data.afterlifeMode : DEFAULT_VARIANT_SETTINGS.afterlifeMode,
      extendedModes: Array.isArray(modes) ? (modes as string[]).filter((m) => typeof m === "string").sort() : [],
      includeBaseColours: typeof data.includeBaseColours === "boolean" ? data.includeBaseColours : true,
      catName: typeof data.catName === "string" ? data.catName : "",
      creatorName: typeof data.creatorName === "string" ? data.creatorName : "",
    };
  }

  // v1 payload: { v: 1, timing: SpinTimingConfig }
  return migrateV1ToV2(payload);
}

function isValidRange(value: unknown): value is LayerRange {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return typeof r.min === "number" && typeof r.max === "number" && r.min >= 0 && r.max >= r.min;
}

const AFTERLIFE_VALUES: AfterlifeOption[] = ["off", "dark10", "star10", "both10", "darkForce", "starForce"];
function isAfterlifeOption(value: unknown): value is AfterlifeOption {
  return typeof value === "string" && AFTERLIFE_VALUES.includes(value as AfterlifeOption);
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/** Stable JSON comparison — extendedModes sorted for consistency. */
export function settingsEqual(a: PageVariantSettings, b: PageVariantSettings): boolean {
  const normalize = (s: PageVariantSettings) => ({
    ...s,
    extendedModes: [...s.extendedModes].sort(),
  });
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

// ---------------------------------------------------------------------------
// localStorage
// ---------------------------------------------------------------------------

export function loadVariantStore(): VariantStore {
  if (typeof window === "undefined") return { activeId: null, variants: [] };
  try {
    const raw = localStorage.getItem(VARIANT_STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.variants)) {
        return parsed as VariantStore;
      }
    }
  } catch {
    // corrupted — fall through
  }

  // Migrate from old timing key if present
  try {
    const oldRaw = localStorage.getItem(OLD_TIMING_KEY);
    if (oldRaw) {
      const oldConfig = JSON.parse(oldRaw);
      const settings = migrateV1ToV2({ v: 1, timing: oldConfig });
      const now = Date.now();
      const variant: PageVariant = {
        id: crypto.randomUUID(),
        name: "Migrated Timing",
        settings,
        createdAt: now,
        updatedAt: now,
      };
      const store: VariantStore = { activeId: variant.id, variants: [variant] };
      localStorage.setItem(VARIANT_STORE_KEY, JSON.stringify(store));
      return store;
    }
  } catch {
    // migration failed — fresh start
  }

  return { activeId: null, variants: [] };
}

export function saveVariantStore(store: VariantStore): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(VARIANT_STORE_KEY, JSON.stringify(store));
  } catch {
    // quota exceeded or similar
  }
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export interface UsePageVariantsReturn {
  store: VariantStore;
  activeVariant: PageVariant | null;
  createVariant: (name: string, settings: PageVariantSettings) => PageVariant;
  saveToActive: (settings: PageVariantSettings) => void;
  deleteVariant: (id: string) => void;
  renameVariant: (id: string, name: string) => void;
  setActive: (id: string | null) => void;
}

export function usePageVariants(): UsePageVariantsReturn {
  const [store, setStore] = useState<VariantStore>({ activeId: null, variants: [] });
  const initialized = useRef(false);

  // Load from localStorage on mount (hydration-safe)
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    // Persisted settings are applied post-hydration to avoid SSR/client mismatches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStore(loadVariantStore());
  }, []);

  // Persist on change (skip initial render)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    saveVariantStore(store);
  }, [store]);

  const activeVariant = store.variants.find((v) => v.id === store.activeId) ?? null;

  const createVariant = useCallback((name: string, settings: PageVariantSettings): PageVariant => {
    const now = Date.now();
    const variant: PageVariant = {
      id: crypto.randomUUID(),
      name,
      settings,
      createdAt: now,
      updatedAt: now,
    };
    setStore((prev) => ({
      activeId: variant.id,
      variants: [...prev.variants, variant],
    }));
    return variant;
  }, []);

  const saveToActive = useCallback((settings: PageVariantSettings) => {
    setStore((prev) => {
      if (!prev.activeId) return prev;
      return {
        ...prev,
        variants: prev.variants.map((v) =>
          v.id === prev.activeId
            ? { ...v, settings, updatedAt: Date.now() }
            : v
        ),
      };
    });
  }, []);

  const deleteVariant = useCallback((id: string) => {
    setStore((prev) => ({
      activeId: prev.activeId === id ? null : prev.activeId,
      variants: prev.variants.filter((v) => v.id !== id),
    }));
  }, []);

  const renameVariant = useCallback((id: string, name: string) => {
    setStore((prev) => ({
      ...prev,
      variants: prev.variants.map((v) =>
        v.id === id ? { ...v, name, updatedAt: Date.now() } : v
      ),
    }));
  }, []);

  const setActive = useCallback((id: string | null) => {
    setStore((prev) => ({ ...prev, activeId: id }));
  }, []);

  return { store, activeVariant, createVariant, saveToActive, deleteVariant, renameVariant, setActive };
}
