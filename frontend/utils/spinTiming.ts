import { useEffect, useState } from "react";

type ParamId =
  | "colour"
  | "pelt"
  | "eyeColour"
  | "eyeColour2"
  | "tortie"
  | "tortieMask"
  | "tortiePattern"
  | "tortieColour"
  | "tint"
  | "skinColour"
  | "whitePatches"
  | "points"
  | "whitePatchesTint"
  | "vitiligo"
  | "shading"
  | "reverse"
  | "accessory"
  | "scar"
  | "sprite";

export type ParamTimingKey =
  | ParamId
  | "accessory"
  | "scar"
  | "tortieMask"
  | "tortiePattern"
  | "tortieColour";

export interface SpinTimingConfig {
  allowFastFlips: boolean;
  delays: Partial<Record<ParamTimingKey, number>>;
  subsetLimits?: Partial<Record<ParamTimingKey, boolean>>;
  pauseDelays?: {
    flashyMs: number;
    calmMs: number;
  };
}

export interface TimingMetric {
  steps: number;
  overheadMs: number;
  variants: number;
}

export type TimingMetrics = Partial<Record<ParamTimingKey, TimingMetric>>;

export interface TimingTotals {
  perKey: Partial<Record<ParamTimingKey, number>>;
  total: number;
}

export const ABSOLUTE_MIN_STEP_MS = 45;
export const MIN_SAFE_STEP_MS = 120;

export const PARAM_TIMING_ORDER: ParamTimingKey[] = [
  "colour",
  "pelt",
  "eyeColour",
  "eyeColour2",
  "tint",
  "skinColour",
  "whitePatches",
  "points",
  "whitePatchesTint",
  "vitiligo",
  "accessory",
  "scar",
  "tortieMask",
  "tortiePattern",
  "tortieColour",
  "sprite",
];

export const PARAM_TIMING_LABELS: Record<ParamTimingKey, string> = {
  colour: "Base Colour",
  pelt: "Pelt",
  eyeColour: "Eyes",
  eyeColour2: "Eye Colour 2",
  tint: "Tint",
  skinColour: "Skin",
  whitePatches: "White Patches",
  points: "Points",
  whitePatchesTint: "White Patch Tint",
  vitiligo: "Vitiligo",
  accessory: "Accessory",
  scar: "Scar",
  tortieMask: "Tortie Mask",
  tortiePattern: "Tortie Pelt",
  tortieColour: "Tortie Colour",
  sprite: "Sprite Pose",
  tortie: "Tortie Toggle",
  shading: "Shading",
  reverse: "Reverse",
} as const;

export const PARAM_DEFAULT_STEP_COUNTS: Partial<Record<ParamTimingKey, number>> = {
  colour: 19,
  pelt: 10,
  eyeColour: 8,
  eyeColour2: 6,
  tint: 8,
  skinColour: 5,
  whitePatches: 10,
  points: 6,
  whitePatchesTint: 6,
  vitiligo: 6,
  accessory: 12,
  scar: 10,
  tortieMask: 8,
  tortiePattern: 8,
  tortieColour: 8,
  sprite: 10,
};

export interface TimingPresetSet {
  slow: number;
  normal: number;
  fast: number;
}

export const PARAM_TIMING_PRESETS: Record<ParamTimingKey, TimingPresetSet> = {
  colour: { slow: 360, normal: 180, fast: 150 },
  pelt: { slow: 360, normal: 180, fast: 150 },
  eyeColour: { slow: 320, normal: 160, fast: 130 },
  eyeColour2: { slow: 320, normal: 160, fast: 130 },
  tint: { slow: 340, normal: 170, fast: 140 },
  skinColour: { slow: 340, normal: 170, fast: 140 },
  whitePatches: { slow: 380, normal: 190, fast: 150 },
  points: { slow: 340, normal: 170, fast: 140 },
  whitePatchesTint: { slow: 320, normal: 160, fast: 130 },
  vitiligo: { slow: 340, normal: 170, fast: 140 },
  accessory: { slow: 380, normal: 190, fast: 150 },
  scar: { slow: 380, normal: 190, fast: 150 },
  tortieMask: { slow: 420, normal: 210, fast: 170 },
  tortiePattern: { slow: 420, normal: 210, fast: 170 },
  tortieColour: { slow: 420, normal: 210, fast: 170 },
  sprite: { slow: 380, normal: 190, fast: 150 },
};

const STORAGE_KEY = "singleCatPlus.paramTiming";

export const DEFAULT_TIMING_CONFIG: SpinTimingConfig = {
  allowFastFlips: false,
  delays: Object.fromEntries(
    PARAM_TIMING_ORDER.map((key) => [key, PARAM_TIMING_PRESETS[key]?.normal ?? 180])
  ),
  subsetLimits: {},
  pauseDelays: {
    flashyMs: 1000,
    calmMs: 1000,
  },
};

export function clampDelay(value: number, allowFast: boolean): number {
  const candidate = Number.isFinite(value) ? Math.max(value, ABSOLUTE_MIN_STEP_MS) : MIN_SAFE_STEP_MS;
  if (allowFast) {
    return candidate;
  }
  return Math.max(candidate, MIN_SAFE_STEP_MS);
}

export function getDelayForKey(config: SpinTimingConfig, key: ParamTimingKey): number {
  const base = config.delays[key] ?? PARAM_TIMING_PRESETS[key]?.normal ?? MIN_SAFE_STEP_MS;
  return clampDelay(base, config.allowFastFlips);
}

export function getPresetValues(key: ParamTimingKey): TimingPresetSet {
  return PARAM_TIMING_PRESETS[key] ?? { slow: 200, normal: 160, fast: 130 };
}

export function isParamTimingKey(value: string): value is ParamTimingKey {
  return (PARAM_TIMING_ORDER as string[]).includes(value);
}

function normaliseMetric(metric: TimingMetric | undefined): TimingMetric {
  if (!metric) {
    return { steps: 0, overheadMs: 0, variants: 0 };
  }
  return {
    steps: Number.isFinite(metric.steps) && metric.steps > 0 ? metric.steps : 0,
    overheadMs: Number.isFinite(metric.overheadMs) && metric.overheadMs > 0 ? metric.overheadMs : 0,
    variants: Number.isFinite(metric.variants) && metric.variants > 0 ? metric.variants : 0,
  };
}

export function computeTimingTotals(config: SpinTimingConfig, metrics: TimingMetrics): TimingTotals {
  const perKey: Partial<Record<ParamTimingKey, number>> = {};
  let total = 0;
  PARAM_TIMING_ORDER.forEach((key) => {
    const delay = getDelayForKey(config, key);
    const metric = normaliseMetric(metrics[key]);
    const duration = delay * metric.steps + metric.overheadMs;
    perKey[key] = duration;
    total += duration;
  });
  return { perKey, total };
}

export function computeDefaultTotal(config: SpinTimingConfig): number {
  const totals = computeTimingTotals(config, stepCountsToMetrics(PARAM_DEFAULT_STEP_COUNTS));
  return totals.total;
}

export function stepCountsToMetrics(
  counts: Partial<Record<ParamTimingKey, number>>
): TimingMetrics {
  const metrics: TimingMetrics = {};
  (Object.entries(counts) as Array<[ParamTimingKey, number]>).forEach(([key, value]) => {
    if (!Number.isFinite(value) || value <= 0) return;
    metrics[key] = {
      steps: value,
      overheadMs: 0,
      variants: 0,
    };
  });
  return metrics;
}

export function loadTimingConfig(): SpinTimingConfig {
  if (typeof window === "undefined") return DEFAULT_TIMING_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TIMING_CONFIG;
    const parsed = JSON.parse(raw) as SpinTimingConfig;
    if (!parsed || typeof parsed !== "object") return DEFAULT_TIMING_CONFIG;
    const hydrated: SpinTimingConfig = {
      allowFastFlips: false,
      delays: { ...DEFAULT_TIMING_CONFIG.delays, ...(parsed.delays ?? {}) },
      subsetLimits: { ...(DEFAULT_TIMING_CONFIG.subsetLimits ?? {}), ...(parsed.subsetLimits ?? {}) },
      pauseDelays: {
        ...(DEFAULT_TIMING_CONFIG.pauseDelays ?? {}),
        ...(parsed.pauseDelays ?? {}),
      },
    };
    return hydrated;
  } catch (error) {
    console.warn("Failed to load spin timing config", error);
    return DEFAULT_TIMING_CONFIG;
  }
}

export function saveTimingConfig(config: SpinTimingConfig) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...config,
        subsetLimits: config.subsetLimits ?? {},
        pauseDelays: config.pauseDelays ?? DEFAULT_TIMING_CONFIG.pauseDelays,
      })
    );
  } catch (error) {
    console.warn("Failed to persist spin timing config", error);
  }
}

export function usePersistentTimingConfig(): [SpinTimingConfig, (next: SpinTimingConfig) => void] {
  const [config, setConfig] = useState<SpinTimingConfig>(DEFAULT_TIMING_CONFIG);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const restored = loadTimingConfig();
    // Persisted settings are applied post-hydration to avoid SSR/client mismatches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfig(restored);
  }, []);

  const update = (next: SpinTimingConfig) => {
    setConfig(next);
    saveTimingConfig(next);
  };

  return [config, update];
}
