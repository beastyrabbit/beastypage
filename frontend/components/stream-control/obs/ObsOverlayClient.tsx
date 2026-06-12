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
import { DEFAULT_POSE_NAME, formatPoseName } from "@/lib/cat-v3/poseOptions";
import type { CatParams } from "@/lib/cat-v3/types";
import {
  type EvolutionStreamCommand,
  estimateEvolutionCommandMs,
  parseEvolutionStreamCommand,
} from "@/lib/evolution/streamEvolution";
import { decodePortableSettings } from "@/lib/portable-settings";
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
  applyParamValue,
  buildFlipSequence,
  buildLayerOptionStrings,
  buildParameterOptions,
  buildSharePayload,
  type CatState,
  cloneParams,
  cloneSourceCanvas,
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
  getParameterRawValue,
  getParameterValueForDisplay,
  getSpeedSettings,
  type Id,
  INSTANT_PARAMS,
  invokeMapperArray,
  LAYER_PARAM_IDS,
  type LayerGroup,
  type LayerRowState,
  logTimingReport,
  MAX_SPINNY_VARIATIONS,
  PARAM_REVEAL_PAUSE,
  PARAM_SEQUENCE,
  type ParameterOptions,
  type ParamId,
  type ParamRow,
  PLACEHOLDER_COLOUR,
  PRE_SPIN_DELAY,
  parseStreamWheelSpin,
  preRenderVariationFrames,
  ROLLER_REVEAL_HOLD,
  renderVariantFrames,
  type SingleCatPortableSettings,
  type SpriteMapperApi,
  SUBSET_LIMIT,
  sampleValues,
  sanitizeForBuilder,
  type TimingSnapshot,
  type TortieSlot,
  toClassicWheelSelection,
  track,
  type VariantDescriptor,
  type VariationFrame,
  type WheelRewardState,
  wait,
} from "./spinSupport";
import { useObsSession } from "./useObsSession";

export function ObsOverlayClient({ apiKey }: { apiKey: string }) {
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
  const [_timingModalOpen, _setTimingModalOpen] = useState(false);
  const [_lastTimingSnapshot, setLastTimingSnapshot] =
    useState<TimingSnapshot | null>(null);
  const [speedMultiplier, setSpeedMultiplier] = useState(
    initialSettings.speedMultiplier,
  );
  const speedMultiplierRef = useRef(1.0);
  const subsetLimits = useMemo(
    () => timingConfig.subsetLimits ?? DEFAULT_TIMING_CONFIG.subsetLimits ?? {},
    [timingConfig.subsetLimits],
  );
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
      subsetLimits: timingConfig.subsetLimits,
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
  >({
    accessories: [],
    scars: [],
    torties: [],
  });
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
      extendedModes: [...extendedModes].sort(),
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
      const limited =
        subsetLimits[key] && baseCount > SUBSET_LIMIT
          ? SUBSET_LIMIT
          : baseCount;
      adjusted[key] = limited;
    });
    return adjusted;
  }, [optionCounts, subsetLimits]);

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

  const _toggleSubsetLimit = useCallback(
    (key: ParamTimingKey) => {
      const current = Boolean(subsetLimits[key]);
      const nextLimits: Partial<Record<ParamTimingKey, boolean>> = {
        ...subsetLimits,
      };
      if (current) {
        delete nextLimits[key];
      } else {
        nextLimits[key] = true;
      }
      setTimingConfig({
        ...timingConfig,
        subsetLimits: nextLimits,
      });
    },
    [subsetLimits, timingConfig],
  );

  const _handleResetTimings = useCallback(() => {
    setTimingConfig({
      ...timingConfig,
      allowFastFlips: DEFAULT_TIMING_CONFIG.allowFastFlips,
      delays: { ...DEFAULT_TIMING_CONFIG.delays },
      subsetLimits: { ...DEFAULT_TIMING_CONFIG.subsetLimits },
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
    ) => {
      const accessories = Array.isArray(accessoriesInput)
        ? accessoriesInput
        : [];
      const scars = Array.isArray(scarsInput) ? scarsInput : [];
      const torties = Array.isArray(tortiesInput) ? tortiesInput : [];

      setLayerRows({
        accessories: accessories.map((_, idx) => ({
          label: `Accessory ${idx + 1}`,
          value: "—",
          status: "idle",
        })),
        scars: scars.map((_, idx) => ({
          label: `Scar ${idx + 1}`,
          value: "—",
          status: "idle",
        })),
        torties: torties.map((_, idx) => ({
          label: `Tortie ${idx + 1}`,
          value: "—",
          status: "idle",
        })),
      });
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
    setLayerRows({
      accessories: placeholderRows("Accessory", accessoryRange.max),
      scars: placeholderRows("Scar", scarRange.max),
      torties: placeholderRows("Tortie", tortieRange.max),
    });
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

      setLayerRows({
        accessories: accessorySlots.map((slot, idx) => ({
          label: `Accessory ${idx + 1}`,
          value: slot === "none" ? "None" : formatValue(slot),
          status: "revealed" as const,
        })),
        scars: scarSlots.map((slot, idx) => ({
          label: `Scar ${idx + 1}`,
          value: slot === "none" ? "None" : formatValue(slot),
          status: "revealed" as const,
        })),
        torties: tortieSlots.map((slot, idx) => ({
          label: `Tortie ${idx + 1}`,
          value: formatTortieLayer(slot),
          status: "revealed" as const,
        })),
      });

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

      const accessorySlots = Array.isArray(slotRecord?.accessories)
        ? slotRecord.accessories.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : Array.isArray(params.accessories)
          ? params.accessories.filter(
              (entry): entry is string => typeof entry === "string",
            )
          : [];
      const scarSlots = Array.isArray(slotRecord?.scars)
        ? slotRecord.scars.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : Array.isArray(params.scars)
          ? params.scars.filter(
              (entry): entry is string => typeof entry === "string",
            )
          : [];
      const tortieSlots = Array.isArray(slotRecord?.tortie)
        ? slotRecord.tortie.map((slot) =>
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
          )
        : Array.isArray(params.tortie)
          ? params.tortie.map((slot) =>
              slot?.mask && slot?.pattern && slot?.colour
                ? {
                    mask: String(slot.mask),
                    pattern: String(slot.pattern),
                    colour: String(slot.colour),
                  }
                : null,
            )
          : [];

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

  const spinAccessorySlots = useCallback(
    async (
      rowIndex: number,
      targetSlotsInput: string[] | null | undefined,
      context: {
        accessories: string[];
        scars: string[];
        torties: (TortieSlot | null)[];
      },
      progressiveParams: Partial<CatParams>,
      mapper: SpriteMapperApi,
      pauseDuration: number,
      currentToken: number,
    ) => {
      const generator = generatorRef.current;
      if (!generator || !mapper) return;

      const targetSlots = Array.isArray(targetSlotsInput)
        ? targetSlotsInput
        : [];

      clearMirror();
      setRollerLabel("Accessories");
      setRollerActiveValue("—");

      if (targetSlots.length === 0) {
        context.accessories.splice(0, context.accessories.length);
        updateParamRow(rowIndex, { value: "None", status: "revealed" });

        const spinState = readSpinState();
        if (spinState.spinny) {
          const frontResult = await generator.generateCat(progressiveParams);
          const drawStep = () =>
            drawCanvas(
              frontResult.canvas as HTMLCanvasElement | OffscreenCanvas,
            );
          await playFlip(
            drawStep,
            Math.max(getBaseFrameDuration(spinState.speed), 90),
          );
          if (generationIdRef.current !== currentToken) return;
          await settleRoller(currentToken);
        } else {
          const frontResult = await generator.generateCat(progressiveParams);
          drawCanvas(frontResult.canvas as HTMLCanvasElement | OffscreenCanvas);
          setRollerLabel(null);
          setRollerActiveValue(null);
        }

        await wait(pauseDuration);
        clearMirror();
        return;
      }

      const allAccessories = invokeMapperArray(mapper, mapper.getAccessories);
      const committed: string[] = [];
      const summary: string[] = [];
      let baseCanvas: HTMLCanvasElement | null = null;

      for (let i = 0; i < targetSlots.length; i += 1) {
        if (generationIdRef.current !== currentToken) return;
        const target = targetSlots[i] ?? "none";
        const spinState = readSpinState();
        setRollerLabel(`Accessory ${i + 1}`);

        await flashLayer(`accessories-${i}`);

        if (spinState.spinny) {
          updateLayerRow("accessories", i, { status: "active", value: "---" });

          const variationOptions = buildLayerOptionStrings(
            allAccessories,
            target,
            true,
            {
              spinny: true,
              limit: subsetLimits.accessory ? SUBSET_LIMIT : undefined,
            },
          );
          if (!baseCanvas) {
            const basePreview = cloneParams(progressiveParams);
            basePreview.accessories = [];
            basePreview.accessory = undefined;
            const baseResult = await generator.generateCat(basePreview);
            baseCanvas = cloneSourceCanvas(
              baseResult.canvas as HTMLCanvasElement | OffscreenCanvas,
            );
          }

          const descriptors: VariantDescriptor[] = variationOptions.map(
            (option, variantIndex) => {
              const preview = cloneParams(progressiveParams);
              const accessoriesList = committed.slice();
              if (typeof option.raw === "string" && option.raw !== "none") {
                accessoriesList.push(option.raw);
              }
              preview.accessories = accessoriesList;
              preview.accessory = accessoriesList[0];
              return {
                id: `accessory-${i}-${variantIndex}`,
                option,
                params: preview,
                label: option.display,
                group: `accessory-${i + 1}`,
              };
            },
          );

          const frames = await renderVariantFrames(
            generator,
            progressiveParams,
            descriptors,
            {
              layerId: "accessories",
              baseCanvas: baseCanvas ?? undefined,
              priority: "high",
            },
          );
          if (frames.length === 0) {
            continue;
          }

          const sequence = buildFlipSequence(frames);

          for (let idx = 0; idx < sequence.length; idx += 1) {
            const step = sequence[idx];
            if (generationIdRef.current !== currentToken) return;

            // Recalculate delay on each step to get live updates
            const accessoryDelay = getDelayWithMultiplier("accessory");
            const currentConfig = timingConfigRef.current;
            const stepDurations = computeStepDurations(
              sequence.slice(idx),
              accessoryDelay,
              currentConfig.allowFastFlips,
            );
            const stepDuration = stepDurations[0] ?? accessoryDelay;

            const frameDisplay = step.frame.option.display;
            setRollerActiveValue(frameDisplay);
            updateLayerRow("accessories", i, {
              value: frameDisplay,
              status: step.isFinal ? "revealed" : "active",
            });

            const drawStep = () => drawCanvas(step.frame.canvas);
            const stepState = readSpinState();
            await playFlip(drawStep, stepDuration);
            if (!stepState.spinny) {
              break;
            }
          }

          if (frames.length > 0) {
            drawCanvas(frames[frames.length - 1].canvas);
          }
          const finalRaw = frames[frames.length - 1]?.option.raw;
          if (typeof finalRaw === "string" && finalRaw !== "none") {
            committed.push(finalRaw);
            summary.push(formatValue(finalRaw));
            context.accessories[i] = finalRaw;
          } else {
            summary.push("None");
            context.accessories[i] = "none";
          }

          progressiveParams.accessories = committed.slice();
          progressiveParams.accessory = committed[0];
          await renderCat(progressiveParams);
          await wait(pauseDuration);
        } else {
          const formatted =
            typeof target === "string" && target !== "none"
              ? formatValue(target)
              : "None";
          updateLayerRow("accessories", i, {
            value: formatted,
            status: "revealed",
          });
          summary.push(formatted);
          if (typeof target === "string" && target !== "none") {
            committed.push(target);
            context.accessories[i] = target;
          } else {
            context.accessories[i] = "none";
          }
          progressiveParams.accessories = committed.slice();
          progressiveParams.accessory = committed[0];
          setRollerActiveValue(formatted);
          await renderCat(progressiveParams);
          await wait(pauseDuration);
        }
      }

      context.accessories.splice(targetSlots.length);
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
      getDelayWithMultiplier,
      playFlip,
      renderCat,
      settleRoller,
      subsetLimits,
      updateLayerRow,
      updateParamRow,
      readSpinState,
    ],
  );

  const spinScarSlots = useCallback(
    async (
      rowIndex: number,
      targetSlotsInput: string[] | null | undefined,
      context: {
        accessories: string[];
        scars: string[];
        torties: (TortieSlot | null)[];
      },
      progressiveParams: Partial<CatParams>,
      mapper: SpriteMapperApi,
      pauseDuration: number,
      currentToken: number,
    ) => {
      const generator = generatorRef.current;
      if (!generator || !mapper) return;

      const targetSlots = Array.isArray(targetSlotsInput)
        ? targetSlotsInput
        : [];

      clearMirror();
      setRollerLabel("Scars");
      setRollerActiveValue("—");

      if (targetSlots.length === 0) {
        context.scars.splice(0, context.scars.length);
        updateParamRow(rowIndex, { value: "None", status: "revealed" });

        const spinState = readSpinState();
        if (spinState.spinny) {
          const frontResult = await generator.generateCat(progressiveParams);
          const drawStep = () =>
            drawCanvas(
              frontResult.canvas as HTMLCanvasElement | OffscreenCanvas,
            );
          await playFlip(
            drawStep,
            Math.max(getBaseFrameDuration(spinState.speed), 90),
          );
          if (generationIdRef.current !== currentToken) return;
          await settleRoller(currentToken);
        } else {
          const frontResult = await generator.generateCat(progressiveParams);
          drawCanvas(frontResult.canvas as HTMLCanvasElement | OffscreenCanvas);
          setRollerLabel(null);
          setRollerActiveValue(null);
        }

        await wait(pauseDuration);
        clearMirror();
        return;
      }

      const allScars = invokeMapperArray(mapper, mapper.getScars);
      const committed: string[] = [];
      const summary: string[] = [];
      let baseCanvas: HTMLCanvasElement | null = null;

      for (let i = 0; i < targetSlots.length; i += 1) {
        if (generationIdRef.current !== currentToken) return;
        const target = targetSlots[i] ?? "none";
        const spinState = readSpinState();
        setRollerLabel(`Scar ${i + 1}`);

        await flashLayer(`scars-${i}`);

        if (spinState.spinny) {
          updateLayerRow("scars", i, { status: "active", value: "---" });

          const variationOptions = buildLayerOptionStrings(
            allScars,
            target,
            true,
            {
              spinny: true,
              limit: subsetLimits.scar ? SUBSET_LIMIT : undefined,
            },
          );
          if (!baseCanvas) {
            const basePreview = cloneParams(progressiveParams);
            basePreview.scars = [];
            basePreview.scar = undefined;
            const baseResult = await generator.generateCat(basePreview);
            baseCanvas = cloneSourceCanvas(
              baseResult.canvas as HTMLCanvasElement | OffscreenCanvas,
            );
          }

          const descriptors: VariantDescriptor[] = variationOptions.map(
            (option, variantIndex) => {
              const preview = cloneParams(progressiveParams);
              const scarsList = committed.slice();
              if (typeof option.raw === "string" && option.raw !== "none") {
                scarsList.push(option.raw);
              }
              preview.scars = scarsList;
              preview.scar = scarsList[0];
              return {
                id: `scar-${i}-${variantIndex}`,
                option,
                params: preview,
                label: option.display,
                group: `scar-${i + 1}`,
              };
            },
          );

          const frames = await renderVariantFrames(
            generator,
            progressiveParams,
            descriptors,
            {
              layerId: "scarsPrimary",
              baseCanvas: baseCanvas ?? undefined,
              priority: "high",
            },
          );
          if (frames.length === 0) {
            continue;
          }

          const sequence = buildFlipSequence(frames);

          for (let idx = 0; idx < sequence.length; idx += 1) {
            const step = sequence[idx];
            if (generationIdRef.current !== currentToken) return;

            // Recalculate delay on each step to get live updates
            const scarDelay = getDelayWithMultiplier("scar");
            const currentConfig = timingConfigRef.current;
            const stepDurations = computeStepDurations(
              sequence.slice(idx),
              scarDelay,
              currentConfig.allowFastFlips,
            );
            const stepDuration = stepDurations[0] ?? scarDelay;

            const frameDisplay = step.frame.option.display;
            setRollerActiveValue(frameDisplay);
            updateLayerRow("scars", i, {
              value: frameDisplay,
              status: step.isFinal ? "revealed" : "active",
            });

            const drawStep = () => drawCanvas(step.frame.canvas);
            const stepState = readSpinState();
            await playFlip(drawStep, stepDuration);
            if (!stepState.spinny) {
              break;
            }
          }

          if (frames.length > 0) {
            drawCanvas(frames[frames.length - 1].canvas);
          }
          const finalRaw = frames[frames.length - 1]?.option.raw;
          if (typeof finalRaw === "string" && finalRaw !== "none") {
            committed.push(finalRaw);
            summary.push(formatValue(finalRaw));
            context.scars[i] = finalRaw;
          } else {
            summary.push("None");
            context.scars[i] = "none";
          }

          progressiveParams.scars = committed.slice();
          progressiveParams.scar = committed[0];
          await renderCat(progressiveParams);
          await wait(pauseDuration);
        } else {
          const formatted =
            typeof target === "string" && target !== "none"
              ? formatValue(target)
              : "None";
          updateLayerRow("scars", i, { value: formatted, status: "revealed" });
          summary.push(formatted);
          if (typeof target === "string" && target !== "none") {
            committed.push(target);
            context.scars[i] = target;
          } else {
            context.scars[i] = "none";
          }
          progressiveParams.scars = committed.slice();
          progressiveParams.scar = committed[0];
          setRollerActiveValue(formatted);
          await renderCat(progressiveParams);
          await wait(pauseDuration);
        }
      }

      context.scars.splice(targetSlots.length);
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
      getDelayWithMultiplier,
      playFlip,
      renderCat,
      settleRoller,
      subsetLimits,
      updateLayerRow,
      updateParamRow,
      readSpinState,
    ],
  );

  const spinTortieSlots = useCallback(
    async (
      rowIndex: number,
      targetSlotsInput: (TortieSlot | null)[] | null | undefined,
      context: {
        accessories: string[];
        scars: string[];
        torties: (TortieSlot | null)[];
      },
      progressiveParams: Partial<CatParams>,
      mapper: SpriteMapperApi,
      pauseDuration: number,
      currentToken: number,
    ) => {
      const generator = generatorRef.current;
      if (!generator || !mapper) return;

      const targetSlots = Array.isArray(targetSlotsInput)
        ? targetSlotsInput
        : [];

      clearMirror();
      setRollerLabel("Tortie Layers");
      setRollerActiveValue("—");

      if (targetSlots.length === 0) {
        context.torties.splice(0, context.torties.length);
        updateParamRow(rowIndex, { value: "None", status: "revealed" });

        const spinState = readSpinState();
        if (spinState.spinny) {
          const frontResult = await generator.generateCat(progressiveParams);
          const drawStep = () =>
            drawCanvas(
              frontResult.canvas as HTMLCanvasElement | OffscreenCanvas,
            );
          await playFlip(
            drawStep,
            Math.max(getBaseFrameDuration(spinState.speed), 90),
          );
          if (generationIdRef.current !== currentToken) return;
          await settleRoller(currentToken);
        } else {
          const frontResult = await generator.generateCat(progressiveParams);
          drawCanvas(frontResult.canvas as HTMLCanvasElement | OffscreenCanvas);
          setRollerLabel(null);
          setRollerActiveValue(null);
        }

        await wait(pauseDuration);
        clearMirror();
        return;
      }

      const masks = invokeMapperArray(mapper, mapper.getTortieMasks);
      const patterns = invokeMapperArray(mapper, mapper.getPeltNames);
      const colours =
        parameterOptionsRef.current?.colour ??
        invokeMapperArray(mapper, mapper.getColours);

      const committed: TortieSlot[] = [];
      const summary: string[] = [];

      for (let i = 0; i < targetSlots.length; i += 1) {
        if (generationIdRef.current !== currentToken) return;
        const target = targetSlots[i];
        const spinState = readSpinState();

        await flashLayer(`torties-${i}`);

        if (!target) {
          updateLayerRow("torties", i, { value: "None", status: "revealed" });
          context.torties[i] = null;
          summary.push("None");
          if (!spinState.spinny) {
            await wait(pauseDuration);
          }
          continue;
        }

        if (spinState.spinny) {
          // Pick a random starting colour that isn't the target, so we get a spin.
          const availableColours = colours.filter((c) => c !== target.colour);
          const startColour =
            availableColours.length > 0
              ? availableColours[
                  Math.floor(Math.random() * availableColours.length)
                ]
              : target.colour;

          // Pick a different random colour for mask/pattern stages (not the final colour)
          const maskPatternColours = colours.filter((c) => c !== target.colour);
          const maskPatternColour =
            maskPatternColours.length > 0
              ? maskPatternColours[
                  Math.floor(Math.random() * maskPatternColours.length)
                ]
              : target.colour;

          let working: TortieSlot = { ...target, colour: startColour };
          updateLayerRow("torties", i, { value: "—", status: "active" });

          const stageConfigs: Array<{
            kind: "mask" | "pattern" | "colour";
            label: string;
            source: string[];
          }> = [
            { kind: "mask", label: "Mask", source: masks },
            { kind: "pattern", label: "Pelt", source: patterns },
            { kind: "colour", label: "Colour", source: colours },
          ];

          const baseSpinState = readSpinState();
          const _phaseTargetDuration =
            baseSpinState.speed.targetSpinDuration /
            Math.max(stageConfigs.length, 1);

          for (const stage of stageConfigs) {
            const stageKey: ParamTimingKey =
              stage.kind === "mask"
                ? "tortieMask"
                : stage.kind === "pattern"
                  ? "tortiePattern"
                  : "tortieColour";
            const stageStart =
              typeof performance !== "undefined"
                ? performance.now()
                : Date.now();
            setRollerLabel(`Tortie Layer ${i + 1} – ${stage.label}`);
            const stageTargetValue =
              stage.kind === "mask"
                ? working.mask
                : stage.kind === "pattern"
                  ? working.pattern
                  : target.colour;
            const options = buildLayerOptionStrings(
              stage.source,
              stageTargetValue,
              false,
              {
                spinny: true,
                limit: subsetLimits[stageKey] ? SUBSET_LIMIT : undefined,
              },
            );
            const descriptors: VariantDescriptor[] = options.map(
              (option, variantIndex) => {
                const preview = cloneParams(progressiveParams);
                const candidateLayer: TortieSlot = {
                  mask:
                    stage.kind === "mask"
                      ? (option.raw as string)
                      : working.mask,
                  pattern:
                    stage.kind === "pattern"
                      ? (option.raw as string)
                      : working.pattern,
                  colour:
                    stage.kind === "colour"
                      ? (option.raw as string)
                      : stage.kind === "mask" || stage.kind === "pattern"
                        ? maskPatternColour
                        : working.colour,
                };
                const tortieList = committed.map((layer) => ({ ...layer }));
                tortieList.push(candidateLayer);
                preview.tortie = tortieList;
                preview.isTortie = true;
                preview.tortieMask = candidateLayer.mask;
                preview.tortiePattern = candidateLayer.pattern;
                preview.tortieColour = candidateLayer.colour;
                return {
                  id: `tortie-${i}-${stage.kind}-${variantIndex}`,
                  option,
                  params: preview,
                  label: option.display,
                  group: `tortie-${i + 1}-${stage.kind}`,
                };
              },
            );

            const frames = await renderVariantFrames(
              generator,
              progressiveParams,
              descriptors,
            );
            if (frames.length === 0) {
              continue;
            }

            const sequence = buildFlipSequence(frames);

            for (let idx = 0; idx < sequence.length; idx += 1) {
              const step = sequence[idx];
              if (generationIdRef.current !== currentToken) return;

              // Recalculate delay on each step to get live updates
              const stageDelay = getDelayWithMultiplier(stageKey);
              const currentConfig = timingConfigRef.current;
              const stageDurations = computeStepDurations(
                sequence.slice(idx),
                stageDelay,
                currentConfig.allowFastFlips,
              );
              const stepDuration = stageDurations[0] ?? stageDelay;

              const candidateLayer: TortieSlot = {
                mask:
                  stage.kind === "mask"
                    ? (step.frame.option.raw as string)
                    : working.mask,
                pattern:
                  stage.kind === "pattern"
                    ? (step.frame.option.raw as string)
                    : working.pattern,
                colour:
                  stage.kind === "colour"
                    ? (step.frame.option.raw as string)
                    : stage.kind === "mask" || stage.kind === "pattern"
                      ? maskPatternColour
                      : working.colour,
              };

              const drawStep = () => drawCanvas(step.frame.canvas);
              await playFlip(drawStep, stepDuration);
              setRollerActiveValue(formatTortieLayer(candidateLayer));
              updateLayerRow("torties", i, {
                value: formatTortieLayer(candidateLayer),
                status: step.isFinal ? "revealed" : "active",
              });
            }

            const finalStageValue = frames[frames.length - 1]?.option.raw;
            if (typeof finalStageValue === "string") {
              if (stage.kind === "mask")
                working = { ...working, mask: finalStageValue };
              if (stage.kind === "pattern")
                working = { ...working, pattern: finalStageValue };
              if (stage.kind === "colour")
                working = { ...working, colour: finalStageValue };
            }

            await wait(pauseDuration);
            const stageEnd =
              typeof performance !== "undefined"
                ? performance.now()
                : Date.now();
            addActualDuration(stageKey, stageEnd - stageStart);
          }

          committed.push({ ...working });
          summary.push(formatTortieLayer(working));
          context.torties[i] = { ...working };
          progressiveParams.tortie = committed.map((layer) => ({ ...layer }));
          progressiveParams.tortieMask = committed[0]?.mask;
          progressiveParams.tortiePattern = committed[0]?.pattern;
          progressiveParams.tortieColour = committed[0]?.colour;
          progressiveParams.isTortie = committed.length > 0;

          setRollerLabel(`Tortie Layer ${i + 1}`);
          setRollerActiveValue(formatTortieLayer(working));
          await renderCat(progressiveParams);
          await wait(pauseDuration);
        } else {
          const display = formatTortieLayer(target);
          updateLayerRow("torties", i, { value: display, status: "revealed" });
          summary.push(display);
          committed.push({ ...target });
          context.torties[i] = { ...target };
          progressiveParams.tortie = committed.map((layer) => ({ ...layer }));
          progressiveParams.tortieMask = committed[0]?.mask;
          progressiveParams.tortiePattern = committed[0]?.pattern;
          progressiveParams.tortieColour = committed[0]?.colour;
          progressiveParams.isTortie = committed.length > 0;
          setRollerActiveValue(display);
          await renderCat(progressiveParams);
          await wait(pauseDuration);
        }
      }

      context.torties.splice(targetSlots.length);
      const summaryText = summary.length ? summary.join(" • ") : "None";
      updateParamRow(rowIndex, { value: "—", status: "revealed" });
      setRollerActiveValue(summaryText);
      if (generationIdRef.current !== currentToken) return;
      await settleRoller(currentToken);
      await wait(pauseDuration);
      clearMirror();
    },
    [
      addActualDuration,
      clearMirror,
      drawCanvas,
      flashLayer,
      getDelayWithMultiplier,
      playFlip,
      renderCat,
      settleRoller,
      subsetLimits,
      updateLayerRow,
      updateParamRow,
      readSpinState,
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
  }, []);

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

  const revealLayerCounts = useCallback(
    async (
      generator: CatGeneratorApi,
      layers: {
        accessories: { range: LayerRange; count: number };
        scars: { range: LayerRange; count: number };
        torties: { range: LayerRange; count: number };
      },
      genOptions: {
        experimentalColourMode: string | string[];
        includeBaseColours: boolean;
        includeNewSprites: boolean;
      },
      token: number,
    ) => {
      if (!generator.generateRandomCat) return;

      const groups = [
        {
          label: "Tortie Layers",
          key: "tortieMask" as const,
          ...layers.torties,
        },
        {
          label: "Accessories",
          key: "accessory" as const,
          ...layers.accessories,
        },
        { label: "Scars", key: "scar" as const, ...layers.scars },
      ];

      for (const group of groups) {
        if (generationIdRef.current !== token) return;
        const minCount = Math.min(group.range.min, group.range.max);
        const maxCount = Math.max(group.range.min, group.range.max);
        if (minCount === maxCount) continue;

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

        // Generate a fresh random cat with MAX count for this layer type
        const catResult = await generator.generateRandomCat({
          accessoryCount: group.key === "accessory" ? maxCount : 0,
          scarCount: group.key === "scar" ? maxCount : 0,
          tortieCount: group.key === "tortieMask" ? maxCount : 0,
          exactLayerCounts: true,
          experimentalColourMode: genOptions.experimentalColourMode,
          includeBaseColours: genOptions.includeBaseColours,
          includeNewSprites: genOptions.includeNewSprites,
        });
        if (generationIdRef.current !== token) return;

        const baseParams = catResult.params;
        baseParams.spriteNumber = 9; // legacy fallback for old render paths
        baseParams.poseName = "adult_long0";
        const slots = catResult.slotSelections;

        // Pre-render a frame for each possible count (0 to max), building up
        const frames: VariationFrame[] = [];
        for (let n = minCount; n <= maxCount; n++) {
          if (generationIdRef.current !== token) return;
          const previewParams = cloneParams(baseParams);

          if (group.key === "accessory") {
            const accSlice = (slots?.accessories ?? []).slice(0, n);
            previewParams.accessories = accSlice;
            previewParams.accessory = accSlice[0];
          } else if (group.key === "scar") {
            const scarSlice = (slots?.scars ?? []).slice(0, n);
            previewParams.scars = scarSlice;
            previewParams.scar = scarSlice[0];
          } else {
            const tortieSlice = (slots?.tortie ?? []).slice(0, n);
            previewParams.isTortie = n > 0;
            previewParams.tortie = tortieSlice;
            if (tortieSlice[0]) {
              previewParams.tortieMask = tortieSlice[0].mask;
              previewParams.tortiePattern = tortieSlice[0].pattern;
              previewParams.tortieColour = tortieSlice[0].colour;
            } else {
              previewParams.isTortie = false;
              previewParams.tortie = [];
            }
          }

          try {
            const result = await generator.generateCat(previewParams);
            const catCanvas = cloneSourceCanvas(
              result.canvas as HTMLCanvasElement | OffscreenCanvas,
            );
            const composited = compositeCountFrame(catCanvas, n);
            frames.push({
              option: { raw: n, display: String(n) },
              canvas: composited,
            });
          } catch {
            // skip failed render
          }
        }

        if (frames.length === 0) continue;

        // Reorder frames so the rolled count is last (buildFlipSequence targets the last frame)
        const targetIdx = frames.findIndex((f) => f.option.raw === group.count);
        if (targetIdx !== -1 && targetIdx !== frames.length - 1) {
          const [target] = frames.splice(targetIdx, 1);
          frames.push(target);
        }

        const sequence = buildFlipSequence(frames);

        for (let idx = 0; idx < sequence.length; idx++) {
          const step = sequence[idx];
          if (generationIdRef.current !== token) return;

          const baseDelay = getDelayWithMultiplier(group.key) * 2; // slower for count reveal
          const stepDurations = computeStepDurations(
            sequence.slice(idx),
            baseDelay,
            false, // never fast-flip the count reveal
          );
          const stepDuration = stepDurations[0] ?? baseDelay;

          setRollerActiveValue(step.frame.option.display);
          drawCanvas(step.frame.canvas);
          await playFlip(() => {}, stepDuration);
          const stepState = readSpinState();
          if (!stepState.spinny) break;
        }

        // Land on rolled count
        const finalFrame = frames.find((f) => f.option.raw === group.count);
        if (finalFrame) drawCanvas(finalFrame.canvas);
        setRollerActiveValue(String(group.count));
        setParamRows((prev) =>
          prev.map((row) =>
            row.id === group.key
              ? {
                  ...row,
                  value: String(group.count),
                  status: "revealed" as const,
                }
              : row,
          ),
        );
        await settleRoller(token);
        await wait(600); // hold the result so viewer can see it
        if (generationIdRef.current !== token) return;
      }

      setRollerLabel(null);
      setRollerActiveValue(null);
      // Remove only the count-reveal rows (layer IDs), preserve prefilled pending rows
      setParamRows((prev) =>
        prev.filter((row) => !LAYER_PARAM_IDS.has(row.id)),
      );
      clearMirror();
    },
    [
      drawCanvas,
      clearMirror,
      playFlip,
      settleRoller,
      getDelayWithMultiplier,
      readSpinState,
    ],
  );

  const generateCatPlus = useCallback(async () => {
    const generator = generatorRef.current;
    if (!generator) return;
    const mapper = await ensureMapperReady();
    if (!mapper) {
      setRollerExpanded(false);
      return;
    }

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
      const accessoryCount = computeLayerCount(accessoryRange);
      const scarCount = computeLayerCount(scarRange);
      const tortieCount = computeLayerCount(tortieRange);
      const experimentalMode =
        extendedModesArray.length === 0 ? "off" : extendedModesArray;

      // OBS: Use override params from the control page if available
      const override = overrideParamsRef.current;
      overrideParamsRef.current = null; // consume once
      const overrideParams = override?.params;
      const overrideSlots = override?.slots;
      const usingOverrideParams = Boolean(overrideParams);
      // biome-ignore lint/suspicious/noExplicitAny: dynamic random generation result with varying shape
      let randomResult: any;
      if (overrideParams) {
        randomResult = {
          params: overrideParams as Record<string, unknown>,
          slotSelections: overrideSlots as typeof randomResult.slotSelections,
        };
      } else {
        if (!generator.generateRandomCat) {
          throw new Error("Random cat generation not available");
        }
        randomResult = await generator.generateRandomCat({
          accessoryCount,
          scarCount,
          tortieCount,
          exactLayerCounts,
          experimentalColourMode: experimentalMode,
          whitePatchColourMode: "default",
          includeBaseColours,
          includeNewSprites,
        });
      }

      if (generationIdRef.current !== token) return;

      const params: Partial<CatParams> = {
        ...randomResult.params,
      };
      if (!params.colour) {
        params.colour = PLACEHOLDER_COLOUR;
      }

      const accessorySlots =
        randomResult.slotSelections?.accessories ??
        (params.accessories ?? []).filter(
          (entry): entry is string => typeof entry === "string",
        );
      const scarSlots =
        randomResult.slotSelections?.scars ??
        (params.scars ?? []).filter(
          (entry): entry is string => typeof entry === "string",
        );
      const tortieSlots: (TortieSlot | null)[] =
        // biome-ignore lint/suspicious/noExplicitAny: slot shape from dynamic random result
        randomResult.slotSelections?.tortie?.map((slot: any) =>
          slot?.mask && slot?.pattern && slot?.colour
            ? { mask: slot.mask, pattern: slot.pattern, colour: slot.colour }
            : null,
        ) ??
        (params.tortie ?? []).map((slot) =>
          slot?.mask && slot?.pattern && slot?.colour
            ? { mask: slot.mask, pattern: slot.pattern, colour: slot.colour }
            : null,
        );
      const tortieLayers = tortieSlots.filter(Boolean) as TortieSlot[];

      initMaxLayerRows();

      if (usingOverrideParams) {
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

      const countsResult: GenerationCounts = {
        accessories: accessorySlots.length,
        scars: scarSlots.length,
        tortie: tortieSlots.length,
      };

      setRollSummary(
        `Rolled → Accessories: ${countsResult.accessories} • Scars: ${countsResult.scars} • Tortie layers: ${countsResult.tortie}`,
      );
      setHasTint(Boolean(params.darkForest || params.dead));

      const uniqueAccessories: string[] = Array.from(
        new Set(
          accessorySlots.filter(
            (entry: unknown): entry is string =>
              typeof entry === "string" && entry !== "none",
          ),
        ),
      );
      const uniqueScars: string[] = Array.from(
        new Set(
          scarSlots.filter(
            (entry: unknown): entry is string =>
              typeof entry === "string" && entry !== "none",
          ),
        ),
      );
      const _tortieChoices = tortieLayers.length ? tortieLayers : [];

      const progressiveParams: Partial<CatParams> = {
        spriteNumber: DEFAULT_SPRITE_NUMBER,
        shading: false,
        reverse: false,
        isTortie: false,
        peltName: "SingleColour",
        accessories: [],
        scars: [],
        tortie: [],
        colour: PLACEHOLDER_COLOUR,
      };

      progressiveParams.darkForest = params.darkForest ?? false;
      progressiveParams.darkMode = params.darkMode ?? false;
      progressiveParams.dead = params.dead ?? false;
      progressiveParams.shading = params.shading ?? false;
      progressiveParams.reverse = params.reverse ?? false;

      const contextForApply = {
        accessories: accessorySlots.map(() => "none" as string),
        scars: scarSlots.map(() => "none" as string),
        torties: tortieSlots.map(() => null as TortieSlot | null),
      };

      const rollerOptions = parameterOptionsRef.current;
      initBoardRows();

      // Count reveal phase — spin the accessory/scar/tortie counts before params
      if (exactLayerCounts) {
        await revealLayerCounts(
          generator,
          {
            accessories: {
              range: accessoryRange,
              count: accessorySlots.length,
            },
            scars: { range: scarRange, count: scarSlots.length },
            torties: { range: tortieRange, count: tortieLayers.length },
          },
          {
            experimentalColourMode: experimentalMode,
            includeBaseColours,
            includeNewSprites,
          },
          token,
        );
        if (generationIdRef.current !== token) return;
      }

      // Count reveal done — resize layer rows from max-prefill to actual slot counts
      resetLayerRows(accessorySlots, scarSlots, tortieSlots);

      for (const definition of PARAM_SEQUENCE) {
        if (
          definition.id === "tortieMask" ||
          definition.id === "tortiePattern" ||
          definition.id === "tortieColour"
        ) {
          continue;
        }
        if (generationIdRef.current !== token) return;
        if (definition.requiresTortie && !params.isTortie) continue;

        const paramKeyCandidate = definition.id;
        const paramKey = isParamTimingKey(paramKeyCandidate)
          ? paramKeyCandidate
          : null;
        const paramStart =
          typeof performance !== "undefined" ? performance.now() : Date.now();

        const rawTargetValue = getParameterRawValue(definition.id, params);
        const displayValue = getParameterValueForDisplay(definition.id, params);
        setActiveParamId(definition.id);

        // Flash the row before activating it
        setFlashParamId(definition.id);
        await wait(350);
        setFlashParamId(null);

        // Update existing pending row to active (instead of appending)
        let rowIndex = -1;
        setParamRows((prev) => {
          const idx = prev.findIndex((row) => row.id === definition.id);
          if (idx !== -1) {
            rowIndex = idx;
            return prev.map((row, i) =>
              i === idx
                ? { ...row, value: "---", status: "active" as const }
                : row,
            );
          }
          // Fallback: append if not found (shouldn't happen with prefill)
          console.warn(
            `[ObsOverlayClient] Param row for "${definition.id}" not found in prefilled board — appending as fallback`,
          );
          rowIndex = prev.length;
          return [
            ...prev,
            {
              id: definition.id,
              label: definition.label,
              value: "---",
              status: "active" as const,
            },
          ];
        });

        const spinState = readSpinState();
        const currentSpeedSetting = spinState.speed;
        const basePause =
          modeRef.current === "calm"
            ? currentSpeedSetting.calmParamPause
            : currentSpeedSetting.paramPause;
        const pauseDuration = Math.max(
          PARAM_REVEAL_PAUSE,
          basePause / speedMultiplierRef.current,
        );
        const isInstantParam = INSTANT_PARAMS.includes(definition.id);
        const isTortieToggle = definition.id === "tortie";
        const shouldAnimate =
          spinState.spinny &&
          !!rollerOptions &&
          !isInstantParam &&
          !isTortieToggle;

        if (definition.id === "accessory") {
          const accessoryStart =
            typeof performance !== "undefined" ? performance.now() : Date.now();
          await spinAccessorySlots(
            rowIndex,
            accessorySlots,
            contextForApply,
            progressiveParams,
            mapper,
            pauseDuration,
            token,
          );
          const accessoryEnd =
            typeof performance !== "undefined" ? performance.now() : Date.now();
          addActualDuration("accessory", accessoryEnd - accessoryStart);
          if (rowIndex >= 0) {
            setParamRows((prev) => prev.filter((_, idx) => idx !== rowIndex));
          }
          clearMirror();
          continue;
        }

        if (definition.id === "scar") {
          const scarStart =
            typeof performance !== "undefined" ? performance.now() : Date.now();
          await spinScarSlots(
            rowIndex,
            scarSlots,
            contextForApply,
            progressiveParams,
            mapper,
            pauseDuration,
            token,
          );
          const scarEnd =
            typeof performance !== "undefined" ? performance.now() : Date.now();
          addActualDuration("scar", scarEnd - scarStart);
          if (rowIndex >= 0) {
            setParamRows((prev) => prev.filter((_, idx) => idx !== rowIndex));
          }
          clearMirror();
          continue;
        }

        if (shouldAnimate) {
          clearMirror();
          setRollerLabel(definition.label);
          setRollerActiveValue("—");
          await wait(
            Math.max(
              getBaseFrameDuration(currentSpeedSetting) * 0.25,
              PRE_SPIN_DELAY,
            ),
          );

          const subsetEnabled = paramKey
            ? Boolean(subsetLimits[paramKey])
            : false;
          const variationOptions = sampleValues(
            rollerOptions,
            definition.id,
            rawTargetValue,
            displayValue,
            subsetEnabled ? SUBSET_LIMIT : MAX_SPINNY_VARIATIONS,
          );

          const frames = await preRenderVariationFrames(
            generator,
            progressiveParams,
            definition.id,
            variationOptions,
          );
          const sequence = buildFlipSequence(frames);

          for (let idx = 0; idx < sequence.length; idx += 1) {
            const step = sequence[idx];
            if (generationIdRef.current !== token) return;

            // Recalculate delay on each step to get live updates
            const currentConfig = timingConfigRef.current;
            const configuredDelay = paramKey
              ? getDelayWithMultiplier(paramKey)
              : MIN_SAFE_STEP_MS;
            const stepDurations = computeStepDurations(
              sequence.slice(idx),
              configuredDelay,
              currentConfig.allowFastFlips,
            );
            const stepDuration = stepDurations[0] ?? configuredDelay;

            const frameDisplay = step.frame.option.display;
            setRollerActiveValue(frameDisplay);
            setParamRows((prev) =>
              prev.map((row) =>
                row.id === definition.id
                  ? {
                      ...row,
                      value: step.isFinal ? frameDisplay : row.value,
                      status: step.isFinal ? "revealed" : "active",
                    }
                  : row,
              ),
            );
            const drawStep = () => {
              drawCanvas(step.frame.canvas);
            };
            const stepState = readSpinState();
            await playFlip(drawStep, stepDuration);
            if (!stepState.spinny) {
              break;
            }
          }

          const finalFrame = frames[frames.length - 1];
          if (finalFrame) {
            drawCanvas(finalFrame.canvas);
          }
          applyParamValue(
            progressiveParams,
            definition.id,
            finalFrame.option.raw,
          );
          setParamRows((prev) =>
            prev.map((row) =>
              row.id === definition.id
                ? {
                    ...row,
                    value: finalFrame.option.display,
                    status: "revealed",
                  }
                : row,
            ),
          );
          if (generationIdRef.current !== token) return;
          await settleRoller(token);
          setRollerLabel(null);
          setRollerActiveValue(null);
        } else {
          clearMirror();
          setParamRows((prev) =>
            prev.map((row) =>
              row.id === definition.id
                ? { ...row, value: displayValue, status: "revealed" }
                : row,
            ),
          );
          applyParamValue(progressiveParams, definition.id, rawTargetValue);
          await renderCat(progressiveParams);
          if (generationIdRef.current !== token) return;
          setRollerLabel(null);
          setRollerActiveValue(displayValue);
          await settleRoller(token, { keepLabel: false, skipHighlight: true });
        }

        if (definition.id === "tortie") {
          await spinTortieSlots(
            rowIndex,
            tortieSlots,
            contextForApply,
            progressiveParams,
            mapper,
            pauseDuration,
            token,
          );
        }

        await wait(pauseDuration);
        const paramEnd =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        addActualDuration(paramKey, paramEnd - paramStart);
      }

      setActiveParamId(null);
      setRollerActiveValue(null);
      setRollerLabel(null);

      await renderCat(params);
      if (generationIdRef.current !== token) return;

      const builderPrimaryAccessory = uniqueAccessories[0] ?? null;
      const builderPrimaryScar = uniqueScars[0] ?? null;
      const builderPrimaryTortie =
        tortieLayers.length > 0 ? tortieLayers[0] : null;
      const builderParams = sanitizeForBuilder(params, {
        accessory: builderPrimaryAccessory,
        scar: builderPrimaryScar,
        tortie: builderPrimaryTortie,
      });
      builderParams.spriteNumber = DEFAULT_SPRITE_NUMBER;
      builderParams.poseName = DEFAULT_POSE_NAME;

      const catUrl = generator.buildCatURL?.(builderParams) ?? "";

      // Persist refs/state for actions
      const nextState: CatState = {
        params,
        accessorySlots,
        scarSlots,
        tortieSlots,
        counts: countsResult,
        catUrl,
        builderParams,
        shareUrl: null,
        profileId: null,
        mapperSlug: null,
        legacyEncoded: catStateRef.current?.legacyEncoded ?? null,
        catShareSlug: catStateRef.current?.catShareSlug ?? null,
        catName: null,
        creatorName: null,
      };

      catStateRef.current = nextState;
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
        timestamp:
          typeof performance !== "undefined" ? performance.now() : Date.now(),
      });
      setIsGenerating(false);
      setSpinDone(true);
      scheduleAutoClear(token);

      // Gold fireworks celebration
      (async () => {
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
      })();

      track("single_cat_generated", {
        mode: modeRef.current,
        accessories: countsResult.accessories > 0,
        scars: countsResult.scars > 0,
        torties: countsResult.tortie > 0,
        afterlife: afterlifeMode !== "off",
        speed: speedMultiplierRef.current,
        layer_count_mode: exactLayerCounts ? "exact" : "chance",
      });
      window.setTimeout(() => {
        if (generationIdRef.current === token) {
          setRollerExpanded(false);
        }
      }, 500);

      const persistToken = token;
      (async () => {
        if (generationIdRef.current !== persistToken) return;
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
        if (generationIdRef.current !== persistToken) return;
        if (shareRecord?.slug) {
          shareSlug = shareRecord.slug;
        }
        if (shareSlug && catStateRef.current) {
          catStateRef.current = {
            ...catStateRef.current,
            catShareSlug: shareSlug,
          };
        }

        let legacyEncoded: string | null = state.legacyEncoded ?? null;
        if (!legacyEncoded) {
          try {
            legacyEncoded = encodeCatShare(payload);
          } catch (err) {
            console.warn("Failed to encode share payload", err);
          }
        }
        if (generationIdRef.current !== persistToken) return;
        if (legacyEncoded && catStateRef.current) {
          catStateRef.current = { ...catStateRef.current, legacyEncoded };
        }

        const mapperPayload = shareSlug ? { ...payload, shareSlug } : payload;

        try {
          const result = await createMapper({
            catData: mapperPayload,
            catName: state.catName ?? undefined,
            creatorName: state.creatorName ?? undefined,
          });
          if (generationIdRef.current !== persistToken) return;
          if (result && catStateRef.current) {
            const shareToken =
              (result as { shareToken?: string }).shareToken ??
              result.slug ??
              result.id;
            const origin =
              typeof window !== "undefined" ? window.location.origin : "";
            const url = origin
              ? `${origin}/view/${shareToken}`
              : `/view/${shareToken}`;
            catStateRef.current = {
              ...catStateRef.current,
              profileId: result.id,
              mapperSlug: shareToken,
              legacyEncoded,
              shareUrl: url,
              catShareSlug:
                shareSlug ?? catStateRef.current.catShareSlug ?? null,
            };
            setShareLink(url);
          }
        } catch (err) {
          console.warn("Failed to persist mapper record", err);
          const origin =
            typeof window !== "undefined" ? window.location.origin : "";
          if (catStateRef.current) {
            if (shareSlug) {
              const fallbackUrl = origin
                ? `${origin}/visual-builder?share=${shareSlug}`
                : `/visual-builder?share=${shareSlug}`;
              catStateRef.current = {
                ...catStateRef.current,
                catShareSlug: shareSlug,
                shareUrl: fallbackUrl,
              };
              setShareLink(fallbackUrl);
            } else if (legacyEncoded) {
              const fallbackUrl = origin
                ? `${origin}/view?cat=${legacyEncoded}`
                : `/view?cat=${legacyEncoded}`;
              catStateRef.current = {
                ...catStateRef.current,
                legacyEncoded,
                shareUrl: fallbackUrl,
              };
              setShareLink(fallbackUrl);
            }
          }
        }
      })();
    } catch (err) {
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
    accessoryRange,
    ensureMapperReady,
    extendedModesArray,
    includeBaseColours,
    includeNewSprites,
    afterlifeMode,
    drawCanvas,
    renderCat,
    scarRange,
    tortieRange,
    resetLayerRows,
    spinAccessorySlots,
    spinScarSlots,
    spinTortieSlots,
    revealLayerCounts,
    initBoardRows,
    initMaxLayerRows,
    playFlip,
    clearMirror,
    drawPlaceholder,
    settleRoller,
    readSpinState,
    createMapper,
    resetMetaDrafts,
    resetWheelOverlay,
    scheduleAutoClear,
    getDelayWithMultiplier,
    exactLayerCounts,
    timingConfig.allowFastFlips,
    timingConfig.delays,
    subsetLimits,
    resetActualDurations,
    addActualDuration,
    estimatedTotals,
    adjustedOptionCounts,
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
      document.body.removeChild(link);
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

  const _handleCopySprite = useCallback(
    async (
      spriteNumber: number,
      size: 120 | typeof FULL_EXPORT_SIZE,
      poseName?: string,
    ) => {
      const state = catStateRef.current;
      const generator = generatorRef.current;
      if (!state || !generator) return;
      const spriteName = poseName
        ? formatPoseName(poseName)
        : `Sprite ${spriteNumber}`;
      const params = { ...state.params, spriteNumber };
      if (poseName) {
        params.poseName = poseName;
      }
      const result = await generator.generateCat(params);
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = size;
      exportCanvas.height = size;
      const ctx = exportCanvas.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(result.canvas as HTMLCanvasElement, 0, 0, size, size);
      }
      await copyCanvasToClipboard(
        exportCanvas,
        size === 120
          ? `Copied ${spriteName} (120×120)!`
          : `Copied ${spriteName} (${FULL_EXPORT_SIZE}×${FULL_EXPORT_SIZE})!`,
        size === 120
          ? `${spriteName.toLowerCase()}-120`
          : `${spriteName.toLowerCase()}-700`,
        showToast,
        (message) => setError(message),
      );
      track("single_cat_exported", { format: `copy-${size}px` });
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
        catData: shareSlug ? { ...payload, shareSlug } : payload,
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
  const _spriteToolsSubtitle = canCopySprite
    ? `Current pose: ${
        currentState?.params.poseName
          ? formatPoseName(currentState.params.poseName)
          : `Sprite ${currentSpriteNumber}`
      }`
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
  const obsBgMode =
    sessionSettingsRecord?.obsBgMode === "colour" ? "colour" : "transparent";
  const obsBgColour =
    typeof sessionSettingsRecord?.obsBgColour === "string"
      ? sessionSettingsRecord.obsBgColour
      : "#00ff00";
  const obsBgOpacity =
    typeof sessionSettingsRecord?.obsBgOpacity === "number"
      ? sessionSettingsRecord.obsBgOpacity
      : 100;
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
  }, [resetWheelOverlay]);

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
          overrideParamsRef.current = {
            params: cmd.params,
            slots: cmd.slots,
          };
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
    primeOverlayFromCommand,
    drawPlaceholder,
    resetCommandState,
    exactLayerCounts,
    tortieRange,
    obsPhase,
    extendedModesArray,
    scarRange,
    includeBaseColours,
    includeNewSprites,
    accessoryRange,
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
  const viewUrl =
    typeof commandViewSlug === "string" && typeof window !== "undefined"
      ? `${window.location.origin}/view/${commandViewSlug}`
      : null;

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
    // The saved slug is patched onto the live command without a seq bump —
    // read it from the session so the QR appears as soon as the save lands.
    const liveCommand = session?.currentCommand;
    const liveBatchSlug =
      liveCommand?.type === "batch" && liveCommand.seq === batchCommand.seq
        ? liveCommand.batch?.slug
        : undefined;
    return (
      <BatchScene
        key={`batch-${batchCommand.seq}`}
        command={
          liveBatchSlug
            ? { ...batchCommand, slug: liveBatchSlug }
            : batchCommand
        }
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
