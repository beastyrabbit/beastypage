/**
 * Pure builders for every spin phase shared by the OBS overlay and Single Cat
 * Plus: which descriptors a phase flips through, and what the progressive
 * params become once the phase commits. No React, DOM, or rendering here.
 *
 * The frame loader memoizes by {base params, variant params}, so the spin
 * planner and the clients must build descriptors through these functions.
 * Behaviour mirrors ObsOverlayClient's spin functions (the source of truth).
 */

import {
  applyParamValue,
  buildLayerOptionStrings,
  cloneParams,
  DEFAULT_SPRITE_NUMBER,
  INSTANT_PARAMS,
  invokeMapperArray,
  MAX_SPINNY_VARIATIONS,
  type ParameterOptions,
  PLACEHOLDER_COLOUR,
  type SpriteMapperApi,
  sampleValues,
  type TortieSlot,
} from "@/components/stream-control/obs/spinSupport";
import { syncChangedRegistryTraitsFromLegacy } from "@/lib/cat-system";
import type { CatParams } from "@/lib/cat-v3/types";
import {
  getRegistryRevealOptions,
  type ParamTimingKey,
  type RegistryRevealDefinition,
  setRegistryRevealValue,
} from "@/utils/spinTiming";
import type { VariantDescriptor, VariationOption } from "./types";

type Params = Partial<CatParams>;

// ---------------------------------------------------------------------------
// Rolled cat → spin inputs
// ---------------------------------------------------------------------------

/** Option pools the slot phases flip through (read from the sprite mapper). */
export interface SpinPools {
  accessories: string[];
  scars: string[];
  tortieMasks: string[];
  tortiePatterns: string[];
  tortieColours: string[];
}

export function readSpinPools(
  mapper: SpriteMapperApi,
  parameterOptions: ParameterOptions | null,
): SpinPools {
  return {
    accessories: invokeMapperArray(mapper, mapper.getAccessories),
    scars: invokeMapperArray(mapper, mapper.getScars),
    tortieMasks: invokeMapperArray(mapper, mapper.getTortieMasks),
    tortiePatterns: invokeMapperArray(mapper, mapper.getPeltNames),
    tortieColours:
      parameterOptions?.colour ?? invokeMapperArray(mapper, mapper.getColours),
  };
}

function toTortieSlot(slot: unknown): TortieSlot | null {
  const candidate = slot as Partial<TortieSlot> | null | undefined;
  return candidate?.mask && candidate?.pattern && candidate?.colour
    ? {
        mask: candidate.mask,
        pattern: candidate.pattern,
        colour: candidate.colour,
      }
    : null;
}

export interface RolledSlots {
  accessorySlots: string[];
  scarSlots: string[];
  tortieSlots: (TortieSlot | null)[];
}

/** The per-slot targets, preferring the roll's slot selections over params. */
export function resolveRolledSlots(
  params: Params,
  slotSelections?: Readonly<Record<string, unknown>> | null,
): RolledSlots {
  const accessories = slotSelections?.accessories;
  const scars = slotSelections?.scars;
  const tortie = slotSelections?.tortie;
  return {
    accessorySlots: Array.isArray(accessories)
      ? (accessories as string[])
      : (params.accessories ?? []).filter(
          (entry): entry is string => typeof entry === "string",
        ),
    scarSlots: Array.isArray(scars)
      ? (scars as string[])
      : (params.scars ?? []).filter(
          (entry): entry is string => typeof entry === "string",
        ),
    tortieSlots: Array.isArray(tortie)
      ? tortie.map(toTortieSlot)
      : (params.tortie ?? []).map(toTortieSlot),
  };
}

/** The placeholder cat every spin starts from. */
export function createInitialProgressiveParams(params: Params): Params {
  const progressive: Params = {
    spriteNumber: DEFAULT_SPRITE_NUMBER,
    shading: params.shading ?? false,
    reverse: params.reverse ?? false,
    isTortie: false,
    peltName: "SingleColour",
    accessories: [],
    scars: [],
    tortie: [],
    colour: PLACEHOLDER_COLOUR,
  };
  progressive.darkForest = params.darkForest ?? false;
  progressive.darkMode = params.darkMode ?? false;
  progressive.dead = params.dead ?? false;
  syncChangedRegistryTraitsFromLegacy(progressive, [
    "accessories",
    "scars",
    "tortie",
    "colour",
    "darkForest",
    "dead",
  ]);
  return progressive;
}

// ---------------------------------------------------------------------------
// Main param loop
// ---------------------------------------------------------------------------

/**
 * How the param loop handles a definition: tortie parts are revealed by the
 * tortie slot phase, accessories/scars and registry string slots by their slot
 * phases, everything else as a single param.
 */
export type SpinParamRoute =
  | "skip"
  | "accessory"
  | "scar"
  | "registrySlots"
  | "param";

export function spinParamRoute(
  definition: RegistryRevealDefinition,
): SpinParamRoute {
  if (
    definition.id === "tortieMask" ||
    definition.id === "tortiePattern" ||
    definition.id === "tortieColour"
  ) {
    return "skip";
  }
  if (definition.id === "accessory") return "accessory";
  if (definition.id === "scar") return "scar";
  if (definition.strategy === "slots") return "registrySlots";
  return "param";
}

/** Whether a param can flip at all (the client additionally needs spinny). */
export function isAnimatableParam(
  definition: RegistryRevealDefinition,
  parameterOptions: ParameterOptions | null,
): boolean {
  return (
    !!parameterOptions &&
    !INSTANT_PARAMS.includes(definition.id) &&
    definition.compoundMode !== "tortieParts"
  );
}

/** Every option of a param, target last (always the full option list). */
export function buildParamDescriptors(
  parameterOptions: ParameterOptions | null,
  paramId: string,
  base: Params,
  targetRaw: unknown,
  targetDisplay: string,
): VariantDescriptor[] {
  const options = sampleValues(
    parameterOptions,
    paramId,
    targetRaw,
    targetDisplay,
    MAX_SPINNY_VARIATIONS,
  );
  return options.map((option, index) => {
    const params = cloneParams(base);
    applyParamValue(params, paramId, option.raw);
    return { id: `param-${paramId}-${index}`, option, params };
  });
}

// ---------------------------------------------------------------------------
// Registry string slots
// ---------------------------------------------------------------------------

export function registrySlotTargets(targetSlotsInput: unknown): string[] {
  return Array.isArray(targetSlotsInput)
    ? targetSlotsInput.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
}

export function registrySlotChoices(
  definition: RegistryRevealDefinition,
): string[] {
  return getRegistryRevealOptions(definition).filter(
    (value): value is string =>
      typeof value === "string" && value.toLowerCase() !== "none",
  );
}

function isNoneString(value: unknown): boolean {
  return typeof value === "string" && value.toLowerCase() === "none";
}

export function buildRegistrySlotDescriptors(
  definition: RegistryRevealDefinition,
  choices: string[],
  base: Params,
  committed: readonly string[],
  target: string,
  index: number,
): VariantDescriptor[] {
  const options = buildLayerOptionStrings(choices, target, true, {
    spinny: true,
  });
  return options.map((option, variantIndex) => {
    const params = cloneParams(base);
    const nextValues = [...committed];
    if (typeof option.raw === "string" && !isNoneString(option.raw)) {
      nextValues.push(option.raw);
    }
    setRegistryRevealValue(params, definition, nextValues);
    return {
      id: `${definition.traitId}-${index}-${variantIndex}`,
      option,
      params,
      label: option.display,
      group: `${definition.traitId}-${index + 1}`,
    };
  });
}

/** The committed list after revealing `target` (the target, not a frame). */
export function nextRegistryCommitted(
  committed: readonly string[],
  target: string,
): string[] {
  return isNoneString(target) ? [...committed] : [...committed, target];
}

/** Also used with `[]` for the "nothing to spin" render. */
export function commitRegistrySlots(
  progressive: Params,
  definition: RegistryRevealDefinition,
  committed: readonly string[],
): void {
  setRegistryRevealValue(progressive, definition, [...committed]);
}

// ---------------------------------------------------------------------------
// Accessory and scar slots
// ---------------------------------------------------------------------------

export type StringLayerKind = "accessory" | "scar";

const STRING_LAYER_FIELDS = {
  accessory: { list: "accessories", single: "accessory", trait: "accessories" },
  scar: { list: "scars", single: "scar", trait: "scars" },
} as const;

function setStringLayers(
  params: Params,
  kind: StringLayerKind,
  values: string[],
): void {
  const fields = STRING_LAYER_FIELDS[kind];
  params[fields.list] = values;
  params[fields.single] = values[0];
  syncChangedRegistryTraitsFromLegacy(params, [fields.trait]);
}

export function buildStringLayerDescriptors(
  kind: StringLayerKind,
  pool: string[],
  base: Params,
  committed: readonly string[],
  target: string | null | undefined,
  index: number,
): VariantDescriptor[] {
  const options = buildLayerOptionStrings(pool, target ?? "none", true, {
    spinny: true,
  });
  return options.map((option, variantIndex) => {
    const params = cloneParams(base);
    const values = [...committed];
    if (typeof option.raw === "string" && option.raw !== "none") {
      values.push(option.raw);
    }
    setStringLayers(params, kind, values);
    return {
      id: `${kind}-${index}-${variantIndex}`,
      option,
      params,
      label: option.display,
      group: `${kind}-${index + 1}`,
    };
  });
}

/**
 * The value a slot commits: the final frame's raw value when flashy, the
 * target when calm. `null` means "none".
 */
export function stringLayerSlotValue(raw: unknown): string | null {
  return typeof raw === "string" && raw !== "none" ? raw : null;
}

export function commitStringLayers(
  progressive: Params,
  kind: StringLayerKind,
  committed: readonly string[],
): void {
  setStringLayers(progressive, kind, [...committed]);
}

// ---------------------------------------------------------------------------
// Tortie slots
// ---------------------------------------------------------------------------

export type TortieStageKind = "mask" | "pattern" | "colour";

export const TORTIE_STAGES: ReadonlyArray<{
  kind: TortieStageKind;
  label: string;
  timingKey: ParamTimingKey;
}> = [
  { kind: "mask", label: "Mask", timingKey: "tortieMask" },
  { kind: "pattern", label: "Pelt", timingKey: "tortiePattern" },
  { kind: "colour", label: "Colour", timingKey: "tortieColour" },
];

/**
 * Random colours for a flashy tortie layer: the colour the working layer
 * starts with, and the stand-in colour shown during the mask/pattern stages.
 * Both avoid the target colour so the colour stage visibly spins.
 */
export function pickTortieColours(
  colours: string[],
  target: TortieSlot,
  rng: () => number = Math.random,
): { startColour: string; maskPatternColour: string } {
  const available = colours.filter((colour) => colour !== target.colour);
  const pick = () =>
    available.length > 0
      ? available[Math.floor(rng() * available.length)]
      : target.colour;
  const startColour = pick();
  const maskPatternColour = pick();
  return { startColour, maskPatternColour };
}

/** The layer a stage option stands for (also what the board displays). */
export function tortieStageCandidate(
  kind: TortieStageKind,
  raw: unknown,
  working: TortieSlot,
  maskPatternColour: string,
): TortieSlot {
  return {
    mask: kind === "mask" ? (raw as string) : working.mask,
    pattern: kind === "pattern" ? (raw as string) : working.pattern,
    colour: kind === "colour" ? (raw as string) : maskPatternColour,
  };
}

function tortieStagePool(kind: TortieStageKind, pools: SpinPools): string[] {
  if (kind === "mask") return pools.tortieMasks;
  if (kind === "pattern") return pools.tortiePatterns;
  return pools.tortieColours;
}

function tortieStageTarget(
  kind: TortieStageKind,
  working: TortieSlot,
  target: TortieSlot,
): string {
  if (kind === "mask") return working.mask;
  if (kind === "pattern") return working.pattern;
  return target.colour;
}

export function tortieStageOptions(
  kind: TortieStageKind,
  pools: SpinPools,
  working: TortieSlot,
  target: TortieSlot,
): VariationOption[] {
  return buildLayerOptionStrings(
    tortieStagePool(kind, pools),
    tortieStageTarget(kind, working, target),
    false,
    { spinny: true },
  );
}

function setTortieLayers(params: Params, layers: TortieSlot[]): void {
  params.tortie = layers;
  params.isTortie = true;
  // Legacy single-layer fields show the layer being spun (the last one).
  const candidate = layers.at(-1);
  params.tortieMask = candidate?.mask;
  params.tortiePattern = candidate?.pattern;
  params.tortieColour = candidate?.colour;
  syncChangedRegistryTraitsFromLegacy(params, ["tortie"]);
}

export function tortieStageDescriptors(
  kind: TortieStageKind,
  options: VariationOption[],
  base: Params,
  committed: readonly TortieSlot[],
  working: TortieSlot,
  maskPatternColour: string,
  index: number,
): VariantDescriptor[] {
  return options.map((option, variantIndex) => {
    const params = cloneParams(base);
    const candidate = tortieStageCandidate(
      kind,
      option.raw,
      working,
      maskPatternColour,
    );
    setTortieLayers(params, [
      ...committed.map((layer) => ({ ...layer })),
      candidate,
    ]);
    return {
      id: `tortie-${index}-${kind}-${variantIndex}`,
      option,
      params,
      label: option.display,
      group: `tortie-${index + 1}-${kind}`,
    };
  });
}

/** The working layer after a stage lands on its final option. */
export function applyTortieStageResult(
  kind: TortieStageKind,
  working: TortieSlot,
  finalRaw: unknown,
): TortieSlot {
  if (typeof finalRaw !== "string") return working;
  return { ...working, [kind]: finalRaw };
}

export interface TortieStageSpin {
  kind: TortieStageKind;
  label: string;
  timingKey: ParamTimingKey;
  /** The layer before this stage (unchanged parts shown during flips). */
  working: TortieSlot;
  /** The layer after this stage. */
  result: TortieSlot;
  readonly descriptors: VariantDescriptor[];
}

export interface TortieSlotSpin {
  startColour: string;
  maskPatternColour: string;
  stages: TortieStageSpin[];
  /** What the layer commits as once all three stages have spun. */
  result: TortieSlot;
}

/** Build once on first call; used so calm spins never build descriptors. */
export function lazy<T>(build: () => T): () => T {
  let built = false;
  let value: T;
  return () => {
    if (!built) {
      value = build();
      built = true;
    }
    return value;
  };
}

/**
 * The three stage spins of one flashy tortie layer. Colours are drawn from
 * `rng` immediately (start colour first, then the mask/pattern colour);
 * descriptors are built on first access.
 */
export function buildTortieSlotSpin(
  pools: SpinPools,
  base: Params,
  committed: readonly TortieSlot[],
  target: TortieSlot,
  index: number,
  rng: () => number = Math.random,
): TortieSlotSpin {
  const { startColour, maskPatternColour } = pickTortieColours(
    pools.tortieColours,
    target,
    rng,
  );
  const baseSnapshot = cloneParams(base);
  const committedSnapshot = committed.map((layer) => ({ ...layer }));
  let working: TortieSlot = { ...target, colour: startColour };
  const stages = TORTIE_STAGES.map((stage): TortieStageSpin => {
    const before = working;
    const options = tortieStageOptions(stage.kind, pools, before, target);
    const descriptors = lazy(() =>
      tortieStageDescriptors(
        stage.kind,
        options,
        baseSnapshot,
        committedSnapshot,
        before,
        maskPatternColour,
        index,
      ),
    );
    working = applyTortieStageResult(stage.kind, before, options.at(-1)?.raw);
    return {
      ...stage,
      working: before,
      result: working,
      get descriptors() {
        return descriptors();
      },
    };
  });
  return { startColour, maskPatternColour, stages, result: working };
}

export function commitTortieSlots(
  progressive: Params,
  committed: readonly TortieSlot[],
): void {
  progressive.tortie = committed.map((layer) => ({ ...layer }));
  progressive.tortieMask = committed[0]?.mask;
  progressive.tortiePattern = committed[0]?.pattern;
  progressive.tortieColour = committed[0]?.colour;
  progressive.isTortie = committed.length > 0;
  syncChangedRegistryTraitsFromLegacy(progressive, ["tortie"]);
}
