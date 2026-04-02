"use client";

/**
 * OBSSpinClient — copied from SingleCatPlusClient.tsx
 *
 * ALL spin logic (generateCatPlus, flip sequences, timing, layer count spinner)
 * is kept byte-for-byte identical. Only the component shell changed:
 * - Props: accepts apiKey instead of page-level settings
 * - Settings: read from Convex session instead of local state/variants
 * - JSX: OBS overlay layout instead of full page UI
 * - Trigger: Convex subscription instead of button click
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useQuery } from "convex/react";
import { FlapDisplay, Presets } from "react-split-flap-effect";
import "react-split-flap-effect/extras/themes.css";
import { api } from "@/convex/_generated/api";
import { decodeImageFromDataUrl } from "@/lib/cat-v3/api";
import type { BatchRenderResponse, CatParams } from "@/lib/cat-v3/types";
import type { CatGeneratorApi } from "@/components/cat-builder/types";
import {
  ABSOLUTE_MIN_STEP_MS,
  MIN_SAFE_STEP_MS,
  PARAM_TIMING_ORDER,
  PARAM_TIMING_LABELS,
  PARAM_TIMING_PRESETS,
  PARAM_DEFAULT_STEP_COUNTS,
  DEFAULT_TIMING_CONFIG,
  type ParamTimingKey,
  type SpinTimingConfig,
  type TimingPresetSet,
  clampDelay,
  computeTimingTotals,
  computeDefaultTotal,
  getDelayForKey,
  getPresetValues,
  isParamTimingKey,
  stepCountsToMetrics,
} from "../../utils/spinTiming";
import {
  DEFAULT_SINGLE_CAT_SETTINGS,
  parseSingleCatPayload,
  singleCatSettingsEqual,
  migrateSingleCatTiming,
  type SingleCatSettings,
  type AfterlifeOption,
  type ExtendedMode,
  type LayerRange,
} from "../../utils/singleCatVariants";
import type { PaletteId } from "@/lib/palettes";
import { ADDITIONAL_PALETTES } from "@/lib/palettes";
import {
  MAX_LAYER_VALUE,
  clampLayerValue,
  computeLayerCount,
  resolveAfterlife,
  AFTERLIFE_OPTIONS,
} from "@/utils/catSettingsHelpers";

// OBS stubs — functions referenced by the spin logic but not needed for overlay
const track = (..._args: unknown[]) => {};
const encodeCatShare = (..._args: unknown[]) => "";
const createCatShare = async (..._args: unknown[]): Promise<{ slug: string; id: string; shareToken?: string }> => ({ slug: "", id: "" });
type SingleCatPortableSettings = SingleCatSettings;
type Id<T extends string> = string & { __tableName: T };

interface TortieSlot {
  mask: string;
  pattern: string;
  colour: string;
}

interface GenerationCounts {
  accessories: number;
  scars: number;
  tortie: number;
}

interface ParamRow {
  id: ParamId;
  label: string;
  value: string;
  status: "active" | "revealed";
}

interface SpriteVariation {
  spriteNumber: number;
  name: string;
  dataUrl: string;
}

interface VariationOption {
  raw: unknown;
  display: string;
}

interface VariationFrame {
  option: VariationOption;
  canvas: HTMLCanvasElement;
}

interface VariantSheetRequest {
  id: string;
  params: Partial<CatParams>;
  label?: string;
  group?: string;
}

interface VariantDescriptor extends VariantSheetRequest {
  option: VariationOption;
}

interface TimingSnapshot {
  counts: Record<ParamTimingKey, number>;
  estimated: Partial<Record<ParamTimingKey, number>>;
  estimatedTotal: number;
  actual: Partial<Record<ParamTimingKey, number>>;
  actualTotal: number;
  timestamp: number;
}

type FetchPriority = "high" | "low" | "auto";

const MAX_LAYER_VARIATIONS = 12;
const MAX_SPINNY_VARIATIONS = Number.MAX_SAFE_INTEGER;
const MAX_SPINNY_LAYER_VARIATIONS = Number.MAX_SAFE_INTEGER;
const DEFAULT_SPRITE_NUMBER = 8;
const PLACEHOLDER_COLOUR = "GINGER";
const GLOBAL_PRESETS: Array<keyof TimingPresetSet> = ["slow", "normal", "fast"];
const SUBSET_LIMIT = 20;

type LayerGroup = "accessories" | "scars" | "torties";

interface LayerRowState {
  label: string;
  value: string;
  status: "idle" | "active" | "revealed";
}

interface CatState {
  params: Partial<CatParams>;
  accessorySlots: string[];
  scarSlots: string[];
  tortieSlots: (TortieSlot | null)[];
  counts: GenerationCounts;
  shareUrl?: string | null;
  catUrl?: string | null;
  builderParams?: Partial<CatParams>;
  profileId?: string | null;
  mapperSlug?: string | null;
  legacyEncoded?: string | null;
  catName?: string | null;
  creatorName?: string | null;
  catShareSlug?: string | null;
}

interface ParameterOptions {
  sprite: number[];
  pelt: string[];
  colour: string[];
  tortie: boolean[];
  tortieMask: string[];
  tortiePattern: string[];
  tortieColour: string[];
  tint: string[];
  eyeColour: string[];
  eyeColour2: (string | "none")[];
  skinColour: string[];
  whitePatches: (string | "none")[];
  points: (string | "none")[];
  whitePatchesTint: (string | "none")[];
  vitiligo: (string | "none")[];
  accessory: (string | "none")[];
  scar: (string | "none")[];
  shading: boolean[];
  reverse: boolean[];
}

function countOptions(list: unknown[] | undefined, { includeNone = false }: { includeNone?: boolean } = {}) {
  if (!Array.isArray(list)) return 0;
  const normalized = list
    .filter((value) => value !== undefined && value !== null && (includeNone || value !== "none"))
    .map((value) => (typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value)));
  return new Set(normalized).size;
}

function deriveOptionCounts(options: ParameterOptions | null): Record<ParamTimingKey, number> {
  const counts: Record<ParamTimingKey, number> = Object.fromEntries(
    PARAM_TIMING_ORDER.map((key) => [key, PARAM_DEFAULT_STEP_COUNTS[key] ?? 0])
  ) as Record<ParamTimingKey, number>;
  if (!options) return counts;

  const assign = (key: ParamTimingKey, list: unknown[] | undefined, opts?: { includeNone?: boolean }) => {
    const total = countOptions(list, opts ?? {});
    if (total > 0) counts[key] = total;
  };

  assign("sprite", options.sprite as unknown[]);
  assign("pelt", options.pelt);
  assign("colour", options.colour);
  assign("eyeColour", options.eyeColour);
  assign("eyeColour2", options.eyeColour2, { includeNone: false });
  assign("tint", options.tint, { includeNone: false });
  assign("skinColour", options.skinColour);
  assign("whitePatches", options.whitePatches, { includeNone: false });
  assign("points", options.points, { includeNone: false });
  assign("whitePatchesTint", options.whitePatchesTint, { includeNone: false });
  assign("vitiligo", options.vitiligo, { includeNone: false });
  assign("accessory", options.accessory);
  assign("scar", options.scar);
  assign("tortie", options.tortie as unknown[]);
  assign("tortieMask", options.tortieMask);
  assign("tortiePattern", options.tortiePattern);
  assign("tortieColour", options.tortieColour);
  assign("shading", options.shading as unknown[], { includeNone: true });
  assign("reverse", options.reverse as unknown[], { includeNone: true });

  return counts;
}

function logTimingReport(
  context: string,
  profile: SpinTimingConfig,
  optionCounts: Record<ParamTimingKey, number>,
  estimatedTotals: { perKey: Partial<Record<ParamTimingKey, number>>; total: number },
  actualDurations: Partial<Record<ParamTimingKey, number>>,
  actualTotalMs: number
) {
  const estimatedSeconds = (estimatedTotals.total / 1000).toFixed(2);
  const actualSeconds = (actualTotalMs / 1000).toFixed(2);
  const groupLabel = `[timing] ${context} → est ${estimatedSeconds}s vs actual ${actualSeconds}s`;
  const openedGroup = typeof console.group === "function" ? true : false;
  if (openedGroup) {
    console.group(groupLabel);
  } else if (typeof console.groupCollapsed === "function") {
    console.groupCollapsed(groupLabel);
  } else {
    console.log(groupLabel);
  }
  try {
    PARAM_TIMING_ORDER.forEach((key) => {
      const delay = getDelayForKey(profile, key);
      const options = optionCounts[key] ?? 0;
      const estimated = estimatedTotals.perKey[key] ?? delay * options;
      const actual = actualDurations[key] ?? 0;
      const label = PARAM_TIMING_LABELS[key] ?? key;
      console.log(
        `${label}: options=${options}, delay=${delay}ms, est=${(estimated / 1000).toFixed(2)}s, actual=${(actual / 1000).toFixed(2)}s`
      );
    });
  } finally {
    if ((openedGroup || typeof console.groupCollapsed === "function") && typeof console.groupEnd === "function") {
      console.groupEnd();
    }
  }
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0.00 s";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${ms.toFixed(0)} ms`;
}

interface SpriteMapperApi {
  loaded: boolean;
  init: () => Promise<boolean>;
  sprites?: number[];
  getColours?: () => string[];
  getExperimentalColoursByMode?: (...args: unknown[]) => string[];
  getWhitePatchColourOptions?: (...args: unknown[]) => string[];
  getPeltNames?: () => string[];
  getTortieMasks?: () => string[];
  getTints?: () => string[];
  getEyeColours?: () => string[];
  getSkinColours?: () => string[];
  getWhitePatches?: () => string[];
  getPoints?: () => string[];
  getVitiligo?: () => string[];
  getAccessories?: () => string[];
  getScars?: () => string[];
}

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

interface ParamDefinition {
  id: ParamId;
  label: string;
  optional?: boolean;
  requiresTortie?: boolean;
}

const DISPLAY_SIZE = 720;
const FULL_EXPORT_SIZE = 700;
const INSTANT_PARAMS: ParamId[] = ["whitePatchesTint"];
const MIN_FRAME_DURATION = 45;

function computeStepDurations(
  sequence: { delay: number }[],
  baseDelay: number,
  allowFast: boolean,
  minimum: number = MIN_FRAME_DURATION
): number[] {
  if (sequence.length === 0) {
    return [];
  }
  const safeBase = clampDelay(baseDelay, allowFast);
  return sequence.map((step) => {
    const scaled = safeBase * Math.max(step.delay, 1);
    return Math.max(scaled, allowFast ? ABSOLUTE_MIN_STEP_MS : Math.max(MIN_SAFE_STEP_MS, minimum));
  });
}

function getBaseFrameDuration(speed: { baseFrameDuration: number }): number {
  return Math.max(speed.baseFrameDuration, MIN_FRAME_DURATION);
}

function invokeMapper<T>(
  mapper: SpriteMapperApi,
  fn: ((...args: unknown[]) => T) | undefined,
  fallback: T,
  ...args: unknown[]
): T {
  if (typeof fn === "function") {
    try {
      return fn.apply(mapper, args as never[]);
    } catch (error) {
      console.warn("SpriteMapper method failed", error);
    }
  }
  return fallback;
}

function invokeMapperArray(
  mapper: SpriteMapperApi,
  fn: ((...args: unknown[]) => unknown) | undefined,
  ...args: unknown[]
): string[] {
  const result = invokeMapper(mapper, fn as ((...args: unknown[]) => unknown), [], ...args);
  return Array.isArray(result) ? [...result] : [];
}

const SPEED_PRESETS = {
  slow: {
    paramPause: 1040,
    calmParamPause: 820,
    targetSpinDuration: 20000,
    baseFrameDuration: 775,
  },
  normal: {
    paramPause: 520,
    calmParamPause: 420,
    targetSpinDuration: 10000,
    baseFrameDuration: 385,
  },
  fast: {
    paramPause: 260,
    calmParamPause: 220,
    targetSpinDuration: 5000,
    baseFrameDuration: 190,
  },
} as const;

function interpolate(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

const ROLLER_REVEAL_HOLD = 500;
const PRE_SPIN_DELAY = 120;
const PARAM_REVEAL_PAUSE = 500;

function mixProfiles(
  a: (typeof SPEED_PRESETS)[keyof typeof SPEED_PRESETS],
  b: (typeof SPEED_PRESETS)[keyof typeof SPEED_PRESETS],
  t: number,
  targetDuration: number
) {
  const paramPause = interpolate(a.paramPause, b.paramPause, t);
  const calmParamPause = interpolate(a.calmParamPause, b.calmParamPause, t);
  const baseFrameDuration = Math.max(
    interpolate(a.baseFrameDuration, b.baseFrameDuration, t),
    MIN_FRAME_DURATION
  );
  return {
    paramPause,
    calmParamPause,
    baseFrameDuration,
    targetSpinDuration: targetDuration,
    flipSpeed: baseFrameDuration,
  };
}

function scaleProfile(
  preset: (typeof SPEED_PRESETS)[keyof typeof SPEED_PRESETS],
  ratio: number,
  targetDuration: number
) {
  const scale = Math.max(ratio, 0.05);
  return {
    paramPause: Math.max(preset.paramPause * scale, 60),
    calmParamPause: Math.max(preset.calmParamPause * scale, 60),
    baseFrameDuration: Math.max(preset.baseFrameDuration * scale, MIN_FRAME_DURATION),
    targetSpinDuration: targetDuration,
    flipSpeed: Math.max(preset.baseFrameDuration * scale, MIN_FRAME_DURATION),
  };
}

function getSpeedSettings(durationMs: number) {
  const duration = Math.max(1000, durationMs);

  if (duration <= SPEED_PRESETS.fast.targetSpinDuration) {
    const ratio = duration / SPEED_PRESETS.fast.targetSpinDuration;
    return scaleProfile(SPEED_PRESETS.fast, ratio, duration);
  }

  if (duration <= SPEED_PRESETS.normal.targetSpinDuration) {
    const t =
      (duration - SPEED_PRESETS.fast.targetSpinDuration) /
      (SPEED_PRESETS.normal.targetSpinDuration - SPEED_PRESETS.fast.targetSpinDuration);
    return mixProfiles(SPEED_PRESETS.fast, SPEED_PRESETS.normal, t, duration);
  }

  if (duration <= SPEED_PRESETS.slow.targetSpinDuration) {
    const t =
      (duration - SPEED_PRESETS.normal.targetSpinDuration) /
      (SPEED_PRESETS.slow.targetSpinDuration - SPEED_PRESETS.normal.targetSpinDuration);
    return mixProfiles(SPEED_PRESETS.normal, SPEED_PRESETS.slow, t, duration);
  }

  const ratio = duration / SPEED_PRESETS.slow.targetSpinDuration;
  return scaleProfile(SPEED_PRESETS.slow, ratio, duration);
}

const VALID_SPRITES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18];

const layerGroupLabels: Record<LayerGroup, string> = {
  accessories: "Accessories",
  scars: "Scars",
  torties: "Tortie Layers",
};

const SPRITE_NAMES: Record<number, string> = {
  0: "Kitten (0)",
  1: "Kitten (1)",
  2: "Kitten (2)",
  3: "Adolescent (3)",
  4: "Adolescent (4)",
  5: "Adolescent (5)",
  6: "Adult (6)",
  7: "Adult (7)",
  8: "Adult (8)",
  9: "Longhair Adult (9)",
  10: "Longhair Adult (10)",
  11: "Longhair Adult (11)",
  12: "Senior (12)",
  13: "Senior (13)",
  14: "Senior (14)",
  15: "Paralyzed Adult (15)",
  16: "Paralyzed Longhair Adult (16)",
  17: "Paralyzed Young (17)",
  18: "Sick Adult (18)",
  19: "Sick Young (19)",
  20: "Newborn (20)",
};

const PARAM_SEQUENCE: ParamDefinition[] = [
  { id: "colour", label: "Colour" },
  { id: "pelt", label: "Pelt" },
  { id: "eyeColour", label: "Eyes" },
  { id: "eyeColour2", label: "Eye Colour 2", optional: true },
  { id: "tortie", label: "Tortie", optional: true },
  { id: "tortieMask", label: "Tortie Mask", requiresTortie: true },
  { id: "tortiePattern", label: "Tortie Pelt", requiresTortie: true },
  { id: "tortieColour", label: "Tortie Colour", requiresTortie: true },
  { id: "tint", label: "Tint", optional: true },
  { id: "skinColour", label: "Skin" },
  { id: "whitePatches", label: "White Patches", optional: true },
  { id: "points", label: "Points", optional: true },
  { id: "whitePatchesTint", label: "White Patch Tint", optional: true },
  { id: "vitiligo", label: "Vitiligo", optional: true },
  { id: "accessory", label: "Accessory", optional: true },
  { id: "scar", label: "Scar", optional: true },
  { id: "sprite", label: "Sprite" },
];

// AFTERLIFE_OPTIONS imported from @/utils/catSettingsHelpers

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === "" || value === "none") {
    return "None";
  }
  const str = String(value)
    .replace(/_/g, " ")
    .replace(/^[0-9]+\s*-\s*/, "")
    .toLowerCase();
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function coerceSpriteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const match = value.match(/(-?\d+)/);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function cloneParams<T>(params: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(params);
    } catch (error) {
      console.warn("structuredClone failed, falling back to JSON clone", error);
    }
  }
  return JSON.parse(JSON.stringify(params));
}

function cloneSourceCanvas(
  source: HTMLCanvasElement | OffscreenCanvas,
  width = DISPLAY_SIZE,
  height = DISPLAY_SIZE
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to clone canvas – 2D context not available");
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
  return canvas;
}

function waitForIdle(): Promise<void> {
  if (typeof requestIdleCallback === "function") {
    return new Promise((resolve) => {
      requestIdleCallback(() => resolve());
    });
  }
  return Promise.resolve();
}

async function preRenderVariationFrames(
  generator: CatGeneratorApi,
  baseParams: Partial<CatParams>,
  paramId: ParamId,
  variationOptions: VariationOption[]
): Promise<VariationFrame[]> {
  const descriptors: VariantDescriptor[] = variationOptions.map((option, index) => {
    const previewParams = cloneParams(baseParams);
    applyParamValue(previewParams, paramId, option.raw);
    return {
      id: `param-${paramId}-${index}`,
      option,
      params: previewParams,
    };
  });

  return renderVariantFrames(generator, baseParams, descriptors, { priority: "high" });
}

async function renderVariantFrames(
  generator: CatGeneratorApi,
  baseParams: Partial<CatParams>,
  descriptors: VariantDescriptor[],
  options?: { layerId?: string; baseCanvas?: HTMLCanvasElement; priority?: FetchPriority }
): Promise<VariationFrame[]> {
  if (descriptors.length === 0) {
    return [];
  }

  if (generator.generateVariantSheet) {
    try {
      const sheet = await generator.generateVariantSheet(
        baseParams,
        descriptors.map(({ id, params, label, group }) => ({ id, params, label, group })),
        {
          includeSources: false,
          includeBase: false,
        }
      );
      if (sheet.frames.length >= descriptors.length) {
        const sheetCanvas = await decodeImageFromDataUrl(sheet.sheetDataUrl);
        await waitForIdle();
        const frameMap = new Map(sheet.frames.map((frame) => [frame.id, frame]));

        return descriptors.map((descriptor) => {
          const meta = frameMap.get(descriptor.id);
          if (!meta) {
            throw new Error(`Missing frame metadata for variant ${descriptor.id}`);
          }
          const canvas = document.createElement("canvas");
          canvas.width = DISPLAY_SIZE;
          canvas.height = DISPLAY_SIZE;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            throw new Error("Unable to acquire 2D context for variant frame");
          }
          ctx.imageSmoothingEnabled = false;
          if (options?.baseCanvas) {
            ctx.drawImage(options.baseCanvas, 0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
          }
          ctx.drawImage(
            sheetCanvas,
            meta.x,
            meta.y,
            meta.width,
            meta.height,
            0,
            0,
            DISPLAY_SIZE,
            DISPLAY_SIZE
          );
          return {
            option: descriptor.option,
            canvas,
          };
        });
      }
    } catch (error) {
      console.warn("generateVariantSheet failed, falling back to sequential renders", error);
    }
  }

  const frames: VariationFrame[] = [];
  for (const descriptor of descriptors) {
    const result = await generator.generateCat(descriptor.params);
    let canvas: HTMLCanvasElement;
    if (options?.layerId && options.baseCanvas) {
      canvas = cloneSourceCanvas(options.baseCanvas, DISPLAY_SIZE, DISPLAY_SIZE);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(result.canvas as CanvasImageSource, 0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
      }
    } else {
      canvas = cloneSourceCanvas(result.canvas as HTMLCanvasElement | OffscreenCanvas);
    }
    frames.push({
      option: descriptor.option,
      canvas,
    });
  }
  return frames;
}

function buildFlipSequence(
  frames: VariationFrame[]
): { frame: VariationFrame; delay: number; isFinal: boolean }[] {
  if (frames.length === 0) {
    return [];
  }

  const targetFrame = frames[frames.length - 1];
  const cycleFrames = frames.slice();
  const sequence: { frame: VariationFrame; delay: number; isFinal: boolean }[] = [];

  // Two fast cycles preserving sampled order (legacy behaviour).
  for (let cycle = 0; cycle < 2; cycle += 1) {
    for (const frame of cycleFrames) {
      sequence.push({ frame, delay: 1, isFinal: false });
    }
  }

  const randomPool = cycleFrames.length > 0 ? cycleFrames : [targetFrame];
  for (let i = 0; i < 5; i += 1) {
    const frame = randomPool[Math.floor(Math.random() * randomPool.length)];
    sequence.push({ frame, delay: 1 + i * 0.3, isFinal: false });
  }

  sequence.push({ frame: targetFrame, delay: 2, isFinal: true });

  return sequence;
}

/**
 * Composite a layer count frame: large number in the cat's dominant colour
 * behind a semi-transparent cat sprite.
 */
function compositeCountFrame(
  catCanvas: HTMLCanvasElement,
  count: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = DISPLAY_SIZE;
  canvas.height = DISPLAY_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return catCanvas;
  ctx.imageSmoothingEnabled = false;

  // Sample the centre pixel of the cat to get a representative colour
  const srcCtx = catCanvas.getContext("2d");
  let numberColour = "rgba(200, 160, 80, 0.6)";
  if (srcCtx) {
    const px = srcCtx.getImageData(
      Math.floor(DISPLAY_SIZE / 2),
      Math.floor(DISPLAY_SIZE / 2),
      1,
      1
    ).data;
    if (px[3] > 20) {
      numberColour = `rgba(${px[0]}, ${px[1]}, ${px[2]}, 0.5)`;
    }
  }

  // Draw large number
  ctx.fillStyle = numberColour;
  ctx.font = `bold ${Math.round(DISPLAY_SIZE * 0.7)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(count), DISPLAY_SIZE / 2, DISPLAY_SIZE / 2);

  // Draw cat on top, semi-transparent
  ctx.globalAlpha = 0.6;
  ctx.drawImage(catCanvas, 0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
  ctx.globalAlpha = 1.0;

  return canvas;
}

function buildLayerOptionStrings(
  allValuesInput: string[] | null | undefined,
  target: string | null | undefined,
  includeNone = true,
  options?: { spinny?: boolean; limit?: number }
): VariationOption[] {
  const spinnyMode = options?.spinny ?? false;
  const allValues = Array.isArray(allValuesInput) ? allValuesInput : [];
  const normalizedTarget = target && target !== "" ? target : "none";
  const baseLimit = spinnyMode ? MAX_SPINNY_LAYER_VARIATIONS : MAX_LAYER_VARIATIONS;
  const variationLimit = Math.max(1, Math.min(baseLimit, options?.limit ?? baseLimit));
  const results: string[] = [];

  if (includeNone) {
    results.push("none");
  }

  const dedup = new Set<string>();
  for (const value of allValues) {
    if (!value) continue;
    if (!dedup.has(value)) {
      dedup.add(value);
    }
  }

  const nonTargetValues = Array.from(dedup).filter((value) => value !== normalizedTarget && value !== "none");
  const remainingSlots = Math.max(0, variationLimit - results.length - 1);

  if (remainingSlots > 0) {
    const step = Math.max(1, Math.floor(nonTargetValues.length / remainingSlots));
    for (let index = 0; index < nonTargetValues.length && results.length < variationLimit - 1; index += step) {
      results.push(nonTargetValues[index]);
    }

    let fallbackIndex = 0;
    while (results.length < variationLimit - 1 && fallbackIndex < nonTargetValues.length) {
      const candidate = nonTargetValues[fallbackIndex++];
      if (!results.includes(candidate)) {
        results.push(candidate);
      }
    }
  }

  const hasTarget = results.includes(normalizedTarget) || (!includeNone && normalizedTarget === "none");
  if (!hasTarget) {
    results.push(normalizedTarget);
  } else {
    // ensure target is final entry to align with downstream assumptions
    const targetIndex = results.indexOf(normalizedTarget);
    if (targetIndex !== -1 && targetIndex !== results.length - 1) {
      results.splice(targetIndex, 1);
      results.push(normalizedTarget);
    }
  }

  if (!results.length) {
    results.push(normalizedTarget);
  }

  return results.map((value) => ({
    raw: value,
    display: formatValue(value),
  }));
}

function formatTortieLayer(layer: TortieSlot | null): string {
  if (!layer) return "None";
  return [layer.mask, layer.pattern, layer.colour]
    .map((part) => formatValue(part ?? "none"))
    .join(" • ");
}

function getParameterRawValue(paramId: ParamId, params: Partial<CatParams>): unknown {
  switch (paramId) {
    case "sprite":
      return params.spriteNumber;
    case "pelt":
      return params.peltName;
    case "colour":
      return params.colour;
    case "eyeColour":
      return params.eyeColour;
    case "eyeColour2":
      return params.eyeColour2 ?? "none";
    case "tortie":
      return params.isTortie ?? false;
    case "tortieMask":
      return params.tortieMask ?? "none";
    case "tortiePattern":
      return params.tortiePattern ?? "none";
    case "tortieColour":
      return params.tortieColour ?? "none";
    case "tint":
      return params.tint ?? "none";
    case "skinColour":
      return params.skinColour;
    case "whitePatches":
      return params.whitePatches ?? "none";
    case "points":
      return params.points ?? "none";
    case "whitePatchesTint":
      return params.whitePatchesTint ?? "none";
    case "vitiligo":
      return params.vitiligo ?? "none";
    case "shading":
      return params.shading ?? false;
    case "reverse":
      return params.reverse ?? false;
    default:
      return undefined;
  }
}

function formatOptionDisplay(paramId: ParamId, raw: unknown): string {
  if (paramId === "sprite") {
    const spriteNumber = coerceSpriteNumber(raw);
    if (spriteNumber !== undefined) {
      return SPRITE_NAMES[spriteNumber] ?? `Sprite ${spriteNumber}`;
    }
  }

  if (typeof raw === "boolean") {
    return raw ? "Yes" : "No";
  }

  if (raw === undefined || raw === null || raw === "") {
    return "None";
  }

  if (typeof raw === "string" && raw.toLowerCase() === "none") {
    return "None";
  }

  return formatValue(raw);
}

function applyParamValue(params: Partial<CatParams>, paramId: ParamId, value: unknown) {
  switch (paramId) {
    case "colour":
      params.colour = value as string;
      break;
    case "pelt":
      params.peltName = value as string;
      break;
    case "eyeColour":
      params.eyeColour = value as string;
      break;
    case "eyeColour2":
      params.eyeColour2 = value === "None" ? undefined : (value as string);
      break;
    case "tortie":
      params.isTortie = Boolean(value);
      if (!value) {
        params.tortie = [];
        params.tortieMask = undefined;
        params.tortieColour = undefined;
        params.tortiePattern = undefined;
      }
      break;
    case "tortieMask":
      params.tortieMask = value as string;
      break;
    case "tortiePattern":
      params.tortiePattern = value as string;
      break;
    case "tortieColour":
      params.tortieColour = value as string;
      break;
    case "tint":
      params.tint = value as string;
      break;
    case "skinColour":
      params.skinColour = value as string;
      break;
    case "whitePatches":
      params.whitePatches = value === "None" ? undefined : (value as string);
      break;
    case "points":
      params.points = value === "None" ? undefined : (value as string);
      break;
    case "whitePatchesTint":
      params.whitePatchesTint = value === "None" ? undefined : (value as string);
      break;
    case "vitiligo":
      params.vitiligo = value === "None" ? undefined : (value as string);
      break;
    case "accessory": {
      const accessoryValue = typeof value === "string" && value !== "none" ? value : undefined;
      params.accessory = accessoryValue;
      if (accessoryValue) {
        params.accessories = [accessoryValue];
      } else {
        params.accessories = [];
      }
      break;
    }
    case "scar": {
      const scarValue = typeof value === "string" && value !== "none" ? value : undefined;
      params.scar = scarValue;
      if (scarValue) {
        params.scars = [scarValue];
      } else {
        params.scars = [];
      }
      break;
    }
    case "shading":
      params.shading = value as boolean;
      break;
    case "reverse":
      params.reverse = value as boolean;
      break;
    case "sprite": {
      const parsed = coerceSpriteNumber(value);
      if (parsed !== undefined) {
        params.spriteNumber = parsed;
      }
      break;
    }
  }
}

function getParameterValueForDisplay(paramId: ParamId, params: Partial<CatParams>): string {
  switch (paramId) {
    case "colour":
      return formatValue(params.colour);
    case "pelt":
      return formatValue(params.peltName);
    case "eyeColour":
      return formatValue(params.eyeColour);
    case "eyeColour2":
      if (!params.eyeColour2 || params.eyeColour2 === params.eyeColour) {
        return "None";
      }
      return formatValue(params.eyeColour2);
    case "tortie":
      return params.isTortie ? "Yes" : "No";
    case "tortieMask":
      return formatValue(params.tortieMask);
    case "tortiePattern":
      return formatValue(params.tortiePattern);
    case "tortieColour":
      return formatValue(params.tortieColour);
    case "tint":
      return formatValue(params.tint ?? "None");
    case "skinColour":
      return formatValue(params.skinColour);
    case "whitePatches":
      return formatValue(params.whitePatches ?? "None");
    case "points":
      return formatValue(params.points ?? "None");
    case "whitePatchesTint":
      return formatValue(params.whitePatchesTint ?? "None");
    case "vitiligo":
      return formatValue(params.vitiligo ?? "None");
    case "shading":
      return params.shading ? "Yes" : "No";
    case "reverse":
      return params.reverse ? "Yes" : "No";
    case "sprite":
      return SPRITE_NAMES[Number(params.spriteNumber)] ?? `Sprite ${params.spriteNumber}`;
    default:
      return "";
  }
}

// clampLayerValue, computeLayerCount imported from @/utils/catSettingsHelpers
// LayerRangeSelector imported from @/components/common/LayerRangeSelector

// resolveAfterlife imported from @/utils/catSettingsHelpers

function randomFrom<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function buildSharePayload(state: CatState) {
  return {
    params: state.params,
    accessorySlots: [...state.accessorySlots],
    scarSlots: [...state.scarSlots],
    tortieSlots: state.tortieSlots.map((slot) => (slot ? { ...slot } : null)),
    counts: { ...state.counts },
  };
}

function sanitizeForBuilder(
  baseParams: Partial<CatParams>,
  overrides?: { accessory?: string | null; scar?: string | null; tortie?: TortieSlot | null }
): Partial<CatParams> {
  const next = cloneParams(baseParams ?? {});

  const accessoryValue = overrides?.accessory ?? (Array.isArray(next.accessories) && next.accessories.length > 0
    ? (next.accessories[0] as string)
    : typeof next.accessory === "string"
      ? (next.accessory as string)
      : null);

  if (accessoryValue) {
    next.accessory = accessoryValue;
    next.accessories = [accessoryValue];
  } else {
    next.accessory = undefined;
    next.accessories = [];
  }

  const scarValue = overrides?.scar ?? (Array.isArray(next.scars) && next.scars.length > 0
    ? (next.scars[0] as string)
    : typeof next.scar === "string"
      ? (next.scar as string)
      : null);

  if (scarValue) {
    next.scar = scarValue;
    next.scars = [scarValue];
  } else {
    next.scar = undefined;
    next.scars = [];
  }

  const tortieValue = overrides?.tortie ?? (Array.isArray(next.tortie) && next.tortie.length > 0
    ? (next.tortie[0] as TortieSlot)
    : null);

  if (tortieValue) {
    next.tortie = [tortieValue];
    next.isTortie = true;
    next.tortieMask = tortieValue.mask;
    next.tortiePattern = tortieValue.pattern;
    next.tortieColour = tortieValue.colour;
  } else {
    next.tortie = [];
    next.isTortie = false;
    next.tortieMask = undefined;
    next.tortiePattern = undefined;
    next.tortieColour = undefined;
  }

  return next;
}

async function copyCanvasToClipboard(
  canvas: HTMLCanvasElement,
  successMessage: string,
  fallbackFilename: string,
  onSuccess: (message: string) => void,
  onError: (message: string) => void
) {
  try {
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("toBlob failed"));
      }, "image/png");
    });

    if (navigator.clipboard && "write" in navigator.clipboard) {
      const item = new ClipboardItem({ "image/png": blob });
      await navigator.clipboard.write([item]);
      onSuccess(successMessage);
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fallbackFilename}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onSuccess("Image downloaded.");
  } catch (error) {
    console.error("Failed to copy canvas", error);
    onError("Failed to copy image. Please try again.");
  }
}


async function buildParameterOptions(
  mapper: SpriteMapperApi,
  includeBaseColours: boolean,
  extendedModes: ExtendedMode[]
): Promise<ParameterOptions> {
  if (!mapper.loaded) {
    await mapper.init();
  }

  const colourModes = extendedModes.length === 0 ? "off" : extendedModes;

  const baseColours: string[] = includeBaseColours ? invokeMapperArray(mapper, mapper.getColours) : [];

  const experimental = invokeMapperArray(mapper, mapper.getExperimentalColoursByMode, colourModes);

  const colourSet = new Set<string>();
  for (const colour of baseColours) colourSet.add(colour);
  for (const colour of experimental) colourSet.add(colour);
  const colourList = Array.from(colourSet);

  const whitePatchTints = invokeMapperArray(
    mapper,
    mapper.getWhitePatchColourOptions,
    "default",
    colourModes === "off" ? null : colourModes
  );
  if (whitePatchTints.length === 0) {
    whitePatchTints.push("none");
  }

  const peltNames = invokeMapperArray(mapper, mapper.getPeltNames);
  const tortieMasks = invokeMapperArray(mapper, mapper.getTortieMasks);
  const tints = invokeMapperArray(mapper, mapper.getTints);
  const eyeColours = invokeMapperArray(mapper, mapper.getEyeColours);
  const skinColours = invokeMapperArray(mapper, mapper.getSkinColours);
  const whitePatches = invokeMapperArray(mapper, mapper.getWhitePatches);
  const points = invokeMapperArray(mapper, mapper.getPoints);
  const vitiligo = invokeMapperArray(mapper, mapper.getVitiligo);
  const accessories = invokeMapperArray(mapper, mapper.getAccessories);
  const scars = invokeMapperArray(mapper, mapper.getScars);

  return {
    sprite: mapper.sprites ?? VALID_SPRITES,
    pelt: peltNames,
    colour: colourList,
    tortie: [true, false],
    tortieMask: tortieMasks,
    tortiePattern: peltNames,
    tortieColour: colourList,
    tint: tints.length > 0 ? tints : ["none"],
    eyeColour: eyeColours,
    eyeColour2: [...eyeColours, "none"],
    skinColour: skinColours,
    whitePatches: ["none", ...whitePatches],
    points: ["none", ...points],
    whitePatchesTint: whitePatchTints.length > 0 ? whitePatchTints : ["none"],
    vitiligo: ["none", ...vitiligo],
    accessory: ["none", ...accessories],
    scar: ["none", ...scars],
    shading: [true, false],
    reverse: [true, false],
  };
}

function sampleValues(
  options: ParameterOptions | null,
  id: ParamId,
  finalRawValue: unknown,
  finalDisplay: string,
  limit = 8
): VariationOption[] {
  if (!options || !(id in options)) {
    return [{ raw: finalRawValue, display: finalDisplay }];
  }

  const rawList = ((options as Record<ParamId, unknown[]>)[id] ?? []).filter(
    (entry) => entry !== undefined && entry !== null
  );

  const dedup = new Map<string, VariationOption>();
  for (const entry of rawList) {
    const display = formatOptionDisplay(id, entry);
    const key = `${display}|${typeof entry === "object" ? JSON.stringify(entry) : String(entry)}`;
    if (!dedup.has(key)) {
      dedup.set(key, { raw: entry, display });
    }
  }

  const finalOption: VariationOption = {
    raw: finalRawValue,
    display: finalDisplay,
  };

  const optionKey = (option: VariationOption) =>
    `${option.display}|${typeof option.raw === "object" ? JSON.stringify(option.raw) : String(option.raw)}`;

  const finalKey = optionKey(finalOption);
  const normalized = Array.from(dedup.values());
  const nonTarget = normalized.filter((option) => optionKey(option) !== finalKey);

  const effectiveLimit = Number.isFinite(limit) ? Math.max(1, limit) : normalized.length + 1;
  const maxNonTarget = Math.max(0, Math.min(effectiveLimit - 1, nonTarget.length));

  const sampled: VariationOption[] = [];
  if (maxNonTarget > 0) {
    const step = Math.max(1, Math.floor(nonTarget.length / maxNonTarget));
    for (let index = 0; index < nonTarget.length && sampled.length < maxNonTarget; index += step) {
      sampled.push(nonTarget[index]);
    }
    let fallbackIndex = 0;
    while (sampled.length < maxNonTarget && fallbackIndex < nonTarget.length) {
      const candidate = nonTarget[fallbackIndex++];
      if (!sampled.includes(candidate)) {
        sampled.push(candidate);
      }
    }
  }

  if (sampled.length === 0) {
    sampled.push(finalOption);
  } else {
    const hasFinalAlready = sampled.some((option) => optionKey(option) === finalKey);
    if (!hasFinalAlready) {
      if (sampled.length >= effectiveLimit) {
        sampled[sampled.length - 1] = finalOption;
      } else {
        sampled.push(finalOption);
      }
    } else {
      sampled.push(finalOption);
    }
  }

  const result = sampled.filter((option) => optionKey(option) !== finalKey);
  result.push(finalOption);
  return result;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function OBSSpinClient({
  apiKey,
}: {
  apiKey: string;
}) {
  // Convex subscription — get session data by API key
  const session = useQuery(api.catStream.getSessionByApiKey, { apiKey });
  const sessionSettings = session?.settings as SingleCatSettings | undefined;

  // Derive settings from session (or defaults)
  const defaultMode = sessionSettings?.mode ?? "flashy";
  const defaultAccessoryRange = sessionSettings?.accessoryRange ?? { min: 1, max: 4 };
  const defaultScarRange = sessionSettings?.scarRange ?? { min: 1, max: 1 };
  const defaultTortieRange = sessionSettings?.tortieRange ?? { min: 1, max: 4 };
  const defaultAfterlife = sessionSettings?.afterlifeMode ?? "dark10";
  const variantSlug = undefined;
  const initialVariantSettings = sessionSettings ?? null;
  const initialVariantLoadError = null as string | null;
  const initialCodeSettings = null as SingleCatPortableSettings | null;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const generatorRef = useRef<CatGeneratorApi | null>(null);
  const mapperRef = useRef<SpriteMapperApi | null>(null);
  const parameterOptionsRef = useRef<ParameterOptions | null>(null);
  const catStateRef = useRef<CatState | null>(null);
  const generationIdRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);
  const initialVariantLoadHandledRef = useRef(false);

  const [initializing, setInitializing] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialSettings = useMemo<SingleCatSettings>(() => {
    let base: SingleCatSettings;
    if (initialVariantSettings) {
      base = initialVariantSettings;
    } else {
      base = {
        ...DEFAULT_SINGLE_CAT_SETTINGS,
        mode: defaultMode,
        accessoryRange: { ...defaultAccessoryRange },
        scarRange: { ...defaultScarRange },
        tortieRange: { ...defaultTortieRange },
        afterlifeMode: defaultAfterlife,
        timing: {
          ...DEFAULT_TIMING_CONFIG,
          delays: { ...DEFAULT_TIMING_CONFIG.delays },
          subsetLimits: { ...(DEFAULT_TIMING_CONFIG.subsetLimits ?? {}) },
          pauseDelays: DEFAULT_TIMING_CONFIG.pauseDelays
            ? {
                flashyMs: DEFAULT_TIMING_CONFIG.pauseDelays.flashyMs,
                calmMs: DEFAULT_TIMING_CONFIG.pauseDelays.calmMs,
              }
            : undefined,
        },
      };
    }
    // Portable code overrides portable fields only (never timing/mode/speed)
    if (initialCodeSettings) {
      base = {
        ...base,
        accessoryRange: { ...initialCodeSettings.accessoryRange },
        scarRange: { ...initialCodeSettings.scarRange },
        tortieRange: { ...initialCodeSettings.tortieRange },
        exactLayerCounts: initialCodeSettings.exactLayerCounts,
        afterlifeMode: initialCodeSettings.afterlifeMode,
        includeBaseColours: initialCodeSettings.includeBaseColours,
        extendedModes: [...initialCodeSettings.extendedModes],
      };
    }
    return base;
  }, [
    defaultAccessoryRange,
    defaultAfterlife,
    defaultMode,
    defaultScarRange,
    defaultTortieRange,
    initialVariantSettings,
    initialCodeSettings,
  ]);

  const [mode, setMode] = useState<"flashy" | "calm">(initialSettings.mode);
  const [accessoryRange, setAccessoryRange] = useState<LayerRange>(initialSettings.accessoryRange);
  const [scarRange, setScarRange] = useState<LayerRange>(initialSettings.scarRange);
  const [tortieRange, setTortieRange] = useState<LayerRange>(initialSettings.tortieRange);
  const [exactLayerCounts, setExactLayerCounts] = useState(initialSettings.exactLayerCounts);
  const [timingConfig, setTimingConfig] = useState<SpinTimingConfig>(initialSettings.timing);

  // OBS: no variant management — settings come from Convex session
  const variants = {
    variants: [] as { id: string; name: string; slug?: string; settings: SingleCatSettings; isActive: boolean; createdAt: number; updatedAt: number }[],
    activeVariant: null as { id: string; name: string; settings: SingleCatSettings } | null,
    saveVariant: async (_name: string, _settings: SingleCatSettings) => {},
    activateVariant: (_id: string) => {},
    deactivateVariant: () => {},
    removeVariant: (_id: string) => {},
    renameVariant: (_id: string, _name: string) => {},
  };
  const [timingModalOpen, setTimingModalOpen] = useState(false);
  const [lastTimingSnapshot, setLastTimingSnapshot] = useState<TimingSnapshot | null>(null);
  const [speedMultiplier, setSpeedMultiplier] = useState(initialSettings.speedMultiplier);
  const speedMultiplierRef = useRef(1.0);
  const subsetLimits = useMemo(
    () => timingConfig.subsetLimits ?? (DEFAULT_TIMING_CONFIG.subsetLimits ?? {}),
    [timingConfig.subsetLimits]
  );
  const defaultFlashyPauseMs = DEFAULT_TIMING_CONFIG.pauseDelays?.flashyMs ?? 520;
  const defaultCalmPauseMs = DEFAULT_TIMING_CONFIG.pauseDelays?.calmMs ?? 420;
  const flashyPauseMs = timingConfig.pauseDelays?.flashyMs ?? defaultFlashyPauseMs;
  const calmPauseMs = timingConfig.pauseDelays?.calmMs ?? defaultCalmPauseMs;
  const flashyPauseSeconds = flashyPauseMs / 1000;
  const calmPauseSeconds = calmPauseMs / 1000;
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
  const optionCountsRef = useRef<Record<ParamTimingKey, number>>(Object.fromEntries(
    PARAM_TIMING_ORDER.map((key) => [key, PARAM_DEFAULT_STEP_COUNTS[key] ?? 0])
  ) as Record<ParamTimingKey, number>);
  const actualDurationsRef = useRef<Partial<Record<ParamTimingKey, number>>>({});
  const totalActualRef = useRef(0);
  const modeRef = useRef(mode);
  const [optionCounts, setOptionCounts] = useState<Record<ParamTimingKey, number>>(optionCountsRef.current);
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

  const addActualDuration = useCallback((key: ParamTimingKey | null, deltaMs: number) => {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    totalActualRef.current += deltaMs;
    if (!key) return;
    actualDurationsRef.current = {
      ...actualDurationsRef.current,
      [key]: (actualDurationsRef.current[key] ?? 0) + deltaMs,
    };
  }, []);
  const [afterlifeMode, setAfterlifeMode] = useState<AfterlifeOption>(initialSettings.afterlifeMode);
  const [includeBaseColours, setIncludeBaseColours] = useState(initialSettings.includeBaseColours);
  const [extendedModes, setExtendedModes] = useState<Set<ExtendedMode>>(() => new Set(initialSettings.extendedModes));

  // OBS: Re-sync settings when the Convex session updates (control page changed them)
  useEffect(() => {
    if (!sessionSettings) return;
    setMode(sessionSettings.mode);
    setAccessoryRange(sessionSettings.accessoryRange);
    setScarRange(sessionSettings.scarRange);
    setTortieRange(sessionSettings.tortieRange);
    setExactLayerCounts(sessionSettings.exactLayerCounts);
    setAfterlifeMode(sessionSettings.afterlifeMode);
    setIncludeBaseColours(sessionSettings.includeBaseColours);
    setExtendedModes(new Set(sessionSettings.extendedModes));
    if (sessionSettings.speedMultiplier !== undefined) {
      setSpeedMultiplier(sessionSettings.speedMultiplier);
    }
    if (sessionSettings.timing) {
      setTimingConfig(sessionSettings.timing);
    }
  }, [sessionSettings]);

  const [rollerLabel, setRollerLabel] = useState<string | null>(null);
  const [rollerActiveValue, setRollerActiveValue] = useState<string | null>(null);
  const [rollerHighlight, setRollerHighlight] = useState(false);
  const [paramRows, setParamRows] = useState<ParamRow[]>([]);
  const [activeParamId, setActiveParamId] = useState<ParamId | null>(null);
  const [layerRows, setLayerRows] = useState<Record<LayerGroup, LayerRowState[]>>({
    accessories: [],
    scars: [],
    torties: [],
  });
  const [rollSummary, setRollSummary] = useState<string | null>(null);
  const [spriteVariations, setSpriteVariations] = useState<SpriteVariation[]>([]);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [hasTint, setHasTint] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [rollerExpanded, setRollerExpanded] = useState(false);
  const [spriteGalleryOpen, setSpriteGalleryOpen] = useState(false);
  const defaultCreatorName = "";
  const [catNameDraft, setCatNameDraft] = useState(initialSettings.catName);
  const [creatorNameDraft, setCreatorNameDraft] = useState(initialSettings.creatorName);
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

  const rollerValueClass = useMemo(() => {
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
  const createMapper = async (..._args: unknown[]): Promise<{ id: string; slug: string; catName?: string; creatorName?: string; shareToken?: string } | null> => null;
  const updateMapperMeta = async (..._args: unknown[]): Promise<{ id: string; slug: string; catName?: string; creatorName?: string; shareToken?: string } | null> => null;

  const extendedModesArray = useMemo(() => Array.from(extendedModes), [extendedModes]);

  const resetMetaDrafts = useCallback((catName?: string | null, creatorName?: string | null) => {
    setCatNameDraft(catName ?? "");
    setCreatorNameDraft(creatorName || defaultCreatorName);
    setMetaDirty(false);
  }, [defaultCreatorName]);

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

  const snapshotConfig = useMemo((): SingleCatSettings => ({
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
    catName: catNameDraft,
    creatorName: creatorNameDraft,
  }), [mode, timingConfig, speedMultiplier, accessoryRange, scarRange, tortieRange, exactLayerCounts, afterlifeMode, extendedModes, includeBaseColours, catNameDraft, creatorNameDraft]);

  const applyVariantConfig = useCallback((settings: SingleCatSettings) => {
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
    setCatNameDraft(settings.catName);
    setCreatorNameDraft(settings.creatorName || defaultCreatorName);
  }, [defaultCreatorName]);

  const variantDirty = useMemo(() => {
    if (!variants.activeVariant) return false;
    return !singleCatSettingsEqual(snapshotConfig, variants.activeVariant.settings);
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
  }, [variantSlug, initialCodeSettings, variants.activeVariant, applyVariantConfig]);

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
    const adjusted: Record<ParamTimingKey, number> = {} as Record<ParamTimingKey, number>;
    PARAM_TIMING_ORDER.forEach((key) => {
      const baseCount = optionCounts[key] ?? PARAM_DEFAULT_STEP_COUNTS[key] ?? 0;
      const limited = subsetLimits[key] && baseCount > SUBSET_LIMIT ? SUBSET_LIMIT : baseCount;
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
    [estimatedTotals.total, timingConfig]
  );

  const readSpinState = useCallback(() => {
    const durationMs = Math.max(1000, effectiveTotalMs);
    const baseSpeed = getSpeedSettings(durationMs);
    const currentConfig = timingConfigRef.current;
    const currentFlashyPause = currentConfig.pauseDelays?.flashyMs ?? defaultFlashyPauseMs;
    const currentCalmPause = currentConfig.pauseDelays?.calmMs ?? defaultCalmPauseMs;
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


  const clearMirror = useCallback(() => { }, []);

  const activeGlobalPreset = useMemo(() => {
    for (const presetKey of GLOBAL_PRESETS) {
      const matches = PARAM_TIMING_ORDER.every((param) => {
        const target = PARAM_TIMING_PRESETS[param]?.[presetKey];
        if (typeof target !== "number") return false;
        const current = timingConfig.delays[param] ?? getPresetValues(param).normal;
        return current === target;
      });
      if (matches) return presetKey;
    }
    return "custom" as const;
  }, [timingConfig.delays]);

  const handleGlobalPreset = useCallback(
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
    [setTimingConfig, timingConfig]
  );

  const handleTimingStepChange = useCallback(
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
    [setTimingConfig, timingConfig]
  );

  const handlePauseChange = useCallback(
    (kind: "flashyMs" | "calmMs", seconds: number) => {
      if (!Number.isFinite(seconds)) return;
      const clampedSeconds = Math.min(10, Math.max(1, seconds));
      const nextMs = Math.round(clampedSeconds * 1000);
      setTimingConfig({
        ...timingConfig,
        pauseDelays: {
          flashyMs: timingConfig.pauseDelays?.flashyMs ?? DEFAULT_TIMING_CONFIG.pauseDelays!.flashyMs,
          calmMs: timingConfig.pauseDelays?.calmMs ?? DEFAULT_TIMING_CONFIG.pauseDelays!.calmMs,
          [kind]: nextMs,
        },
      });
    },
    [setTimingConfig, timingConfig]
  );

  const toggleSubsetLimit = useCallback(
    (key: ParamTimingKey) => {
      const current = Boolean(subsetLimits[key]);
      const nextLimits: Partial<Record<ParamTimingKey, boolean>> = { ...subsetLimits };
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
    [setTimingConfig, subsetLimits, timingConfig]
  );

  const handleResetTimings = useCallback(() => {
    setTimingConfig({
      ...timingConfig,
      allowFastFlips: DEFAULT_TIMING_CONFIG.allowFastFlips,
      delays: { ...DEFAULT_TIMING_CONFIG.delays },
      subsetLimits: { ...DEFAULT_TIMING_CONFIG.subsetLimits },
      pauseDelays: {
        flashyMs: DEFAULT_TIMING_CONFIG.pauseDelays!.flashyMs,
        calmMs: DEFAULT_TIMING_CONFIG.pauseDelays!.calmMs,
      },
    });
  }, [setTimingConfig, timingConfig]);

  const copyText = useCallback(
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
    [showToast]
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
  }, [initialVariantLoadError, initialVariantSettings, showToast, variantSlug]);

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
      options?: { keepLabel?: boolean; keepValue?: boolean; skipHighlight?: boolean }
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
    []
  );

  const playFlip = useCallback(async (draw: () => void, duration: number) => {
    draw();
    await wait(Math.max(duration, 30));
  }, []);

  const resetLayerRows = useCallback(
    (
      accessoriesInput: string[] | null | undefined,
      scarsInput: string[] | null | undefined,
      tortiesInput: (TortieSlot | null)[] | null | undefined
    ) => {
      const accessories = Array.isArray(accessoriesInput) ? accessoriesInput : [];
      const scars = Array.isArray(scarsInput) ? scarsInput : [];
      const torties = Array.isArray(tortiesInput) ? tortiesInput : [];

      setLayerRows({
        accessories: accessories.map((_, idx) => ({ label: `Accessory ${idx + 1}`, value: "—", status: "idle" })),
        scars: scars.map((_, idx) => ({ label: `Scar ${idx + 1}`, value: "—", status: "idle" })),
        torties: torties.map((_, idx) => ({ label: `Tortie ${idx + 1}`, value: "—", status: "idle" })),
      });
    },
    []
  );

  const updateLayerRow = useCallback(
    (group: LayerGroup, index: number, updates: Partial<LayerRowState>) => {
      setLayerRows((prev) => {
        const groupRows = prev[group];
        if (!groupRows || index < 0 || index >= groupRows.length) {
          return prev;
        }
        const nextGroup = groupRows.map((row, idx) =>
          idx === index ? { ...row, ...updates } : row
        );
        return { ...prev, [group]: nextGroup };
      });
    },
    []
  );

  const updateParamRow = useCallback((rowIndex: number, updates: Partial<ParamRow>) => {
    setParamRows((prev) =>
      prev.map((row, idx) => (idx === rowIndex ? { ...row, ...updates } : row))
    );
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

  const drawCanvas = useCallback((source?: HTMLCanvasElement | OffscreenCanvas) => {
    if (!source) return;
    const target = canvasRef.current;
    if (!target) return;
    const ctx = target.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
    try {
      ctx.drawImage(source as HTMLCanvasElement, 0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
    } catch (error) {
      console.warn("drawImage failed, creating fallback canvas", error);
      const fallback = document.createElement("canvas");
      const fallbackWidth =
        "width" in source && typeof source.width === "number"
          ? source.width
          : DISPLAY_SIZE;
      const fallbackHeight =
        "height" in source && typeof source.height === "number"
          ? source.height
          : DISPLAY_SIZE;
      fallback.width = fallbackWidth;
      fallback.height = fallbackHeight;
      const fallbackCtx = fallback.getContext("2d");
      if (fallbackCtx) {
        fallbackCtx.drawImage(source as HTMLCanvasElement, 0, 0);
        ctx.drawImage(fallback, 0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
      }
    }
  }, []);

  const renderCat = useCallback(
    async (params: Partial<CatParams>) => {
      const generator = generatorRef.current;
      if (!generator) return;
      const result = await generator.generateCat(params);
      drawCanvas(result.canvas as HTMLCanvasElement);
    },
    [drawCanvas]
  );


  const spinAccessorySlots = useCallback(
    async (
      rowIndex: number,
      targetSlotsInput: string[] | null | undefined,
      context: { accessories: string[]; scars: string[]; torties: (TortieSlot | null)[] },
      progressiveParams: Partial<CatParams>,
      mapper: SpriteMapperApi,
      pauseDuration: number,
      currentToken: number
    ) => {
      const generator = generatorRef.current;
      if (!generator || !mapper) return;

      const targetSlots = Array.isArray(targetSlotsInput) ? targetSlotsInput : [];

      clearMirror();
      setRollerLabel("Accessories");
      setRollerActiveValue("—");

      if (targetSlots.length === 0) {
        context.accessories.splice(0, context.accessories.length);
        updateParamRow(rowIndex, { value: "None", status: "revealed" });

        const spinState = readSpinState();
        if (spinState.spinny) {
          const frontResult = await generator.generateCat(progressiveParams);
          const drawStep = () => drawCanvas(frontResult.canvas as HTMLCanvasElement | OffscreenCanvas);
          await playFlip(drawStep, Math.max(getBaseFrameDuration(spinState.speed), 90));
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

        if (spinState.spinny) {
          updateLayerRow("accessories", i, { status: "active", value: "—" });

          const variationOptions = buildLayerOptionStrings(allAccessories, target, true, {
            spinny: true,
            limit: subsetLimits.accessory ? SUBSET_LIMIT : undefined,
          });
          if (!baseCanvas) {
            const basePreview = cloneParams(progressiveParams);
            basePreview.accessories = [];
            basePreview.accessory = undefined;
            const baseResult = await generator.generateCat(basePreview);
            baseCanvas = cloneSourceCanvas(baseResult.canvas as HTMLCanvasElement | OffscreenCanvas);
          }

          const descriptors: VariantDescriptor[] = variationOptions.map((option, variantIndex) => {
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
          });

          const frames = await renderVariantFrames(generator, progressiveParams, descriptors, {
            layerId: "accessories",
            baseCanvas: baseCanvas ?? undefined,
            priority: "high",
          });
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
            const stepDurations = computeStepDurations(sequence.slice(idx), accessoryDelay, currentConfig.allowFastFlips);
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
          const formatted = typeof target === "string" && target !== "none" ? formatValue(target) : "None";
          updateLayerRow("accessories", i, { value: formatted, status: "revealed" });
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
      getDelayWithMultiplier,
      playFlip,
      renderCat,
      settleRoller,
      subsetLimits,
      updateLayerRow,
      updateParamRow,
      readSpinState,
    ]
  );

  const spinScarSlots = useCallback(
    async (
      rowIndex: number,
      targetSlotsInput: string[] | null | undefined,
      context: { accessories: string[]; scars: string[]; torties: (TortieSlot | null)[] },
      progressiveParams: Partial<CatParams>,
      mapper: SpriteMapperApi,
      pauseDuration: number,
      currentToken: number
    ) => {
      const generator = generatorRef.current;
      if (!generator || !mapper) return;

      const targetSlots = Array.isArray(targetSlotsInput) ? targetSlotsInput : [];

      clearMirror();
      setRollerLabel("Scars");
      setRollerActiveValue("—");

      if (targetSlots.length === 0) {
        context.scars.splice(0, context.scars.length);
        updateParamRow(rowIndex, { value: "None", status: "revealed" });

        const spinState = readSpinState();
        if (spinState.spinny) {
          const frontResult = await generator.generateCat(progressiveParams);
          const drawStep = () => drawCanvas(frontResult.canvas as HTMLCanvasElement | OffscreenCanvas);
          await playFlip(drawStep, Math.max(getBaseFrameDuration(spinState.speed), 90));
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

        if (spinState.spinny) {
          updateLayerRow("scars", i, { status: "active", value: "—" });

          const variationOptions = buildLayerOptionStrings(allScars, target, true, {
            spinny: true,
            limit: subsetLimits.scar ? SUBSET_LIMIT : undefined,
          });
          if (!baseCanvas) {
            const basePreview = cloneParams(progressiveParams);
            basePreview.scars = [];
            basePreview.scar = undefined;
            const baseResult = await generator.generateCat(basePreview);
            baseCanvas = cloneSourceCanvas(baseResult.canvas as HTMLCanvasElement | OffscreenCanvas);
          }

          const descriptors: VariantDescriptor[] = variationOptions.map((option, variantIndex) => {
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
          });

          const frames = await renderVariantFrames(generator, progressiveParams, descriptors, {
            layerId: "scarsPrimary",
            baseCanvas: baseCanvas ?? undefined,
            priority: "high",
          });
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
            const stepDurations = computeStepDurations(sequence.slice(idx), scarDelay, currentConfig.allowFastFlips);
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
          const formatted = typeof target === "string" && target !== "none" ? formatValue(target) : "None";
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
      getDelayWithMultiplier,
      playFlip,
      renderCat,
      settleRoller,
      subsetLimits,
      updateLayerRow,
      updateParamRow,
      readSpinState,
    ]
  );

  const spinTortieSlots = useCallback(
    async (
      rowIndex: number,
      targetSlotsInput: (TortieSlot | null)[] | null | undefined,
      context: { accessories: string[]; scars: string[]; torties: (TortieSlot | null)[] },
      progressiveParams: Partial<CatParams>,
      mapper: SpriteMapperApi,
      pauseDuration: number,
      currentToken: number
    ) => {
      const generator = generatorRef.current;
      if (!generator || !mapper) return;

      const targetSlots = Array.isArray(targetSlotsInput) ? targetSlotsInput : [];

      clearMirror();
      setRollerLabel("Tortie Layers");
      setRollerActiveValue("—");

      if (targetSlots.length === 0) {
        context.torties.splice(0, context.torties.length);
        updateParamRow(rowIndex, { value: "None", status: "revealed" });

        const spinState = readSpinState();
        if (spinState.spinny) {
          const frontResult = await generator.generateCat(progressiveParams);
          const drawStep = () => drawCanvas(frontResult.canvas as HTMLCanvasElement | OffscreenCanvas);
          await playFlip(drawStep, Math.max(getBaseFrameDuration(spinState.speed), 90));
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
      const colours = parameterOptionsRef.current?.colour ?? invokeMapperArray(mapper, mapper.getColours);

      const committed: TortieSlot[] = [];
      const summary: string[] = [];

      for (let i = 0; i < targetSlots.length; i += 1) {
        if (generationIdRef.current !== currentToken) return;
        const target = targetSlots[i];
        const spinState = readSpinState();

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
              ? availableColours[Math.floor(Math.random() * availableColours.length)]
              : target.colour;

          // Pick a different random colour for mask/pattern stages (not the final colour)
          const maskPatternColours = colours.filter((c) => c !== target.colour);
          const maskPatternColour =
            maskPatternColours.length > 0
              ? maskPatternColours[Math.floor(Math.random() * maskPatternColours.length)]
              : target.colour;

          let working: TortieSlot = { ...target, colour: startColour };
          updateLayerRow("torties", i, { value: "—", status: "active" });

          const stageConfigs: Array<{ kind: "mask" | "pattern" | "colour"; label: string; source: string[] }> = [
            { kind: "mask", label: "Mask", source: masks },
            { kind: "pattern", label: "Pelt", source: patterns },
            { kind: "colour", label: "Colour", source: colours },
          ];

          const baseSpinState = readSpinState();
          const phaseTargetDuration =
            baseSpinState.speed.targetSpinDuration / Math.max(stageConfigs.length, 1);

          for (const stage of stageConfigs) {
            const stageKey: ParamTimingKey =
              stage.kind === "mask" ? "tortieMask" : stage.kind === "pattern" ? "tortiePattern" : "tortieColour";
            const stageStart = typeof performance !== "undefined" ? performance.now() : Date.now();
            setRollerLabel(`Tortie Layer ${i + 1} – ${stage.label}`);
            const stageTargetValue =
              stage.kind === "mask"
                ? working.mask
                : stage.kind === "pattern"
                  ? working.pattern
                  : target.colour;
            const options = buildLayerOptionStrings(stage.source, stageTargetValue, false, {
              spinny: true,
              limit: subsetLimits[stageKey] ? SUBSET_LIMIT : undefined,
            });
            const descriptors: VariantDescriptor[] = options.map((option, variantIndex) => {
              const preview = cloneParams(progressiveParams);
              const candidateLayer: TortieSlot = {
                mask: stage.kind === "mask" ? (option.raw as string) : working.mask,
                pattern: stage.kind === "pattern" ? (option.raw as string) : working.pattern,
                colour: stage.kind === "colour" ? (option.raw as string) : (stage.kind === "mask" || stage.kind === "pattern" ? maskPatternColour : working.colour),
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
            });

            const frames = await renderVariantFrames(generator, progressiveParams, descriptors);
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
              const stageDurations = computeStepDurations(sequence.slice(idx), stageDelay, currentConfig.allowFastFlips);
              const stepDuration = stageDurations[0] ?? stageDelay;
              
              const candidateLayer: TortieSlot = {
                mask: stage.kind === "mask" ? (step.frame.option.raw as string) : working.mask,
                pattern: stage.kind === "pattern" ? (step.frame.option.raw as string) : working.pattern,
                colour: stage.kind === "colour" ? (step.frame.option.raw as string) : (stage.kind === "mask" || stage.kind === "pattern" ? maskPatternColour : working.colour),
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
              if (stage.kind === "mask") working = { ...working, mask: finalStageValue };
              if (stage.kind === "pattern") working = { ...working, pattern: finalStageValue };
              if (stage.kind === "colour") working = { ...working, colour: finalStageValue };
            }

            await wait(pauseDuration);
            const stageEnd = typeof performance !== "undefined" ? performance.now() : Date.now();
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
      getDelayWithMultiplier,
      playFlip,
      renderCat,
      settleRoller,
      subsetLimits,
      updateLayerRow,
      updateParamRow,
      readSpinState,
    ]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!generatorRef.current || !mapperRef.current) {
          const [{ default: catGenerator }, { default: spriteMapper }] = await Promise.all([
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
            extendedModesArray
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
  }, [drawPlaceholder, includeBaseColours, extendedModesArray]);

  useEffect(() => {
    const mapper = mapperRef.current;
    if (!mapper || !mapper.loaded) return;
    let cancelled = false;
    (async () => {
      const options = await buildParameterOptions(
        mapper,
        includeBaseColours,
        extendedModesArray
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
  }, [includeBaseColours, extendedModesArray]);

  useEffect(() => {
    return () => {
      generationIdRef.current += 1; // cancel ongoing work
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

  const handleToggleExtended = useCallback((modeToToggle: ExtendedMode) => {
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

  const ensureMapperReady = useCallback(async (): Promise<SpriteMapperApi | null> => {
    if (!mapperRef.current) return null;
    if (!mapperRef.current.loaded && mapperRef.current.init) {
      await mapperRef.current.init();
    }
    if (!parameterOptionsRef.current) {
      parameterOptionsRef.current = await buildParameterOptions(
        mapperRef.current,
        includeBaseColours,
        extendedModesArray
      );
      const counts = deriveOptionCounts(parameterOptionsRef.current);
      optionCountsRef.current = counts;
      setOptionCounts(counts);
    }
    return mapperRef.current;
  }, [includeBaseColours, extendedModesArray]);

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
      },
      token: number
    ) => {
      if (!generator.generateRandomCat) return;

      const groups = [
        { label: "Accessories", key: "accessory" as const, ...layers.accessories },
        { label: "Scars", key: "scar" as const, ...layers.scars },
        { label: "Tortie Layers", key: "tortieMask" as const, ...layers.torties },
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
          { id: group.key, label: group.label, value: "?", status: "active" as const },
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
        });
        if (generationIdRef.current !== token) return;

        const baseParams = catResult.params;
        baseParams.spriteNumber = 9; // always use longhair adult for count previews
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
              result.canvas as HTMLCanvasElement | OffscreenCanvas
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
            false // never fast-flip the count reveal
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
              ? { ...row, value: String(group.count), status: "revealed" as const }
              : row
          )
        );
        await settleRoller(token);
        await wait(600); // hold the result so viewer can see it
        if (generationIdRef.current !== token) return;
      }

      setRollerLabel(null);
      setRollerActiveValue(null);
      setParamRows([]); // clear count rows before main param spin
      clearMirror();
    },
    [drawCanvas, clearMirror, playFlip, settleRoller, getDelayWithMultiplier, readSpinState]
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
    setSpriteVariations([]);
    setParamRows([]);
    setRollerLabel(null);
    setRollerActiveValue(null);
    setRollerHighlight(false);
    setRollSummary(null);
    setActiveParamId(null);
    setHasTint(false);
    clearMirror();
    drawPlaceholder();
    setRollerExpanded(true);

    const token = ++generationIdRef.current;
    setIsGenerating(true);

    try {
      const accessoryCount = computeLayerCount(accessoryRange);
      const scarCount = computeLayerCount(scarRange);
      const tortieCount = computeLayerCount(tortieRange);
      const experimentalMode = extendedModesArray.length === 0 ? "off" : extendedModesArray;

      // OBS: Use override params from the control page if available
      const override = overrideParamsRef.current;
      overrideParamsRef.current = null; // consume once

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let randomResult: any;
      if (override?.params) {
        randomResult = {
          params: override.params as Record<string, unknown>,
          slotSelections: override.slots as typeof randomResult.slotSelections,
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
        (params.accessories ?? []).filter((entry): entry is string => typeof entry === "string");
      const scarSlots =
        randomResult.slotSelections?.scars ??
        (params.scars ?? []).filter((entry): entry is string => typeof entry === "string");
      const tortieSlots: (TortieSlot | null)[] =
        randomResult.slotSelections?.tortie?.map((slot: any) =>
          slot?.mask && slot?.pattern && slot?.colour
            ? { mask: slot.mask, pattern: slot.pattern, colour: slot.colour }
            : null
        ) ??
        (params.tortie ?? []).map((slot) =>
          slot?.mask && slot?.pattern && slot?.colour
            ? { mask: slot.mask, pattern: slot.pattern, colour: slot.colour }
            : null
        );
      const tortieLayers = tortieSlots.filter(Boolean) as TortieSlot[];

      resetLayerRows(accessorySlots, scarSlots, tortieSlots);

      const { darkForest: enableDarkForest, dead: enableDead } = resolveAfterlife(afterlifeMode);
      params.darkForest = enableDarkForest;
      params.darkMode = enableDarkForest;
      params.dead = enableDead;

      const countsResult: GenerationCounts = {
        accessories: accessorySlots.length,
        scars: scarSlots.length,
        tortie: tortieSlots.length,
      };

      setRollSummary(
        `Rolled → Accessories: ${countsResult.accessories} • Scars: ${countsResult.scars} • Tortie layers: ${countsResult.tortie}`
      );
      setHasTint(Boolean(enableDarkForest || enableDead));
      setSpriteGalleryOpen(false);

      const uniqueAccessories: string[] = Array.from(
        new Set(accessorySlots.filter((entry: unknown): entry is string => typeof entry === "string" && entry !== "none"))
      );
      const uniqueScars: string[] = Array.from(
        new Set(scarSlots.filter((entry: unknown): entry is string => typeof entry === "string" && entry !== "none"))
      );
      const tortieChoices = tortieLayers.length ? tortieLayers : [];

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
      setParamRows([]);

      // Count reveal phase — spin the accessory/scar/tortie counts before params
      if (exactLayerCounts) {
        await revealLayerCounts(
          generator,
          {
            accessories: { range: accessoryRange, count: accessoryCount },
            scars: { range: scarRange, count: scarCount },
            torties: { range: tortieRange, count: tortieCount },
          },
          {
            experimentalColourMode: experimentalMode,
            includeBaseColours,
          },
          token
        );
        if (generationIdRef.current !== token) return;
      }

      for (const definition of PARAM_SEQUENCE) {
        if (definition.id === "tortieMask" || definition.id === "tortiePattern" || definition.id === "tortieColour") {
          continue;
        }
        if (generationIdRef.current !== token) return;
        if (definition.requiresTortie && !params.isTortie) continue;

        const paramKeyCandidate = definition.id;
        const paramKey = isParamTimingKey(paramKeyCandidate) ? paramKeyCandidate : null;
        const paramStart = typeof performance !== "undefined" ? performance.now() : Date.now();

        const rawTargetValue = getParameterRawValue(definition.id, params);
        const displayValue = getParameterValueForDisplay(definition.id, params);
        setActiveParamId(definition.id);
        let rowIndex = -1;
        setParamRows((prev) => {
          const nextIndex = prev.length;
          rowIndex = nextIndex;
          return [
            ...prev,
            {
              id: definition.id,
              label: definition.label,
              value: "—",
              status: "active",
            },
          ];
        });

        const spinState = readSpinState();
        const currentSpeedSetting = spinState.speed;
        const basePause = modeRef.current === "calm"
          ? currentSpeedSetting.calmParamPause
          : currentSpeedSetting.paramPause;
        const pauseDuration = Math.max(
          PARAM_REVEAL_PAUSE,
          basePause / speedMultiplierRef.current
        );
        const isInstantParam = INSTANT_PARAMS.includes(definition.id);
        const isTortieToggle = definition.id === "tortie";
        const shouldAnimate = spinState.spinny && !!rollerOptions && !isInstantParam && !isTortieToggle;

        if (definition.id === "accessory") {
          const accessoryStart = typeof performance !== "undefined" ? performance.now() : Date.now();
          await spinAccessorySlots(
            rowIndex,
            accessorySlots,
            contextForApply,
            progressiveParams,
            mapper,
            pauseDuration,
            token
          );
          const accessoryEnd = typeof performance !== "undefined" ? performance.now() : Date.now();
          addActualDuration("accessory", accessoryEnd - accessoryStart);
          if (rowIndex >= 0) {
            setParamRows((prev) => prev.filter((_, idx) => idx !== rowIndex));
          }
          clearMirror();
          continue;
        }

        if (definition.id === "scar") {
          const scarStart = typeof performance !== "undefined" ? performance.now() : Date.now();
          await spinScarSlots(
            rowIndex,
            scarSlots,
            contextForApply,
            progressiveParams,
            mapper,
            pauseDuration,
            token
          );
          const scarEnd = typeof performance !== "undefined" ? performance.now() : Date.now();
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
          await wait(Math.max(getBaseFrameDuration(currentSpeedSetting) * 0.25, PRE_SPIN_DELAY));

          const subsetEnabled = paramKey ? Boolean(subsetLimits[paramKey]) : false;
          const variationOptions = sampleValues(
            rollerOptions,
            definition.id,
            rawTargetValue,
            displayValue,
            subsetEnabled ? SUBSET_LIMIT : MAX_SPINNY_VARIATIONS
          );

          const frames = await preRenderVariationFrames(
            generator,
            progressiveParams,
            definition.id,
            variationOptions
          );
          const sequence = buildFlipSequence(frames);

          for (let idx = 0; idx < sequence.length; idx += 1) {
            const step = sequence[idx];
            if (generationIdRef.current !== token) return;
            
            // Recalculate delay on each step to get live updates
            const currentConfig = timingConfigRef.current;
            const configuredDelay = paramKey ? getDelayWithMultiplier(paramKey) : MIN_SAFE_STEP_MS;
            const stepDurations = computeStepDurations(sequence.slice(idx), configuredDelay, currentConfig.allowFastFlips);
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
                  : row
              )
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
          applyParamValue(progressiveParams, definition.id, finalFrame.option.raw);
          setParamRows((prev) =>
            prev.map((row) =>
              row.id === definition.id
                ? { ...row, value: finalFrame.option.display, status: "revealed" }
                : row
            )
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
                : row
            )
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
            token
          );
        }

        await wait(pauseDuration);
        const paramEnd = typeof performance !== "undefined" ? performance.now() : Date.now();
        addActualDuration(paramKey, paramEnd - paramStart);
      }

      setActiveParamId(null);
      setRollerActiveValue(null);
      setRollerLabel(null);

      await renderCat(params);
      if (generationIdRef.current !== token) return;

      const builderPrimaryAccessory = uniqueAccessories[0] ?? null;
      const builderPrimaryScar = uniqueScars[0] ?? null;
      const builderPrimaryTortie = tortieLayers.length > 0 ? tortieLayers[0] : null;
      const builderParams = sanitizeForBuilder(params, {
        accessory: builderPrimaryAccessory,
        scar: builderPrimaryScar,
        tortie: builderPrimaryTortie,
      });
      builderParams.spriteNumber = DEFAULT_SPRITE_NUMBER;

      const catUrl = generator.buildCatURL?.(builderParams) ?? "";

      const spritePreview: SpriteVariation[] = [];
      for (const spriteNumber of VALID_SPRITES) {
        if (generationIdRef.current !== token) return;
        const spriteParams = { ...params, spriteNumber };
        const result = await generator.generateCat(spriteParams);
        const previewCanvas = document.createElement("canvas");
        previewCanvas.width = 120;
        previewCanvas.height = 120;
        const previewCtx = previewCanvas.getContext("2d");
        if (previewCtx) {
          previewCtx.imageSmoothingEnabled = false;
          previewCtx.drawImage(result.canvas as HTMLCanvasElement, 0, 0, 120, 120);
        }
        spritePreview.push({
          spriteNumber,
          name: SPRITE_NAMES[spriteNumber] ?? `Sprite ${spriteNumber}`,
          dataUrl: previewCanvas.toDataURL("image/png"),
        });
      }
      setSpriteVariations(spritePreview);

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
        totalActualRef.current
      );
      setLastTimingSnapshot({
        counts: { ...adjustedOptionCounts },
        estimated: { ...estimatedTotals.perKey },
        estimatedTotal: estimatedTotals.total,
        actual: { ...actualDurationsRef.current },
        actualTotal: totalActualRef.current,
        timestamp: typeof performance !== "undefined" ? performance.now() : Date.now(),
      });
      setIsGenerating(false);
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
          catStateRef.current = { ...catStateRef.current, catShareSlug: shareSlug };
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
            const shareToken = (result as { shareToken?: string }).shareToken ?? result.slug ?? result.id;
            const origin = typeof window !== "undefined" ? window.location.origin : "";
            const url = origin ? `${origin}/view/${shareToken}` : `/view/${shareToken}`;
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
          const origin = typeof window !== "undefined" ? window.location.origin : "";
          if (catStateRef.current) {
            if (shareSlug) {
              const fallbackUrl = origin ? `${origin}/visual-builder?share=${shareSlug}` : `/visual-builder?share=${shareSlug}`;
              catStateRef.current = { ...catStateRef.current, catShareSlug: shareSlug, shareUrl: fallbackUrl };
              setShareLink(fallbackUrl);
            } else if (legacyEncoded) {
              const fallbackUrl = origin ? `${origin}/view?cat=${legacyEncoded}` : `/view?cat=${legacyEncoded}`;
              catStateRef.current = { ...catStateRef.current, legacyEncoded, shareUrl: fallbackUrl };
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
    playFlip,
    clearMirror,
    drawPlaceholder,
    settleRoller,
    readSpinState,
    createMapper,
    resetMetaDrafts,
    getDelayWithMultiplier,
    exactLayerCounts,
    timingConfig.allowFastFlips,
    timingConfig.delays,
    subsetLimits,
    resetActualDurations,
    addActualDuration,
    estimatedTotals,
    adjustedOptionCounts,
    setLastTimingSnapshot,
  ]);



  const handleDownload = useCallback(() => {
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
        ctx.drawImage(result.canvas as HTMLCanvasElement, 0, 0, FULL_EXPORT_SIZE, FULL_EXPORT_SIZE);
      }
      await copyCanvasToClipboard(
        exportCanvas,
        options?.noTint
          ? `Copied cat (no tint) (${FULL_EXPORT_SIZE}×${FULL_EXPORT_SIZE})!`
          : `Copied cat (${FULL_EXPORT_SIZE}×${FULL_EXPORT_SIZE})!`,
        options?.noTint ? "cat-no-tint" : "cat",
        showToast,
        (message) => setError(message)
      );
    },
    [showToast]
  );

  const handleCopySprite = useCallback(
    async (spriteNumber: number, size: 120 | typeof FULL_EXPORT_SIZE) => {
      const state = catStateRef.current;
      const generator = generatorRef.current;
      if (!state || !generator) return;
      const spriteName = SPRITE_NAMES[spriteNumber] ?? `Sprite ${spriteNumber}`;
      const params = { ...state.params, spriteNumber };
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
        size === 120 ? `${spriteName.toLowerCase()}-120` : `${spriteName.toLowerCase()}-700`,
        showToast,
        (message) => setError(message)
      );
      track("single_cat_exported", { format: `copy-${size}px` });
    },
    [showToast]
  );

  const buildShareUrl = useCallback(async () => {
    const state = catStateRef.current;
    if (!state) return null;
    if (state.shareUrl) return state.shareUrl;
    const origin = typeof window !== "undefined" ? window.location.origin : "";

    let shareSlug: string | null = state.catShareSlug ?? null;

    const slugCandidate = state.mapperSlug ?? state.profileId ?? null;
    if (slugCandidate) {
      const url = origin ? `${origin}/view/${slugCandidate}` : `/view/${slugCandidate}`;
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
        const shareToken = (result as { shareToken?: string }).shareToken ?? result.slug ?? result.id;
        const url = origin ? `${origin}/view/${shareToken}` : `/view/${shareToken}`;
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
          catStateRef.current = { ...catStateRef.current, catShareSlug: shareSlug };
        }
      }
    }

    if (shareSlug) {
      const url = origin ? `${origin}/visual-builder?share=${shareSlug}` : `/visual-builder?share=${shareSlug}`;
      if (catStateRef.current) {
        catStateRef.current = {
          ...catStateRef.current,
          catShareSlug: shareSlug,
          shareUrl: url,
          legacyEncoded: catStateRef.current.legacyEncoded ?? legacyEncoded ?? null,
        };
      }
      setShareLink(url);
      return url;
    }

    if (legacyEncoded) {
      const url = origin ? `${origin}/view?cat=${legacyEncoded}` : `/view?cat=${legacyEncoded}`;
      catStateRef.current = { ...state, legacyEncoded, shareUrl: url };
      setShareLink(url);
      return url;
    }

    setError("Unable to build share link right now.");
    return null;
  }, [createMapper, setError]);

  const handleCopyShareLink = useCallback(async () => {
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

  const handleOpenShareViewer = useCallback(async () => {
    const url = await buildShareUrl();
    if (!url) return;
    const opened = window.open(url, "_blank", "noopener=yes");
    if (!opened) {
      showToast("Enable popups to open the share viewer.");
    }
  }, [buildShareUrl, showToast]);

  const handleSaveMeta = useCallback(async () => {
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
          mapperSlug: ((result as { shareToken?: string }).shareToken ?? result.slug ?? result.id) ?? catStateRef.current.mapperSlug,
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
  }, [catNameDraft, creatorNameDraft, updateMapperMeta, resetMetaDrafts, showToast, setError]);

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (event.shiftKey) {
        event.preventDefault();
        exportCat({ noTint: true }).catch((err) => console.error(err));
      }
    },
    [exportCat]
  );

  const currentState = catStateRef.current;
  const currentSpriteNumber =
    typeof currentState?.params?.spriteNumber === "number"
      ? Number(currentState.params.spriteNumber)
      : DEFAULT_SPRITE_NUMBER;
  const canCopySprite = Boolean(currentState && generatorRef.current);
  const spriteToolsSubtitle = canCopySprite
    ? `Current sprite #${currentSpriteNumber}`
    : "Roll a cat to unlock sprite tools";
  const existingCatName = (currentState?.catName ?? "").trim();
  const existingCreatorName = (currentState?.creatorName ?? "").trim();
  const trimmedCatDraft = catNameDraft.trim();
  const trimmedCreatorDraft = creatorNameDraft.trim();
  const historyReady = Boolean(currentState?.profileId);
  const metaChanged = trimmedCatDraft !== existingCatName || trimmedCreatorDraft !== existingCreatorName;
  const saveHistoryDisabled = !historyReady || metaSaving || (!metaDirty && !metaChanged);
  const viewerSlug = currentState?.mapperSlug ?? null;


  const generationDisabled = initializing || !!initialError;

  // =======================================================================
  // OBS: Hide header/footer, transparent background
  // =======================================================================
  useEffect(() => {
    // Green chroma key for dev preview — OBS uses transparent
    const isOBS = typeof window !== "undefined" && "obsstudio" in window;
    const bg = isOBS ? "transparent" : "#00ff00";
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
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
  }, []);

  // =======================================================================
  // OBS: Command handling — spin, clear, lobby
  // =======================================================================
  const lastSeqRef = useRef<number | null>(null);
  const initializedSeqRef = useRef(false);
  /** When set, generateCatPlus uses these params instead of generating random ones */
  const overrideParamsRef = useRef<{ params: unknown; slots?: unknown } | null>(null);
  const [obsPhase, setObsPhase] = useState<"idle" | "lobby" | "active">("idle");

  useEffect(() => {
    if (!session?.currentCommand) return;
    const cmd = session.currentCommand;

    // On first load, just record the current seq — don't replay it
    if (!initializedSeqRef.current) {
      initializedSeqRef.current = true;
      lastSeqRef.current = cmd.seq;
      return;
    }

    if (lastSeqRef.current !== null && cmd.seq <= lastSeqRef.current) return;
    lastSeqRef.current = cmd.seq;

    switch (cmd.type) {
      case "spin":
        if (!generationDisabled) {
          // Store the params from the control page so generateCatPlus uses them
          overrideParamsRef.current = {
            params: cmd.params,
            slots: cmd.slots,
          };
          setParamRows([]);
          setRollerLabel(null);
          setRollerActiveValue(null);
          setRollerHighlight(false);
          setActiveParamId(null);
          setObsPhase("active");
          generateCatPlus();
        }
        break;
      case "clear":
        // Cancel any running spin and go transparent
        generationIdRef.current++;
        setParamRows([]);
        setRollerLabel(null);
        setRollerActiveValue(null);
        setObsPhase("idle");
        drawPlaceholder();
        break;
      case "lobby":
        generationIdRef.current++;
        setParamRows([]);
        setRollerLabel(null);
        setRollerActiveValue(null);
        setObsPhase("lobby");
        break;
    }
  }, [session?.currentCommand, generationDisabled, generateCatPlus, drawPlaceholder]);

  // =======================================================================
  // OBS: Fixed-position overlay — nothing moves, everything anchored
  // =======================================================================
  const flapChars = Presets.ALPHANUM + " .-()_/•–:";

  // Build a map of revealed params for the fixed board
  const revealedMap = useMemo(() => {
    const map = new Map<string, ParamRow>();
    for (const row of paramRows) {
      map.set(row.id, row);
    }
    return map;
  }, [paramRows]);

  // The fixed board slots — exclude accessory/scar (they have their own panel)
  // Show tortie sub-params only if tortie was revealed as "Yes"
  // Exclude all layer params — they have their own bottom panel
  const layerParamIds = new Set(["accessory", "scar", "tortie", "tortieMask", "tortiePattern", "tortieColour"]);
  const boardSlots = PARAM_SEQUENCE.filter(
    (def) => !layerParamIds.has(def.id)
  );

  // All layer groups combined for the layer panel
  const hasLayers = layerRows.accessories.length > 0 || layerRows.scars.length > 0 || layerRows.torties.length > 0;

  // When idle (after clear), show nothing — fully transparent
  if (obsPhase === "idle" && !initializing) {
    return null;
  }

  // Lobby phase — settings overview + flying cats, no spin canvas
  if (obsPhase === "lobby") {
    return (
      <OBSLobby
        settings={{ mode, accessoryRange, scarRange, tortieRange, afterlifeMode, includeBaseColours, extendedModes: extendedModesArray, exactLayerCounts,
          lobbyMode: (sessionSettings as Record<string, unknown> | undefined)?.lobbyMode as string ?? "fruit-ninja",
          lobbyCatCount: (sessionSettings as Record<string, unknown> | undefined)?.lobbyCatCount as number ?? 4,
          lobbyMoveSpeed: (sessionSettings as Record<string, unknown> | undefined)?.lobbyMoveSpeed as number ?? 1.0,
          lobbySwapSpeed: (sessionSettings as Record<string, unknown> | undefined)?.lobbySwapSpeed as number ?? 1.0,
          lobbyClearSeq: (sessionSettings as Record<string, unknown> | undefined)?.lobbyClearSeq as number ?? 0,
        }}
        generator={generatorRef.current}
      />
    );
  }

  return (
    <div className="relative" style={{ width: "1280px", height: "1080px" }}>
      <style>{`
        @keyframes obs-dot-pulse {
          0%, 100% { opacity: 0.4; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
        /* Split-flap overrides — clean dark tiles, single line */
        .obs-flap { white-space: nowrap !important; flex-wrap: nowrap !important; }
        .obs-flap [data-kind="digit"] {
          color: #e4e4e7 !important;
          background: #18181b !important;
          border: 1px solid #27272a !important;
          border-radius: 4px !important;
          margin-right: 2px !important;
          font-family: 'Geist Mono', ui-monospace, monospace !important;
          font-weight: 700 !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.4) !important;
        }
        .obs-flap-active [data-kind="digit"] {
          color: #fbbf24 !important;
          background: #1c1a0a !important;
          border-color: #44400a !important;
        }
        .obs-flap-done [data-kind="digit"] {
          color: #a1a1aa !important;
          background: #111113 !important;
          border-color: #1e1e22 !important;
        }
      `}</style>

      {/* ═══ Cat canvas — absolute, never moves ═══ */}
      <div
        className="absolute flex items-center justify-center"
        style={{ left: "0px", top: "0px", width: "750px", height: "780px" }}
      >
          <canvas
            ref={canvasRef}
            width={DISPLAY_SIZE}
            height={DISPLAY_SIZE}
            style={{
              width: "720px",
              height: "720px",
              imageRendering: "pixelated",
              filter: [
                "drop-shadow(3px 0 0 white)",
                "drop-shadow(-3px 0 0 white)",
                "drop-shadow(0 3px 0 white)",
                "drop-shadow(0 -3px 0 white)",
                "drop-shadow(3px 3px 0 white)",
                "drop-shadow(-3px 3px 0 white)",
                "drop-shadow(3px -3px 0 white)",
                "drop-shadow(-3px -3px 0 white)",
              ].join(" "),
            }}
          />
      </div>

      {/* ═══ LAYER DETAILS — full width bottom bar, above right panel ═══ */}
      {hasLayers && (
        <div
          className="absolute z-10 overflow-hidden"
          style={{
            left: "0px",
            bottom: "0px",
            width: "1280px",
            background: "#09090b",
            borderTop: "1px solid #27272a",
            padding: "14px 32px",
          }}
        >
          <div className="flex">
            {(["accessories", "scars", "torties"] as const).map((group) => {
              const rows = layerRows[group];
              if (rows.length === 0) return null;
              return (
                <div key={group} style={{ width: "400px" }}>
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400">
                    {group === "torties" ? "Tortie Layers" : group.charAt(0).toUpperCase() + group.slice(1)}
                  </div>
                  {rows.map((row, i) => (
                    <div
                      key={`${group}-${i}`}
                      className="flex items-center border-l-2 py-1.5 pl-3"
                      style={{
                        borderColor: row.status === "active" ? "#f59e0b" : row.status === "revealed" ? "#3f3f46" : "transparent",
                      }}
                    >
                      <span className={cn(
                        "w-[90px] shrink-0 text-sm",
                        row.status === "active" ? "font-semibold text-amber-400" :
                        row.status === "revealed" ? "text-zinc-300" : "text-zinc-600"
                      )}>
                        {row.label}
                      </span>
                      <span className={cn(
                        "truncate font-mono text-sm font-bold",
                        row.status === "active" ? "text-white" :
                        row.status === "revealed" ? "text-white" : "text-zinc-600"
                      )}>
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ RIGHT COLUMN: Roller + Param board ═══ */}
      <div
        className="absolute flex flex-col"
        style={{ left: "750px", top: "0px", width: "530px", height: "1080px" }}
      >
        {/* Roller — current spinning param */}
        <div
          style={{
            height: "100px",
            background: "rgba(0,0,0,0.88)",
            borderBottom: "1px solid #27272a",
            borderLeft: "1px solid #27272a",
            padding: "20px 28px",
          }}
        >
          {rollerLabel ? (
            <>
              <div className="flex items-center gap-2.5">
                <div
                  className="size-2 rounded-full bg-amber-500"
                  style={{ animation: "obs-dot-pulse 1s ease-in-out infinite" }}
                />
                <span className="text-xs font-bold uppercase tracking-[0.3em] text-amber-500/60">
                  {rollerLabel}
                </span>
              </div>
              {rollerActiveValue && (
                <div className="mt-2 truncate font-mono text-3xl font-bold text-white">
                  {rollerActiveValue}
                </div>
              )}
            </>
          ) : (
            <span className="text-xs uppercase tracking-[0.3em] text-zinc-700">
              Ready
            </span>
          )}
        </div>

        {/* Param board — all slots, always visible */}
        <div
          className="flex-1 overflow-hidden"
          style={{
            background: "rgba(0,0,0,0.85)",
            borderLeft: "1px solid #27272a",
            padding: "12px 0",
          }}
        >
          {boardSlots.map((def) => {
            const row = revealedMap.get(def.id);
            const isActive = row?.status === "active";
            const isRevealed = row?.status === "revealed";
            const isNone = isRevealed && row?.value?.toLowerCase() === "none";
            const valueLen = row?.value?.length ?? 0;
            // Use S size for long values (>12 chars), M for normal
            const sizeClass = valueLen > 12 ? "S" : "M";

            // Hide "None" rows after reveal (fade out)
            if (isNone) return null;

            // Don't show empty slots
            if (!row) return null;

            return (
              <div
                key={def.id}
                className="flex items-center transition-all duration-200"
                style={{
                  padding: "8px 24px",
                  borderLeft: isActive ? "3px solid #f59e0b" : "3px solid transparent",
                  background: isActive ? "rgba(245,158,11,0.05)" : "transparent",
                }}
              >
                <span
                  className={cn(
                    "w-[130px] shrink-0 text-sm font-bold uppercase tracking-wide",
                    isActive ? "text-amber-400" : "text-zinc-400"
                  )}
                >
                  {def.label}
                </span>

                <div className="flex-1 overflow-hidden">
                  <FlapDisplay
                    className={cn("obs-flap", sizeClass, isActive ? "obs-flap-active" : "obs-flap-done")}
                    chars={flapChars}
                    length={row.value.length}
                    value={row.value.toUpperCase()}
                    timing={80}
                    padMode="end"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Loading */}
      {initializing && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-3 bg-black/90 px-6 py-4 rounded-lg">
            <Loader2 className="size-5 animate-spin text-amber-500" />
            <span className="text-sm text-zinc-400">Loading…</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OBS Lobby — settings overview + fruit-ninja flying cats
// ---------------------------------------------------------------------------

interface FlyingCat {
  id: number;
  frames: string[];
  x: number;
  startTime: number;
  duration: number;
  peakY: number;
  rotation: number;
}

function OBSLobby({
  settings,
  generator,
}: {
  settings: {
    mode: string;
    accessoryRange: LayerRange;
    scarRange: LayerRange;
    tortieRange: LayerRange;
    afterlifeMode: string;
    includeBaseColours: boolean;
    extendedModes: string[];
    exactLayerCounts?: boolean;
    lobbyMode?: string;
    lobbyCatCount?: number;
    lobbyMoveSpeed?: number;
    lobbySwapSpeed?: number;
    lobbyClearSeq?: number;
  };
  generator: CatGeneratorApi | null;
}) {
  const lobbyMode = (settings.lobbyMode ?? "fruit-ninja") as "fruit-ninja" | "matrix" | "dvd";
  const maxCats = settings.lobbyCatCount ?? 4;
  const moveSpeed = settings.lobbyMoveSpeed ?? 1.0;
  const swapSpeed = settings.lobbySwapSpeed ?? 1.0;
  const [flyingCats, setFlyingCats] = useState<FlyingCat[]>([]);
  const [paletteIdx, setPaletteIdx] = useState(0);
  const catIdRef = useRef(0);

  const afterlifeLabel =
    AFTERLIFE_OPTIONS.find((o) => o.value === settings.afterlifeMode)?.label ?? "Off";
  const rangeStr = (r: LayerRange) => `${r.min}–${r.max}`;

  // Resolve palette data
  const selectedPalettes = useMemo(
    () => ADDITIONAL_PALETTES.filter((p) => settings.extendedModes.includes(p.id)),
    [settings.extendedModes]
  );

  // Cycle palettes
  useEffect(() => {
    if (selectedPalettes.length <= 1) return;
    const timer = setInterval(() => setPaletteIdx((i) => (i + 1) % selectedPalettes.length), 4000);
    return () => clearInterval(timer);
  }, [selectedPalettes.length]);

  // Spawn flying cats WITH current settings + fixed sprite
  useEffect(() => {
    if (!generator?.generateRandomCat) return;
    let cancelled = false;

    const spawn = async () => {
      if (cancelled) return;
      // Generate one cat with settings, then re-render with different params but SAME sprite
      const firstResult = await generator.generateRandomCat!({
        accessoryCount: settings.accessoryRange.max,
        scarCount: settings.scarRange.max,
        tortieCount: settings.tortieRange.max,
        exactLayerCounts: settings.exactLayerCounts ?? true,
        experimentalColourMode: settings.extendedModes.length > 0 ? settings.extendedModes : undefined,
        includeBaseColours: settings.includeBaseColours,
      }).catch(() => null);
      if (cancelled || !firstResult) return;

      const fixedSprite = firstResult.params.spriteNumber ?? 8;
      const frames: string[] = [];

      // First frame from the initial result
      if (firstResult.canvas instanceof HTMLCanvasElement) {
        frames.push(firstResult.canvas.toDataURL("image/png"));
      }

      // Generate 20 more frames — same sprite, no reverse, different params each time
      for (let i = 0; i < 20; i++) {
        if (cancelled) return;
        try {
          const r = await generator.generateRandomCat!({
            accessoryCount: settings.accessoryRange.max,
            scarCount: settings.scarRange.max,
            tortieCount: settings.tortieRange.max,
            exactLayerCounts: settings.exactLayerCounts ?? true,
            experimentalColourMode: settings.extendedModes.length > 0 ? settings.extendedModes : undefined,
            includeBaseColours: settings.includeBaseColours,
          });
          if (r.canvas instanceof HTMLCanvasElement) {
            // Override sprite to keep it constant, lock reverse off
            const overrideParams = { ...r.params, spriteNumber: fixedSprite, reverse: false };
            const rendered = await generator.generateCat(overrideParams);
            if (rendered.canvas instanceof HTMLCanvasElement) {
              frames.push(rendered.canvas.toDataURL("image/png"));
            }
          }
        } catch { /* skip */ }
      }
      if (cancelled || frames.length === 0) return;

      setFlyingCats((prev) => {
        const alive = prev.filter((c) => Date.now() - c.startTime < c.duration);
        if (alive.length >= maxCats) return alive;
        // Random duration 10-30s for natural fade, scaled by moveSpeed
        const baseDuration = lobbyMode === "dvd"
          ? 999999
          : (10000 + Math.random() * 20000) / moveSpeed;
        return [...alive, {
          id: catIdRef.current++,
          frames,
          x: Math.random() * 85,
          startTime: Date.now(),
          duration: baseDuration,
          peakY: 250 + Math.random() * 500,
          rotation: -60 + Math.random() * 120,
        }];
      });
    };

    spawn();
    // Spawn fast enough to maintain maxCats active — check every 500ms
    const timer = setInterval(spawn, 500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [generator, settings]);

  // Cleanup expired cats
  useEffect(() => {
    const timer = setInterval(() => {
      setFlyingCats((prev) => prev.filter((c) => Date.now() - c.startTime < c.duration + 500));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Clear all cats when reset button is pressed
  const clearSeqRef = useRef(settings.lobbyClearSeq ?? 0);
  useEffect(() => {
    const seq = settings.lobbyClearSeq ?? 0;
    if (seq > clearSeqRef.current) {
      clearSeqRef.current = seq;
      setFlyingCats([]);
    }
  }, [settings.lobbyClearSeq]);

  const chips = [
    { label: "Afterlife", value: afterlifeLabel },
    { label: "Exact Count", value: settings.exactLayerCounts ? "Yes" : "No" },
    { label: "Accessories", value: rangeStr(settings.accessoryRange) },
    { label: "Scars", value: rangeStr(settings.scarRange) },
    { label: "Torties", value: rangeStr(settings.tortieRange) },
    { label: "Base Colours", value: settings.includeBaseColours ? "On" : "Off" },
  ];

  const currentPalette = selectedPalettes[paletteIdx];

  return (
    <div className="relative" style={{ width: "1280px", height: "1080px" }}>
      {/* Settings display */}
      <div
        className="absolute"
        style={{
          left: "40px",
          top: "40px",
          width: "700px",
          background: "rgba(0,0,0,0.88)",
          borderRadius: "16px",
          border: "1px solid #27272a",
          padding: "28px 32px",
        }}
      >
        <div className="mb-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
          <span className="text-xs font-bold uppercase tracking-[0.4em] text-amber-500/60">
            Spin Settings
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {chips.map((chip) => (
            <div
              key={chip.label}
              className="flex flex-col items-center rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2.5"
            >
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                {chip.label}
              </span>
              <span className="mt-1 text-base font-bold capitalize text-white">
                {chip.value}
              </span>
            </div>
          ))}
        </div>

        {/* Palette carousel */}
        {selectedPalettes.length > 0 && (
          <div className="mt-5 border-t border-zinc-800 pt-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold text-amber-500/70">
                {currentPalette?.label ?? "Palettes"}
              </span>
              <div className="flex gap-1">
                {selectedPalettes.map((p, i) => (
                  <div
                    key={p.id}
                    className="rounded-full transition-all"
                    style={{
                      width: i === paletteIdx ? "16px" : "6px",
                      height: "6px",
                      background: i === paletteIdx ? "#f59e0b" : "#3f3f46",
                    }}
                  />
                ))}
              </div>
            </div>
            {currentPalette && (
              <div className="flex flex-wrap gap-1">
                {Object.entries(currentPalette.colors).slice(0, 32).map(([name, def]) => {
                  const rgb = def.multiply ?? [128, 128, 128];
                  return (
                    <div
                      key={name}
                      className="rounded border border-white/10"
                      style={{
                        width: "28px",
                        height: "28px",
                        backgroundColor: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`,
                      }}
                      title={name.replace(/_/g, " ")}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Flying cats — full screen, above everything */}
      <div className="absolute inset-0 z-50 overflow-hidden">
        {flyingCats.map((cat) => (
          <FlyingCatSprite key={cat.id} cat={cat} mode={lobbyMode} swapSpeed={swapSpeed} moveSpeed={moveSpeed} />
        ))}
      </div>
    </div>
  );
}

function FlyingCatSprite({ cat, mode = "fruit-ninja", swapSpeed = 1, moveSpeed = 1 }: { cat: FlyingCat; mode?: "fruit-ninja" | "matrix" | "dvd"; swapSpeed?: number; moveSpeed?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const frameRef = useRef(0);
  // DVD mode: bounce direction stored in ref
  const dvdRef = useRef({ vx: (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random()), vy: (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random()), px: cat.x * 12.8, py: Math.random() * 900 });

  useEffect(() => {
    let raf: number;
    let lastSwap = 0;
    const animate = () => {
      if (!ref.current) return;
      const now = Date.now();
      const elapsed = now - cat.startTime;
      const t = Math.min(elapsed / cat.duration, 1);

      // Frame cycling — speed controlled by swapSpeed
      const swapInterval = Math.max(200, 2000 / swapSpeed);
      if (cat.frames.length > 1 && now - lastSwap > swapInterval) {
        frameRef.current = (frameRef.current + 1) % cat.frames.length;
        if (imgRef.current) imgRef.current.src = cat.frames[frameRef.current];
        lastSwap = now;
      }

      if (mode === "matrix") {
        // Fall from top to bottom
        if (t >= 1) return;
        const yPos = t * 1200 - 120;
        const opacity = t < 0.05 ? t / 0.05 : t > 0.9 ? (1 - t) / 0.1 : 1;
        ref.current.style.left = `${cat.x}%`;
        ref.current.style.top = `${yPos}px`;
        ref.current.style.bottom = "auto";
        ref.current.style.transform = `scale(0.9)`;
        ref.current.style.opacity = String(Math.max(0, Math.min(1, opacity)));
      } else if (mode === "dvd") {
        // Bounce around — never expires
        const d = dvdRef.current;
        d.px += d.vx * 2 * moveSpeed;
        d.py += d.vy * 2 * moveSpeed;
        if (d.px <= 0 || d.px >= 1160) d.vx *= -1;
        if (d.py <= 0 || d.py >= 960) d.vy *= -1;
        d.px = Math.max(0, Math.min(1160, d.px));
        d.py = Math.max(0, Math.min(960, d.py));
        ref.current.style.left = `${d.px}px`;
        ref.current.style.top = `${d.py}px`;
        ref.current.style.bottom = "auto";
        ref.current.style.transform = "scale(0.85)";
        ref.current.style.opacity = "1";
      } else {
        // Fruit ninja — arc from bottom
        if (t >= 1) return;
        const y = -4 * cat.peakY * t * (t - 1);
        const xDrift = t * 30 * (cat.rotation > 0 ? 1 : -1);
        const opacity = t < 0.1 ? t / 0.1 : t > 0.9 ? (1 - t) / 0.1 : 1;
        ref.current.style.left = `${cat.x + xDrift}%`;
        ref.current.style.transform = `translateY(${-y}px) rotate(${cat.rotation * t}deg) scale(${0.7 + t * 0.5})`;
        ref.current.style.opacity = String(Math.max(0, Math.min(1, opacity)));
      }

      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [cat, mode]);

  return (
    <div ref={ref} className="absolute bottom-0" style={{ opacity: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={cat.frames[0]}
        alt=""
        style={{
          width: "120px",
          height: "120px",
          imageRendering: "pixelated",
          filter: [
            "drop-shadow(2px 0 0 white)",
            "drop-shadow(-2px 0 0 white)",
            "drop-shadow(0 2px 0 white)",
            "drop-shadow(0 -2px 0 white)",
          ].join(" "),
        }}
      />
    </div>
  );
}
