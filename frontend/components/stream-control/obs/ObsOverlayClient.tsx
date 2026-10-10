"use client";

/**
 * ObsOverlayClient — the OBS browser-source overlay (formerly OBSSpinClient,
 * forked from SingleCatPlusClient.tsx).
 *
 * Subscribes to the stream session by API key and dispatches
 * `currentCommand` updates (spin, wheel, countdown, clear, lobby, brb, test)
 * onto the scene components in ./scenes. The spin engine (generateCatPlus,
 * flip sequences, timing) lives here because it runs across scene changes;
 * pure helpers live in ./spinSupport, dispatch decisions in ./commandPolicy.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatGeneratorApi } from "@/components/cat-builder/types";
import {
  type BatchStreamCommand,
  parseBatchStreamCommand,
} from "@/lib/adoption/streamBatch";
import {
  catDataToLegacyPersistence,
  syncChangedRegistryTraitsFromLegacy,
} from "@/lib/cat-system";
import { DEFAULT_POSE_NAME, formatPoseName } from "@/lib/cat-v3/poseOptions";
import type { CatParams } from "@/lib/cat-v3/types";
import {
  type EvolutionStreamCommand,
  estimateEvolutionCommandMs,
  parseEvolutionStreamCommand,
} from "@/lib/evolution/streamEvolution";
import { decodePortableSettings } from "@/lib/portable-settings";
import {
  type CountRevealGroup,
  prefetchCountReveal,
  prepareCountReveal,
} from "@/lib/single-cat/spin/countReveal";
import {
  readSpinPools,
  type TortieSlotSpin,
  tortieStageCandidate,
} from "@/lib/single-cat/spin/descriptors";
import {
  createSpinFrameLoader,
  SpinLoaderDisposedError,
} from "@/lib/single-cat/spin/frameLoader";
import {
  buildSpinPlan,
  type ParamPhase,
  prefetchSpin,
  type SpinPlan,
  type StringSlotPhase,
  type TortieSlotPhase,
} from "@/lib/single-cat/spin/spinPlan";
import type { SpinFrameLoader } from "@/lib/single-cat/spin/types";
import {
  type StreamWheelSpin,
  WHEEL_SPIN_DURATION_MS,
} from "@/lib/wheel/classicWheel";
import {
  computeLayerCount,
  resolveAfterlife,
} from "@/utils/catSettingsHelpers";
import {
  type AfterlifeOption,
  DEFAULT_SINGLE_CAT_SETTINGS,
  type ExtendedMode,
  type LayerRange,
  type SingleCatSettings,
  singleCatSettingsEqual,
} from "@/utils/singleCatVariants";
import {
  clampDelay,
  computeDefaultTotal,
  computeTimingTotals,
  DEFAULT_TIMING_CONFIG,
  getDelayForKey,
  getPresetValues,
  isParamTimingKey,
  MIN_SAFE_STEP_MS,
  PARAM_DEFAULT_STEP_COUNTS,
  PARAM_TIMING_ORDER,
  PARAM_TIMING_PRESETS,
  type ParamTimingKey,
  type RegistryRevealDefinition,
  type SpinTimingConfig,
  stepCountsToMetrics,
  type TimingPresetSet,
} from "@/utils/spinTiming";
import type { OBSClassicWheelHandle } from "../OBSClassicWheel";
import type { LobbySettings } from "../OBSLobby";
import { decideCommandAction } from "./commandPolicy";
import { BatchScene } from "./scenes/BatchScene";
import { BrbScene } from "./scenes/BrbScene";
import { EvolutionScene } from "./scenes/EvolutionScene";
import { LobbyCountdownScene } from "./scenes/LobbyCountdownScene";
import { SpinBoard } from "./scenes/SpinBoard";
import { TestCard } from "./scenes/TestCard";
import {
  buildFlipSequence,
  buildParameterOptions,
  buildSharePayload,
  type CatState,
  cloneParams,
  compositeCountFrame,
  computeStepDurations,
  copyCanvasToClipboard,
  createCatShare,
  DEFAULT_SPRITE_NUMBER,
  DISPLAY_SIZE,
  deriveOptionCounts,
  encodeCatShare,
  FULL_EXPORT_SIZE,
  formatTortieLayer,
  formatValue,
  type GenerationCounts,
  GLOBAL_PRESETS,
  getBaseFrameDuration,
  getParameterValueForDisplay,
  getSpeedSettings,
  type Id,
  INSTANT_PARAMS,
  LAYER_GROUPS,
  LAYER_PARAM_IDS,
  type LayerGroup,
  type LayerRowState,
  logTimingReport,
  PARAM_REVEAL_PAUSE,
  PARAM_SEQUENCE,
  type ParameterOptions,
  type ParamId,
  type ParamRow,
  PLACEHOLDER_COLOUR,
  PRE_SPIN_DELAY,
  parseStreamWheelSpin,
  ROLLER_REVEAL_HOLD,
  type SingleCatPortableSettings,
  type SpriteMapperApi,
  sanitizeForBuilder,
  type TimingSnapshot,
  type TortieSlot,
  toClassicWheelSelection,
  track,
  type VariationFrame,
  type WheelRewardState,
  wait,
} from "./spinSupport";
import { useObsSession } from "./useObsSession";

function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

interface SpinOverride {
  params: unknown;
  slots?: unknown;
}

/** A rolled spin whose frames are already queued on its loader. */
interface PreparedSpin {
  loader: SpinFrameLoader;
  plan: SpinPlan;
  params: Partial<CatParams>;
  slotSelections: unknown;
  countReveal: CountRevealGroup[];
}

const STRING_LAYER_UI = {
  accessory: {
    title: "Accessories",
    slotLabel: "Accessory",
    rows: "accessories",
  },
  scar: { title: "Scars", slotLabel: "Scar", rows: "scars" },
} as const;

/** Spin plan phases looked up by slot index, in order, until one is missing. */
function collectSlotPhases<T>(lookup: (index: number) => T | undefined): T[] {
  const phases: T[] = [];
  for (let index = 0; ; index += 1) {
    const phase = lookup(index);
    if (!phase) return phases;
    phases.push(phase);
  }
}

function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

type FlipStep = ReturnType<typeof buildFlipSequence>[number];

/** A param row's index, assigned when setParamRows runs its updater. */
interface ParamRowIndex {
  current: number;
}

/** Spin inputs shared by every param reveal of one spin. */
interface ParamRevealContext {
  loader: SpinFrameLoader;
  plan: SpinPlan;
  hasRollerOptions: boolean;
  token: number;
}

/** Tortie parts are revealed by the tortie toggle's slot spin instead. */
const TORTIE_PART_IDS = new Set<ParamId>([
  "tortieMask",
  "tortiePattern",
  "tortieColour",
]);

/** Duration of the step at `index`, recomputed so live timing edits apply. */
function stepDurationAt(
  sequence: FlipStep[],
  index: number,
  delay: number,
  allowFastFlips: boolean,
): number {
  const durations = computeStepDurations(
    sequence.slice(index),
    delay,
    allowFastFlips,
  );
  return durations[0] ?? delay;
}

function flipStepStatus(step: FlipStep): "active" | "revealed" {
  return step.isFinal ? "revealed" : "active";
}

function formatSlotValue(value: string | null): string {
  return value ? formatValue(value) : "None";
}

/** Marks a prefilled param row active and records its index in `row`. */
function activateParamRow(
  prev: ParamRow[],
  definition: RegistryRevealDefinition,
  row: ParamRowIndex,
): ParamRow[] {
  const idx = prev.findIndex((entry) => entry.id === definition.id);
  if (idx !== -1) {
    row.current = idx;
    return prev.map((entry, i) =>
      i === idx ? { ...entry, value: "---", status: "active" as const } : entry,
    );
  }
  // Fallback: append if not found (shouldn't happen with prefill)
  console.warn(
    `[ObsOverlayClient] Param row for "${definition.id}" not found in prefilled board — appending as fallback`,
  );
  row.current = prev.length;
  return [
    ...prev,
    {
      id: definition.id,
      label: definition.label,
      value: "---",
      status: "active" as const,
    },
  ];
}

function revealParamRow(
  prev: ParamRow[],
  id: ParamId,
  value: string,
): ParamRow[] {
  return prev.map((row) =>
    row.id === id ? { ...row, value, status: "revealed" as const } : row,
  );
}

/** A param row during a flip: active, then revealed on the final frame. */
function showParamStep(
  prev: ParamRow[],
  id: ParamId,
  step: FlipStep,
): ParamRow[] {
  return prev.map((row) => {
    if (row.id !== id) return row;
    return {
      ...row,
      value: step.isFinal ? step.frame.option.display : row.value,
      status: flipStepStatus(step),
    };
  });
}

/** Moves the rolled count's frame last; buildFlipSequence lands on it. */
function moveRolledCountLast(frames: VariationFrame[], count: number): void {
  const targetIdx = frames.findIndex((f) => f.option.raw === count);
  if (targetIdx !== -1 && targetIdx !== frames.length - 1) {
    const [target] = frames.splice(targetIdx, 1);
    frames.push(target);
  }
}

function firstRolledSlot(slots: readonly unknown[]): string | null {
  return (
    slots.find(
      (entry): entry is string => typeof entry === "string" && entry !== "none",
    ) ?? null
  );
}

/** The finished spin's cat, before it is shared or persisted. */
function buildFinishedCatState(
  generator: CatGeneratorApi,
  prepared: PreparedSpin,
  counts: GenerationCounts,
  previous: CatState | null,
): CatState {
  const { params } = prepared;
  const { accessorySlots, scarSlots, tortieSlots } = prepared.plan.slots;
  const tortieLayers = tortieSlots.filter(Boolean) as TortieSlot[];
  const builderParams = sanitizeForBuilder(params, {
    accessory: firstRolledSlot(accessorySlots),
    scar: firstRolledSlot(scarSlots),
    tortie: tortieLayers.length > 0 ? tortieLayers[0] : null,
  });
  builderParams.spriteNumber = DEFAULT_SPRITE_NUMBER;
  builderParams.poseName = DEFAULT_POSE_NAME;

  return {
    params,
    accessorySlots,
    scarSlots,
    tortieSlots,
    counts,
    catUrl: generator.buildCatURL?.(builderParams) ?? "",
    builderParams,
    shareUrl: null,
    profileId: null,
    mapperSlug: null,
    legacyEncoded: previous?.legacyEncoded ?? null,
    catShareSlug: previous?.catShareSlug ?? null,
    catName: null,
    creatorName: null,
  };
}

/** Site URL for `path`; the bare path when there is no window. */
function siteUrl(path: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return origin ? `${origin}${path}` : path;
}

/** The cat's legacy share encoding, encoding it now when missing. */
function ensureLegacyEncoded(
  existing: string | null | undefined,
  payload: ReturnType<typeof buildSharePayload>,
): string | null {
  const current = existing ?? null;
  if (current) return current;
  try {
    return encodeCatShare(payload);
  } catch (err) {
    console.warn("Failed to encode share payload", err);
    return current;
  }
}

/** Gold fireworks celebration for a finished spin. */
async function celebrateSpin(): Promise<void> {
  try {
    const confetti = (await import("canvas-confetti")).default;
    const gold = ["#f59e0b", "#fbbf24", "#d97706", "#eab308"];
    const fireBurst = () => {
      confetti({
        particleCount: 60,
        spread: 100,
        origin: { x: 0.5, y: 0.5 },
        colors: gold,
        zIndex: 10000,
        startVelocity: 30,
      });
      confetti({
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.6 },
        particleCount: 40,
        colors: gold,
        zIndex: 10000,
        startVelocity: 40,
      });
      confetti({
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.6 },
        particleCount: 40,
        colors: gold,
        zIndex: 10000,
        startVelocity: 40,
      });
      confetti({
        spread: 360,
        ticks: 60,
        startVelocity: 25,
        particleCount: 30,
        origin: { x: 0.3 + Math.random() * 0.4, y: Math.random() * 0.4 },
        colors: gold,
        shapes: ["star"],
        zIndex: 10000,
      });
    };
    fireBurst();
    setTimeout(fireBurst, 200);
    setTimeout(fireBurst, 500);
  } catch (err) {
    console.warn("Confetti celebration failed", err);
  }
}

function formatRevealedLayerValue(
  definition: (typeof LAYER_GROUPS)[number],
  slot: unknown,
): string {
  if (definition.compoundMode === "tortieParts") {
    return formatTortieLayer((slot as TortieSlot | null) ?? null);
  }
  if (typeof slot === "string" && slot.toLowerCase() !== "none") {
    return formatValue(slot);
  }
  return "None";
}

function pickStringSlots(primary: unknown, fallback: unknown): string[] {
  let source: unknown[] = [];
  if (Array.isArray(primary)) {
    source = primary;
  } else if (Array.isArray(fallback)) {
    source = fallback;
  }
  return source.filter((entry): entry is string => typeof entry === "string");
}

type ObsBackgroundSettings = {
  obsBgMode: "colour" | "transparent";
  obsBgColour: string;
  obsBgOpacity: number;
};

function resolveObsBackgroundSettings(
  record: Record<string, unknown> | undefined,
): ObsBackgroundSettings {
  return {
    obsBgMode: record?.obsBgMode === "colour" ? "colour" : "transparent",
    obsBgColour:
      typeof record?.obsBgColour === "string" ? record.obsBgColour : "#00ff00",
    obsBgOpacity:
      typeof record?.obsBgOpacity === "number" ? record.obsBgOpacity : 100,
  };
}

function buildViewUrl(viewSlug: unknown): string | null {
  return typeof viewSlug === "string" && typeof window !== "undefined"
    ? `${window.location.origin}/view/${viewSlug}`
    : null;
}

type ObsLiveCommand = NonNullable<
  ReturnType<typeof useObsSession>["session"]
>["currentCommand"];

type SeqBatchCommand = BatchStreamCommand & { seq: number };

// The saved slug is patched onto the live command without a seq bump —
// read it from the session so the QR appears as soon as the save lands.
function withLiveBatchSlug(
  batchCommand: SeqBatchCommand,
  liveCommand: ObsLiveCommand | undefined,
): SeqBatchCommand {
  const liveBatchSlug =
    liveCommand?.type === "batch" && liveCommand.seq === batchCommand.seq
      ? liveCommand.batch?.slug
      : undefined;
  return liveBatchSlug
    ? { ...batchCommand, slug: liveBatchSlug }
    : batchCommand;
}

export function ObsOverlayClient({ apiKey }: Readonly<{ apiKey: string }>) {
  const {
    session,
    sessionSettingsRecord,
    sessionSettings,
    initialSettings,
    resolvedResultAutoClear,
    resolvedResultAutoClearEnabled,
  } = useObsSession(apiKey);

  // OBS: no variant URL/code entry points — settings come from the session
  const variantSlug = undefined;
  const initialVariantSettings = sessionSettings ?? null;
  const initialVariantLoadError = null as string | null;
  const initialCodeSettings = null as SingleCatPortableSettings | null;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wheelRef = useRef<OBSClassicWheelHandle | null>(null);
  const generatorRef = useRef<CatGeneratorApi | null>(null);
  /** Frame loader of the latest spin; disposed by the next spin, clear, wheel, or unmount. */
  const spinLoaderRef = useRef<SpinFrameLoader | null>(null);
  /** Spin prepared (and preloading) while the countdown runs. */
  const preparedSpinRef = useRef<Promise<PreparedSpin | null> | null>(null);
  const mapperRef = useRef<SpriteMapperApi | null>(null);
  const parameterOptionsRef = useRef<ParameterOptions | null>(null);
  const catStateRef = useRef<CatState | null>(null);
  const generationIdRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);
  const initialVariantLoadHandledRef = useRef(false);

  const [initializing, setInitializing] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [_isGenerating, setIsGenerating] = useState(false);
  const [_error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<"flashy" | "calm">(initialSettings.mode);
  const [accessoryRange, setAccessoryRange] = useState<LayerRange>(
    initialSettings.accessoryRange,
  );
  const [scarRange, setScarRange] = useState<LayerRange>(
    initialSettings.scarRange,
  );
  const [tortieRange, setTortieRange] = useState<LayerRange>(
    initialSettings.tortieRange,
  );
  const [exactLayerCounts, setExactLayerCounts] = useState(
    initialSettings.exactLayerCounts,
  );
  const [timingConfig, setTimingConfig] = useState<SpinTimingConfig>(
    initialSettings.timing,
  );

  // OBS: no variant management — settings come from Convex session
  const variants = {
    variants: [] as {
      id: string;
      name: string;
      slug?: string;
      settings: SingleCatSettings;
      isActive: boolean;
      createdAt: number;
      updatedAt: number;
    }[],
    activeVariant: null as {
      id: string;
      name: string;
      settings: SingleCatSettings;
    } | null,
    saveVariant: async (_name: string, _settings: SingleCatSettings) => {},
    activateVariant: (_id: string) => {},
    deactivateVariant: () => {},
    removeVariant: (_id: string) => {},
    renameVariant: (_id: string, _name: string) => {},
  };
  const [_lastTimingSnapshot, setLastTimingSnapshot] =
    useState<TimingSnapshot | null>(null);
  const [speedMultiplier, setSpeedMultiplier] = useState(
    initialSettings.speedMultiplier,
  );
  const speedMultiplierRef = useRef(1.0);
  const defaultFlashyPauseMs =
    DEFAULT_TIMING_CONFIG.pauseDelays?.flashyMs ?? 520;
  const defaultCalmPauseMs = DEFAULT_TIMING_CONFIG.pauseDelays?.calmMs ?? 420;
  const flashyPauseMs =
    timingConfig.pauseDelays?.flashyMs ?? defaultFlashyPauseMs;
  const calmPauseMs = timingConfig.pauseDelays?.calmMs ?? defaultCalmPauseMs;
  const _flashyPauseSeconds = flashyPauseMs / 1000;
  const _calmPauseSeconds = calmPauseMs / 1000;
  const activeTimingRef = useRef<SpinTimingConfig>(DEFAULT_TIMING_CONFIG);
  const timingConfigRef = useRef<SpinTimingConfig>(timingConfig);

  // Sync activeTimingRef and timingConfigRef when timingConfig changes for live updates
  useEffect(() => {
    const timingProfile: SpinTimingConfig = {
      allowFastFlips: timingConfig.allowFastFlips,
      delays: { ...DEFAULT_TIMING_CONFIG.delays, ...timingConfig.delays },
      pauseDelays: timingConfig.pauseDelays,
    };
    activeTimingRef.current = timingProfile;
    timingConfigRef.current = timingConfig;
  }, [timingConfig]);

  // Sync speedMultiplierRef when speedMultiplier changes
  useEffect(() => {
    speedMultiplierRef.current = speedMultiplier;
  }, [speedMultiplier]);
  const optionCountsRef = useRef<Record<ParamTimingKey, number>>(
    Object.fromEntries(
      PARAM_TIMING_ORDER.map((key) => [
        key,
        PARAM_DEFAULT_STEP_COUNTS[key] ?? 0,
      ]),
    ) as Record<ParamTimingKey, number>,
  );
  const actualDurationsRef = useRef<Partial<Record<ParamTimingKey, number>>>(
    {},
  );
  const totalActualRef = useRef(0);
  const modeRef = useRef(mode);
  const [optionCounts, setOptionCounts] = useState<
    Record<ParamTimingKey, number>
  >(optionCountsRef.current);
  useEffect(() => {
    optionCountsRef.current = optionCounts;
  }, [optionCounts]);

  // Helper function to get delay with speed multiplier applied
  // Uses refs to always get the latest timing config and speed multiplier
  const getDelayWithMultiplier = useCallback((key: ParamTimingKey): number => {
    const config = timingConfigRef.current;
    const baseDelay = getDelayForKey(config, key);
    return Math.max(MIN_SAFE_STEP_MS, baseDelay / speedMultiplierRef.current);
  }, []);

  const resetActualDurations = useCallback(() => {
    actualDurationsRef.current = {};
    totalActualRef.current = 0;
  }, []);

  const addActualDuration = useCallback(
    (key: ParamTimingKey | null, deltaMs: number) => {
      if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
      totalActualRef.current += deltaMs;
      if (!key) return;
      actualDurationsRef.current = {
        ...actualDurationsRef.current,
        [key]: (actualDurationsRef.current[key] ?? 0) + deltaMs,
      };
    },
    [],
  );
  const [afterlifeMode, setAfterlifeMode] = useState<AfterlifeOption>(
    initialSettings.afterlifeMode,
  );
  const [includeBaseColours, setIncludeBaseColours] = useState(
    initialSettings.includeBaseColours,
  );
  const [includeNewSprites, setIncludeNewSprites] = useState(
    initialSettings.includeNewSprites,
  );
  const [extendedModes, setExtendedModes] = useState<Set<ExtendedMode>>(
    () => new Set(initialSettings.extendedModes),
  );

  // OBS: Re-sync settings when the Convex session updates (control page changed them)
  useEffect(() => {
    if (!sessionSettings) return;
    setMode(sessionSettings.mode ?? DEFAULT_SINGLE_CAT_SETTINGS.mode);
    setAccessoryRange(
      sessionSettings.accessoryRange ??
        DEFAULT_SINGLE_CAT_SETTINGS.accessoryRange,
    );
    setScarRange(
      sessionSettings.scarRange ?? DEFAULT_SINGLE_CAT_SETTINGS.scarRange,
    );
    setTortieRange(
      sessionSettings.tortieRange ?? DEFAULT_SINGLE_CAT_SETTINGS.tortieRange,
    );
    setExactLayerCounts(
      sessionSettings.exactLayerCounts ??
        DEFAULT_SINGLE_CAT_SETTINGS.exactLayerCounts,
    );
    setAfterlifeMode(
      sessionSettings.afterlifeMode ??
        DEFAULT_SINGLE_CAT_SETTINGS.afterlifeMode,
    );
    setIncludeBaseColours(
      sessionSettings.includeBaseColours ??
        DEFAULT_SINGLE_CAT_SETTINGS.includeBaseColours,
    );
    setIncludeNewSprites(
      sessionSettings.includeNewSprites ??
        DEFAULT_SINGLE_CAT_SETTINGS.includeNewSprites,
    );
    setExtendedModes(
      new Set(
        sessionSettings.extendedModes ??
          DEFAULT_SINGLE_CAT_SETTINGS.extendedModes,
      ),
    );
    if (sessionSettings.speedMultiplier !== undefined) {
      setSpeedMultiplier(sessionSettings.speedMultiplier);
    }
    if (sessionSettings.timing) {
      setTimingConfig(sessionSettings.timing);
    }
    if (sessionSettings.creatorName) {
      setCreatorNameDraft(sessionSettings.creatorName);
    }
  }, [sessionSettings]);

  const [rollerLabel, setRollerLabel] = useState<string | null>(null);
  const [rollerActiveValue, setRollerActiveValue] = useState<string | null>(
    null,
  );
  const [_rollerHighlight, setRollerHighlight] = useState(false);
  const [paramRows, setParamRows] = useState<ParamRow[]>([]);
  const [_activeParamId, setActiveParamId] = useState<ParamId | null>(null);
  const [wheelReward, setWheelReward] = useState<WheelRewardState>({
    status: "hidden",
    prize: null,
  });
  const [wheelBannerVisible, setWheelBannerVisible] = useState(false);
  const [layerRows, setLayerRows] = useState<
    Record<LayerGroup, LayerRowState[]>
  >(() =>
    Object.fromEntries(
      LAYER_GROUPS.map((definition) => [definition.layerKey, []]),
    ),
  );
  const [_rollSummary, setRollSummary] = useState<string | null>(null);
  const [_shareLink, setShareLink] = useState<string | null>(null);
  const [_hasTint, setHasTint] = useState(false);
  const [_toast, setToast] = useState<string | null>(null);
  const [flashParamId, setFlashParamId] = useState<ParamId | null>(null);
  const [flashLayerKey, setFlashLayerKey] = useState<string | null>(null);
  const [_rollerExpanded, setRollerExpanded] = useState(false);
  const defaultCreatorName = sessionSettings?.creatorName ?? "";
  const [catNameDraft, setCatNameDraft] = useState(initialSettings.catName);
  const [creatorNameDraft, setCreatorNameDraft] = useState(
    initialSettings.creatorName || defaultCreatorName,
  );
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaDirty, setMetaDirty] = useState(false);

  // Auto-fill creator name when username loads and field is still empty
  const creatorFilledRef = useRef(false);
  useEffect(() => {
    if (defaultCreatorName && !creatorFilledRef.current && !creatorNameDraft) {
      setCreatorNameDraft(defaultCreatorName);
      creatorFilledRef.current = true;
    }
  }, [defaultCreatorName, creatorNameDraft]);

  const _rollerValueClass = useMemo(() => {
    if (!rollerActiveValue) {
      return "text-3xl tracking-[0.35em]";
    }
    const length = rollerActiveValue.length;
    if (length > 36) return "text-lg tracking-[0.18em]";
    if (length > 26) return "text-xl tracking-[0.22em]";
    if (length > 18) return "text-2xl tracking-[0.28em]";
    return "text-3xl tracking-[0.32em]";
  }, [rollerActiveValue]);

  // OBS: stub out Convex mutations not needed for overlay
  const createMapper = useCallback(
    async (
      ..._args: unknown[]
    ): Promise<{
      id: string;
      slug: string;
      catName?: string;
      creatorName?: string;
      shareToken?: string;
    } | null> => null,
    [],
  );
  const updateMapperMeta = useCallback(
    async (
      ..._args: unknown[]
    ): Promise<{
      id: string;
      slug: string;
      catName?: string;
      creatorName?: string;
      shareToken?: string;
    } | null> => null,
    [],
  );

  const extendedModesArray = useMemo(
    () => Array.from(extendedModes),
    [extendedModes],
  );

  const resetMetaDrafts = useCallback(
    (catName?: string | null, creatorName?: string | null) => {
      setCatNameDraft(catName ?? "");
      setCreatorNameDraft(creatorName || defaultCreatorName);
      setMetaDirty(false);
    },
    [defaultCreatorName],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2400);
  }, []);

  // ---------------------------------------------------------------------------
  // Variant snapshot / apply / dirty detection
  // ---------------------------------------------------------------------------

  const snapshotConfig = useMemo(
    (): SingleCatSettings => ({
      v: 2,
      mode,
      timing: timingConfig,
      speedMultiplier,
      accessoryRange,
      scarRange,
      tortieRange,
      exactLayerCounts,
      afterlifeMode,
      extendedModes: [...extendedModes].sort(compareCodeUnits),
      includeBaseColours,
      includeNewSprites,
      catName: catNameDraft,
      creatorName: creatorNameDraft,
    }),
    [
      mode,
      timingConfig,
      speedMultiplier,
      accessoryRange,
      scarRange,
      tortieRange,
      exactLayerCounts,
      afterlifeMode,
      extendedModes,
      includeBaseColours,
      includeNewSprites,
      catNameDraft,
      creatorNameDraft,
    ],
  );

  const applyVariantConfig = useCallback(
    (settings: SingleCatSettings) => {
      setMode(settings.mode);
      setTimingConfig(settings.timing);
      setSpeedMultiplier(settings.speedMultiplier);
      setAccessoryRange(settings.accessoryRange);
      setScarRange(settings.scarRange);
      setTortieRange(settings.tortieRange);
      setExactLayerCounts(settings.exactLayerCounts ?? true);
      setAfterlifeMode(settings.afterlifeMode);
      setExtendedModes(new Set(settings.extendedModes));
      setIncludeBaseColours(settings.includeBaseColours);
      setIncludeNewSprites(settings.includeNewSprites ?? false);
      setCatNameDraft(settings.catName);
      setCreatorNameDraft(settings.creatorName || defaultCreatorName);
    },
    [defaultCreatorName],
  );

  const variantDirty = useMemo(() => {
    if (!variants.activeVariant) return false;
    return !singleCatSettingsEqual(
      snapshotConfig,
      variants.activeVariant.settings,
    );
  }, [snapshotConfig, variants.activeVariant]);

  // Apply active variant settings after hydration from localStorage
  // (skip when URL slug or portable code settings take priority)
  const variantRestoredRef = useRef(false);
  useEffect(() => {
    if (variantRestoredRef.current) return;
    if (variantSlug) return;
    if (initialCodeSettings) return;
    if (!variants.activeVariant) return;
    variantRestoredRef.current = true;
    applyVariantConfig(variants.activeVariant.settings);
  }, [initialCodeSettings, variants.activeVariant, applyVariantConfig]);

  // Warn before unload when dirty
  useEffect(() => {
    if (!variantDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [variantDirty]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const adjustedOptionCounts = useMemo(() => {
    const adjusted: Record<ParamTimingKey, number> = {} as Record<
      ParamTimingKey,
      number
    >;
    PARAM_TIMING_ORDER.forEach((key) => {
      const baseCount =
        optionCounts[key] ?? PARAM_DEFAULT_STEP_COUNTS[key] ?? 0;
      adjusted[key] = baseCount;
    });
    return adjusted;
  }, [optionCounts]);

  const estimatedTotals = useMemo(() => {
    const metrics = stepCountsToMetrics(adjustedOptionCounts);
    return computeTimingTotals(timingConfig, metrics);
  }, [timingConfig, adjustedOptionCounts]);

  const effectiveTotalMs = useMemo(
    () => estimatedTotals.total || computeDefaultTotal(timingConfig),
    [estimatedTotals.total, timingConfig],
  );

  const readSpinState = useCallback(() => {
    const durationMs = Math.max(1000, effectiveTotalMs);
    const baseSpeed = getSpeedSettings(durationMs);
    const currentConfig = timingConfigRef.current;
    const currentFlashyPause =
      currentConfig.pauseDelays?.flashyMs ?? defaultFlashyPauseMs;
    const currentCalmPause =
      currentConfig.pauseDelays?.calmMs ?? defaultCalmPauseMs;
    return {
      mode: modeRef.current,
      spinny: modeRef.current === "flashy",
      speed: {
        ...baseSpeed,
        paramPause: currentFlashyPause,
        calmParamPause: currentCalmPause,
      },
    };
  }, [defaultCalmPauseMs, defaultFlashyPauseMs, effectiveTotalMs]);

  const clearMirror = useCallback(() => {}, []);

  const disposeSpinLoader = useCallback(() => {
    spinLoaderRef.current?.dispose();
    spinLoaderRef.current = null;
  }, []);

  const _activeGlobalPreset = useMemo(() => {
    for (const presetKey of GLOBAL_PRESETS) {
      const matches = PARAM_TIMING_ORDER.every((param) => {
        const target = PARAM_TIMING_PRESETS[param]?.[presetKey];
        if (typeof target !== "number") return false;
        const current =
          timingConfig.delays[param] ?? getPresetValues(param).normal;
        return current === target;
      });
      if (matches) return presetKey;
    }
    return "custom" as const;
  }, [timingConfig.delays]);

  const _handleGlobalPreset = useCallback(
    (preset: keyof TimingPresetSet) => {
      const nextDelays: SpinTimingConfig["delays"] = { ...timingConfig.delays };
      PARAM_TIMING_ORDER.forEach((key) => {
        const value = PARAM_TIMING_PRESETS[key]?.[preset];
        if (typeof value === "number") {
          nextDelays[key] = clampDelay(value, timingConfig.allowFastFlips);
        }
      });
      setTimingConfig({
        ...timingConfig,
        delays: nextDelays,
      });
    },
    [timingConfig],
  );

  const _handleTimingStepChange = useCallback(
    (key: ParamTimingKey, value: number) => {
      if (!Number.isFinite(value)) {
        return;
      }
      const nextValue = Math.max(value, 0);
      setTimingConfig({
        ...timingConfig,
        delays: {
          ...timingConfig.delays,
          [key]: nextValue,
        },
      });
    },
    [timingConfig],
  );

  const _handlePauseChange = useCallback(
    (kind: "flashyMs" | "calmMs", seconds: number) => {
      if (!Number.isFinite(seconds)) return;
      const clampedSeconds = Math.min(10, Math.max(1, seconds));
      const nextMs = Math.round(clampedSeconds * 1000);
      setTimingConfig({
        ...timingConfig,
        pauseDelays: {
          flashyMs:
            timingConfig.pauseDelays?.flashyMs ??
            DEFAULT_TIMING_CONFIG.pauseDelays?.flashyMs ??
            520,
          calmMs:
            timingConfig.pauseDelays?.calmMs ??
            DEFAULT_TIMING_CONFIG.pauseDelays?.calmMs ??
            420,
          [kind]: nextMs,
        },
      });
    },
    [timingConfig],
  );

  const _handleResetTimings = useCallback(() => {
    setTimingConfig({
      ...timingConfig,
      allowFastFlips: DEFAULT_TIMING_CONFIG.allowFastFlips,
      delays: { ...DEFAULT_TIMING_CONFIG.delays },
      pauseDelays: {
        flashyMs: DEFAULT_TIMING_CONFIG.pauseDelays?.flashyMs ?? 520,
        calmMs: DEFAULT_TIMING_CONFIG.pauseDelays?.calmMs ?? 420,
      },
    });
  }, [timingConfig]);

  const _copyText = useCallback(
    async (text: string, successMessage: string) => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          showToast(successMessage);
          return;
        }
      } catch (error) {
        console.warn("copyText", error);
      }
      window.prompt("Copy to clipboard", text);
    },
    [showToast],
  );

  useEffect(() => {
    if (!variantSlug) return;
    if (initialVariantLoadHandledRef.current) return;
    initialVariantLoadHandledRef.current = true;
    if (initialVariantLoadError) {
      showToast(initialVariantLoadError);
      return;
    }
    if (initialVariantSettings) {
      showToast("Settings loaded from URL");
    }
  }, [initialVariantSettings, showToast]);

  // Notify when portable code settings were applied from URL
  const codeToastShownRef = useRef(false);
  useEffect(() => {
    if (!initialCodeSettings) return;
    if (codeToastShownRef.current) return;
    codeToastShownRef.current = true;
    showToast("Settings applied from code");
  }, [initialCodeSettings, showToast]);

  const settleRoller = useCallback(
    async (
      token: number,
      options?: {
        keepLabel?: boolean;
        keepValue?: boolean;
        skipHighlight?: boolean;
      },
    ) => {
      if (!options?.skipHighlight) {
        setRollerHighlight(true);
      }
      await wait(ROLLER_REVEAL_HOLD);
      if (generationIdRef.current !== token) {
        return;
      }
      if (!options?.skipHighlight) {
        setRollerHighlight(false);
      }
      if (!options?.keepValue) {
        setRollerActiveValue(null);
      }
      if (!options?.keepLabel) {
        setRollerLabel(null);
      }
    },
    [],
  );

  const playFlip = useCallback(async (draw: () => void, duration: number) => {
    draw();
    await wait(Math.max(duration, 30));
  }, []);

  const resetLayerRows = useCallback(
    (
      accessoriesInput: string[] | null | undefined,
      scarsInput: string[] | null | undefined,
      tortiesInput: (TortieSlot | null)[] | null | undefined,
      traitsInput?: Readonly<Record<string, unknown>>,
    ) => {
      const accessories = Array.isArray(accessoriesInput)
        ? accessoriesInput
        : [];
      const scars = Array.isArray(scarsInput) ? scarsInput : [];
      const torties = Array.isArray(tortiesInput) ? tortiesInput : [];

      const valuesByTrait: Readonly<Record<string, unknown>> = {
        ...traitsInput,
        accessories,
        scars,
        tortie: torties,
      };
      setLayerRows(
        Object.fromEntries(
          LAYER_GROUPS.map((definition) => {
            const values = valuesByTrait[definition.traitId];
            const slots = Array.isArray(values) ? values : [];
            return [
              definition.layerKey,
              slots.map((_, index) => ({
                label: `${definition.label} ${index + 1}`,
                value: "—",
                status: "idle" as const,
              })),
            ];
          }),
        ),
      );
    },
    [],
  );

  const updateLayerRow = useCallback(
    (group: LayerGroup, index: number, updates: Partial<LayerRowState>) => {
      setLayerRows((prev) => {
        const groupRows = prev[group];
        if (!groupRows || index < 0 || index >= groupRows.length) {
          return prev;
        }
        const nextGroup = groupRows.map((row, idx) =>
          idx === index ? { ...row, ...updates } : row,
        );
        return { ...prev, [group]: nextGroup };
      });
    },
    [],
  );

  const updateParamRow = useCallback(
    (rowIndex: number, updates: Partial<ParamRow>) => {
      setParamRows((prev) =>
        prev.map((row, idx) =>
          idx === rowIndex ? { ...row, ...updates } : row,
        ),
      );
    },
    [],
  );

  // Prefill the param board with all slots in "pending" state
  const initBoardRows = useCallback(() => {
    setParamRows(
      PARAM_SEQUENCE.filter((def) => !LAYER_PARAM_IDS.has(def.id)).map(
        (def) => ({
          id: def.id,
          label: def.label,
          value: "???",
          status: "pending" as const,
        }),
      ),
    );
  }, []);

  // Prefill layer rows with MAX counts from range settings
  const initMaxLayerRows = useCallback(() => {
    function placeholderRows(prefix: string, count: number) {
      return Array.from({ length: count }, (_, i) => ({
        label: `${prefix} ${i + 1}`,
        value: "???",
        status: "idle" as const,
      }));
    }
    setLayerRows(
      Object.fromEntries(
        LAYER_GROUPS.map((definition) => {
          let configuredMax = 0;
          if (definition.traitId === "accessories") {
            configuredMax = accessoryRange.max;
          } else if (definition.traitId === "scars") {
            configuredMax = scarRange.max;
          } else if (definition.traitId === "tortie") {
            configuredMax = tortieRange.max;
          }
          return [
            definition.layerKey,
            placeholderRows(
              definition.label,
              Math.max(0, Math.trunc(configuredMax)),
            ),
          ];
        }),
      ),
    );
  }, [accessoryRange.max, scarRange.max, tortieRange.max]);

  // Brief highlight on a layer row before its spin begins
  const flashLayer = useCallback(async (key: string) => {
    setFlashLayerKey(key);
    await wait(350);
    setFlashLayerKey(null);
  }, []);

  const drawPlaceholder = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "20px var(--font-geist-sans, sans-serif)";
    ctx.textAlign = "center";
    ctx.fillText("Roll a cat to begin", DISPLAY_SIZE / 2, DISPLAY_SIZE / 2);
  }, []);

  const drawCanvas = useCallback(
    (source?: HTMLCanvasElement | OffscreenCanvas) => {
      if (!source) return;
      const target = canvasRef.current;
      if (!target) return;
      const ctx = target.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);

      // Resolve source to a usable canvas
      let src: HTMLCanvasElement;
      try {
        // Test if source can be drawn directly
        ctx.drawImage(source as HTMLCanvasElement, 0, 0, 1, 1);
        ctx.clearRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
        src = source as HTMLCanvasElement;
      } catch {
        const fallback = document.createElement("canvas");
        const w =
          "width" in source && typeof source.width === "number"
            ? source.width
            : DISPLAY_SIZE;
        const h =
          "height" in source && typeof source.height === "number"
            ? source.height
            : DISPLAY_SIZE;
        fallback.width = w;
        fallback.height = h;
        const fCtx = fallback.getContext("2d");
        if (fCtx) fCtx.drawImage(source as HTMLCanvasElement, 0, 0);
        src = fallback;
      }

      // White sticker outline — draw source offset in 8 directions, tinted white
      // This works in OBS unlike CSS drop-shadow
      const outline = 3;
      const offsets = [
        [-outline, 0],
        [outline, 0],
        [0, -outline],
        [0, outline],
        [-outline, -outline],
        [outline, -outline],
        [-outline, outline],
        [outline, outline],
      ];
      // Create a white-tinted version of the source
      const tint = document.createElement("canvas");
      tint.width = DISPLAY_SIZE;
      tint.height = DISPLAY_SIZE;
      const tCtx = tint.getContext("2d");
      if (!tCtx) return;
      tCtx.imageSmoothingEnabled = false;
      tCtx.drawImage(src, 0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
      tCtx.globalCompositeOperation = "source-in";
      tCtx.fillStyle = "white";
      tCtx.fillRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);

      // Draw the white silhouette at each offset
      for (const [dx, dy] of offsets) {
        ctx.drawImage(tint, dx, dy);
      }
      // Draw the actual cat on top
      ctx.drawImage(src, 0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
    },
    [],
  );

  const renderCat = useCallback(
    async (params: Partial<CatParams>) => {
      const generator = generatorRef.current;
      if (!generator) return;
      const result = await generator.generateCat(params);
      drawCanvas(result.canvas as HTMLCanvasElement);
    },
    [drawCanvas],
  );

  const resetWheelOverlay = useCallback(() => {
    wheelRef.current?.reset();
    setWheelReward({ status: "hidden", prize: null });
    setWheelBannerVisible(false);
  }, []);

  const scheduleAutoClear = useCallback((token: number) => {
    if (!resultAutoClearEnabledRef.current) return;
    const autoClearMs = resultAutoClearSecondsRef.current * 1000;
    if (autoClearMs <= 0) return;
    if (autoClearTimerRef.current) {
      clearTimeout(autoClearTimerRef.current);
    }
    autoClearTimerRef.current = setTimeout(() => {
      if (generationIdRef.current === token) {
        setObsPhase("fading");
      }
    }, autoClearMs);
  }, []);

  const showStaticCatState = useCallback(
    async (
      state: Pick<
        CatState,
        "params" | "accessorySlots" | "scarSlots" | "tortieSlots" | "counts"
      > &
        Partial<CatState>,
    ) => {
      const params = cloneParams(state.params ?? {});
      const accessorySlots = Array.isArray(state.accessorySlots)
        ? state.accessorySlots.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [];
      const scarSlots = Array.isArray(state.scarSlots)
        ? state.scarSlots.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [];
      const tortieSlots = Array.isArray(state.tortieSlots)
        ? state.tortieSlots.map((slot) =>
            slot?.mask && slot?.pattern && slot?.colour ? { ...slot } : null,
          )
        : [];

      setParamRows(
        PARAM_SEQUENCE.filter((def) => !LAYER_PARAM_IDS.has(def.id)).map(
          (def) => ({
            id: def.id,
            label: def.label,
            value: getParameterValueForDisplay(def.id, params),
            status: "revealed" as const,
          }),
        ),
      );

      const valuesByTrait: Readonly<Record<string, unknown>> = {
        ...params.traits,
        accessories: accessorySlots,
        scars: scarSlots,
        tortie: tortieSlots,
      };
      setLayerRows(
        Object.fromEntries(
          LAYER_GROUPS.map((definition) => {
            const value = valuesByTrait[definition.traitId];
            const slots = Array.isArray(value) ? value : [];
            return [
              definition.layerKey,
              slots.map((slot, index) => ({
                label: `${definition.label} ${index + 1}`,
                value: formatRevealedLayerValue(definition, slot),
                status: "revealed" as const,
              })),
            ];
          }),
        ),
      );

      setRollerLabel(null);
      setRollerActiveValue(null);
      setFlashParamId(null);
      setFlashLayerKey(null);
      setActiveParamId(null);
      setHasTint(Boolean(params.darkForest || params.darkMode || params.dead));

      catStateRef.current = {
        ...catStateRef.current,
        ...state,
        params,
        accessorySlots,
        scarSlots,
        tortieSlots,
        counts: { ...state.counts },
      };

      await renderCat(params);
    },
    [renderCat],
  );

  const primeOverlayFromCommand = useCallback(
    async (paramsInput: unknown, slotsInput?: unknown) => {
      const params = cloneParams((paramsInput ?? {}) as Partial<CatParams>);
      const slotRecord =
        slotsInput && typeof slotsInput === "object"
          ? (slotsInput as {
              accessories?: unknown[];
              scars?: unknown[];
              tortie?: unknown[];
            })
          : undefined;

      const accessorySlots = pickStringSlots(
        slotRecord?.accessories,
        params.accessories,
      );
      const scarSlots = pickStringSlots(slotRecord?.scars, params.scars);
      let tortieSlots: ({
        mask: string;
        pattern: string;
        colour: string;
      } | null)[] = [];
      if (Array.isArray(slotRecord?.tortie)) {
        tortieSlots = slotRecord.tortie.map((slot) =>
          slot &&
          typeof slot === "object" &&
          "mask" in slot &&
          "pattern" in slot &&
          "colour" in slot
            ? {
                mask: String((slot as TortieSlot).mask),
                pattern: String((slot as TortieSlot).pattern),
                colour: String((slot as TortieSlot).colour),
              }
            : null,
        );
      } else if (Array.isArray(params.tortie)) {
        tortieSlots = params.tortie.map((slot) =>
          slot?.mask && slot?.pattern && slot?.colour
            ? {
                mask: String(slot.mask),
                pattern: String(slot.pattern),
                colour: String(slot.colour),
              }
            : null,
        );
      }

      await showStaticCatState({
        params,
        accessorySlots,
        scarSlots,
        tortieSlots,
        counts: {
          accessories: accessorySlots.filter((slot) => slot !== "none").length,
          scars: scarSlots.filter((slot) => slot !== "none").length,
          tortie: tortieSlots.filter(Boolean).length,
        },
      });
    },
    [showStaticCatState],
  );

  const runWheelReveal = useCallback(
    async (wheelSpin: StreamWheelSpin, token: number) => {
      if (autoClearTimerRef.current) {
        clearTimeout(autoClearTimerRef.current);
      }

      setWheelBannerVisible(false);
      setWheelReward({ status: "spinning", prize: wheelSpin });

      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (generationIdRef.current !== token) return;
        if (wheelRef.current) break;
        await wait(50);
      }

      if (generationIdRef.current !== token) return;

      const wheelSelection = toClassicWheelSelection(wheelSpin);
      if (wheelRef.current) {
        wheelRef.current.reset();
        await wait(80);
        if (generationIdRef.current !== token) return;
        await wheelRef.current.spinTo(wheelSelection);
      } else {
        console.warn(
          "[ObsOverlayClient] Wheel ref not available after 1s polling — falling back to timed delay",
        );
        await wait(WHEEL_SPIN_DURATION_MS);
      }

      if (generationIdRef.current !== token) return;
      setWheelReward({ status: "settled", prize: wheelSpin });
      setWheelBannerVisible(true);
    },
    [],
  );

  /**
   * Flips through a sequence on the roller and canvas, re-reading the delay
   * each step for live timing edits; calm mode stops after the current step.
   * Resolves false once a newer spin cancelled this one.
   */
  const playRollerSequence = useCallback(
    async (
      sequence: FlipStep[],
      readDelay: () => number,
      showStep: (step: FlipStep) => void,
      token: number,
    ): Promise<boolean> => {
      for (let idx = 0; idx < sequence.length; idx += 1) {
        const step = sequence[idx];
        if (generationIdRef.current !== token) return false;

        // Recalculate delay on each step to get live updates
        const delay = readDelay();
        const stepDuration = stepDurationAt(
          sequence,
          idx,
          delay,
          timingConfigRef.current.allowFastFlips,
        );

        setRollerActiveValue(step.frame.option.display);
        showStep(step);

        const stepState = readSpinState();
        await playFlip(() => drawCanvas(step.frame.canvas), stepDuration);
        if (!stepState.spinny) break;
      }
      return true;
    },
    [drawCanvas, playFlip, readSpinState],
  );

  /** Flips one registry string slot's frames; false once cancelled. */
  const flipRegistrySlot = useCallback(
    async (
      definition: RegistryRevealDefinition,
      slot: StringSlotPhase,
      loader: SpinFrameLoader,
      token: number,
    ): Promise<boolean> => {
      const frames = await loader.frames(slot.before, slot.descriptors);
      const sequence = buildFlipSequence(frames);
      for (const step of sequence) {
        if (generationIdRef.current !== token) return false;
        const display = step.frame.option.display;
        updateLayerRow(definition.layerKey, slot.index, {
          value: display,
          status: flipStepStatus(step),
        });
        setRollerActiveValue(display);
        await playFlip(
          () => drawCanvas(step.frame.canvas),
          getDelayWithMultiplier(definition.timingKey),
        );
      }
      return true;
    },
    [drawCanvas, getDelayWithMultiplier, playFlip, updateLayerRow],
  );

  const spinRegistryStringSlots = useCallback(
    async (
      definition: RegistryRevealDefinition,
      rowIndex: number,
      plan: SpinPlan,
      loader: SpinFrameLoader,
      pauseDuration: number,
      currentToken: number,
    ) => {
      const summary: string[] = [];

      clearMirror();
      setRollerLabel(definition.label);
      const empty = plan.phase("empty", definition.traitId);
      if (empty) {
        updateParamRow(rowIndex, { value: "None", status: "revealed" });
        drawCanvas(await loader.single(empty.params));
        await wait(pauseDuration);
        setRollerLabel(null);
        setRollerActiveValue(null);
        return;
      }

      const slots = collectSlotPhases((index) =>
        plan.phase("registry", definition.traitId, index),
      );
      for (const slot of slots) {
        if (generationIdRef.current !== currentToken) return;
        const { index } = slot;
        const spinState = readSpinState();
        await flashLayer(`${definition.layerKey}-${index}`);

        if (spinState.spinny) {
          const played = await flipRegistrySlot(
            definition,
            slot,
            loader,
            currentToken,
          );
          if (!played) return;
        }

        const display = formatSlotValue(slot.value);
        summary.push(display);
        updateLayerRow(definition.layerKey, index, {
          value: display,
          status: "revealed",
        });
        drawCanvas(await loader.single(slot.after));
        await wait(pauseDuration);
      }

      updateParamRow(rowIndex, {
        value: summary.length > 0 ? summary.join(", ") : "None",
        status: "revealed",
      });
      setRollerLabel(null);
      setRollerActiveValue(null);
      clearMirror();
    },
    [
      clearMirror,
      drawCanvas,
      flashLayer,
      flipRegistrySlot,
      readSpinState,
      updateLayerRow,
      updateParamRow,
    ],
  );

  /** Shows a slot group with nothing rolled ("None"), flashy or calm. */
  const revealEmptySlotGroup = useCallback(
    async (
      loader: SpinFrameLoader,
      params: Partial<CatParams>,
      pauseDuration: number,
      currentToken: number,
    ) => {
      const spinState = readSpinState();
      const canvas = await loader.single(params);
      if (spinState.spinny) {
        await playFlip(
          () => drawCanvas(canvas),
          Math.max(getBaseFrameDuration(spinState.speed), 90),
        );
        if (generationIdRef.current !== currentToken) return;
        await settleRoller(currentToken);
      } else {
        drawCanvas(canvas);
        setRollerLabel(null);
        setRollerActiveValue(null);
      }

      await wait(pauseDuration);
      clearMirror();
    },
    [clearMirror, drawCanvas, playFlip, readSpinState, settleRoller],
  );

  /** Flips one accessory or scar slot's frames; false once cancelled. */
  const flipStringLayerSlot = useCallback(
    async (
      kind: "accessory" | "scar",
      slot: StringSlotPhase,
      loader: SpinFrameLoader,
      token: number,
    ): Promise<boolean> => {
      const { rows } = STRING_LAYER_UI[kind];
      updateLayerRow(rows, slot.index, { status: "active", value: "---" });

      // Every frame is a complete cat, so no base-layer compositing.
      const frames = await loader.frames(slot.before, slot.descriptors);
      const played = await playRollerSequence(
        buildFlipSequence(frames),
        () => getDelayWithMultiplier(kind),
        (step) =>
          updateLayerRow(rows, slot.index, {
            value: step.frame.option.display,
            status: flipStepStatus(step),
          }),
        token,
      );
      if (!played) return false;

      const finalFrame = frames.at(-1);
      if (finalFrame) {
        drawCanvas(finalFrame.canvas);
      }
      return true;
    },
    [drawCanvas, getDelayWithMultiplier, playRollerSequence, updateLayerRow],
  );

  const spinStringLayerSlots = useCallback(
    async (
      kind: "accessory" | "scar",
      rowIndex: number,
      plan: SpinPlan,
      loader: SpinFrameLoader,
      pauseDuration: number,
      currentToken: number,
    ) => {
      const ui = STRING_LAYER_UI[kind];

      clearMirror();
      setRollerLabel(ui.title);
      setRollerActiveValue("—");

      const empty = plan.phase("empty", kind);
      if (empty) {
        updateParamRow(rowIndex, { value: "None", status: "revealed" });
        await revealEmptySlotGroup(
          loader,
          empty.params,
          pauseDuration,
          currentToken,
        );
        return;
      }

      const summary: string[] = [];
      const slots = collectSlotPhases((index) => plan.phase(kind, index));
      for (const slot of slots) {
        if (generationIdRef.current !== currentToken) return;
        const i = slot.index;
        const spinState = readSpinState();
        setRollerLabel(`${ui.slotLabel} ${i + 1}`);

        await flashLayer(`${ui.rows}-${i}`);

        const display = formatSlotValue(slot.value);
        if (spinState.spinny) {
          const played = await flipStringLayerSlot(
            kind,
            slot,
            loader,
            currentToken,
          );
          if (!played) return;
        } else {
          updateLayerRow(ui.rows, i, { value: display, status: "revealed" });
          setRollerActiveValue(display);
        }

        summary.push(display);
        drawCanvas(await loader.single(slot.after));
        await wait(pauseDuration);
      }

      const summaryText = summary.length ? summary.join(", ") : "None";
      updateParamRow(rowIndex, { value: "—", status: "revealed" });
      setRollerActiveValue(summaryText);
      if (generationIdRef.current !== currentToken) return;
      await settleRoller(currentToken);
      setRollerLabel(null);
      setRollerActiveValue(null);
      await wait(pauseDuration);
      clearMirror();
    },
    [
      clearMirror,
      drawCanvas,
      flashLayer,
      flipStringLayerSlot,
      revealEmptySlotGroup,
      settleRoller,
      updateLayerRow,
      updateParamRow,
      readSpinState,
    ],
  );

  /** Spins a tortie layer's mask, pattern and colour stages; false once cancelled. */
  const flipTortieStages = useCallback(
    async (
      slot: TortieSlotPhase,
      spin: TortieSlotSpin,
      loader: SpinFrameLoader,
      pauseDuration: number,
      token: number,
    ): Promise<boolean> => {
      const i = slot.index;
      for (const stage of spin.stages) {
        const stageStart = now();
        setRollerLabel(`Tortie Layer ${i + 1} – ${stage.label}`);
        const frames = await loader.frames(slot.before, stage.descriptors);
        if (frames.length === 0) {
          continue;
        }

        const sequence = buildFlipSequence(frames);

        for (let idx = 0; idx < sequence.length; idx += 1) {
          const step = sequence[idx];
          if (generationIdRef.current !== token) return false;

          // Recalculate delay on each step to get live updates
          const stageDelay = getDelayWithMultiplier(stage.timingKey);
          const stepDuration = stepDurationAt(
            sequence,
            idx,
            stageDelay,
            timingConfigRef.current.allowFastFlips,
          );

          const candidateLabel = formatTortieLayer(
            tortieStageCandidate(
              stage.kind,
              step.frame.option.raw,
              stage.working,
              spin.maskPatternColour,
            ),
          );

          const drawStep = () => drawCanvas(step.frame.canvas);
          await playFlip(drawStep, stepDuration);
          setRollerActiveValue(candidateLabel);
          updateLayerRow("tortie", i, {
            value: candidateLabel,
            status: flipStepStatus(step),
          });
        }

        await wait(pauseDuration);
        addActualDuration(stage.timingKey, now() - stageStart);
      }
      return true;
    },
    [
      addActualDuration,
      drawCanvas,
      getDelayWithMultiplier,
      playFlip,
      updateLayerRow,
    ],
  );

  /** Reveals one tortie layer; resolves its summary text, or null once cancelled. */
  const revealTortieSlot = useCallback(
    async (
      definition: RegistryRevealDefinition,
      slot: TortieSlotPhase,
      loader: SpinFrameLoader,
      pauseDuration: number,
      token: number,
    ): Promise<string | null> => {
      const i = slot.index;
      const spin = slot.spin;
      const spinState = readSpinState();

      await flashLayer(`${definition.layerKey}-${i}`);

      if (!spin || !slot.value) {
        updateLayerRow("tortie", i, { value: "None", status: "revealed" });
        if (!spinState.spinny) {
          await wait(pauseDuration);
        }
        return "None";
      }

      const display = formatTortieLayer(slot.value);
      if (spinState.spinny) {
        updateLayerRow("tortie", i, { value: "—", status: "active" });
        const played = await flipTortieStages(
          slot,
          spin,
          loader,
          pauseDuration,
          token,
        );
        if (!played) return null;
        setRollerLabel(`Tortie Layer ${i + 1}`);
      } else {
        updateLayerRow("tortie", i, { value: display, status: "revealed" });
      }

      setRollerActiveValue(display);
      drawCanvas(await loader.single(slot.after));
      await wait(pauseDuration);
      return display;
    },
    [drawCanvas, flashLayer, flipTortieStages, readSpinState, updateLayerRow],
  );

  const spinTortieSlots = useCallback(
    async (
      definition: RegistryRevealDefinition,
      rowIndex: number,
      plan: SpinPlan,
      loader: SpinFrameLoader,
      pauseDuration: number,
      currentToken: number,
    ) => {
      clearMirror();
      setRollerLabel("Tortie Layers");
      setRollerActiveValue("—");

      const empty = plan.phase("empty", "tortie");
      if (empty) {
        updateParamRow(rowIndex, { value: "None", status: "revealed" });
        await revealEmptySlotGroup(
          loader,
          empty.params,
          pauseDuration,
          currentToken,
        );
        return;
      }

      const summary: string[] = [];
      const slots = collectSlotPhases((index) => plan.phase("tortie", index));
      for (const slot of slots) {
        if (generationIdRef.current !== currentToken) return;
        const display = await revealTortieSlot(
          definition,
          slot,
          loader,
          pauseDuration,
          currentToken,
        );
        if (display === null) return;
        summary.push(display);
      }

      const summaryText = summary.length ? summary.join(" • ") : "None";
      updateParamRow(rowIndex, { value: "—", status: "revealed" });
      setRollerActiveValue(summaryText);
      if (generationIdRef.current !== currentToken) return;
      await settleRoller(currentToken);
      await wait(pauseDuration);
      clearMirror();
    },
    [
      clearMirror,
      revealEmptySlotGroup,
      revealTortieSlot,
      settleRoller,
      updateParamRow,
    ],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!generatorRef.current || !mapperRef.current) {
          const [{ default: catGenerator }, { default: spriteMapper }] =
            await Promise.all([
              import("@/lib/single-cat/catGeneratorV3"),
              import("@/lib/single-cat/spriteMapper"),
            ]);
          if (cancelled) return;
          generatorRef.current = catGenerator as CatGeneratorApi;
          mapperRef.current = spriteMapper as unknown as SpriteMapperApi;
          if (mapperRef.current.init) {
            await mapperRef.current.init();
          }
        }

        if (!mapperRef.current) return;

        if (!parameterOptionsRef.current) {
          parameterOptionsRef.current = await buildParameterOptions(
            mapperRef.current,
            includeBaseColours,
            extendedModesArray,
            includeNewSprites,
          );
          const counts = deriveOptionCounts(parameterOptionsRef.current);
          optionCountsRef.current = counts;
          setOptionCounts(counts);
        }

        if (!catStateRef.current) {
          drawPlaceholder();
        }
        setInitializing(false);
      } catch (err) {
        console.error("Failed to load Single Cat modules", err);
        if (!cancelled) {
          setInitialError("Unable to load cat generator modules.");
          setInitializing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    drawPlaceholder,
    includeBaseColours,
    extendedModesArray,
    includeNewSprites,
  ]);

  useEffect(() => {
    const mapper = mapperRef.current;
    if (!mapper?.loaded) return;
    let cancelled = false;
    (async () => {
      const options = await buildParameterOptions(
        mapper,
        includeBaseColours,
        extendedModesArray,
        includeNewSprites,
      );
      if (!cancelled) {
        parameterOptionsRef.current = options;
        const counts = deriveOptionCounts(options);
        optionCountsRef.current = counts;
        setOptionCounts(counts);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [includeBaseColours, extendedModesArray, includeNewSprites]);

  useEffect(() => {
    return () => {
      generationIdRef.current += 1; // cancel ongoing work
      disposeSpinLoader();
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      if (countdownTimerRef.current) {
        clearTimeout(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      if (previewIntervalRef.current) {
        clearInterval(previewIntervalRef.current);
        previewIntervalRef.current = null;
      }
      if (autoClearTimerRef.current) {
        clearTimeout(autoClearTimerRef.current);
        autoClearTimerRef.current = null;
      }
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
    };
  }, [disposeSpinLoader]);

  const _handleToggleExtended = useCallback((modeToToggle: ExtendedMode) => {
    if (modeToToggle === "base") {
      setIncludeBaseColours((prev) => !prev);
      return;
    }
    setExtendedModes((prev) => {
      const next = new Set(prev);
      if (next.has(modeToToggle)) {
        next.delete(modeToToggle);
      } else {
        next.add(modeToToggle);
      }
      return next;
    });
  }, []);

  const ensureMapperReady =
    useCallback(async (): Promise<SpriteMapperApi | null> => {
      if (!mapperRef.current) return null;
      if (!mapperRef.current.loaded && mapperRef.current.init) {
        await mapperRef.current.init();
      }
      if (!parameterOptionsRef.current) {
        parameterOptionsRef.current = await buildParameterOptions(
          mapperRef.current,
          includeBaseColours,
          extendedModesArray,
          includeNewSprites,
        );
        const counts = deriveOptionCounts(parameterOptionsRef.current);
        optionCountsRef.current = counts;
        setOptionCounts(counts);
      }
      return mapperRef.current;
    }, [includeBaseColours, extendedModesArray, includeNewSprites]);

  // -------------------------------------------------------------------
  // Layer count spinner — reveals accessory/scar/tortie counts visually
  // -------------------------------------------------------------------

  /**
   * Renders a count group's frames in one batch, queued when the spin was
   * prepared. Resolves null when rendering failed, so the group is skipped.
   */
  const renderCountFrames = useCallback(
    async (
      loader: SpinFrameLoader,
      group: CountRevealGroup,
      token: number,
    ): Promise<VariationFrame[] | null> => {
      try {
        const rendered = await loader.frames(
          group.baseParams,
          group.descriptors,
        );
        return rendered.map((frame) => ({
          option: frame.option,
          canvas: compositeCountFrame(frame.canvas, frame.option.raw as number),
        }));
      } catch (err) {
        if (err instanceof SpinLoaderDisposedError) throw err;
        if (generationIdRef.current === token) {
          console.warn(`Count reveal render failed for ${group.label}`, err);
        }
        return null;
      }
    },
    [],
  );

  /** Flips through a count group's frames; false once cancelled. */
  const flipCountSequence = useCallback(
    async (
      group: CountRevealGroup,
      frames: VariationFrame[],
      token: number,
    ): Promise<boolean> => {
      const sequence = buildFlipSequence(frames);

      for (let idx = 0; idx < sequence.length; idx++) {
        const step = sequence[idx];
        if (generationIdRef.current !== token) return false;

        const baseDelay = getDelayWithMultiplier(group.key) * 2; // slower for count reveal
        // never fast-flip the count reveal
        const stepDuration = stepDurationAt(sequence, idx, baseDelay, false);

        setRollerActiveValue(step.frame.option.display);
        drawCanvas(step.frame.canvas);
        await playFlip(() => {}, stepDuration);
        const stepState = readSpinState();
        if (!stepState.spinny) break;
      }
      return true;
    },
    [drawCanvas, getDelayWithMultiplier, playFlip, readSpinState],
  );

  /** Rolls one layer count on the roller; false once cancelled. */
  const revealCountGroup = useCallback(
    async (
      loader: SpinFrameLoader,
      group: CountRevealGroup,
      token: number,
    ): Promise<boolean> => {
      const { minCount, maxCount } = group;

      // Show what we're about to roll
      setRollerLabel(`Rolling: ${group.label}`);
      setRollerActiveValue(`${minCount}–${maxCount}`);
      setParamRows((prev) => [
        ...prev,
        {
          id: group.key,
          label: group.label,
          value: "?",
          status: "active" as const,
        },
      ]);
      await wait(800); // let the viewer read what's being rolled
      if (generationIdRef.current !== token) return false;

      const frames = await renderCountFrames(loader, group, token);
      if (generationIdRef.current !== token) return false;
      if (!frames) return true;

      // Reorder frames so the rolled count is last (buildFlipSequence targets the last frame)
      moveRolledCountLast(frames, group.count);

      const flipped = await flipCountSequence(group, frames, token);
      if (!flipped) return false;

      // Land on rolled count
      const finalFrame = frames.find((f) => f.option.raw === group.count);
      if (finalFrame) drawCanvas(finalFrame.canvas);
      setRollerActiveValue(String(group.count));
      setParamRows((prev) =>
        revealParamRow(prev, group.key, String(group.count)),
      );
      await settleRoller(token);
      await wait(600); // hold the result so viewer can see it
      return generationIdRef.current === token;
    },
    [drawCanvas, flipCountSequence, renderCountFrames, settleRoller],
  );

  const revealLayerCounts = useCallback(
    async (
      loader: SpinFrameLoader,
      groups: CountRevealGroup[],
      token: number,
    ) => {
      for (const group of groups) {
        if (generationIdRef.current !== token) return;
        const revealed = await revealCountGroup(loader, group, token);
        if (!revealed) return;
      }

      setRollerLabel(null);
      setRollerActiveValue(null);
      // Remove only the count-reveal rows (layer IDs), preserve prefilled pending rows
      setParamRows((prev) =>
        prev.filter((row) => !LAYER_PARAM_IDS.has(row.id)),
      );
      clearMirror();
    },
    [clearMirror, revealCountGroup],
  );

  /**
   * Rolls (or takes the control page's) cat, simulates the whole spin and
   * queues every frame it will show on a fresh loader. Runs when the spin
   * command arrives, so a countdown doubles as preload time.
   */
  const prepareSpin = useCallback(
    async (override: SpinOverride | null): Promise<PreparedSpin | null> => {
      const generator = generatorRef.current;
      if (!generator) return null;
      const generation = generationIdRef.current;
      const mapper = await ensureMapperReady();
      // A clear, new command, or unmount while waiting cancels this spin.
      if (!mapper || generationIdRef.current !== generation) return null;

      disposeSpinLoader();
      const loader = createSpinFrameLoader(generator);
      spinLoaderRef.current = loader;

      const experimentalMode =
        extendedModesArray.length === 0 ? "off" : extendedModesArray;
      // biome-ignore lint/suspicious/noExplicitAny: dynamic random generation result with varying shape
      let randomResult: any;
      if (override?.params) {
        randomResult = {
          params: override.params as Record<string, unknown>,
          slotSelections: override.slots,
        };
      } else {
        if (!generator.generateRandomCat) {
          throw new Error("Random cat generation not available");
        }
        randomResult = await generator.generateRandomCat({
          accessoryCount: computeLayerCount(accessoryRange),
          scarCount: computeLayerCount(scarRange),
          tortieCount: computeLayerCount(tortieRange),
          exactLayerCounts,
          experimentalColourMode: experimentalMode,
          whitePatchColourMode: "default",
          includeBaseColours,
          includeNewSprites,
        });
      }
      if (spinLoaderRef.current !== loader) return null;

      const params: Partial<CatParams> = {
        ...randomResult.params,
      };
      if (!params.colour) {
        params.colour = PLACEHOLDER_COLOUR;
      }

      if (override?.params) {
        const enableDarkForest = Boolean(params.darkForest || params.darkMode);
        params.darkForest = enableDarkForest;
        params.darkMode = enableDarkForest;
        params.dead = Boolean(params.dead);
      } else {
        const { darkForest: enableDarkForest, dead: enableDead } =
          resolveAfterlife(afterlifeMode);
        params.darkForest = enableDarkForest;
        params.darkMode = enableDarkForest;
        params.dead = enableDead;
      }
      syncChangedRegistryTraitsFromLegacy(params, ["darkForest", "dead"]);

      // Simulate the whole spin now and queue every frame it will show.
      const rollerOptions = parameterOptionsRef.current;
      const plan = buildSpinPlan({
        params,
        slotSelections: randomResult.slotSelections,
        parameterOptions: rollerOptions,
        pools: readSpinPools(mapper, rollerOptions),
        spinny: readSpinState().spinny,
      });
      prefetchSpin(loader, plan);

      // The count reveal lands on the cat's real slot counts, which for a
      // control-page cat are not the overlay's own random counts.
      const { accessorySlots, scarSlots, tortieSlots } = plan.slots;
      const countReveal = exactLayerCounts
        ? await prepareCountReveal(
            generator,
            [
              {
                label: "Tortie Layers",
                key: "tortieMask",
                range: tortieRange,
                count: tortieSlots.length,
              },
              {
                label: "Accessories",
                key: "accessory",
                range: accessoryRange,
                count: accessorySlots.length,
              },
              {
                label: "Scars",
                key: "scar",
                range: scarRange,
                count: scarSlots.length,
              },
            ],
            {
              experimentalColourMode: experimentalMode,
              includeBaseColours,
              includeNewSprites,
            },
          )
        : [];
      if (spinLoaderRef.current !== loader) return null;
      prefetchCountReveal(loader, countReveal);

      return {
        loader,
        plan,
        params,
        slotSelections: randomResult.slotSelections,
        countReveal,
      };
    },
    [
      accessoryRange,
      afterlifeMode,
      disposeSpinLoader,
      ensureMapperReady,
      exactLayerCounts,
      extendedModesArray,
      includeBaseColours,
      includeNewSprites,
      readSpinState,
      scarRange,
      tortieRange,
    ],
  );

  /** Removes a slot group's param row once its slots are revealed. */
  const dropParamRow = useCallback((row: ParamRowIndex) => {
    if (row.current >= 0) {
      setParamRows((prev) => prev.filter((_, idx) => idx !== row.current));
    }
  }, []);

  /** Spins the accessory or scar slots, timing them under their own key. */
  const revealStringLayerParam = useCallback(
    async (
      kind: "accessory" | "scar",
      row: ParamRowIndex,
      pauseDuration: number,
      context: ParamRevealContext,
    ) => {
      const start = now();
      await spinStringLayerSlots(
        kind,
        row.current,
        context.plan,
        context.loader,
        pauseDuration,
        context.token,
      );
      addActualDuration(kind, now() - start);
      dropParamRow(row);
      clearMirror();
    },
    [addActualDuration, clearMirror, dropParamRow, spinStringLayerSlots],
  );

  /** Flips a param through its options on the roller; false once cancelled. */
  const revealAnimatedParam = useCallback(
    async (
      definition: RegistryRevealDefinition,
      paramPhase: ParamPhase,
      paramKey: ParamTimingKey | null,
      speed: { baseFrameDuration: number },
      context: ParamRevealContext,
    ): Promise<boolean> => {
      clearMirror();
      setRollerLabel(definition.label);
      setRollerActiveValue("—");
      await wait(Math.max(getBaseFrameDuration(speed) * 0.25, PRE_SPIN_DELAY));

      const frames = await context.loader.frames(
        paramPhase.before,
        paramPhase.descriptors,
      );
      const played = await playRollerSequence(
        buildFlipSequence(frames),
        () => (paramKey ? getDelayWithMultiplier(paramKey) : MIN_SAFE_STEP_MS),
        (step) =>
          setParamRows((prev) => showParamStep(prev, definition.id, step)),
        context.token,
      );
      if (!played) return false;

      const finalFrame = frames.at(-1);
      if (finalFrame) {
        drawCanvas(finalFrame.canvas);
      }
      const finalDisplay =
        finalFrame?.option.display ?? paramPhase.targetDisplay;
      setParamRows((prev) => revealParamRow(prev, definition.id, finalDisplay));
      if (generationIdRef.current !== context.token) return false;
      await settleRoller(context.token);
      setRollerLabel(null);
      setRollerActiveValue(null);
      return true;
    },
    [
      clearMirror,
      drawCanvas,
      getDelayWithMultiplier,
      playRollerSequence,
      settleRoller,
    ],
  );

  /** Shows a param's value without flipping; false once cancelled. */
  const revealSettledParam = useCallback(
    async (
      definition: RegistryRevealDefinition,
      paramPhase: ParamPhase,
      context: ParamRevealContext,
    ): Promise<boolean> => {
      const displayValue = paramPhase.targetDisplay;
      clearMirror();
      setParamRows((prev) => revealParamRow(prev, definition.id, displayValue));
      drawCanvas(await context.loader.single(paramPhase.after));
      if (generationIdRef.current !== context.token) return false;
      setRollerLabel(null);
      setRollerActiveValue(displayValue);
      await settleRoller(context.token, {
        keepLabel: false,
        skipHighlight: true,
      });
      return true;
    },
    [clearMirror, drawCanvas, settleRoller],
  );

  /** Reveals one param of the spin; false once cancelled. */
  const revealParam = useCallback(
    async (
      definition: RegistryRevealDefinition,
      context: ParamRevealContext,
    ): Promise<boolean> => {
      const { id } = definition;
      const paramKey = isParamTimingKey(id) ? id : null;
      const paramStart = now();

      setActiveParamId(id);

      // Flash the row before activating it
      setFlashParamId(id);
      await wait(350);
      setFlashParamId(null);

      // Update existing pending row to active (instead of appending)
      const row: ParamRowIndex = { current: -1 };
      setParamRows((prev) => activateParamRow(prev, definition, row));

      const spinState = readSpinState();
      const basePause =
        modeRef.current === "calm"
          ? spinState.speed.calmParamPause
          : spinState.speed.paramPause;
      const pauseDuration = Math.max(
        PARAM_REVEAL_PAUSE,
        basePause / speedMultiplierRef.current,
      );

      if (id === "accessory" || id === "scar") {
        await revealStringLayerParam(id, row, pauseDuration, context);
        return true;
      }

      if (definition.strategy === "slots") {
        await spinRegistryStringSlots(
          definition,
          row.current,
          context.plan,
          context.loader,
          pauseDuration,
          context.token,
        );
        dropParamRow(row);
        return true;
      }

      const paramPhase = context.plan.phase("param", id);
      if (!paramPhase) {
        throw new Error(`Spin plan has no phase for ${id}`);
      }
      const isInstantParam = INSTANT_PARAMS.includes(id);
      const isTortieToggle = definition.compoundMode === "tortieParts";
      const shouldAnimate =
        spinState.spinny &&
        context.hasRollerOptions &&
        !isInstantParam &&
        !isTortieToggle;
      const stillCurrent = shouldAnimate
        ? await revealAnimatedParam(
            definition,
            paramPhase,
            paramKey,
            spinState.speed,
            context,
          )
        : await revealSettledParam(definition, paramPhase, context);
      if (!stillCurrent) return false;

      if (isTortieToggle) {
        await spinTortieSlots(
          definition,
          row.current,
          context.plan,
          context.loader,
          pauseDuration,
          context.token,
        );
      }

      await wait(pauseDuration);
      addActualDuration(paramKey, now() - paramStart);
      return true;
    },
    [
      addActualDuration,
      dropParamRow,
      readSpinState,
      revealAnimatedParam,
      revealSettledParam,
      revealStringLayerParam,
      spinRegistryStringSlots,
      spinTortieSlots,
    ],
  );

  /**
   * Takes the spin the command queued, or prepares one now. Resolves null
   * when it is unavailable or a newer spin cancelled this one.
   */
  const claimPreparedSpin = useCallback(
    async (token: number): Promise<PreparedSpin | null> => {
      // OBS: Use override params from the control page if available
      const override = overrideParamsRef.current;
      overrideParamsRef.current = null; // consume once
      const preparing = preparedSpinRef.current;
      preparedSpinRef.current = null;
      const preloaded = await preparing?.catch(() => null);
      if (generationIdRef.current !== token) return null;
      return preloaded ?? (await prepareSpin(override));
    },
    [prepareSpin],
  );

  /** Plays the count reveal, then every param; false once cancelled. */
  const runSpinReveal = useCallback(
    async (
      prepared: PreparedSpin,
      hasRollerOptions: boolean,
      token: number,
    ): Promise<boolean> => {
      const { loader, plan, params, slotSelections, countReveal } = prepared;

      // Count reveal phase — spin the accessory/scar/tortie counts before params
      if (countReveal.length > 0) {
        await revealLayerCounts(loader, countReveal, token);
        if (generationIdRef.current !== token) return false;
      }

      // Count reveal done — resize layer rows from max-prefill to actual slot counts
      const { accessorySlots, scarSlots, tortieSlots } = plan.slots;
      resetLayerRows(accessorySlots, scarSlots, tortieSlots, {
        ...params.traits,
        ...(slotSelections as Record<string, unknown> | undefined),
      });

      const context: ParamRevealContext = {
        loader,
        plan,
        hasRollerOptions,
        token,
      };
      for (const definition of PARAM_SEQUENCE) {
        if (TORTIE_PART_IDS.has(definition.id)) continue;
        if (generationIdRef.current !== token) return false;
        const revealed = await revealParam(definition, context);
        if (!revealed) return false;
      }
      return true;
    },
    [resetLayerRows, revealLayerCounts, revealParam],
  );

  /** Mapper persistence failed: fall back to a share or legacy view URL. */
  const applyFallbackShareUrl = useCallback(
    (shareSlug: string | null, legacyEncoded: string | null) => {
      const current = catStateRef.current;
      if (!current) return;
      if (shareSlug) {
        const fallbackUrl = siteUrl(`/visual-builder?share=${shareSlug}`);
        catStateRef.current = {
          ...current,
          catShareSlug: shareSlug,
          shareUrl: fallbackUrl,
        };
        setShareLink(fallbackUrl);
      } else if (legacyEncoded) {
        const fallbackUrl = siteUrl(`/view?cat=${legacyEncoded}`);
        catStateRef.current = {
          ...current,
          legacyEncoded,
          shareUrl: fallbackUrl,
        };
        setShareLink(fallbackUrl);
      }
    },
    [],
  );

  /** Saves the mapper record and points the share link at its view page. */
  const persistMapperRecord = useCallback(
    async (
      state: CatState,
      payload: ReturnType<typeof buildSharePayload>,
      shareSlug: string | null,
      legacyEncoded: string | null,
      token: number,
    ) => {
      const mapperPayload = shareSlug ? { ...payload, shareSlug } : payload;

      try {
        const result = await createMapper({
          catData: catDataToLegacyPersistence(mapperPayload),
          catName: state.catName ?? undefined,
          creatorName: state.creatorName ?? undefined,
        });
        if (generationIdRef.current !== token) return;
        if (result && catStateRef.current) {
          const shareToken =
            (result as { shareToken?: string }).shareToken ??
            result.slug ??
            result.id;
          const url = siteUrl(`/view/${shareToken}`);
          catStateRef.current = {
            ...catStateRef.current,
            profileId: result.id,
            mapperSlug: shareToken,
            legacyEncoded,
            shareUrl: url,
            catShareSlug: shareSlug ?? catStateRef.current.catShareSlug ?? null,
          };
          setShareLink(url);
        }
      } catch (err) {
        console.warn("Failed to persist mapper record", err);
        applyFallbackShareUrl(shareSlug, legacyEncoded);
      }
    },
    [applyFallbackShareUrl, createMapper],
  );

  /** Shares and persists the finished cat in the background. */
  const persistSpinShare = useCallback(
    async (token: number) => {
      if (generationIdRef.current !== token) return;
      const state = catStateRef.current;
      if (!state) return;
      const payload = buildSharePayload(state);
      const shareSeed = {
        params: payload.params,
        accessorySlots: payload.accessorySlots,
        scarSlots: payload.scarSlots,
        tortieSlots: payload.tortieSlots,
        counts: payload.counts,
      } as const;

      let shareSlug: string | null = state.catShareSlug ?? null;
      const shareRecord = await createCatShare(shareSeed);
      if (generationIdRef.current !== token) return;
      if (shareRecord?.slug) {
        shareSlug = shareRecord.slug;
      }
      if (shareSlug && catStateRef.current) {
        catStateRef.current = {
          ...catStateRef.current,
          catShareSlug: shareSlug,
        };
      }

      const legacyEncoded = ensureLegacyEncoded(state.legacyEncoded, payload);
      if (generationIdRef.current !== token) return;
      if (legacyEncoded && catStateRef.current) {
        catStateRef.current = { ...catStateRef.current, legacyEncoded };
      }

      await persistMapperRecord(
        state,
        payload,
        shareSlug,
        legacyEncoded,
        token,
      );
    },
    [persistMapperRecord],
  );

  /** Stores the finished cat, reports timing, celebrates and persists it. */
  const finishSpin = useCallback(
    (
      generator: CatGeneratorApi,
      prepared: PreparedSpin,
      counts: GenerationCounts,
      token: number,
    ) => {
      // Persist refs/state for actions
      catStateRef.current = buildFinishedCatState(
        generator,
        prepared,
        counts,
        catStateRef.current,
      );
      resetMetaDrafts();
      setShareLink(null);
      setMetaSaving(false);

      logTimingReport(
        "post-roll",
        activeTimingRef.current,
        adjustedOptionCounts,
        estimatedTotals,
        actualDurationsRef.current,
        totalActualRef.current,
      );
      setLastTimingSnapshot({
        counts: { ...adjustedOptionCounts },
        estimated: { ...estimatedTotals.perKey },
        estimatedTotal: estimatedTotals.total,
        actual: { ...actualDurationsRef.current },
        actualTotal: totalActualRef.current,
        timestamp: now(),
      });
      setIsGenerating(false);
      setSpinDone(true);
      scheduleAutoClear(token);

      void celebrateSpin();

      track("single_cat_generated", {
        mode: modeRef.current,
        accessories: counts.accessories > 0,
        scars: counts.scars > 0,
        torties: counts.tortie > 0,
        afterlife: afterlifeMode !== "off",
        speed: speedMultiplierRef.current,
        layer_count_mode: exactLayerCounts ? "exact" : "chance",
      });
      window.setTimeout(() => {
        if (generationIdRef.current === token) {
          setRollerExpanded(false);
        }
      }, 500);

      void persistSpinShare(token);
    },
    [
      adjustedOptionCounts,
      afterlifeMode,
      estimatedTotals,
      exactLayerCounts,
      persistSpinShare,
      resetMetaDrafts,
      scheduleAutoClear,
    ],
  );

  const generateCatPlus = useCallback(async () => {
    const generator = generatorRef.current;
    if (!generator) return;

    resetActualDurations();
    const timingProfile: SpinTimingConfig = {
      allowFastFlips: timingConfig.allowFastFlips,
      delays: { ...DEFAULT_TIMING_CONFIG.delays, ...timingConfig.delays },
    };
    activeTimingRef.current = timingProfile;

    setError(null);
    setShareLink(null);
    initBoardRows();
    setRollerLabel(null);
    setRollerActiveValue(null);
    setRollerHighlight(false);
    setRollSummary(null);
    setActiveParamId(null);
    setHasTint(false);
    setSpinDone(false);
    resetWheelOverlay();
    if (autoClearTimerRef.current) clearTimeout(autoClearTimerRef.current);
    clearMirror();
    drawPlaceholder();
    setRollerExpanded(true);

    const token = ++generationIdRef.current;
    setIsGenerating(true);

    try {
      const prepared = await claimPreparedSpin(token);
      if (generationIdRef.current !== token) return;
      if (!prepared) {
        setIsGenerating(false);
        setRollerExpanded(false);
        return;
      }
      const { loader, plan, params } = prepared;
      const hasRollerOptions = Boolean(parameterOptionsRef.current);

      initMaxLayerRows();

      const { accessorySlots, scarSlots, tortieSlots } = plan.slots;
      const countsResult: GenerationCounts = {
        accessories: accessorySlots.length,
        scars: scarSlots.length,
        tortie: tortieSlots.length,
      };

      setRollSummary(
        `Rolled → Accessories: ${countsResult.accessories} • Scars: ${countsResult.scars} • Tortie layers: ${countsResult.tortie}`,
      );
      setHasTint(Boolean(params.darkForest || params.dead));
      initBoardRows();

      const revealed = await runSpinReveal(prepared, hasRollerOptions, token);
      if (!revealed) return;

      setActiveParamId(null);
      setRollerActiveValue(null);
      setRollerLabel(null);

      drawCanvas(await loader.single(plan.phase("final").params));
      if (generationIdRef.current !== token) return;
      // Every frame has been shown; release the spin's canvases.
      if (spinLoaderRef.current === loader) disposeSpinLoader();

      finishSpin(generator, prepared, countsResult, token);
    } catch (err) {
      // A newer spin, clear, or unmount disposed this spin's loader.
      if (err instanceof SpinLoaderDisposedError) return;
      console.error("Failed to generate cat", err);
      if (generationIdRef.current !== token) return;
      setError("Failed to generate cat. Please try again.");
      setRollerActiveValue(null);
      setRollerLabel(null);
      setRollerHighlight(false);
      setFlashParamId(null);
      setFlashLayerKey(null);
      setIsGenerating(false);
      window.setTimeout(() => {
        setRollerExpanded(false);
      }, 300);
    }
  }, [
    claimPreparedSpin,
    disposeSpinLoader,
    drawCanvas,
    runSpinReveal,
    finishSpin,
    initBoardRows,
    initMaxLayerRows,
    clearMirror,
    drawPlaceholder,
    resetWheelOverlay,
    timingConfig.allowFastFlips,
    timingConfig.delays,
    resetActualDurations,
  ]);

  const _handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "cat.png";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast("Downloaded PNG");
      track("single_cat_exported", { format: "download-png" });
    }, "image/png");
  }, [showToast]);

  const exportCat = useCallback(
    async (options?: { noTint?: boolean }) => {
      const state = catStateRef.current;
      const generator = generatorRef.current;
      if (!state || !generator) return;
      const params = { ...state.params } as Record<string, unknown>;
      if (options?.noTint) {
        params.darkForest = false;
        params.darkMode = false;
        params.dead = false;
        syncChangedRegistryTraitsFromLegacy(params, ["darkForest", "dead"]);
      }
      const result = await generator.generateCat(params);
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = FULL_EXPORT_SIZE;
      exportCanvas.height = FULL_EXPORT_SIZE;
      const ctx = exportCanvas.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          result.canvas as HTMLCanvasElement,
          0,
          0,
          FULL_EXPORT_SIZE,
          FULL_EXPORT_SIZE,
        );
      }
      await copyCanvasToClipboard(
        exportCanvas,
        options?.noTint
          ? `Copied cat (no tint) (${FULL_EXPORT_SIZE}×${FULL_EXPORT_SIZE})!`
          : `Copied cat (${FULL_EXPORT_SIZE}×${FULL_EXPORT_SIZE})!`,
        options?.noTint ? "cat-no-tint" : "cat",
        showToast,
        (message) => setError(message),
      );
    },
    [showToast],
  );

  const buildShareUrl = useCallback(async () => {
    const state = catStateRef.current;
    if (!state) return null;
    if (state.shareUrl) return state.shareUrl;
    const origin = typeof window !== "undefined" ? window.location.origin : "";

    let shareSlug: string | null = state.catShareSlug ?? null;

    const slugCandidate = state.mapperSlug ?? state.profileId ?? null;
    if (slugCandidate) {
      const url = origin
        ? `${origin}/view/${slugCandidate}`
        : `/view/${slugCandidate}`;
      catStateRef.current = { ...state, shareUrl: url };
      setShareLink(url);
      return url;
    }

    const payload = buildSharePayload(state);
    let legacyEncoded = state.legacyEncoded ?? null;
    if (!legacyEncoded) {
      try {
        legacyEncoded = encodeCatShare(payload);
      } catch (err) {
        console.warn("Failed to encode share payload", err);
      }
    }

    try {
      const result = await createMapper({
        catData: catDataToLegacyPersistence(
          shareSlug ? { ...payload, shareSlug } : payload,
        ),
        catName: state.catName ?? undefined,
        creatorName: state.creatorName ?? undefined,
      });
      if (result) {
        const shareToken =
          (result as { shareToken?: string }).shareToken ??
          result.slug ??
          result.id;
        const url = origin
          ? `${origin}/view/${shareToken}`
          : `/view/${shareToken}`;
        catStateRef.current = {
          ...state,
          profileId: result.id,
          mapperSlug: shareToken,
          legacyEncoded,
          shareUrl: url,
          catShareSlug: shareSlug ?? state.catShareSlug ?? null,
        };
        setShareLink(url);
        return url;
      }
    } catch (err) {
      console.warn("Failed to persist share payload to Convex", err);
    }

    if (!shareSlug) {
      const shareRecord = await createCatShare({
        params: payload.params,
        accessorySlots: payload.accessorySlots,
        scarSlots: payload.scarSlots,
        tortieSlots: payload.tortieSlots,
        counts: payload.counts,
      });
      if (shareRecord?.slug) {
        shareSlug = shareRecord.slug;
        if (catStateRef.current) {
          catStateRef.current = {
            ...catStateRef.current,
            catShareSlug: shareSlug,
          };
        }
      }
    }

    if (shareSlug) {
      const url = origin
        ? `${origin}/visual-builder?share=${shareSlug}`
        : `/visual-builder?share=${shareSlug}`;
      if (catStateRef.current) {
        catStateRef.current = {
          ...catStateRef.current,
          catShareSlug: shareSlug,
          shareUrl: url,
          legacyEncoded:
            catStateRef.current.legacyEncoded ?? legacyEncoded ?? null,
        };
      }
      setShareLink(url);
      return url;
    }

    if (legacyEncoded) {
      const url = origin
        ? `${origin}/view?cat=${legacyEncoded}`
        : `/view?cat=${legacyEncoded}`;
      catStateRef.current = { ...state, legacyEncoded, shareUrl: url };
      setShareLink(url);
      return url;
    }

    setError("Unable to build share link right now.");
    return null;
  }, [createMapper]);

  const _handleCopyShareLink = useCallback(async () => {
    const url = await buildShareUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Share link copied!");
      track("single_cat_shared", {});
    } catch (err) {
      console.warn("Clipboard failed, showing prompt", err);
      window.prompt("Copy this link", url);
    }
  }, [buildShareUrl, showToast]);

  const _handleOpenShareViewer = useCallback(async () => {
    const url = await buildShareUrl();
    if (!url) return;
    const opened = window.open(url, "_blank", "noopener=yes");
    if (!opened) {
      showToast("Enable popups to open the share viewer.");
    }
  }, [buildShareUrl, showToast]);

  const _handleSaveMeta = useCallback(async () => {
    const state = catStateRef.current;
    if (!state?.profileId) {
      showToast("Roll a cat before saving.");
      return;
    }
    const trimmedCat = catNameDraft.trim();
    const trimmedCreator = creatorNameDraft.trim();
    setMetaSaving(true);
    try {
      const result = await updateMapperMeta({
        id: state.profileId as Id<"cat_profile">,
        catName: trimmedCat || undefined,
        creatorName: trimmedCreator || undefined,
      });
      if (result && catStateRef.current) {
        catStateRef.current = {
          ...catStateRef.current,
          catName: result.catName ?? null,
          creatorName: result.creatorName ?? null,
          profileId: result.id ?? catStateRef.current.profileId,
          mapperSlug:
            (result as { shareToken?: string }).shareToken ??
            result.slug ??
            result.id ??
            catStateRef.current.mapperSlug,
        };
        resetMetaDrafts(result.catName, result.creatorName);
      } else {
        resetMetaDrafts(trimmedCat || null, trimmedCreator || null);
      }
      setMetaDirty(false);
      showToast("Saved to history!");
    } catch (err) {
      console.error("Failed to update mapper meta", err);
      setError("Unable to save history entry. Please try again.");
    } finally {
      setMetaSaving(false);
    }
  }, [
    catNameDraft,
    creatorNameDraft,
    updateMapperMeta,
    resetMetaDrafts,
    showToast,
  ]);

  const _handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (event.shiftKey) {
        event.preventDefault();
        exportCat({ noTint: true }).catch((err) => console.error(err));
      }
    },
    [exportCat],
  );

  const currentState = catStateRef.current;
  const currentSpriteNumber =
    typeof currentState?.params?.spriteNumber === "number"
      ? Number(currentState.params.spriteNumber)
      : DEFAULT_SPRITE_NUMBER;
  const canCopySprite = Boolean(currentState && generatorRef.current);
  const currentPoseLabel = currentState?.params.poseName
    ? formatPoseName(currentState.params.poseName)
    : `Sprite ${currentSpriteNumber}`;
  const _spriteToolsSubtitle = canCopySprite
    ? `Current pose: ${currentPoseLabel}`
    : "Roll a cat to unlock sprite tools";
  const existingCatName = (currentState?.catName ?? "").trim();
  const existingCreatorName = (currentState?.creatorName ?? "").trim();
  const trimmedCatDraft = catNameDraft.trim();
  const trimmedCreatorDraft = creatorNameDraft.trim();
  const historyReady = Boolean(currentState?.profileId);
  const metaChanged =
    trimmedCatDraft !== existingCatName ||
    trimmedCreatorDraft !== existingCreatorName;
  const _saveHistoryDisabled =
    !historyReady || metaSaving || (!metaDirty && !metaChanged);
  const _viewerSlug = currentState?.mapperSlug ?? null;

  const generationDisabled = initializing || !!initialError;

  // =======================================================================
  // OBS: Hide header/footer; background follows the Settings tab
  // (transparent for OBS, dev art in the browser, or a solid colour for
  // chroma keying / custom looks).
  // =======================================================================
  const { obsBgMode, obsBgColour, obsBgOpacity } = resolveObsBackgroundSettings(
    sessionSettingsRecord,
  );
  const obsLayoutSpread = sessionSettingsRecord?.obsLayoutMode === "spread";
  useEffect(() => {
    const isOBS = typeof window !== "undefined" && "obsstudio" in window;
    let background: string;
    if (obsBgMode === "colour" && /^#[0-9a-fA-F]{6}$/.test(obsBgColour)) {
      const alpha = Math.max(0, Math.min(1, obsBgOpacity / 100));
      const r = Number.parseInt(obsBgColour.slice(1, 3), 16);
      const g = Number.parseInt(obsBgColour.slice(3, 5), 16);
      const b = Number.parseInt(obsBgColour.slice(5, 7), 16);
      background = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    } else if (isOBS) {
      background = "transparent";
    } else {
      // Dev preview shows background art — OBS uses transparent
      background =
        "url(/assets/stream-bg.jpg) 0 0/1920px 1080px no-repeat fixed #000";
    }
    document.documentElement.style.background = background;
    document.body.style.background = background;
    const header = document.querySelector("header");
    const footer = document.querySelector("footer");
    if (header instanceof HTMLElement) header.style.display = "none";
    if (footer instanceof HTMLElement) footer.style.display = "none";
    return () => {
      document.documentElement.style.background = "";
      document.body.style.background = "";
      if (header instanceof HTMLElement) header.style.display = "";
      if (footer instanceof HTMLElement) footer.style.display = "";
    };
  }, [obsBgMode, obsBgColour, obsBgOpacity]);

  // =======================================================================
  // OBS: Command dispatch — spin, wheel, countdown, clear, lobby, brb, test
  // =======================================================================
  const lastSeqRef = useRef<number | null>(null);
  const initializedSeqRef = useRef(false);
  /** When set, generateCatPlus uses these params instead of generating random ones */
  const overrideParamsRef = useRef<{
    params: unknown;
    slots?: unknown;
  } | null>(null);
  const [obsPhase, setObsPhase] = useState<
    | "idle"
    | "lobby"
    | "brb"
    | "active"
    | "countdown"
    | "fading"
    | "evolution"
    | "batch"
  >("idle");
  const [countdownValue, setCountdownValue] = useState(0);
  const [countdownPreview, setCountdownPreview] = useState<string | null>(null);
  const [spinDone, setSpinDone] = useState(false);
  const [evolutionCommand, setEvolutionCommand] = useState<
    (EvolutionStreamCommand & { seq: number }) | null
  >(null);
  const [evolutionInitialPhase, setEvolutionInitialPhase] = useState<
    "ceremony" | "tree"
  >("ceremony");
  const [batchCommand, setBatchCommand] = useState<
    (BatchStreamCommand & { seq: number }) | null
  >(null);
  const autoClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultAutoClearEnabledRef = useRef(resolvedResultAutoClearEnabled);
  resultAutoClearEnabledRef.current = resolvedResultAutoClearEnabled;
  const resultAutoClearSecondsRef = useRef(resolvedResultAutoClear);
  resultAutoClearSecondsRef.current = resolvedResultAutoClear;
  const [spinVisible, setSpinVisible] = useState(false);
  const [spinBoardVisible, setSpinBoardVisible] = useState(false);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Cancel running timers + reset roller/param state for phase transitions */
  const resetCommandState = useCallback(() => {
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (previewIntervalRef.current) {
      clearInterval(previewIntervalRef.current);
      previewIntervalRef.current = null;
    }
    if (autoClearTimerRef.current) {
      clearTimeout(autoClearTimerRef.current);
      autoClearTimerRef.current = null;
    }
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    generationIdRef.current++;
    preparedSpinRef.current = null;
    disposeSpinLoader();
    setParamRows([]);
    setRollerLabel(null);
    setRollerActiveValue(null);
    setCountdownPreview(null);
    setCountdownValue(0);
    setSpinBoardVisible(false);
    setSpinDone(false);
    setEvolutionCommand(null);
    setBatchCommand(null);
    resetWheelOverlay();
  }, [disposeSpinLoader, resetWheelOverlay]);

  const handleWheelCommand = useCallback(
    async (wheelSpin: StreamWheelSpin, params?: unknown, slots?: unknown) => {
      if (countdownTimerRef.current) {
        clearTimeout(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      if (previewIntervalRef.current) {
        clearInterval(previewIntervalRef.current);
        previewIntervalRef.current = null;
      }
      if (autoClearTimerRef.current) {
        clearTimeout(autoClearTimerRef.current);
        autoClearTimerRef.current = null;
      }
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }

      const token = ++generationIdRef.current;
      disposeSpinLoader();
      setSpinDone(false);
      setRollerLabel(null);
      setRollerActiveValue(null);
      setFlashParamId(null);
      setFlashLayerKey(null);
      setActiveParamId(null);
      setCountdownPreview(null);
      setCountdownValue(0);
      setSpinBoardVisible(false);
      setObsPhase("active");

      if (params) {
        await primeOverlayFromCommand(params, slots);
      } else {
        const currentState = catStateRef.current;
        if (currentState) {
          if (obsPhase !== "active") {
            await showStaticCatState(currentState);
          }
        } else {
          console.warn(
            "[ObsOverlayClient] Wheel command received but no cat state or params available",
          );
          resetWheelOverlay();
          drawPlaceholder();
          return;
        }
      }

      if (generationIdRef.current !== token) return;
      await runWheelReveal(wheelSpin, token);
      if (generationIdRef.current !== token) return;
      setSpinDone(true);
      scheduleAutoClear(token);
    },
    [
      disposeSpinLoader,
      drawPlaceholder,
      obsPhase,
      primeOverlayFromCommand,
      resetWheelOverlay,
      runWheelReveal,
      scheduleAutoClear,
      showStaticCatState,
    ],
  );

  // Visibility transitions for active and fading phases
  useEffect(() => {
    if (obsPhase === "active") {
      const raf = requestAnimationFrame(() => setSpinVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    if (obsPhase === "fading") {
      // Start fading out, then go idle after transition
      setSpinVisible(false);
      fadeTimerRef.current = setTimeout(() => setObsPhase("idle"), 1500);
      return () => {
        if (fadeTimerRef.current) {
          clearTimeout(fadeTimerRef.current);
          fadeTimerRef.current = null;
        }
      };
    }
    setSpinVisible(false);
  }, [obsPhase]);

  useEffect(() => {
    if (!session?.currentCommand) return;
    const cmd = session.currentCommand;
    const cmdSeq = typeof cmd.seq === "number" ? cmd.seq : 0;

    const decision = decideCommandAction({
      type: cmd.type,
      seq: cmdSeq,
      timestamp: cmd.timestamp,
      lastSeq: lastSeqRef.current,
      initialized: initializedSeqRef.current,
      generationDisabled,
      initializing,
      resultAutoClearEnabled: resultAutoClearEnabledRef.current,
      resultAutoClearSeconds: resultAutoClearSecondsRef.current,
      now: Date.now(),
    });

    if (decision === "ignore" || decision === "defer") return;

    initializedSeqRef.current = true;
    lastSeqRef.current = cmdSeq;

    if (decision === "skip") return;

    if (decision === "restore") {
      // Overlay (re)loaded with auto-clear off — show the final result
      // without replaying the spin animation.
      resetCommandState();
      if (!cmd.params) {
        setObsPhase("idle");
        drawPlaceholder();
        return;
      }
      const restoredWheelSpin =
        cmd.type === "wheel"
          ? parseStreamWheelSpin((cmd as Record<string, unknown>).wheelSpin)
          : null;
      if (cmd.type === "wheel" && !restoredWheelSpin) {
        setObsPhase("idle");
        drawPlaceholder();
        return;
      }
      const restoreToken = generationIdRef.current;
      setObsPhase("active");
      primeOverlayFromCommand(cmd.params, cmd.slots)
        .then(() => {
          if (generationIdRef.current !== restoreToken) return;
          setSpinDone(true);
          if (restoredWheelSpin) {
            setWheelReward({ status: "settled", prize: restoredWheelSpin });
            setWheelBannerVisible(true);
          }
        })
        .catch((err) => {
          if (generationIdRef.current !== restoreToken) return;
          console.error(
            "[ObsOverlayClient] Failed to restore OBS command",
            err,
          );
          resetCommandState();
          setObsPhase("idle");
          drawPlaceholder();
        });
      return;
    }

    if (decision === "discard-stale") {
      resetCommandState();
      setObsPhase("idle");
      drawPlaceholder();
      return;
    }

    switch (cmd.type) {
      case "spin":
        if (!generationDisabled) {
          resetCommandState();
          const commandToken = generationIdRef.current;
          // Store the params from the control page so generateCatPlus uses them
          const override = { params: cmd.params, slots: cmd.slots };
          overrideParamsRef.current = override;
          // Roll the plan and start loading every frame now, so the
          // countdown doubles as preload time.
          // A failed preparation is retried by generateCatPlus.
          preparedSpinRef.current = prepareSpin(override).catch(() => null);
          setRollerHighlight(false);
          setActiveParamId(null);

          const cdSeconds = (cmd as Record<string, unknown>).countdownSeconds as
            | number
            | undefined;
          if (cdSeconds && cdSeconds > 0) {
            setObsPhase("countdown");
            setCountdownValue(cdSeconds);
            setCountdownPreview(null);
            setSpinBoardVisible(false);
            let remaining = cdSeconds;

            // Rich full-screen fireworks
            const fireConfetti = async () => {
              if (generationIdRef.current !== commandToken) return;
              try {
                const confetti = (await import("canvas-confetti")).default;
                if (generationIdRef.current !== commandToken) return;
                const colors = [
                  "#f59e0b",
                  "#ef4444",
                  "#3b82f6",
                  "#22c55e",
                  "#a855f7",
                  "#ec4899",
                  "#fbbf24",
                ];
                // Center burst
                confetti({
                  particleCount: 80,
                  spread: 100,
                  origin: { x: 0.5, y: 0.5 },
                  colors,
                  zIndex: 10000,
                  startVelocity: 35,
                });
                // Left side sprayer
                confetti({
                  angle: 60,
                  spread: 55,
                  origin: { x: 0, y: 0.6 },
                  particleCount: 50,
                  colors,
                  zIndex: 10000,
                  startVelocity: 45,
                });
                // Right side sprayer
                confetti({
                  angle: 120,
                  spread: 55,
                  origin: { x: 1, y: 0.6 },
                  particleCount: 50,
                  colors,
                  zIndex: 10000,
                  startVelocity: 45,
                });
                // Top burst with stars
                confetti({
                  spread: 360,
                  ticks: 60,
                  startVelocity: 30,
                  particleCount: 40,
                  origin: {
                    x: 0.3 + Math.random() * 0.4,
                    y: Math.random() * 0.4,
                  },
                  colors,
                  shapes: ["star"],
                  zIndex: 10000,
                });
                // Random scatter
                confetti({
                  particleCount: 30,
                  spread: 120,
                  origin: { x: Math.random(), y: Math.random() * 0.5 },
                  colors,
                  zIndex: 10000,
                });
              } catch {
                /* confetti unavailable */
              }
            };
            fireConfetti();

            // Cat preview cycling every 250ms
            const genRef = generatorRef.current;
            if (genRef?.generateRandomCat) {
              const cycle = async () => {
                if (generationIdRef.current !== commandToken) return;
                try {
                  const r = await genRef.generateRandomCat?.({
                    accessoryCount: computeLayerCount(accessoryRange),
                    scarCount: computeLayerCount(scarRange),
                    tortieCount: computeLayerCount(tortieRange),
                    exactLayerCounts,
                    experimentalColourMode:
                      extendedModesArray.length > 0
                        ? extendedModesArray
                        : undefined,
                    includeBaseColours,
                    includeNewSprites,
                  });
                  if (
                    generationIdRef.current === commandToken &&
                    r?.canvas instanceof HTMLCanvasElement
                  ) {
                    setCountdownPreview(r.canvas.toDataURL("image/png"));
                  }
                } catch {
                  /* skip */
                }
              };
              cycle();
              previewIntervalRef.current = setInterval(cycle, 250);
            }

            const tick = () => {
              if (generationIdRef.current !== commandToken) return;
              remaining--;
              if (remaining <= 0) {
                // "GO!" flash — big finale burst, hold 800ms then start spin
                setCountdownValue(0);
                if (previewIntervalRef.current) {
                  clearInterval(previewIntervalRef.current);
                  previewIntervalRef.current = null;
                }
                // Massive finale — triple burst
                fireConfetti();
                setTimeout(() => {
                  if (generationIdRef.current === commandToken) fireConfetti();
                }, 150);
                setTimeout(() => {
                  if (generationIdRef.current === commandToken) fireConfetti();
                }, 300);
                countdownTimerRef.current = setTimeout(() => {
                  if (generationIdRef.current !== commandToken) return;
                  setCountdownPreview(null);
                  setObsPhase("active");
                  generateCatPlus();
                }, 800);
              } else {
                setCountdownValue(remaining);
                fireConfetti();
                // Last 3 seconds — extra bursts + start fading in the spin board
                if (remaining <= 3) {
                  setTimeout(() => {
                    if (generationIdRef.current === commandToken)
                      fireConfetti();
                  }, 400);
                  setTimeout(() => {
                    if (generationIdRef.current === commandToken)
                      fireConfetti();
                  }, 700);
                  setSpinBoardVisible(true);
                }
                countdownTimerRef.current = setTimeout(tick, 1000);
              }
            };
            countdownTimerRef.current = setTimeout(tick, 1000);
          } else {
            setObsPhase("active");
            generateCatPlus();
          }
        }
        break;
      case "wheel": {
        const wheelSpin = parseStreamWheelSpin(
          (cmd as Record<string, unknown>).wheelSpin,
        );
        if (!wheelSpin) {
          break;
        }
        handleWheelCommand(wheelSpin, cmd.params, cmd.slots).catch((err) => {
          console.error("[ObsOverlayClient] Wheel command failed", err);
          resetCommandState();
          drawPlaceholder();
        });
        break;
      }
      case "evolution": {
        const evolution = parseEvolutionStreamCommand(
          (cmd as Record<string, unknown>).evolution,
        );
        if (!evolution) {
          break;
        }
        resetCommandState();
        // After an overlay reload the ceremony may already be over — jump
        // straight to the lineage + QR instead of replaying it.
        const commandAgeMs = Date.now() - cmd.timestamp;
        setEvolutionInitialPhase(
          Number.isFinite(commandAgeMs) &&
            commandAgeMs > estimateEvolutionCommandMs(evolution)
            ? "tree"
            : "ceremony",
        );
        setEvolutionCommand({ ...evolution, seq: cmdSeq });
        setObsPhase("evolution");
        break;
      }
      case "batch": {
        const batch = parseBatchStreamCommand(
          (cmd as Record<string, unknown>).batch,
        );
        if (!batch) {
          break;
        }
        resetCommandState();
        // Elimination progress lives in session.batchState, so the scene
        // resumes mid-show on its own after an overlay reload.
        setBatchCommand({ ...batch, seq: cmdSeq });
        setObsPhase("batch");
        break;
      }
      case "clear":
        resetCommandState();
        if (
          obsPhase === "active" ||
          obsPhase === "countdown" ||
          obsPhase === "brb" ||
          obsPhase === "evolution" ||
          obsPhase === "batch"
        ) {
          setObsPhase("fading");
        } else {
          setObsPhase("idle");
        }
        drawPlaceholder();
        break;
      case "lobby":
        resetCommandState();
        setObsPhase("lobby");
        break;
      case "brb":
        resetCommandState();
        setObsPhase("brb");
        break;
      case "test":
        // No-op — test mode rendering is handled by the session.testMode early-return above
        break;
    }
  }, [
    session?.currentCommand,
    generationDisabled,
    initializing,
    handleWheelCommand,
    generateCatPlus,
    prepareSpin,
    primeOverlayFromCommand,
    drawPlaceholder,
    resetCommandState,
    exactLayerCounts,
    obsPhase,
    extendedModesArray,
    includeBaseColours,
    includeNewSprites,
    accessoryRange,
    scarRange,
    tortieRange,
  ]);

  // Memoize lobby settings so OBSLobby doesn't restart animations on every render
  const rawSession = sessionSettings as Record<string, unknown> | undefined;
  const lobbySettings = useMemo(
    () => ({
      mode,
      accessoryRange,
      scarRange,
      tortieRange,
      afterlifeMode,
      includeBaseColours,
      includeNewSprites,
      extendedModes: extendedModesArray,
      exactLayerCounts,
      lobbyMode:
        (rawSession?.lobbyMode as LobbySettings["lobbyMode"]) ?? "fruit-ninja",
      lobbyCatCount: (rawSession?.lobbyCatCount as number) ?? 4,
      lobbyMoveSpeed: (rawSession?.lobbyMoveSpeed as number) ?? 1.0,
      lobbySwapSpeed: (rawSession?.lobbySwapSpeed as number) ?? 1.0,
      lobbyClearSeq: (rawSession?.lobbyClearSeq as number) ?? 0,
      paletteDisplayMode:
        (rawSession?.paletteDisplayMode as "cycle" | "all") ?? "cycle",
      lobbyCatMinSize: (rawSession?.lobbyCatMinSize as number) ?? 1,
      lobbyCatMaxSize: (rawSession?.lobbyCatMaxSize as number) ?? 2,
      lobbyInfoMode:
        (rawSession?.lobbyInfoMode as LobbySettings["lobbyInfoMode"]) ?? "spin",
      evolutionInfo:
        rawSession?.evolutionInfo as LobbySettings["evolutionInfo"],
      batchInfo: rawSession?.batchInfo as LobbySettings["batchInfo"],
    }),
    [
      mode,
      accessoryRange,
      scarRange,
      tortieRange,
      afterlifeMode,
      includeBaseColours,
      includeNewSprites,
      extendedModesArray,
      exactLayerCounts,
      rawSession,
    ],
  );
  const brbPortableSettings = useMemo(() => {
    const rawCode = rawSession?.brbSettingsCode;
    if (typeof rawCode !== "string" || !rawCode.trim()) {
      return null;
    }
    return decodePortableSettings(rawCode);
  }, [rawSession]);
  const brbLobbySettings = useMemo(
    () =>
      brbPortableSettings
        ? {
            ...lobbySettings,
            accessoryRange: brbPortableSettings.accessoryRange,
            scarRange: brbPortableSettings.scarRange,
            tortieRange: brbPortableSettings.tortieRange,
            exactLayerCounts: brbPortableSettings.exactLayerCounts,
            afterlifeMode: brbPortableSettings.afterlifeMode,
            includeBaseColours: brbPortableSettings.includeBaseColours,
            includeNewSprites: brbPortableSettings.includeNewSprites,
            extendedModes: brbPortableSettings.extendedModes,
          }
        : lobbySettings,
    [brbPortableSettings, lobbySettings],
  );

  const showCountdownLayer = obsPhase === "countdown";

  // Share QR for the current result — the slug is stamped onto the command
  // by the control page after the history save (same seq, no re-dispatch).
  const commandViewSlug = session?.currentCommand?.viewSlug;
  const viewUrl = buildViewUrl(commandViewSlug);

  // Test mode — layout guide for OBS positioning
  if (session?.testMode) {
    return <TestCard spread={obsLayoutSpread} />;
  }

  // When idle (after clear), show nothing — fully transparent
  if (obsPhase === "idle" && !initializing) {
    return null;
  }

  // BRB mode — lobby cats without the settings panel
  if (obsPhase === "brb") {
    return (
      <BrbScene settings={brbLobbySettings} generator={generatorRef.current} />
    );
  }

  // Evolution ceremony → lineage + QR
  if (obsPhase === "evolution" && evolutionCommand) {
    return (
      <EvolutionScene
        key={`evolution-${evolutionCommand.seq}`}
        command={evolutionCommand}
        initialPhase={evolutionInitialPhase}
      />
    );
  }

  // Batch elimination show → final grid + QR
  if (obsPhase === "batch" && batchCommand) {
    return (
      <BatchScene
        key={`batch-${batchCommand.seq}`}
        command={withLiveBatchSlug(batchCommand, session?.currentCommand)}
        liveState={session?.batchState ?? null}
        apiKey={apiKey}
      />
    );
  }

  if (obsPhase === "lobby" || obsPhase === "countdown") {
    return (
      <LobbyCountdownScene
        lobbySettings={lobbySettings}
        generator={generatorRef.current}
        showCountdown={showCountdownLayer}
        countdownPreview={countdownPreview}
        countdownValue={countdownValue}
        spinBoardVisible={spinBoardVisible}
      />
    );
  }

  return (
    <SpinBoard
      canvasRef={canvasRef}
      wheelRef={wheelRef}
      spinVisible={spinVisible}
      initializing={initializing}
      wheelReward={wheelReward}
      wheelBannerVisible={wheelBannerVisible}
      paramRows={paramRows}
      layerRows={layerRows}
      flashParamId={flashParamId}
      flashLayerKey={flashLayerKey}
      rollerLabel={rollerLabel}
      rollerActiveValue={rollerActiveValue}
      spinDone={spinDone}
      viewUrl={viewUrl}
      spread={obsLayoutSpread}
    />
  );
}
