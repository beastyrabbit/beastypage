/**
 * Module-level support for the OBS spin overlay: shared types, constants,
 * and pure helpers extracted verbatim from OBSSpinClient.tsx (which was
 * forked from SingleCatPlusClient.tsx). No React in here.
 */

import type { CatGeneratorApi } from "@/components/cat-builder/types";
import { decodeImageFromDataUrl } from "@/lib/cat-v3/api";
import {
  applyCoatChoice,
  getCoatChoiceValue,
  getCoatChoiceValues,
  getCoatPatternName,
} from "@/lib/cat-v3/coatPatterns";
import {
  formatPoseName,
  getRandomSelectablePoseNames,
} from "@/lib/cat-v3/poseOptions";
import { getRandomAccessoryPool } from "@/lib/cat-v3/randomAccessories";
import type { CatParams } from "@/lib/cat-v3/types";
import {
  CLASSIC_WHEEL_PRIZES,
  type ClassicWheelSelection,
  type StreamWheelSpin,
} from "@/lib/wheel/classicWheel";
import type {
  ExtendedMode,
  SingleCatSettings,
} from "@/utils/singleCatVariants";
import {
  ABSOLUTE_MIN_STEP_MS,
  clampDelay,
  getDelayForKey,
  MIN_SAFE_STEP_MS,
  PARAM_DEFAULT_STEP_COUNTS,
  PARAM_TIMING_LABELS,
  PARAM_TIMING_ORDER,
  type ParamTimingKey,
  type SpinTimingConfig,
  type TimingPresetSet,
} from "@/utils/spinTiming";

// OBS stubs — functions referenced by the spin logic but not needed for overlay
export const track = (..._args: unknown[]) => {};
export const encodeCatShare = (..._args: unknown[]) => "";
export const createCatShare = async (
  ..._args: unknown[]
): Promise<{ slug: string; id: string; shareToken?: string }> => ({
  slug: "",
  id: "",
});
export type SingleCatPortableSettings = SingleCatSettings;
export type Id<T extends string> = string & { __tableName: T };

export interface TortieSlot {
  mask: string;
  pattern: string;
  colour: string;
}

export interface GenerationCounts {
  accessories: number;
  scars: number;
  tortie: number;
}

export interface ParamRow {
  id: ParamId;
  label: string;
  value: string;
  status: "pending" | "active" | "revealed";
}

/** Param IDs that map to layer-panel rows rather than the main param board. */
export const LAYER_PARAM_IDS = new Set([
  "accessory",
  "scar",
  "tortie",
  "tortieMask",
  "tortiePattern",
  "tortieColour",
]);

export interface VariationOption {
  raw: unknown;
  display: string;
}

export interface VariationFrame {
  option: VariationOption;
  canvas: HTMLCanvasElement;
}

export interface VariantSheetRequest {
  id: string;
  params: Partial<CatParams>;
  label?: string;
  group?: string;
}

export interface VariantDescriptor extends VariantSheetRequest {
  option: VariationOption;
}

export interface TimingSnapshot {
  counts: Record<ParamTimingKey, number>;
  estimated: Partial<Record<ParamTimingKey, number>>;
  estimatedTotal: number;
  actual: Partial<Record<ParamTimingKey, number>>;
  actualTotal: number;
  timestamp: number;
}

export type FetchPriority = "high" | "low" | "auto";

export const MAX_LAYER_VARIATIONS = 12;
export const MAX_SPINNY_VARIATIONS = Number.MAX_SAFE_INTEGER;
export const MAX_SPINNY_LAYER_VARIATIONS = Number.MAX_SAFE_INTEGER;
export const DEFAULT_SPRITE_NUMBER = 8;
export const PLACEHOLDER_COLOUR = "GINGER";
export const GLOBAL_PRESETS: Array<keyof TimingPresetSet> = [
  "slow",
  "normal",
  "fast",
];
export const SUBSET_LIMIT = 20;

export type LayerGroup = "accessories" | "scars" | "torties";

export interface LayerRowState {
  label: string;
  value: string;
  status: "idle" | "active" | "revealed";
}

export interface CatState {
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

export interface WheelRewardState {
  status: "hidden" | "spinning" | "settled";
  prize: StreamWheelSpin | null;
}

export interface ParameterOptions {
  sprite: (number | string)[];
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

export function countOptions(
  list: unknown[] | undefined,
  { includeNone = false }: { includeNone?: boolean } = {},
) {
  if (!Array.isArray(list)) return 0;
  const normalized = list
    .filter(
      (value) =>
        value !== undefined &&
        value !== null &&
        (includeNone || value !== "none"),
    )
    .map((value) =>
      typeof value === "string" || typeof value === "number"
        ? String(value)
        : JSON.stringify(value),
    );
  return new Set(normalized).size;
}

export function deriveOptionCounts(
  options: ParameterOptions | null,
): Record<ParamTimingKey, number> {
  const counts: Record<ParamTimingKey, number> = Object.fromEntries(
    PARAM_TIMING_ORDER.map((key) => [key, PARAM_DEFAULT_STEP_COUNTS[key] ?? 0]),
  ) as Record<ParamTimingKey, number>;
  if (!options) return counts;

  const assign = (
    key: ParamTimingKey,
    list: unknown[] | undefined,
    opts?: { includeNone?: boolean },
  ) => {
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

export function logTimingReport(
  context: string,
  profile: SpinTimingConfig,
  optionCounts: Record<ParamTimingKey, number>,
  estimatedTotals: {
    perKey: Partial<Record<ParamTimingKey, number>>;
    total: number;
  },
  actualDurations: Partial<Record<ParamTimingKey, number>>,
  actualTotalMs: number,
) {
  const estimatedSeconds = (estimatedTotals.total / 1000).toFixed(2);
  const actualSeconds = (actualTotalMs / 1000).toFixed(2);
  const groupLabel = `[timing] ${context} → est ${estimatedSeconds}s vs actual ${actualSeconds}s`;
  const openedGroup = typeof console.group === "function";
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
        `${label}: options=${options}, delay=${delay}ms, est=${(estimated / 1000).toFixed(2)}s, actual=${(actual / 1000).toFixed(2)}s`,
      );
    });
  } finally {
    if (
      (openedGroup || typeof console.groupCollapsed === "function") &&
      typeof console.groupEnd === "function"
    ) {
      console.groupEnd();
    }
  }
}

export function _formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0.00 s";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${ms.toFixed(0)} ms`;
}

export interface SpriteMapperApi {
  loaded: boolean;
  init: () => Promise<boolean>;
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
  getExtraAccessories?: () => string[];
  getScars?: () => string[];
  getPoseNames?: () => string[];
  getRenderablePoseNames?: () => string[];
}

export type ParamId =
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

export interface ParamDefinition {
  id: ParamId;
  label: string;
  optional?: boolean;
  requiresTortie?: boolean;
}

export const DISPLAY_SIZE = 720;
export const FULL_EXPORT_SIZE = 700;
export const INSTANT_PARAMS: ParamId[] = ["whitePatchesTint"];
export const MIN_FRAME_DURATION = 45;

export function computeStepDurations(
  sequence: { delay: number }[],
  baseDelay: number,
  allowFast: boolean,
  minimum: number = MIN_FRAME_DURATION,
): number[] {
  if (sequence.length === 0) {
    return [];
  }
  const safeBase = clampDelay(baseDelay, allowFast);
  return sequence.map((step) => {
    const scaled = safeBase * Math.max(step.delay, 1);
    return Math.max(
      scaled,
      allowFast ? ABSOLUTE_MIN_STEP_MS : Math.max(MIN_SAFE_STEP_MS, minimum),
    );
  });
}

export function getBaseFrameDuration(speed: {
  baseFrameDuration: number;
}): number {
  return Math.max(speed.baseFrameDuration, MIN_FRAME_DURATION);
}

export function invokeMapper<T>(
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

export function invokeMapperArray(
  mapper: SpriteMapperApi,
  fn: ((...args: unknown[]) => unknown) | undefined,
  ...args: unknown[]
): string[] {
  const result = invokeMapper(
    mapper,
    fn as (...args: unknown[]) => unknown,
    [],
    ...args,
  );
  return Array.isArray(result) ? [...result] : [];
}

export const SPEED_PRESETS = {
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

export function interpolate(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export const ROLLER_REVEAL_HOLD = 500;
export const PRE_SPIN_DELAY = 120;
export const PARAM_REVEAL_PAUSE = 500;

export function mixProfiles(
  a: (typeof SPEED_PRESETS)[keyof typeof SPEED_PRESETS],
  b: (typeof SPEED_PRESETS)[keyof typeof SPEED_PRESETS],
  t: number,
  targetDuration: number,
) {
  const paramPause = interpolate(a.paramPause, b.paramPause, t);
  const calmParamPause = interpolate(a.calmParamPause, b.calmParamPause, t);
  const baseFrameDuration = Math.max(
    interpolate(a.baseFrameDuration, b.baseFrameDuration, t),
    MIN_FRAME_DURATION,
  );
  return {
    paramPause,
    calmParamPause,
    baseFrameDuration,
    targetSpinDuration: targetDuration,
    flipSpeed: baseFrameDuration,
  };
}

export function scaleProfile(
  preset: (typeof SPEED_PRESETS)[keyof typeof SPEED_PRESETS],
  ratio: number,
  targetDuration: number,
) {
  const scale = Math.max(ratio, 0.05);
  return {
    paramPause: Math.max(preset.paramPause * scale, 60),
    calmParamPause: Math.max(preset.calmParamPause * scale, 60),
    baseFrameDuration: Math.max(
      preset.baseFrameDuration * scale,
      MIN_FRAME_DURATION,
    ),
    targetSpinDuration: targetDuration,
    flipSpeed: Math.max(preset.baseFrameDuration * scale, MIN_FRAME_DURATION),
  };
}

export function getSpeedSettings(durationMs: number) {
  const duration = Math.max(1000, durationMs);

  if (duration <= SPEED_PRESETS.fast.targetSpinDuration) {
    const ratio = duration / SPEED_PRESETS.fast.targetSpinDuration;
    return scaleProfile(SPEED_PRESETS.fast, ratio, duration);
  }

  if (duration <= SPEED_PRESETS.normal.targetSpinDuration) {
    const t =
      (duration - SPEED_PRESETS.fast.targetSpinDuration) /
      (SPEED_PRESETS.normal.targetSpinDuration -
        SPEED_PRESETS.fast.targetSpinDuration);
    return mixProfiles(SPEED_PRESETS.fast, SPEED_PRESETS.normal, t, duration);
  }

  if (duration <= SPEED_PRESETS.slow.targetSpinDuration) {
    const t =
      (duration - SPEED_PRESETS.normal.targetSpinDuration) /
      (SPEED_PRESETS.slow.targetSpinDuration -
        SPEED_PRESETS.normal.targetSpinDuration);
    return mixProfiles(SPEED_PRESETS.normal, SPEED_PRESETS.slow, t, duration);
  }

  const ratio = duration / SPEED_PRESETS.slow.targetSpinDuration;
  return scaleProfile(SPEED_PRESETS.slow, ratio, duration);
}

export const _layerGroupLabels: Record<LayerGroup, string> = {
  accessories: "Accessories",
  scars: "Scars",
  torties: "Tortie Layers",
};

export const PARAM_SEQUENCE: ParamDefinition[] = [
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

export function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function formatValue(value: unknown): string {
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    value === "none"
  ) {
    return "None";
  }
  const str = String(value)
    .replace(/_/g, " ")
    .replace(/^[0-9]+\s*-\s*/, "")
    .toLowerCase();
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function coerceSpriteNumber(value: unknown): number | undefined {
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

export function cloneParams<T>(params: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(params);
    } catch (error) {
      console.warn("structuredClone failed, falling back to JSON clone", error);
    }
  }
  return JSON.parse(JSON.stringify(params));
}

export function cloneSourceCanvas(
  source: HTMLCanvasElement | OffscreenCanvas,
  width = DISPLAY_SIZE,
  height = DISPLAY_SIZE,
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

export function waitForIdle(): Promise<void> {
  if (typeof requestIdleCallback === "function") {
    return new Promise((resolve) => {
      requestIdleCallback(() => resolve());
    });
  }
  return Promise.resolve();
}

export async function preRenderVariationFrames(
  generator: CatGeneratorApi,
  baseParams: Partial<CatParams>,
  paramId: ParamId,
  variationOptions: VariationOption[],
): Promise<VariationFrame[]> {
  const descriptors: VariantDescriptor[] = variationOptions.map(
    (option, index) => {
      const previewParams = cloneParams(baseParams);
      applyParamValue(previewParams, paramId, option.raw);
      return {
        id: `param-${paramId}-${index}`,
        option,
        params: previewParams,
      };
    },
  );

  return renderVariantFrames(generator, baseParams, descriptors, {
    priority: "high",
  });
}

export async function renderVariantFrames(
  generator: CatGeneratorApi,
  baseParams: Partial<CatParams>,
  descriptors: VariantDescriptor[],
  options?: {
    layerId?: string;
    baseCanvas?: HTMLCanvasElement;
    priority?: FetchPriority;
  },
): Promise<VariationFrame[]> {
  if (descriptors.length === 0) {
    return [];
  }

  if (generator.generateVariantSheet) {
    try {
      const sheet = await generator.generateVariantSheet(
        baseParams,
        descriptors.map(({ id, params, label, group }) => ({
          id,
          params,
          label,
          group,
        })),
        {
          includeSources: false,
          includeBase: false,
        },
      );
      if (sheet.frames.length >= descriptors.length) {
        const sheetCanvas = await decodeImageFromDataUrl(sheet.sheetDataUrl);
        await waitForIdle();
        const frameMap = new Map(
          sheet.frames.map((frame) => [frame.id, frame]),
        );

        return descriptors.map((descriptor) => {
          const meta = frameMap.get(descriptor.id);
          if (!meta) {
            throw new Error(
              `Missing frame metadata for variant ${descriptor.id}`,
            );
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
            DISPLAY_SIZE,
          );
          return {
            option: descriptor.option,
            canvas,
          };
        });
      }
    } catch (error) {
      console.warn(
        "generateVariantSheet failed, falling back to sequential renders",
        error,
      );
    }
  }

  const frames: VariationFrame[] = [];
  for (const descriptor of descriptors) {
    const result = await generator.generateCat(descriptor.params);
    let canvas: HTMLCanvasElement;
    if (options?.layerId && options.baseCanvas) {
      canvas = cloneSourceCanvas(
        options.baseCanvas,
        DISPLAY_SIZE,
        DISPLAY_SIZE,
      );
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          result.canvas as CanvasImageSource,
          0,
          0,
          DISPLAY_SIZE,
          DISPLAY_SIZE,
        );
      }
    } else {
      canvas = cloneSourceCanvas(
        result.canvas as HTMLCanvasElement | OffscreenCanvas,
      );
    }
    frames.push({
      option: descriptor.option,
      canvas,
    });
  }
  return frames;
}

export function buildFlipSequence(
  frames: VariationFrame[],
): { frame: VariationFrame; delay: number; isFinal: boolean }[] {
  if (frames.length === 0) {
    return [];
  }

  const targetFrame = frames[frames.length - 1];
  const cycleFrames = frames.slice();
  const sequence: { frame: VariationFrame; delay: number; isFinal: boolean }[] =
    [];

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
export function compositeCountFrame(
  catCanvas: HTMLCanvasElement,
  count: number,
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
      1,
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

export function buildLayerOptionStrings(
  allValuesInput: string[] | null | undefined,
  target: string | null | undefined,
  includeNone = true,
  options?: { spinny?: boolean; limit?: number },
): VariationOption[] {
  const spinnyMode = options?.spinny ?? false;
  const allValues = Array.isArray(allValuesInput) ? allValuesInput : [];
  const normalizedTarget = target && target !== "" ? target : "none";
  const baseLimit = spinnyMode
    ? MAX_SPINNY_LAYER_VARIATIONS
    : MAX_LAYER_VARIATIONS;
  const variationLimit = Math.max(
    1,
    Math.min(baseLimit, options?.limit ?? baseLimit),
  );
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

  const nonTargetValues = Array.from(dedup).filter(
    (value) => value !== normalizedTarget && value !== "none",
  );
  const remainingSlots = Math.max(0, variationLimit - results.length - 1);

  if (remainingSlots > 0) {
    const step = Math.max(
      1,
      Math.floor(nonTargetValues.length / remainingSlots),
    );
    for (
      let index = 0;
      index < nonTargetValues.length && results.length < variationLimit - 1;
      index += step
    ) {
      results.push(nonTargetValues[index]);
    }

    let fallbackIndex = 0;
    while (
      results.length < variationLimit - 1 &&
      fallbackIndex < nonTargetValues.length
    ) {
      const candidate = nonTargetValues[fallbackIndex++];
      if (!results.includes(candidate)) {
        results.push(candidate);
      }
    }
  }

  const hasTarget =
    results.includes(normalizedTarget) ||
    (!includeNone && normalizedTarget === "none");
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

export function formatTortieLayer(layer: TortieSlot | null): string {
  if (!layer) return "None";
  return [layer.mask, layer.pattern, layer.colour]
    .map((part) => formatValue(part ?? "none"))
    .join(" • ");
}

export function getParameterRawValue(
  paramId: ParamId,
  params: Partial<CatParams>,
): unknown {
  switch (paramId) {
    case "sprite":
      return params.poseName ?? params.spriteNumber;
    case "pelt":
      return getCoatChoiceValue(params);
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

export function formatOptionDisplay(paramId: ParamId, raw: unknown): string {
  if (paramId === "sprite") {
    if (typeof raw === "string" && !/^-?\d+$/.test(raw.trim())) {
      return formatPoseName(raw);
    }
    const spriteNumber = coerceSpriteNumber(raw);
    if (spriteNumber !== undefined) {
      return `Sprite ${spriteNumber}`;
    }
  }

  if (typeof raw === "boolean") {
    return raw ? "Yes" : "No";
  }

  if (paramId === "pelt") {
    return getCoatPatternName(raw) ?? formatValue(raw);
  }

  if (raw === undefined || raw === null || raw === "") {
    return "None";
  }

  if (typeof raw === "string" && raw.toLowerCase() === "none") {
    return "None";
  }

  return formatValue(raw);
}

export function applyParamValue(
  params: Partial<CatParams>,
  paramId: ParamId,
  value: unknown,
) {
  switch (paramId) {
    case "colour":
      params.colour = value as string;
      break;
    case "pelt":
      applyCoatChoice(params, value as string);
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
      params.whitePatchesTint =
        value === "None" ? undefined : (value as string);
      break;
    case "vitiligo":
      params.vitiligo = value === "None" ? undefined : (value as string);
      break;
    case "accessory": {
      const accessoryValue =
        typeof value === "string" && value !== "none" ? value : undefined;
      params.accessory = accessoryValue;
      if (accessoryValue) {
        params.accessories = [accessoryValue];
      } else {
        params.accessories = [];
      }
      break;
    }
    case "scar": {
      const scarValue =
        typeof value === "string" && value !== "none" ? value : undefined;
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
      if (typeof value === "string" && !/^-?\d+$/.test(value.trim())) {
        params.poseName = value;
      } else {
        const parsed = coerceSpriteNumber(value);
        if (parsed !== undefined) {
          params.spriteNumber = parsed;
          params.poseName = undefined;
        }
      }
      break;
    }
  }
}

export function getParameterValueForDisplay(
  paramId: ParamId,
  params: Partial<CatParams>,
): string {
  switch (paramId) {
    case "colour":
      return formatValue(params.colour);
    case "pelt":
      return (
        getCoatPatternName(getCoatChoiceValue(params)) ??
        formatValue(params.peltName)
      );
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
      return params.poseName
        ? formatPoseName(params.poseName)
        : `Sprite ${params.spriteNumber}`;
    default:
      return "";
  }
}

export function parseStreamWheelSpin(value: unknown): StreamWheelSpin | null {
  if (!value || typeof value !== "object") {
    console.error("[ObsOverlay] Invalid wheelSpin data — not an object", value);
    return null;
  }
  const spin = value as Partial<StreamWheelSpin>;
  if (
    typeof spin.prizeIndex !== "number" ||
    !Number.isInteger(spin.prizeIndex) ||
    spin.prizeIndex < 0 ||
    spin.prizeIndex >= CLASSIC_WHEEL_PRIZES.length ||
    typeof spin.forced !== "boolean"
  ) {
    console.error(
      "[ObsOverlay] Invalid wheelSpin data — missing or wrong fields",
      value,
    );
    return null;
  }
  const prize = CLASSIC_WHEEL_PRIZES[spin.prizeIndex];
  if (
    spin.prizeName !== prize.name ||
    spin.color !== prize.color ||
    spin.chance !== prize.chance
  ) {
    console.error(
      "[ObsOverlay] Invalid wheelSpin data - prize fields do not match index",
      value,
    );
    return null;
  }
  const randomBucket =
    typeof spin.randomBucket === "number" &&
    Number.isFinite(spin.randomBucket) &&
    Number.isInteger(spin.randomBucket) &&
    spin.randomBucket >= 0 &&
    spin.randomBucket < 100
      ? spin.randomBucket
      : undefined;
  return {
    prizeName: prize.name,
    prizeIndex: spin.prizeIndex,
    color: prize.color,
    chance: prize.chance,
    randomBucket,
    forced: spin.forced,
  };
}

export function toClassicWheelSelection(
  wheelSpin: StreamWheelSpin,
): ClassicWheelSelection {
  const index =
    Number.isInteger(wheelSpin.prizeIndex) &&
    wheelSpin.prizeIndex >= 0 &&
    wheelSpin.prizeIndex < CLASSIC_WHEEL_PRIZES.length
      ? wheelSpin.prizeIndex
      : CLASSIC_WHEEL_PRIZES.length - 1;
  const prize = CLASSIC_WHEEL_PRIZES[index];
  return {
    prize,
    index,
    random: wheelSpin.randomBucket,
  };
}

export function _randomFrom<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

export function buildSharePayload(state: CatState) {
  return {
    params: state.params,
    accessorySlots: [...state.accessorySlots],
    scarSlots: [...state.scarSlots],
    tortieSlots: state.tortieSlots.map((slot) => (slot ? { ...slot } : null)),
    counts: { ...state.counts },
  };
}

export function sanitizeForBuilder(
  baseParams: Partial<CatParams>,
  overrides?: {
    accessory?: string | null;
    scar?: string | null;
    tortie?: TortieSlot | null;
  },
): Partial<CatParams> {
  const next = cloneParams(baseParams ?? {});

  const accessoryValue =
    overrides?.accessory ??
    (Array.isArray(next.accessories) && next.accessories.length > 0
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

  const scarValue =
    overrides?.scar ??
    (Array.isArray(next.scars) && next.scars.length > 0
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

  const tortieValue =
    overrides?.tortie ??
    (Array.isArray(next.tortie) && next.tortie.length > 0
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

export async function copyCanvasToClipboard(
  canvas: HTMLCanvasElement,
  successMessage: string,
  fallbackFilename: string,
  onSuccess: (message: string) => void,
  onError: (message: string) => void,
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

export async function buildParameterOptions(
  mapper: SpriteMapperApi,
  includeBaseColours: boolean,
  extendedModes: ExtendedMode[],
  includeNewSprites: boolean,
): Promise<ParameterOptions> {
  if (!mapper.loaded) {
    await mapper.init();
  }

  const colourModes = extendedModes.length === 0 ? "off" : extendedModes;

  const baseColours: string[] = includeBaseColours
    ? invokeMapperArray(mapper, mapper.getColours)
    : [];

  const experimental = invokeMapperArray(
    mapper,
    mapper.getExperimentalColoursByMode,
    colourModes,
  );

  const colourSet = new Set<string>();
  for (const colour of baseColours) colourSet.add(colour);
  for (const colour of experimental) colourSet.add(colour);
  const colourList = Array.from(colourSet);

  const whitePatchTints = invokeMapperArray(
    mapper,
    mapper.getWhitePatchColourOptions,
    "default",
    colourModes === "off" ? null : colourModes,
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
  const accessories = getRandomAccessoryPool(mapper, includeNewSprites);
  const scars = invokeMapperArray(mapper, mapper.getScars);
  const poseNames = getRandomSelectablePoseNames(mapper, {
    includeNewSprites,
  });

  return {
    sprite: poseNames,
    pelt: getCoatChoiceValues(peltNames),
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

export function sampleValues(
  options: ParameterOptions | null,
  id: ParamId,
  finalRawValue: unknown,
  finalDisplay: string,
  limit = 8,
): VariationOption[] {
  if (!options || !(id in options)) {
    return [{ raw: finalRawValue, display: finalDisplay }];
  }

  const rawList = ((options as Record<ParamId, unknown[]>)[id] ?? []).filter(
    (entry) => entry !== undefined && entry !== null,
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
  const nonTarget = normalized.filter(
    (option) => optionKey(option) !== finalKey,
  );

  const effectiveLimit = Number.isFinite(limit)
    ? Math.max(1, limit)
    : normalized.length + 1;
  const maxNonTarget = Math.max(
    0,
    Math.min(effectiveLimit - 1, nonTarget.length),
  );

  const sampled: VariationOption[] = [];
  if (maxNonTarget > 0) {
    const step = Math.max(1, Math.floor(nonTarget.length / maxNonTarget));
    for (
      let index = 0;
      index < nonTarget.length && sampled.length < maxNonTarget;
      index += step
    ) {
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
    const hasFinalAlready = sampled.some(
      (option) => optionKey(option) === finalKey,
    );
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
