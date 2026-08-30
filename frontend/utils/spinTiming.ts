import {
  getSelectableCatalogElementsFromCatalog,
  publicCatCatalog,
} from "@/lib/cat-system/catalog";
import type {
  CatSystemDefinition,
  TraitValueKind,
} from "@/lib/cat-system/definition";
import {
  catDocumentToLegacyParams,
  legacyParamsToCatDocument,
} from "@/lib/cat-system/document";
import { catSystem } from "@/lib/cat-system/registry";
import { getSystemRevealTraits } from "@/lib/cat-system/runtime";
import type { CatParams } from "@/lib/cat-v3/types";

/** Registry timing IDs plus legacy compound-animation substeps. */
export type ParamTimingKey = string;

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

function spinRevealTraits(system: CatSystemDefinition) {
  return getSystemRevealTraits(system)
    .filter((trait) => {
      const reveal = trait.capabilities.reveal;
      return reveal !== false && reveal?.spin !== false;
    })
    .sort((left, right) => {
      const leftReveal = left.capabilities.reveal;
      const rightReveal = right.capabilities.reveal;
      const leftOrder =
        leftReveal && leftReveal.spin !== false
          ? (leftReveal.spin?.order ?? left.order)
          : left.order;
      const rightOrder =
        rightReveal && rightReveal.spin !== false
          ? (rightReveal.spin?.order ?? right.order)
          : right.order;
      return leftOrder - rightOrder || left.id.localeCompare(right.id);
    });
}

const revealTraits = spinRevealTraits(catSystem);
const legacyCompoundTimingKeys = [
  "tortieMask",
  "tortiePattern",
  "tortieColour",
] as const;

/** Fixed product setting: registry additions do not grow the timing UI. */
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
  ...legacyCompoundTimingKeys,
  "sprite",
];

export interface RegistryRevealDefinition {
  /** Animation/timing ID. Existing aliases such as `sprite` remain stable. */
  id: string;
  traitId: string;
  /** Product label used for a multi-row layer group's heading. */
  groupLabel: string;
  label: string;
  optional: boolean;
  strategy: "single" | "slots" | "compoundSlots";
  timingKey: string;
  valueKind: TraitValueKind;
  catalogId?: string;
  layerKey: string;
  compoundMode?: "tortieParts" | "wholeValue";
}

/**
 * The one reveal-sequence builder shared by Single Cat Plus and OBS. It has no
 * trait-ID list: adding a reveal capability to the registry adds a definition.
 */
export function buildRegistryRevealSequence(
  system: CatSystemDefinition = catSystem,
): RegistryRevealDefinition[] {
  return spinRevealTraits(system).flatMap((trait) => {
    const reveal = trait.capabilities.reveal;
    if (!reveal) return [];
    const timingKey = reveal.timingKey ?? trait.id;
    const gachaCatalog =
      trait.gacha?.strategy === "catalogChoice" ||
      trait.gacha?.strategy === "slotList"
        ? trait.gacha.catalog
        : undefined;
    return [
      {
        id: timingKey,
        traitId: trait.id,
        groupLabel: trait.label,
        label:
          reveal.spin !== false
            ? (reveal.spin?.label ?? trait.label)
            : trait.label,
        optional: !trait.value.required,
        strategy: reveal.strategy,
        timingKey,
        valueKind: trait.value.kind,
        catalogId: trait.value.catalog ?? gachaCatalog,
        layerKey: trait.id,
        ...(reveal.strategy === "compoundSlots"
          ? {
              compoundMode:
                trait.legacy.strategy === "tortie" &&
                trait.gacha.strategy === "tortieList"
                  ? ("tortieParts" as const)
                  : ("wholeValue" as const),
            }
          : {}),
      },
    ];
  });
}

export const REGISTRY_REVEAL_SEQUENCE = buildRegistryRevealSequence();

export function getRegistryRevealOptions(
  definition: RegistryRevealDefinition,
  pose?: string,
  catalogs: Readonly<
    Record<
      string,
      readonly {
        id: string;
        poses?: readonly string[];
        deprecated?: boolean;
      }[]
    >
  > = publicCatCatalog.catalogs,
): unknown[] {
  if (definition.valueKind === "boolean") return [true, false];
  if (!definition.catalogId) return [];
  const values = getSelectableCatalogElementsFromCatalog(
    { catalogs },
    definition.catalogId,
    pose,
  ).map((element) => element.id);
  return Array.from(
    new Set(definition.optional ? ["none", ...values] : values),
  );
}

export function getRegistryRevealDefinition(
  id: string,
): RegistryRevealDefinition | undefined {
  return REGISTRY_REVEAL_SEQUENCE.find(
    (definition) => definition.id === id || definition.traitId === id,
  );
}

function withoutCanonicalEnvelope(
  params: Partial<CatParams>,
): Record<string, unknown> {
  const legacy = { ...(params as Record<string, unknown>) };
  delete legacy.schemaVersion;
  delete legacy.traits;
  delete legacy.unknownTraits;
  return legacy;
}

function partialParamsToCatDocument(params: Partial<CatParams>) {
  const legacy = withoutCanonicalEnvelope(params);
  const poseTrait = catSystem.traits.find(
    (trait) => trait.legacy.strategy === "pose",
  );
  if (
    poseTrait?.legacy.strategy === "pose" &&
    legacy[poseTrait.legacy.key] === undefined &&
    legacy[poseTrait.legacy.spriteKey] === undefined &&
    poseTrait.value.default !== undefined
  ) {
    legacy[poseTrait.legacy.key] = poseTrait.value.default;
  }
  return legacyParamsToCatDocument(legacy);
}

/** Keeps canonical traits authoritative while maintaining legacy projections. */
export function setRegistryRevealValue(
  params: Partial<CatParams>,
  definition: RegistryRevealDefinition,
  rawValue: unknown,
): void {
  const legacyDocument = partialParamsToCatDocument(params);
  const traits: Record<string, unknown> = {
    ...legacyDocument.traits,
    ...(params.traits ?? {}),
  };
  const absent =
    rawValue === undefined ||
    rawValue === null ||
    (definition.optional &&
      typeof rawValue === "string" &&
      rawValue.toLowerCase() === "none");
  if (absent) delete traits[definition.traitId];
  else traits[definition.traitId] = rawValue;

  const document = {
    ...legacyDocument,
    traits,
    unknownTraits: params.unknownTraits,
  };
  Object.assign(params, catDocumentToLegacyParams(document), {
    schemaVersion: document.schemaVersion,
    traits: document.traits,
    unknownTraits: document.unknownTraits,
  });
}

export function getRegistryRevealValue(
  params: Partial<CatParams>,
  definition: RegistryRevealDefinition,
): unknown {
  if (params.traits && definition.traitId in params.traits) {
    return (params.traits as Record<string, unknown>)[definition.traitId];
  }
  return partialParamsToCatDocument(params).traits[
    definition.traitId as keyof ReturnType<
      typeof legacyParamsToCatDocument
    >["traits"]
  ];
}

const legacyTimingLabels: Record<string, string> = {
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
};

export const PARAM_TIMING_LABELS: Record<ParamTimingKey, string> = {
  ...Object.fromEntries(
    revealTraits.map((trait) => [
      (trait.capabilities.reveal || undefined)?.timingKey ?? trait.id,
      trait.label,
    ]),
  ),
  ...legacyTimingLabels,
};

export const PARAM_DEFAULT_STEP_COUNTS: Partial<
  Record<ParamTimingKey, number>
> = {
  ...Object.fromEntries(
    revealTraits.map((trait) => [
      (trait.capabilities.reveal || undefined)?.timingKey ?? trait.id,
      (trait.capabilities.reveal || undefined)?.defaultSteps ?? 1,
    ]),
  ),
  tortieMask: 8,
  tortiePattern: 8,
  tortieColour: 8,
};

export interface TimingPresetSet {
  slow: number;
  normal: number;
  fast: number;
}

const legacyTimingPresets: Record<string, TimingPresetSet> = {
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
  reverse: { slow: 300, normal: 150, fast: 120 },
  tortie: { slow: 400, normal: 200, fast: 160 },
  shading: { slow: 300, normal: 150, fast: 120 },
};

export const PARAM_TIMING_PRESETS: Record<ParamTimingKey, TimingPresetSet> = {
  ...Object.fromEntries(
    revealTraits.map((trait) => [
      (trait.capabilities.reveal || undefined)?.timingKey ?? trait.id,
      { slow: 360, normal: 180, fast: 150 },
    ]),
  ),
  ...legacyTimingPresets,
};

const STORAGE_KEY = "singleCatPlus.paramTiming";

export const DEFAULT_TIMING_CONFIG: SpinTimingConfig = {
  allowFastFlips: false,
  delays: Object.fromEntries(
    PARAM_TIMING_ORDER.map((key) => [
      key,
      PARAM_TIMING_PRESETS[key]?.normal ?? 180,
    ]),
  ),
  subsetLimits: {},
  pauseDelays: {
    flashyMs: 1000,
    calmMs: 1000,
  },
};

export function clampDelay(value: number, allowFast: boolean): number {
  const candidate = Number.isFinite(value)
    ? Math.max(value, ABSOLUTE_MIN_STEP_MS)
    : MIN_SAFE_STEP_MS;
  if (allowFast) {
    return candidate;
  }
  return Math.max(candidate, MIN_SAFE_STEP_MS);
}

export function getDelayForKey(
  config: SpinTimingConfig,
  key: ParamTimingKey,
): number {
  const base =
    config.delays[key] ?? PARAM_TIMING_PRESETS[key]?.normal ?? MIN_SAFE_STEP_MS;
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
    overheadMs:
      Number.isFinite(metric.overheadMs) && metric.overheadMs > 0
        ? metric.overheadMs
        : 0,
    variants:
      Number.isFinite(metric.variants) && metric.variants > 0
        ? metric.variants
        : 0,
  };
}

export function computeTimingTotals(
  config: SpinTimingConfig,
  metrics: TimingMetrics,
): TimingTotals {
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
  const totals = computeTimingTotals(
    config,
    stepCountsToMetrics(PARAM_DEFAULT_STEP_COUNTS),
  );
  return totals.total;
}

export function stepCountsToMetrics(
  counts: Partial<Record<ParamTimingKey, number>>,
): TimingMetrics {
  const metrics: TimingMetrics = {};
  (Object.entries(counts) as Array<[ParamTimingKey, number]>).forEach(
    ([key, value]) => {
      if (!Number.isFinite(value) || value <= 0) return;
      metrics[key] = {
        steps: value,
        overheadMs: 0,
        variants: 0,
      };
    },
  );
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
      subsetLimits: {
        ...(DEFAULT_TIMING_CONFIG.subsetLimits ?? {}),
        ...(parsed.subsetLimits ?? {}),
      },
      pauseDelays: {
        flashyMs:
          parsed.pauseDelays?.flashyMs ??
          DEFAULT_TIMING_CONFIG.pauseDelays?.flashyMs ??
          1000,
        calmMs:
          parsed.pauseDelays?.calmMs ??
          DEFAULT_TIMING_CONFIG.pauseDelays?.calmMs ??
          1000,
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
      }),
    );
  } catch (error) {
    console.warn("Failed to persist spin timing config", error);
  }
}
