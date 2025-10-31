"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import {
  ArrowUpRight,
  Copy,
  Download,
  Loader2,
  Palette,
  RefreshCw,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { decodeImageFromDataUrl } from "@/lib/cat-v3/api";
import type { BatchRenderResponse } from "@/lib/cat-v3/types";
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
  usePersistentTimingConfig,
} from "../../utils/spinTiming";
// `encodeCatShare` is still defined in the legacy pipeline and gives us a
// portable payload for the old viewer and future React viewer work.
// @ts-ignore -- legacy JS module without types.
import { encodeCatShare, createCatShare } from "@/lib/catShare";

type ExtendedMode = "base" | "mood" | "bold" | "darker" | "blackout";
export type AfterlifeOption = "off" | "dark10" | "star10" | "both10" | "darkForce" | "starForce";

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
  params: Record<string, unknown>;
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
  actual: Record<ParamTimingKey, number>;
  actualTotal: number;
  timestamp: number;
}

type FetchPriority = "high" | "low" | "auto";

const MAX_LAYER_VARIATIONS = 12;
const MAX_SPINNY_VARIATIONS = Number.MAX_SAFE_INTEGER;
const MAX_SPINNY_LAYER_VARIATIONS = Number.MAX_SAFE_INTEGER;
const MAX_LAYER_VALUE = 4;
const DEFAULT_SPRITE_NUMBER = 8;
const PLACEHOLDER_COLOUR = "GINGER";
const GLOBAL_PRESETS: Array<keyof TimingPresetSet> = ["slow", "normal", "fast"];
const SUBSET_LIMIT = 20;

interface LayerRange {
  min: number;
  max: number;
}

type LayerGroup = "accessories" | "scars" | "torties";

interface LayerRowState {
  label: string;
  value: string;
  status: "idle" | "active" | "revealed";
}

interface CatState {
  params: Record<string, unknown>;
  accessorySlots: string[];
  scarSlots: string[];
  tortieSlots: (TortieSlot | null)[];
  counts: GenerationCounts;
  shareUrl?: string | null;
  catUrl?: string | null;
  builderParams?: Record<string, unknown>;
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
  actualDurations: Record<ParamTimingKey, number>,
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

interface CatGeneratorApi {
  generateRandomCat: (options?: Record<string, unknown>) => Promise<{
    params: Record<string, unknown>;
    canvas: HTMLCanvasElement | OffscreenCanvas;
  }>;
  generateCat: (params: Record<string, unknown>) => Promise<{
    canvas: HTMLCanvasElement | OffscreenCanvas;
  }>;
  buildCatURL: (params: Record<string, unknown>) => string;
  generateVariantSheet?: (
    baseParams: Record<string, unknown>,
    variants: VariantSheetRequest[],
    options?: { includeSources?: boolean; includeBase?: boolean; tileSize?: number; columns?: number }
  ) => Promise<BatchRenderResponse>;
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

const AFTERLIFE_OPTIONS: { label: string; value: AfterlifeOption; description?: string }[] = [
  { label: "Off", value: "off" },
  { label: "Dark Forest 10%", value: "dark10" },
  { label: "StarClan 10%", value: "star10" },
  { label: "Both 10%", value: "both10" },
  { label: "Always Dark Forest", value: "darkForce" },
  { label: "Always StarClan", value: "starForce" },
];

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

function cloneParams(params: Record<string, unknown>) {
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
  baseParams: Record<string, unknown>,
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
  baseParams: Record<string, unknown>,
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
          frameMode: options?.layerId ? "layer" : "composed",
          layerId: options?.layerId,
          priority: options?.priority ?? "high",
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

function getParameterRawValue(paramId: ParamId, params: Record<string, unknown>): unknown {
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

function applyParamValue(params: Record<string, unknown>, paramId: ParamId, value: unknown) {
  switch (paramId) {
    case "colour":
      params.colour = value;
      break;
    case "pelt":
      params.peltName = value;
      break;
    case "eyeColour":
      params.eyeColour = value;
      break;
    case "eyeColour2":
      params.eyeColour2 = value === "None" ? undefined : value;
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
      params.tortieMask = value;
      break;
    case "tortiePattern":
      params.tortiePattern = value;
      break;
    case "tortieColour":
      params.tortieColour = value;
      break;
    case "tint":
      params.tint = value;
      break;
    case "skinColour":
      params.skinColour = value;
      break;
    case "whitePatches":
      params.whitePatches = value === "None" ? undefined : value;
      break;
    case "points":
      params.points = value === "None" ? undefined : value;
      break;
    case "whitePatchesTint":
      params.whitePatchesTint = value === "None" ? undefined : value;
      break;
    case "vitiligo":
      params.vitiligo = value === "None" ? undefined : value;
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
      params.shading = value;
      break;
    case "reverse":
      params.reverse = value;
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

function getParameterValueForDisplay(paramId: ParamId, params: Record<string, unknown>): string {
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

function clampLayerValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_LAYER_VALUE, Math.round(value)));
}

function computeLayerCount(range: LayerRange) {
  const min = clampLayerValue(Math.min(range.min, range.max));
  const max = clampLayerValue(Math.max(range.min, range.max));
  if (min === max) {
    return min;
  }
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

interface LayerRangeSliderProps {
  label: string;
  value: LayerRange;
  onChange: (next: LayerRange) => void;
}

function LayerRangeSelector({ label, value, onChange }: LayerRangeSliderProps) {
  const summary = value.min === value.max ? `${value.min}` : `${value.min} – ${value.max}`;
  const options = useMemo(() => Array.from({ length: MAX_LAYER_VALUE + 1 }, (_, index) => index), []);

  const handleMinSelect = (nextMin: number) => {
    const clampedMin = clampLayerValue(nextMin);
    const clampedMax = clampLayerValue(value.max);
    const adjustedMax = Math.max(clampedMin, clampedMax);
    onChange({ min: clampedMin, max: adjustedMax });
  };

  const handleMaxSelect = (nextMax: number) => {
    const clampedMax = clampLayerValue(nextMax);
    const clampedMin = clampLayerValue(value.min);
    if (clampedMax < clampedMin) {
      onChange({ min: clampedMax, max: clampedMax });
    } else {
      onChange({ min: clampedMin, max: clampedMax });
    }
  };

  const renderRow = (
    type: "min" | "max",
    selectedValue: number,
    clickHandler: (next: number) => void
  ) => (
      <div className="flex items-center gap-2" role="radiogroup" aria-label={`${label} ${type}`}>
      <span className="w-10 text-[10px] uppercase tracking-wide text-muted-foreground/70">
        {type === "min" ? "Min" : "Max"}
      </span>
      <div className="flex flex-1 items-center gap-1 rounded-full border border-border/60 bg-background/70 p-1">
        {options.map((option) => {
          const isActive = selectedValue === option;
          const isDisabled = type === "max" && option < value.min;
          return (
            <button
              key={`${label}-${type}-${option}`}
              type="button"
              role="radio"
              aria-checked={isActive}
              disabled={isDisabled}
              onClick={() => clickHandler(option)}
              className={cn(
                "h-8 flex-1 rounded-md text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                isDisabled && "cursor-not-allowed opacity-40",
                !isActive && !isDisabled && "bg-background text-muted-foreground hover:bg-primary/10",
                isActive && "bg-primary text-primary-foreground shadow-inner"
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground/80">
        <span>{label}</span>
        <span className="font-mono text-muted-foreground/70">{summary}</span>
      </div>
      {renderRow("min", clampLayerValue(value.min), handleMinSelect)}
      {renderRow("max", clampLayerValue(value.max), handleMaxSelect)}
    </div>
  );
}

function resolveAfterlife(option: AfterlifeOption) {
  switch (option) {
    case "off":
      return { darkForest: false, dead: false };
    case "dark10":
      return { darkForest: Math.random() < 0.1, dead: false };
    case "star10":
      return { darkForest: false, dead: Math.random() < 0.1 };
    case "both10":
      return {
        darkForest: Math.random() < 0.1,
        dead: Math.random() < 0.1,
      };
    case "darkForce":
      return { darkForest: true, dead: false };
    case "starForce":
      return { darkForest: false, dead: true };
    default:
      return { darkForest: false, dead: false };
  }
}

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
  baseParams: Record<string, unknown>,
  overrides?: { accessory?: string | null; scar?: string | null; tortie?: TortieSlot | null }
): Record<string, unknown> {
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

type SingleCatPlusClientProps = {
  defaultMode?: "flashy" | "calm";
  defaultAccessoryRange?: LayerRange;
  defaultScarRange?: LayerRange;
  defaultTortieRange?: LayerRange;
  defaultAfterlife?: AfterlifeOption;
};

export function SingleCatPlusClient({
  defaultMode = "flashy",
  defaultAccessoryRange = { min: 1, max: 4 },
  defaultScarRange = { min: 1, max: 1 },
  defaultTortieRange = { min: 1, max: 4 },
  defaultAfterlife = "dark10",
}: SingleCatPlusClientProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const generatorRef = useRef<CatGeneratorApi | null>(null);
  const mapperRef = useRef<SpriteMapperApi | null>(null);
  const parameterOptionsRef = useRef<ParameterOptions | null>(null);
  const catStateRef = useRef<CatState | null>(null);
  const generationIdRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);

  const [initializing, setInitializing] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<"flashy" | "calm">(defaultMode);
  const [accessoryRange, setAccessoryRange] = useState<LayerRange>(defaultAccessoryRange);
  const [scarRange, setScarRange] = useState<LayerRange>(defaultScarRange);
  const [tortieRange, setTortieRange] = useState<LayerRange>(defaultTortieRange);
  const [timingConfig, setTimingConfig] = usePersistentTimingConfig();
  const [timingModalOpen, setTimingModalOpen] = useState(false);
  const [lastTimingSnapshot, setLastTimingSnapshot] = useState<TimingSnapshot | null>(null);
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
  const optionCountsRef = useRef<Record<ParamTimingKey, number>>(Object.fromEntries(
    PARAM_TIMING_ORDER.map((key) => [key, PARAM_DEFAULT_STEP_COUNTS[key] ?? 0])
  ) as Record<ParamTimingKey, number>);
  const actualDurationsRef = useRef<Record<ParamTimingKey, number>>({});
  const totalActualRef = useRef(0);
  const modeRef = useRef(mode);
  const [optionCounts, setOptionCounts] = useState<Record<ParamTimingKey, number>>(optionCountsRef.current);
  useEffect(() => {
    optionCountsRef.current = optionCounts;
  }, [optionCounts]);

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
  const [afterlifeMode, setAfterlifeMode] = useState<AfterlifeOption>(defaultAfterlife);
  const [includeBaseColours, setIncludeBaseColours] = useState(true);
  const [extendedModes, setExtendedModes] = useState<Set<ExtendedMode>>(() => new Set());

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
  const [catNameDraft, setCatNameDraft] = useState("");
  const [creatorNameDraft, setCreatorNameDraft] = useState("");
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaDirty, setMetaDirty] = useState(false);

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

  const createMapper = useMutation(api.mapper.create);
  const updateMapperMeta = useMutation(api.mapper.updateMeta);

  const extendedModesArray = useMemo(() => Array.from(extendedModes), [extendedModes]);

  const resetMetaDrafts = useCallback((catName?: string | null, creatorName?: string | null) => {
    setCatNameDraft(catName ?? "");
    setCreatorNameDraft(creatorName ?? "");
    setMetaDirty(false);
  }, []);

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
    return {
      mode: modeRef.current,
      spinny: modeRef.current === "flashy",
      speed: {
        ...baseSpeed,
        paramPause: flashyPauseMs,
        calmParamPause: calmPauseMs,
      },
    };
  }, [calmPauseMs, effectiveTotalMs, flashyPauseMs]);


  const clearMirror = useCallback(() => {}, []);

  const detectGlobalPreset = useCallback(() => {
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

  const [activeGlobalPreset, setActiveGlobalPreset] = useState<ReturnType<typeof detectGlobalPreset>>(detectGlobalPreset);

  useEffect(() => {
    setActiveGlobalPreset(detectGlobalPreset());
  }, [detectGlobalPreset]);

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
      setActiveGlobalPreset(preset);
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
      setActiveGlobalPreset("custom");
    },
    [setTimingConfig, setActiveGlobalPreset, timingConfig]
  );

  const handlePauseChange = useCallback(
    (kind: "flashyMs" | "calmMs", seconds: number) => {
      if (!Number.isFinite(seconds)) return;
      const clampedSeconds = Math.min(10, Math.max(1, seconds));
      const nextMs = Math.round(clampedSeconds * 1000);
      setTimingConfig({
        ...timingConfig,
        pauseDelays: {
          ...(timingConfig.pauseDelays ?? {}),
          [kind]: nextMs,
        },
      });
      setActiveGlobalPreset("custom");
    },
    [setActiveGlobalPreset, setTimingConfig, timingConfig]
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
      setActiveGlobalPreset("custom");
    },
    [setActiveGlobalPreset, setTimingConfig, subsetLimits, timingConfig]
  );

  const handleResetTimings = useCallback(() => {
    setTimingConfig({
      ...timingConfig,
      allowFastFlips: DEFAULT_TIMING_CONFIG.allowFastFlips,
      delays: { ...DEFAULT_TIMING_CONFIG.delays },
      subsetLimits: { ...DEFAULT_TIMING_CONFIG.subsetLimits },
      pauseDelays: { ...DEFAULT_TIMING_CONFIG.pauseDelays },
    });
    setActiveGlobalPreset("normal");
  }, [setActiveGlobalPreset, setTimingConfig, timingConfig]);

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
    async (params: Record<string, unknown>) => {
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
      progressiveParams: Record<string, unknown>,
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
          const accessoryDelay = getDelayForKey(timingConfig, "accessory");
          const stepDurations = computeStepDurations(sequence, accessoryDelay, timingConfig.allowFastFlips);

          for (let idx = 0; idx < sequence.length; idx += 1) {
            const step = sequence[idx];
            if (generationIdRef.current !== currentToken) return;
            const frameDisplay = step.frame.option.display;
            setRollerActiveValue(frameDisplay);
            updateLayerRow("accessories", i, {
              value: frameDisplay,
              status: step.isFinal ? "revealed" : "active",
            });

            const drawStep = () => drawCanvas(step.frame.canvas);
            const stepState = readSpinState();
            await playFlip(drawStep, stepDurations[idx]);
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
      playFlip,
      renderCat,
      settleRoller,
      subsetLimits,
      timingConfig,
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
      progressiveParams: Record<string, unknown>,
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
          const scarDelay = getDelayForKey(timingConfig, "scar");
          const stepDurations = computeStepDurations(sequence, scarDelay, timingConfig.allowFastFlips);

          for (let idx = 0; idx < sequence.length; idx += 1) {
            const step = sequence[idx];
            if (generationIdRef.current !== currentToken) return;
            const frameDisplay = step.frame.option.display;
            setRollerActiveValue(frameDisplay);
            updateLayerRow("scars", i, {
              value: frameDisplay,
              status: step.isFinal ? "revealed" : "active",
            });

            const drawStep = () => drawCanvas(step.frame.canvas);
            const stepState = readSpinState();
            await playFlip(drawStep, stepDurations[idx]);
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
      playFlip,
      renderCat,
      settleRoller,
      subsetLimits,
      timingConfig,
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
      progressiveParams: Record<string, unknown>,
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
          let working: TortieSlot = { ...target };
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
              stage.kind === "mask" ? working.mask : stage.kind === "pattern" ? working.pattern : working.colour;
            const options = buildLayerOptionStrings(stage.source, stageTargetValue, false, {
              spinny: true,
              limit: subsetLimits[stageKey] ? SUBSET_LIMIT : undefined,
            });
            const descriptors: VariantDescriptor[] = options.map((option, variantIndex) => {
              const preview = cloneParams(progressiveParams);
              const candidateLayer: TortieSlot = {
                mask: stage.kind === "mask" ? (option.raw as string) : working.mask,
                pattern: stage.kind === "pattern" ? (option.raw as string) : working.pattern,
                colour: stage.kind === "colour" ? (option.raw as string) : working.colour,
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
            const stageDelay = getDelayForKey(timingConfig, stageKey);
            const stageDurations = computeStepDurations(sequence, stageDelay, timingConfig.allowFastFlips);

            for (let idx = 0; idx < sequence.length; idx += 1) {
              const step = sequence[idx];
              if (generationIdRef.current !== currentToken) return;
              const candidateLayer: TortieSlot = {
                mask: stage.kind === "mask" ? (step.frame.option.raw as string) : working.mask,
                pattern: stage.kind === "pattern" ? (step.frame.option.raw as string) : working.pattern,
                colour: stage.kind === "colour" ? (step.frame.option.raw as string) : working.colour,
              };

              const drawStep = () => drawCanvas(step.frame.canvas);
              await playFlip(drawStep, stageDurations[idx]);
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
      playFlip,
      renderCat,
      settleRoller,
      subsetLimits,
      timingConfig,
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

      const randomResult = await generator.generateRandomCat({
        accessoryCount,
        scarCount,
        tortieCount,
        experimentalColourMode: experimentalMode,
        whitePatchColourMode: "default",
        includeBaseColours,
      });

      if (generationIdRef.current !== token) return;

      const params = {
        ...randomResult.params,
      } as Record<string, unknown>;
      if (!params.colour) {
        params.colour = PLACEHOLDER_COLOUR;
      }

      // Re-run per-slot logic to mirror legacy behaviour.
      const accessoriesAll = invokeMapperArray(mapper, mapper.getAccessories).filter(
        (entry: string) => entry && entry !== "none"
      );
      const scarsAll = invokeMapperArray(mapper, mapper.getScars).filter(
        (entry: string) => entry && entry !== "none"
      );
      const tortieMasksAll = invokeMapperArray(mapper, mapper.getTortieMasks);
      const tortiePeltsAll = invokeMapperArray(mapper, mapper.getPeltNames);
      const coloursAll = parameterOptionsRef.current?.colour ?? invokeMapperArray(mapper, mapper.getColours);

      const accessorySlots: string[] = [];
      for (let i = 0; i < accessoryCount; i += 1) {
        const include = Math.random() <= 0.5;
        if (include && accessoriesAll.length > 0) {
          accessorySlots.push(randomFrom(accessoriesAll));
        } else {
          accessorySlots.push("none");
        }
      }
      params.accessories = accessorySlots.filter((entry) => entry && entry !== "none");
      params.accessory = (params.accessories as string[])[0];

      const scarSlots: string[] = [];
      for (let i = 0; i < scarCount; i += 1) {
        const include = Math.random() <= 0.5;
        if (include && scarsAll.length > 0) {
          scarSlots.push(randomFrom(scarsAll));
        } else {
          scarSlots.push("none");
        }
      }
      params.scars = scarSlots.filter((entry) => entry && entry !== "none");
      params.scar = (params.scars as string[])[0];

      const tortieSlots: (TortieSlot | null)[] = [];
      for (let i = 0; i < tortieCount; i += 1) {
        const include = Math.random() <= 0.5;
        if (include && tortieMasksAll.length > 0) {
          const mask = randomFrom(tortieMasksAll);
          const pattern = randomFrom(tortiePeltsAll);
          const colour = coloursAll.length > 0 ? randomFrom(coloursAll) : "GINGER";
          tortieSlots.push({ mask, pattern, colour });
        } else {
          tortieSlots.push(null);
        }
      }
      const tortieLayers = tortieSlots.filter(Boolean) as TortieSlot[];
      params.tortie = tortieLayers;
      params.isTortie = tortieLayers.length > 0;
      if (tortieLayers.length > 0) {
        params.tortieMask = tortieLayers[0].mask;
        params.tortiePattern = tortieLayers[0].pattern;
        params.tortieColour = tortieLayers[0].colour;
      } else {
        params.tortieMask = undefined;
        params.tortiePattern = undefined;
        params.tortieColour = undefined;
      }

      resetLayerRows(accessorySlots, scarSlots, tortieSlots);

      const { darkForest: enableDarkForest, dead: enableDead } = resolveAfterlife(afterlifeMode);
      params.darkForest = enableDarkForest;
      params.darkMode = enableDarkForest;
      params.dead = enableDead;

      const countsResult: GenerationCounts = {
        accessories: accessoryCount,
        scars: scarCount,
        tortie: tortieCount,
      };

      setRollSummary(
        `Rolled → Accessories: ${accessoryCount} • Scars: ${scarCount} • Tortie layers: ${tortieCount}`
      );
      setHasTint(Boolean(enableDarkForest || enableDead));
      setSpriteGalleryOpen(false);

      const uniqueAccessories = Array.from(
        new Set(accessorySlots.filter((entry): entry is string => typeof entry === "string" && entry !== "none"))
      );
      const uniqueScars = Array.from(
        new Set(scarSlots.filter((entry): entry is string => typeof entry === "string" && entry !== "none"))
      );
      const tortieChoices = tortieLayers.length ? tortieLayers : [];

      const progressiveParams: Record<string, unknown> = {
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
        const pauseDuration = Math.max(
          PARAM_REVEAL_PAUSE,
          modeRef.current === "calm"
            ? currentSpeedSetting.calmParamPause
            : currentSpeedSetting.paramPause
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
            variationOptions,
            contextForApply
          );
          const sequence = buildFlipSequence(frames);
          const configuredDelay = paramKey ? getDelayForKey(timingConfig, paramKey) : MIN_SAFE_STEP_MS;
          const stepDurations = computeStepDurations(sequence, configuredDelay, timingConfig.allowFastFlips);

          for (let idx = 0; idx < sequence.length; idx += 1) {
            const step = sequence[idx];
            if (generationIdRef.current !== token) return;
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
            await playFlip(drawStep, stepDurations[idx]);
            if (!stepState.spinny) {
              break;
            }
          }

          const finalFrame = frames[frames.length - 1];
          if (finalFrame) {
            drawCanvas(finalFrame.canvas);
          }
          applyParamValue(progressiveParams, definition.id, finalFrame.option.raw, contextForApply);
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
          applyParamValue(progressiveParams, definition.id, rawTargetValue, contextForApply);
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
      builderParams.sprite = DEFAULT_SPRITE_NUMBER;

      const catUrl = generator.buildCatURL(builderParams);

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
    playFlip,
    clearMirror,
    drawPlaceholder,
    settleRoller,
    readSpinState,
    createMapper,
    resetMetaDrafts,
    timingConfig,
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

  return (
    <div className="grid gap-10">
      <div className="glass-card px-6 py-8">
        <div className="mb-8 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,420px)] xl:items-start">
          <div className="flex flex-col gap-6">
            <div className="relative flex flex-col items-center gap-4">
              <div className="flip-container w-full max-w-[700px]">
                <div className="rounded-3xl border border-border/50 bg-background/90 p-6 shadow-inner">
                  <canvas
                    ref={canvasRef}
                    width={DISPLAY_SIZE}
                    height={DISPLAY_SIZE}
                    onClick={handleCanvasClick}
                    className="w-full"
                  />
                </div>
              </div>
              {initializing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl bg-background/70">
                  <Loader2 className="mb-2 size-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Loading renderer
                  </p>
                </div>
              )}
            </div>

            <div className="mx-auto w-full max-w-[700px] rounded-2xl border border-border/40 bg-background/70 p-4 shadow-inner">
              <div className="text-center text-xs uppercase tracking-[0.32em] text-muted-foreground/80">
                {rollerLabel ?? "Ready"}
              </div>
              <div
                className={cn(
                  "overflow-hidden transition-all duration-300",
                  rollerExpanded
                    ? "mt-3 max-h-40 opacity-100"
                    : "max-h-0 opacity-0"
                )}
              >
                <div
                  className={cn(
                    "relative h-24 overflow-hidden rounded-xl bg-gradient-to-b from-background/40 via-background/20 to-background/5 transition",
                    rollerHighlight && "roller-flash ring-2 ring-primary/30"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-full items-center justify-center font-semibold transition",
                      rollerActiveValue ? "text-primary" : "text-muted-foreground/40",
                      rollerHighlight && "text-primary",
                      rollerValueClass
                    )}
                  >
                    {rollerActiveValue ?? "—"}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:translate-y-0.5 hover:opacity-90"
                onClick={generateCatPlus}
                disabled={generationDisabled || isGenerating}
              >
                <RefreshCw className="size-4" />
                {initializing ? "Loading" : isGenerating ? "Rolling..." : "Generate Cat"}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-border/60 px-5 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background"
                onClick={handleDownload}
                disabled={initializing}
              >
                <Download className="size-4" />
                Download PNG
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-border/60 px-5 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background"
                onClick={() => exportCat()}
                disabled={initializing}
              >
                <Copy className="size-4" />
                Copy 700×700
              </button>
              {hasTint && (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-border/60 px-5 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background"
                  onClick={() => exportCat({ noTint: true })}
                  disabled={initializing}
                  title="Shift+click the canvas for a shortcut"
                >
                  <Copy className="size-4" />
                  Copy (No Tint)
                </button>
              )}
            </div>

            {rollSummary && (
              <div className="rounded-2xl border border-border/40 bg-background/60 px-4 py-3 text-sm text-muted-foreground">
                {rollSummary}
              </div>
            )}

            <div className="rounded-2xl border border-border/40 bg-background/60 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">Parameter Reveal</h3>
                <div className="flex min-h-[1.5rem] items-center gap-2 text-xs text-muted-foreground">
                  {rollerActiveValue ? (
                    <>
                      <Sparkles className="size-3" />
                      <span className="font-mono uppercase tracking-wide text-primary">
                        {rollerActiveValue}
                      </span>
                    </>
                  ) : (
                    <span className="font-mono text-muted-foreground/60">Ready</span>
                  )}
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {paramRows.length === 0 && (
                  <p className="text-sm text-muted-foreground">Roll a cat to reveal traits one by one.</p>
                )}
                {paramRows.map((row) => (
                  <div
                    key={row.id}
                    className={`flex items-center justify-between rounded-xl border border-border/30 px-3 py-2 text-sm transition ${
                      row.status === "active" || activeParamId === row.id
                        ? "bg-primary/10 text-foreground"
                        : "bg-background/70 text-muted-foreground"
                    }`}
                  >
                    <span className="font-medium text-foreground/90">{row.label}</span>
                    <span className="font-mono text-xs uppercase tracking-wide text-foreground">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border/40 bg-background/60 p-4 text-sm text-muted-foreground">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Layered Details</h3>
              <div className="grid gap-3 md:grid-cols-3">
                {(Object.keys(layerGroupLabels) as LayerGroup[]).map((group) => {
                  const rows = layerRows[group];
                  return (
                    <div key={group} className="space-y-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
                        {layerGroupLabels[group]}
                      </p>
                      {rows.length ? (
                        <ul className="space-y-2">
                          {rows.map((row, index) => (
                            <li
                              key={`${group}-${index}`}
                              className={cn(
                                "rounded-xl border px-3 py-2 transition",
                                row.status === "active"
                                  ? "border-primary/60 bg-primary/10 text-primary"
                                  : row.status === "revealed"
                                  ? "border-border/40 text-foreground"
                                  : "border-border/20 text-muted-foreground"
                              )}
                            >
                              <span className="block text-[0.65rem] uppercase tracking-wide text-muted-foreground/70">
                                {row.label}
                              </span>
                              <span className="block font-mono text-sm text-foreground">{row.value}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted-foreground/60">None rolled</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-border/40 bg-background/60 p-4">
              <h3 className="text-sm font-semibold text-foreground">Links & Actions</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background"
                  onClick={handleCopyShareLink}
                  disabled={!catStateRef.current}
                >
                  <Share2 className="size-4" /> Copy Share Link
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background"
                  onClick={handleOpenShareViewer}
                  disabled={!catStateRef.current}
                >
                  <Sparkles className="size-4" /> Open Share Viewer
                </button>
              </div>
              <div className="mt-4 grid gap-3 rounded-xl border border-border/40 bg-background/50 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground/80">History Entry</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-muted-foreground/70">
                    <span>Cat Name</span>
                    <input
                      type="text"
                      value={catNameDraft}
                      onChange={(event) => {
                        setCatNameDraft(event.target.value);
                        setMetaDirty(true);
                      }}
                      placeholder="Optional"
                      className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-muted-foreground/70">
                    <span>Your Name</span>
                    <input
                      type="text"
                      value={creatorNameDraft}
                      onChange={(event) => {
                        setCreatorNameDraft(event.target.value);
                        setMetaDirty(true);
                      }}
                      placeholder="Optional"
                      className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background disabled:opacity-50"
                    onClick={handleSaveMeta}
                    disabled={saveHistoryDisabled}
                  >
                    <Sparkles className="size-4" /> Save to History
                  </button>
                  <Link
                    href="/history"
                    className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background"
                  >
                    Browse History
                  </Link>
                  {viewerSlug && (
                    <Link
                      href={`/view/${viewerSlug}`}
                      className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background"
                    >
                      <ArrowUpRight className="size-4" /> View Entry
                    </Link>
                  )}
                </div>
              </div>
              {shareLink && (
                <p className="mt-3 truncate text-xs text-muted-foreground">
                  Latest share: <span className="text-foreground">{shareLink}</span>
                </p>
              )}
            </div>
          </div>

          <aside className="rounded-2xl border border-border/40 bg-background/60 p-5">
            <h3 className="text-sm font-semibold text-foreground">Controls</h3>
            <div className="mt-4 space-y-6 text-sm text-muted-foreground">
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground/80">Generation Mode</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("flashy")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                      mode === "flashy"
                        ? "border-primary/60 bg-primary/15 text-foreground"
                        : "border-border/60 bg-background/70"
                    }`}
                  >
                    Flashy
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("calm")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                      mode === "calm"
                        ? "border-primary/60 bg-primary/15 text-foreground"
                        : "border-border/60 bg-background/70"
                    }`}
                  >
                    Calm
                  </button>
                </div>
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground/80">Timing</p>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => setTimingModalOpen(true)}
                      className="inline-flex items-center gap-2 rounded-full border border-border/60 px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
                    >
                      Adjust Timing Settings
                    </button>
                    <span className="text-xs text-muted-foreground/70">
                      Estimated total: {formatMs(effectiveTotalMs)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground/80">Layer Counts</p>
                <LayerRangeSelector label="Accessories" value={accessoryRange} onChange={setAccessoryRange} />
                <LayerRangeSelector label="Scars" value={scarRange} onChange={setScarRange} />
                <LayerRangeSelector label="Tortie Layers" value={tortieRange} onChange={setTortieRange} />
              </div>

              <div className="space-y-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground/80">Afterlife Effects</p>
                <label className="flex flex-col gap-1 text-xs">
                  <span>Dark Forest / StarClan chance</span>
                  <select
                    value={afterlifeMode}
                    onChange={(event) => setAfterlifeMode(event.target.value as AfterlifeOption)}
                    className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  >
                    {AFTERLIFE_OPTIONS.map((option) => (
                      <option key={`afterlife-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="space-y-3">
                <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground/80">
                  <Palette className="size-3" /> Colour Palettes
                </p>
                <div className="flex flex-wrap gap-2">
                  {(["base", "mood", "bold", "darker", "blackout"] as ExtendedMode[]).map((modeKey) => {
                    const active =
                      modeKey === "base" ? includeBaseColours : extendedModes.has(modeKey);
                    return (
                      <button
                        key={modeKey}
                        type="button"
                        onClick={() => handleToggleExtended(modeKey)}
                        className={`rounded-full border px-4 py-1 text-xs font-semibold transition ${
                          active
                            ? "border-primary/60 bg-primary/20 text-foreground"
                            : "border-border/60 bg-background/70"
                        }`}
                      >
                        {modeKey === "base" ? "Base" : modeKey.charAt(0).toUpperCase() + modeKey.slice(1)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>
        </div>

        {error && (
          <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        )}
        {initialError && (
          <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {initialError}
          </p>
        )}
      </div>

      <div className="glass-card px-6 py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Sprite Tools</h3>
            <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
              {spriteToolsSubtitle}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => handleCopySprite(currentSpriteNumber, 120)}
              disabled={!canCopySprite}
            >
              Copy 120×120
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => handleCopySprite(currentSpriteNumber, FULL_EXPORT_SIZE)}
              disabled={!canCopySprite}
            >
              Copy 700×700
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => setSpriteGalleryOpen(true)}
              disabled={spriteVariations.length === 0}
            >
              View Sprite Gallery
            </button>
          </div>
        </div>
      </div>

      {spriteGalleryOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6 py-10"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSpriteGalleryOpen(false);
            }
          }}
        >
          <div className="relative w-full max-w-5xl rounded-3xl border border-border/40 bg-background/95 p-8 shadow-2xl">
            <button
              type="button"
              onClick={() => setSpriteGalleryOpen(false)}
              aria-label="Close sprite gallery"
              className="absolute right-4 top-4 rounded-full border border-border/60 bg-background/80 p-1.5 text-muted-foreground transition hover:bg-foreground hover:text-background"
            >
              <X className="size-4" />
            </button>
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Sprite Gallery</h2>
                <p className="text-sm text-muted-foreground">
                  Browse every sprite rendered for this cat and copy quick exports.
                </p>
              </div>
              {spriteVariations.length === 0 ? (
                <div className="rounded-2xl border border-border/40 bg-background/70 p-6 text-sm text-muted-foreground">
                  Roll a cat to generate sprite previews.
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {spriteVariations.map((variation) => (
                    <div
                      key={variation.spriteNumber}
                      className="rounded-2xl border border-border/40 bg-background/70 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">{variation.name}</p>
                        <span className="text-xs text-muted-foreground">#{variation.spriteNumber}</span>
                      </div>
                      <div className="mt-3 overflow-hidden rounded-xl border border-border/30 bg-background/80">
                        <Image
                          src={variation.dataUrl}
                          alt={variation.name}
                          width={120}
                          height={120}
                          unoptimized
                          className="mx-auto block h-28 w-28 image-render-pixel"
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="flex-1 rounded-lg border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background"
                          onClick={() => handleCopySprite(variation.spriteNumber, 120)}
                        >
                          Copy 120×120
                        </button>
                        <button
                          type="button"
                          className="flex-1 rounded-lg border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background"
                          onClick={() => handleCopySprite(variation.spriteNumber, FULL_EXPORT_SIZE)}
                        >
                          Copy 700×700
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {timingModalOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 py-10"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setTimingModalOpen(false);
            }
          }}
        >
          <div className="relative w-full max-w-5xl rounded-3xl border border-border/40 bg-background/95 shadow-2xl">
            <button
              type="button"
              onClick={() => setTimingModalOpen(false)}
              className="absolute right-4 top-4 rounded-full border border-border/50 bg-background/80 p-1.5 text-muted-foreground transition hover:bg-foreground hover:text-background"
              aria-label="Close timing settings"
            >
              <X className="size-4" />
            </button>
            <div className="max-h-[80vh] overflow-y-auto px-6 pb-8 pt-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Spin Timing</h2>
                  <p className="text-sm text-muted-foreground">
                    Tune per-parameter delays for flashy rolls. Estimated totals update instantly; actuals are logged after each roll.
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 text-xs text-muted-foreground/80">
                  <span className="rounded-full border border-border/50 bg-background/80 px-3 py-1 font-mono text-foreground">
                    Estimated total: {formatMs(estimatedTotals.total)}
                  </span>
                  {lastTimingSnapshot && (
                    <span className="rounded-full border border-border/50 bg-background/80 px-3 py-1 font-mono text-muted-foreground">
                      Last roll: {formatMs(lastTimingSnapshot.actualTotal)}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                {GLOBAL_PRESETS.map((preset) => {
                  const label = preset === "slow" ? "Slow" : preset === "fast" ? "Fast" : "Normal";
                  const active = activeGlobalPreset === preset;
                  return (
                    <button
                      key={`preset-${preset}`}
                      type="button"
                      onClick={() => handleGlobalPreset(preset)}
                      className={cn(
                        "rounded-full border px-4 py-1.5 text-xs font-semibold transition",
                        active
                          ? "border-primary/60 bg-primary/20 text-foreground"
                          : "border-border/60 bg-background/70 text-muted-foreground"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={handleResetTimings}
                  className="ml-auto rounded-full border border-border/60 bg-background/70 px-4 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
                >
                  Reset to Default
                </button>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground/80">
                  <span>Flashy pause</span>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={10}
                      step={0.1}
                      value={flashyPauseSeconds}
                      onChange={(event) => handlePauseChange("flashyMs", Number.parseFloat(event.target.value))}
                      className="h-2 flex-1 rounded-full bg-border/60 accent-primary"
                    />
                    <span className="w-12 text-right font-mono text-sm text-foreground">
                      {flashyPauseSeconds.toFixed(1)} s
                    </span>
                  </div>
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground/80">
                  <span>Calm pause</span>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={10}
                      step={0.1}
                      value={calmPauseSeconds}
                      onChange={(event) => handlePauseChange("calmMs", Number.parseFloat(event.target.value))}
                      className="h-2 flex-1 rounded-full bg-border/60 accent-primary"
                    />
                    <span className="w-12 text-right font-mono text-sm text-foreground">
                      {calmPauseSeconds.toFixed(1)} s
                    </span>
                  </div>
                </label>
              </div>

              <div className="mt-4 grid gap-2 text-xs text-muted-foreground/80 sm:grid-cols-2">
                <span className="rounded-xl border border-border/40 bg-background/70 px-3 py-2">
                  Flashy pause: <strong className="ml-1 font-mono text-foreground">{formatMs(flashyPauseMs)}</strong>
                </span>
                <span className="rounded-xl border border-border/40 bg-background/70 px-3 py-2">
                  Calm pause: <strong className="ml-1 font-mono text-foreground">{formatMs(calmPauseMs)}</strong>
                </span>
              </div>

              <div className="mt-6 overflow-hidden rounded-2xl border border-border/40">
                <div className="grid grid-cols-[minmax(0,1.6fr)_100px_80px_110px_110px] gap-3 border-b border-border/40 bg-background/70 px-4 py-3 text-[0.65rem] uppercase tracking-wide text-muted-foreground/70">
                  <span>Parameter</span>
                  <span className="text-right">Delay (ms)</span>
                  <span className="text-right">Options</span>
                  <span className="text-right">Estimated</span>
                  <span className="text-right">Last Actual</span>
                </div>
                {PARAM_TIMING_ORDER.map((key) => {
                  const label = PARAM_TIMING_LABELS[key] ?? key;
                  const storedDelay = timingConfig.delays[key];
                  const delayInputValue = Number.isFinite(storedDelay)
                    ? (storedDelay as number)
                    : getPresetValues(key).normal;
                  const rawOptions = optionCounts[key] ?? PARAM_DEFAULT_STEP_COUNTS[key] ?? 0;
                  const subsetEligible = rawOptions > SUBSET_LIMIT;
                  const subsetEnabled = Boolean(subsetLimits[key]);
                  const effectiveOptions = adjustedOptionCounts[key] ?? rawOptions;
                  const delayForEstimate = delayInputValue;
                  const estimatedDuration = estimatedTotals.perKey[key] ?? delayForEstimate * effectiveOptions;
                  const actualDuration = lastTimingSnapshot?.actual?.[key] ?? 0;
                  const hasActual = actualDuration > 0;
                  return (
                    <div
                      key={`timing-row-${key}`}
                      className="grid grid-cols-[minmax(0,1.6fr)_100px_80px_110px_110px] items-center gap-3 border-b border-border/30 px-4 py-3 last:border-b-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">{label}</p>
                        {subsetEligible ? (
                          <button
                            type="button"
                            onClick={() => toggleSubsetLimit(key)}
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition",
                              subsetEnabled
                                ? "border-primary/60 bg-primary/20 text-foreground"
                                : "border-border/60 bg-background/70 text-muted-foreground"
                            )}
                          >
                            {subsetEnabled ? "Subset 20" : "All"}
                          </button>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <input
                          type="number"
                          inputMode="numeric"
                          value={delayInputValue}
                          onChange={(event) => {
                            const next = Number.parseFloat(event.target.value);
                            if (Number.isFinite(next)) {
                              handleTimingStepChange(key, next);
                            }
                          }}
                          className="w-full rounded-lg border border-border/50 bg-background/80 px-2 py-1 text-right font-mono text-xs text-foreground focus:border-primary focus:outline-none"
                        />
                      </div>
                      <div className="text-right font-mono text-sm text-foreground">
                        {subsetEnabled && subsetEligible ? `${effectiveOptions}/${rawOptions}` : effectiveOptions}
                      </div>
                      <div className="text-right font-mono text-sm text-muted-foreground">{formatMs(estimatedDuration)}</div>
                      <div className="text-right font-mono text-sm text-muted-foreground">
                        {hasActual ? formatMs(actualDuration) : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="mt-4 text-xs text-muted-foreground/70">
                Minimum delay is {MIN_SAFE_STEP_MS}ms. Console logs include a full breakdown after each roll.
              </p>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-full border border-border/40 bg-background/90 px-4 py-2 text-sm text-foreground shadow-lg shadow-primary/10">
          {toast}
        </div>
      )}
    </div>
  );
}
