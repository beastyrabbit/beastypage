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

/** Variant-managed settings (v2) for the single-cat-plus page. */
export interface SingleCatSettings {
  v: 2;
  mode: "flashy" | "calm";
  timing: SpinTimingConfig;
  speedMultiplier: number;
  accessoryRange: LayerRange;
  scarRange: LayerRange;
  tortieRange: LayerRange;
  afterlifeMode: AfterlifeOption;
  extendedModes: ExtendedMode[];
  includeBaseColours: boolean;
  catName: string;
  creatorName: string;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_SINGLE_CAT_SETTINGS: SingleCatSettings = {
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
// Validation helpers
// ---------------------------------------------------------------------------

const EXTENDED_MODE_VALUES: Set<string> = new Set([
  "base", "mood", "bold", "darker", "blackout", "mononoke", "howl",
  "demonslayer", "titanic", "deathnote", "slime", "ghostintheshell",
  "mushishi", "chisweethome", "fma",
]);

const AFTERLIFE_VALUES: Set<string> = new Set(["off", "dark10", "star10", "both10", "darkForce", "starForce"]);

function isAfterlifeOption(value: unknown): value is AfterlifeOption {
  return typeof value === "string" && AFTERLIFE_VALUES.has(value);
}

function isValidRange(value: unknown): value is LayerRange {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.min === "number" &&
    typeof r.max === "number" &&
    Number.isFinite(r.min) &&
    Number.isFinite(r.max) &&
    r.min >= 0 &&
    r.max >= r.min
  );
}

// ---------------------------------------------------------------------------
// Timing sanitization
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// v1 migration
// ---------------------------------------------------------------------------

interface V1Payload {
  v: number;
  timing: SpinTimingConfig;
}

/** Converts a v1 payload (or any unknown input) into a v2 SingleCatSettings, using defaults for all non-timing fields. */
export function migrateV1ToV2(v1Payload: unknown): SingleCatSettings {
  const data = (v1Payload && typeof v1Payload === "object") ? v1Payload as V1Payload : { v: 1, timing: DEFAULT_TIMING_CONFIG };
  return {
    ...DEFAULT_SINGLE_CAT_SETTINGS,
    timing: sanitizeTiming(data.timing),
  };
}

// ---------------------------------------------------------------------------
// Payload parsing (Convex / import)
// ---------------------------------------------------------------------------

/** Detects v1 vs v2 payloads from Convex and returns a valid SingleCatSettings. */
export function parseSingleCatPayload(payload: unknown): SingleCatSettings {
  if (!payload || typeof payload !== "object") {
    return { ...DEFAULT_SINGLE_CAT_SETTINGS };
  }
  const data = payload as Record<string, unknown>;

  // v2 payload: v === 2 with "mode" and "timing" required; other keys fall back to defaults
  if (data.v === 2 && "mode" in data && "timing" in data) {
    const modes = data.extendedModes;
    return {
      v: 2,
      mode: data.mode === "calm" ? "calm" : "flashy",
      timing: sanitizeTiming(data.timing),
      speedMultiplier: typeof data.speedMultiplier === "number" && Number.isFinite(data.speedMultiplier)
        ? Math.min(10, Math.max(0.1, data.speedMultiplier))
        : 1.0,
      accessoryRange: isValidRange(data.accessoryRange) ? data.accessoryRange as LayerRange : DEFAULT_SINGLE_CAT_SETTINGS.accessoryRange,
      scarRange: isValidRange(data.scarRange) ? data.scarRange as LayerRange : DEFAULT_SINGLE_CAT_SETTINGS.scarRange,
      tortieRange: isValidRange(data.tortieRange) ? data.tortieRange as LayerRange : DEFAULT_SINGLE_CAT_SETTINGS.tortieRange,
      afterlifeMode: isAfterlifeOption(data.afterlifeMode) ? data.afterlifeMode : DEFAULT_SINGLE_CAT_SETTINGS.afterlifeMode,
      extendedModes: Array.isArray(modes) ? [...new Set((modes as string[]).filter((m): m is ExtendedMode => EXTENDED_MODE_VALUES.has(m)))].sort() : [],
      includeBaseColours: typeof data.includeBaseColours === "boolean" ? data.includeBaseColours : true,
      catName: typeof data.catName === "string" ? data.catName.slice(0, 100) : "",
      creatorName: typeof data.creatorName === "string" ? data.creatorName.slice(0, 100) : "",
    };
  }

  // v1 payload: { v: 1, timing: SpinTimingConfig }
  return migrateV1ToV2(payload);
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/** JSON comparison that normalizes extendedModes order before comparing. */
export function singleCatSettingsEqual(a: SingleCatSettings, b: SingleCatSettings): boolean {
  const normalize = (s: SingleCatSettings) => ({
    ...s,
    extendedModes: [...s.extendedModes].sort(),
  });
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

// ---------------------------------------------------------------------------
// Migration callback for useVariants
// ---------------------------------------------------------------------------

const OLD_TIMING_KEY = "singleCatPlus.paramTiming";

/** One-time migration: reads old singleCatPlus.paramTiming from localStorage and converts to a variant. The old key is removed via the returned cleanup callback only after the caller has persisted the migrated data. */
export function migrateSingleCatTiming(): { name: string; settings: SingleCatSettings; cleanup?: () => void } | null {
  if (typeof window === "undefined") return null;
  try {
    const oldRaw = localStorage.getItem(OLD_TIMING_KEY);
    if (!oldRaw) return null;
    const oldConfig = JSON.parse(oldRaw);
    const settings = migrateV1ToV2({ v: 1, timing: oldConfig });
    return {
      name: "Migrated Timing",
      settings,
      cleanup: () => localStorage.removeItem(OLD_TIMING_KEY),
    };
  } catch (error) {
    console.error("Failed to migrate v1 timing config", error);
    return null;
  }
}
