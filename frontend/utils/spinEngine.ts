/**
 * Spin Engine — extracted from SingleCatPlusClient.tsx
 *
 * Contains all pure functions, types, and constants that drive the
 * progressive cat reveal animation. Shared by both SingleCatPlusClient
 * and the OBS overlay.
 */

import { decodeImageFromDataUrl } from "@/lib/cat-v3/api";
import type { CatParams } from "@/lib/cat-v3/types";
import type { CatGeneratorApi } from "@/components/cat-builder/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export interface ParameterOptions {
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

export type FetchPriority = "high" | "low" | "auto";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DISPLAY_SIZE = 720;
export const MAX_LAYER_VARIATIONS = 12;
export const MAX_SPINNY_VARIATIONS = Number.MAX_SAFE_INTEGER;
export const MAX_SPINNY_LAYER_VARIATIONS = Number.MAX_SAFE_INTEGER;
export const DEFAULT_SPRITE_NUMBER = 8;
export const PLACEHOLDER_COLOUR = "GINGER";
export const SUBSET_LIMIT = 20;
export const INSTANT_PARAMS: ParamId[] = ["whitePatchesTint"];

export const SPRITE_NAMES: Record<number, string> = {
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

// ---------------------------------------------------------------------------
// Pure utility functions
// ---------------------------------------------------------------------------

export function spinWait(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function waitForIdle(): Promise<void> {
  if (typeof requestIdleCallback === "function") {
    return new Promise((resolve) => {
      requestIdleCallback(() => resolve());
    });
  }
  return Promise.resolve();
}

export function cloneParams<T>(params: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(params);
    } catch {
      // fall through
    }
  }
  return JSON.parse(JSON.stringify(params));
}

export function cloneSourceCanvas(
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

export function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === "" || value === "none") {
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

// ---------------------------------------------------------------------------
// Parameter value access
// ---------------------------------------------------------------------------

export function getParameterRawValue(paramId: ParamId, params: Partial<CatParams>): unknown {
  switch (paramId) {
    case "sprite": return params.spriteNumber;
    case "pelt": return params.peltName;
    case "colour": return params.colour;
    case "eyeColour": return params.eyeColour;
    case "eyeColour2": return params.eyeColour2 ?? "none";
    case "tortie": return params.isTortie ?? false;
    case "tortieMask": return params.tortieMask ?? "none";
    case "tortiePattern": return params.tortiePattern ?? "none";
    case "tortieColour": return params.tortieColour ?? "none";
    case "tint": return params.tint ?? "none";
    case "skinColour": return params.skinColour;
    case "whitePatches": return params.whitePatches ?? "none";
    case "points": return params.points ?? "none";
    case "whitePatchesTint": return params.whitePatchesTint ?? "none";
    case "vitiligo": return params.vitiligo ?? "none";
    case "shading": return params.shading ?? false;
    case "reverse": return params.reverse ?? false;
    default: return undefined;
  }
}

export function formatOptionDisplay(paramId: ParamId, raw: unknown): string {
  if (paramId === "sprite") {
    const spriteNumber = coerceSpriteNumber(raw);
    if (spriteNumber !== undefined) {
      return SPRITE_NAMES[spriteNumber] ?? `Sprite ${spriteNumber}`;
    }
  }
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  if (raw === undefined || raw === null || raw === "") return "None";
  if (typeof raw === "string" && raw.toLowerCase() === "none") return "None";
  return formatValue(raw);
}

export function getParameterValueForDisplay(paramId: ParamId, params: Partial<CatParams>): string {
  switch (paramId) {
    case "colour": return formatValue(params.colour);
    case "pelt": return formatValue(params.peltName);
    case "eyeColour": return formatValue(params.eyeColour);
    case "eyeColour2":
      if (!params.eyeColour2 || params.eyeColour2 === params.eyeColour) return "None";
      return formatValue(params.eyeColour2);
    case "tortie": return params.isTortie ? "Yes" : "No";
    case "tortieMask": return formatValue(params.tortieMask);
    case "tortiePattern": return formatValue(params.tortiePattern);
    case "tortieColour": return formatValue(params.tortieColour);
    case "tint": return formatValue(params.tint ?? "None");
    case "skinColour": return formatValue(params.skinColour);
    case "whitePatches": return formatValue(params.whitePatches ?? "None");
    case "points": return formatValue(params.points ?? "None");
    case "whitePatchesTint": return formatValue(params.whitePatchesTint ?? "None");
    case "vitiligo": return formatValue(params.vitiligo ?? "None");
    case "shading": return params.shading ? "Yes" : "No";
    case "reverse": return params.reverse ? "Yes" : "No";
    case "sprite": return SPRITE_NAMES[Number(params.spriteNumber)] ?? `Sprite ${params.spriteNumber}`;
    default: return "";
  }
}

export function applyParamValue(params: Partial<CatParams>, paramId: ParamId, value: unknown) {
  switch (paramId) {
    case "colour": params.colour = value as string; break;
    case "pelt": params.peltName = value as string; break;
    case "eyeColour": params.eyeColour = value as string; break;
    case "eyeColour2": params.eyeColour2 = value === "None" ? undefined : (value as string); break;
    case "tortie":
      params.isTortie = Boolean(value);
      if (!value) {
        params.tortie = [];
        params.tortieMask = undefined;
        params.tortieColour = undefined;
        params.tortiePattern = undefined;
      }
      break;
    case "tortieMask": params.tortieMask = value as string; break;
    case "tortiePattern": params.tortiePattern = value as string; break;
    case "tortieColour": params.tortieColour = value as string; break;
    case "tint": params.tint = value as string; break;
    case "skinColour": params.skinColour = value as string; break;
    case "whitePatches": params.whitePatches = value === "None" ? undefined : (value as string); break;
    case "points": params.points = value === "None" ? undefined : (value as string); break;
    case "whitePatchesTint": params.whitePatchesTint = value === "None" ? undefined : (value as string); break;
    case "vitiligo": params.vitiligo = value === "None" ? undefined : (value as string); break;
    case "accessory": {
      const v = typeof value === "string" && value !== "none" ? value : undefined;
      params.accessory = v;
      params.accessories = v ? [v] : [];
      break;
    }
    case "scar": {
      const v = typeof value === "string" && value !== "none" ? value : undefined;
      params.scar = v;
      params.scars = v ? [v] : [];
      break;
    }
    case "shading": params.shading = value as boolean; break;
    case "reverse": params.reverse = value as boolean; break;
    case "sprite": {
      const parsed = coerceSpriteNumber(value);
      if (parsed !== undefined) params.spriteNumber = parsed;
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Variation sampling
// ---------------------------------------------------------------------------

export function sampleValues(
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

  const finalOption: VariationOption = { raw: finalRawValue, display: finalDisplay };
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

export function buildLayerOptionStrings(
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

  if (includeNone) results.push("none");

  const dedup = new Set<string>();
  for (const value of allValues) {
    if (!value) continue;
    if (!dedup.has(value)) dedup.add(value);
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
    const targetIndex = results.indexOf(normalizedTarget);
    if (targetIndex !== -1 && targetIndex !== results.length - 1) {
      results.splice(targetIndex, 1);
      results.push(normalizedTarget);
    }
  }

  if (!results.length) results.push(normalizedTarget);

  return results.map((value) => ({
    raw: value,
    display: formatValue(value),
  }));
}

// ---------------------------------------------------------------------------
// Frame rendering
// ---------------------------------------------------------------------------

export async function preRenderVariationFrames(
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

export async function renderVariantFrames(
  generator: CatGeneratorApi,
  baseParams: Partial<CatParams>,
  descriptors: VariantDescriptor[],
  options?: { layerId?: string; baseCanvas?: HTMLCanvasElement; priority?: FetchPriority }
): Promise<VariationFrame[]> {
  if (descriptors.length === 0) return [];

  if (generator.generateVariantSheet) {
    try {
      const sheet = await generator.generateVariantSheet(
        baseParams,
        descriptors.map(({ id, params, label, group }) => ({ id, params, label, group })),
        { includeSources: false, includeBase: false }
      );
      if (sheet.frames.length >= descriptors.length) {
        const sheetCanvas = await decodeImageFromDataUrl(sheet.sheetDataUrl);
        await waitForIdle();
        const frameMap = new Map(sheet.frames.map((frame) => [frame.id, frame]));

        return descriptors.map((descriptor) => {
          const meta = frameMap.get(descriptor.id);
          if (!meta) throw new Error(`Missing frame metadata for variant ${descriptor.id}`);
          const canvas = document.createElement("canvas");
          canvas.width = DISPLAY_SIZE;
          canvas.height = DISPLAY_SIZE;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Unable to acquire 2D context for variant frame");
          ctx.imageSmoothingEnabled = false;
          if (options?.baseCanvas) {
            ctx.drawImage(options.baseCanvas, 0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
          }
          ctx.drawImage(
            sheetCanvas, meta.x, meta.y, meta.width, meta.height,
            0, 0, DISPLAY_SIZE, DISPLAY_SIZE
          );
          return { option: descriptor.option, canvas };
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
    frames.push({ option: descriptor.option, canvas });
  }
  return frames;
}

// ---------------------------------------------------------------------------
// Flip sequence
// ---------------------------------------------------------------------------

export function buildFlipSequence(
  frames: VariationFrame[]
): { frame: VariationFrame; delay: number; isFinal: boolean }[] {
  if (frames.length === 0) return [];

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

// ---------------------------------------------------------------------------
// High-level spin orchestrator
// ---------------------------------------------------------------------------

export interface SpinCallbacks {
  /** Called when a parameter starts being revealed. */
  onParamStart: (paramId: ParamId, label: string) => void;
  /** Called for each flip frame — draw this canvas and show the value label. */
  onFrame: (canvas: HTMLCanvasElement, paramLabel: string, valueDisplay: string, isFinal: boolean) => void;
  /** Called when a parameter has been fully revealed and locked in. */
  onParamRevealed: (paramId: ParamId, label: string, value: string) => void;
  /** Called when the entire spin is done. */
  onComplete: (finalCanvas: HTMLCanvasElement | null) => void;
  /** Return true to abort the spin. */
  isCancelled: () => boolean;
}

export interface SpinOptions {
  /** Base delay per flip step in ms (default 80). */
  baseStepMs?: number;
  /** Pause between parameters in ms (default 300). */
  paramPauseMs?: number;
  /** Max variation options to sample per param (default 8). */
  variationLimit?: number;
  /** Skip params listed here (instant reveal). */
  instantParams?: ParamId[];
}

/**
 * Run a progressive spin animation — the same algorithm as
 * SingleCatPlusClient's `generateCatPlus`.
 *
 * For each param in PARAM_SEQUENCE:
 * 1. Sample variation options
 * 2. Pre-render variation frames (via generateVariantSheet or generateCat)
 * 3. Build flip sequence (2 fast cycles + 5 decel + final)
 * 4. Execute flip sequence, calling onFrame for each step
 * 5. Lock in the final value, call onParamRevealed
 */
export async function runProgressiveSpin(
  generator: CatGeneratorApi,
  finalParams: Partial<CatParams>,
  parameterOptions: ParameterOptions | null,
  callbacks: SpinCallbacks,
  options?: SpinOptions
): Promise<void> {
  const baseStepMs = options?.baseStepMs ?? 80;
  const paramPauseMs = options?.paramPauseMs ?? 300;
  const variationLimit = options?.variationLimit ?? 8;
  const instantParamsSet = new Set(options?.instantParams ?? INSTANT_PARAMS);

  // Start with placeholder progressive params
  const progressive: Partial<CatParams> = {
    spriteNumber: DEFAULT_SPRITE_NUMBER,
    peltName: "SingleColour",
    colour: PLACEHOLDER_COLOUR,
    shading: finalParams.shading ?? false,
    reverse: finalParams.reverse ?? false,
    isTortie: false,
    accessories: [],
    scars: [],
    tortie: [],
    darkForest: (finalParams as Record<string, unknown>).darkForest as boolean ?? false,
    darkMode: (finalParams as Record<string, unknown>).darkMode as boolean ?? false,
    dead: (finalParams as Record<string, unknown>).dead as boolean ?? false,
  };

  for (const definition of PARAM_SEQUENCE) {
    if (callbacks.isCancelled()) return;

    // Skip tortie sub-params if not tortie
    if (definition.requiresTortie && !finalParams.isTortie) continue;

    const rawTargetValue = getParameterRawValue(definition.id, finalParams);
    const displayValue = getParameterValueForDisplay(definition.id, finalParams);

    // Skip if the param has no value and is optional
    if (rawTargetValue === undefined || rawTargetValue === null) {
      if (definition.optional) continue;
    }

    callbacks.onParamStart(definition.id, definition.label);

    const isInstant = instantParamsSet.has(definition.id);
    const isTortieToggle = definition.id === "tortie";
    const shouldAnimate = !!parameterOptions && !isInstant && !isTortieToggle;

    if (shouldAnimate) {
      // Sample variations and pre-render frames
      const variationOptions = sampleValues(
        parameterOptions,
        definition.id,
        rawTargetValue,
        displayValue,
        variationLimit
      );

      const frames = await preRenderVariationFrames(
        generator,
        progressive,
        definition.id,
        variationOptions
      );
      if (callbacks.isCancelled()) return;

      const sequence = buildFlipSequence(frames);

      // Execute flip sequence
      for (const step of sequence) {
        if (callbacks.isCancelled()) return;
        callbacks.onFrame(
          step.frame.canvas,
          definition.label,
          step.frame.option.display,
          step.isFinal
        );
        const stepDuration = baseStepMs * step.delay;
        await spinWait(stepDuration);
      }

      // Apply the final value
      applyParamValue(progressive, definition.id, rawTargetValue);
    } else {
      // Instant reveal — no animation
      applyParamValue(progressive, definition.id, rawTargetValue);

      // Render the cat with the new param applied
      try {
        const result = await generator.generateCat(progressive);
        const canvas = cloneSourceCanvas(
          result.canvas as HTMLCanvasElement | OffscreenCanvas
        );
        callbacks.onFrame(canvas, definition.label, displayValue, true);
      } catch {
        // render failed, skip
      }
    }

    if (callbacks.isCancelled()) return;
    callbacks.onParamRevealed(definition.id, definition.label, displayValue);
    await spinWait(paramPauseMs);
  }

  // Final render with all params
  if (callbacks.isCancelled()) return;
  let finalCanvas: HTMLCanvasElement | null = null;
  try {
    const result = await generator.generateCat(finalParams);
    finalCanvas = cloneSourceCanvas(
      result.canvas as HTMLCanvasElement | OffscreenCanvas
    );
  } catch {
    // final render failed
  }

  callbacks.onComplete(finalCanvas);
}
