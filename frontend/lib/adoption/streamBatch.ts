/**
 * Stream version of the adoption generator's elimination format: a pool of
 * `finalCount + stageCount` cats is generated upfront; each stage reveals
 * one more parameter on every survivor, the streamer culls one cat per
 * stage from the control page until `finalCount` remain, and the finalists
 * become a saved adoption batch.
 *
 * The command payload carries params-only cat data (never rendered images —
 * the session document is capped at Convex's 1 MiB limit); both the overlay
 * and the control page re-render partially revealed cats locally with
 * `buildPartialBatchParams`. Stage order mirrors
 * lib/adoption/adoptionGenerator.js (`buildStagePlan`).
 */

import type {
  AnyCatTraitDefinition,
  CatSystemDefinition,
} from "@/lib/cat-system/definition";
import { readCatDocument } from "@/lib/cat-system/document";
import { catSystem } from "@/lib/cat-system/registry";
import { getSystemRevealTraits } from "@/lib/cat-system/runtime";
import { applyCoatChoice, getCoatChoiceValue } from "@/lib/cat-v3/coatPatterns";
import { DEFAULT_POSE_NAME, formatPoseName } from "@/lib/cat-v3/poseOptions";
import type { CatParams } from "@/lib/cat-v3/types";

/** Verdict window armed by cullBatchCat; convex/catStream.ts keeps its own VERDICT_MS = 3000 in sync. */
export const BATCH_VERDICT_MS = 3000;
/** Depart + repack after a finalised cull; the next stage is reported at lastCullAt + this. convex has no copy. */
export const BATCH_DEPART_MS = 1600;
export const BATCH_REPACK_MS = 400;

export type BatchLayerConfig = {
  accessoryCount: number;
  scarCount: number;
  tortieCount: number;
};

export type BatchTortieLayer = {
  mask: string;
  pattern: string;
  colour: string;
};

export type BatchStage =
  | { id: string; label: string; type: "simple"; param: string }
  | {
      id: string;
      label: string;
      type: "tortie-sub";
      layerIndex: number;
      subElement: "mask" | "pattern" | "colour";
    }
  | { id: string; label: string; type: "accessory"; slotIndex: number }
  | { id: string; label: string; type: "scar"; slotIndex: number }
  | {
      id: string;
      label: string;
      type: "registry";
      traitId: string;
      strategy: "single" | "slots" | "compoundSlots";
      slotIndex?: number;
    };

export type BatchStreamCat = {
  id: string;
  label: string;
  catData: {
    params: CatParams;
    accessorySlots: string[];
    scarSlots: string[];
    tortieSlots: (BatchTortieLayer | null)[];
    counts: { accessories: number; scars: number; tortie: number };
  };
};

export type BatchStreamCommand = {
  /** Saved batch slug — attached once the finalists are persisted. */
  slug?: string;
  title?: string;
  /** How many cats survive the eliminations (website default: 10). */
  finalCount: number;
  config: BatchLayerConfig;
  /** The full starting pool, finalCount + stage count cats. */
  cats: BatchStreamCat[];
};

/** Live elimination state, synced through cat_stream_sessions.batchState. */
export type BatchLiveState = {
  seq: number;
  /** Index of the stage the overlay is currently revealing. */
  stageIndex: number;
  /** True while the overlay waits for the streamer to cull a cat. */
  awaitingCull: boolean;
  eliminatedIds: string[];
  /** Cat marked as the removal candidate — highlighted for viewers. */
  markedId?: string | null;
  /** "Maybe leaves next" picks — shown yellow; reset after every cull. */
  potentialIds?: string[];
  /** Crowd favourites — persist across culls. */
  favoriteIds?: string[];
  /** Cat shown enlarged on the overlay and control board. */
  spotlightId?: string | null;
  /** Cat whose cull is armed; cleared by cancel or finalize. `| null` matches markedId/spotlightId's existing convention; the server never writes null (clearing = omitting the key). */
  pendingCullId?: string | null;
  /** Server ms when finalizeBatchCull fires (= arm time + BATCH_VERDICT_MS). */
  verdictAt?: number | null;
  /** Server ms the current `stageIndex` was entered (stamped by reportBatchStage); every deal timeline is anchored here. */
  stageStartedAt?: number;
  /** Server ms the most recent cull was finalised; depart/repack are anchored here. */
  lastCullAt?: number;
};

export const BATCH_FINAL_COUNT = 10;

/** Unrevealed tortie sub-elements render with these stand-ins. */
export type BatchTortiePlaceholders = {
  mask: string;
  pattern: string;
  colour: string;
};

export const BATCH_TORTIE_PLACEHOLDER_FALLBACK: BatchTortiePlaceholders = {
  mask: "ONE",
  pattern: "SingleColour",
  colour: "WHITE",
};

/**
 * Compatibility boundary for the hand-tuned batch reveal. Traits outside
 * this snapshot are handled exclusively through registry metadata.
 */
export const BATCH_LEGACY_TRAIT_IDS = [
  "pose",
  "pelt",
  "coatPattern",
  "colour",
  "tortie",
  "tint",
  "whitePatches",
  "points",
  "whitePatchesTint",
  "vitiligo",
  "eyeColour",
  "eyeColour2",
  "scars",
  "shading",
  "lighting",
  "darkForest",
  "dead",
  "skinColour",
  "accessories",
  "reverse",
] as const;

const BATCH_LEGACY_TRAIT_ID_SET = new Set<string>(BATCH_LEGACY_TRAIT_IDS);

function canonicalTraits(
  cat: BatchStreamCat,
  system: CatSystemDefinition,
): Record<string, unknown> | null {
  try {
    const document = readCatDocument(cat.catData.params);
    const known = document.traits as Record<string, unknown>;
    const unknown = document.unknownTraits ?? {};
    return Object.fromEntries(
      system.traits.flatMap((trait) => {
        const value = known[trait.id] ?? unknown[trait.id];
        if (value === undefined) return [];
        const parsed = trait.value.schema.safeParse(value);
        return parsed.success ? [[trait.id, parsed.data]] : [];
      }),
    );
  } catch {
    return null;
  }
}

function genericStageCount(
  trait: AnyCatTraitDefinition,
  cats: readonly BatchStreamCat[] | undefined,
  system: CatSystemDefinition,
): number {
  const reveal = trait.capabilities.reveal;
  if (!reveal) return 0;

  if (cats !== undefined) {
    const values = cats.flatMap((cat) => {
      const traits = canonicalTraits(cat, system);
      return traits?.[trait.id] !== undefined ? [traits[trait.id]] : [];
    });
    if (reveal.strategy === "single") return values.length > 0 ? 1 : 0;
    return values.reduce<number>(
      (maximum, value) =>
        Math.max(maximum, Array.isArray(value) ? value.length : 0),
      0,
    );
  }

  if (reveal.strategy === "single") return 1;
  const gachaMaximum =
    trait.gacha.strategy === "slotList" || trait.gacha.strategy === "tortieList"
      ? trait.gacha.count.max
      : undefined;
  const defaultLength = Array.isArray(trait.value.default)
    ? trait.value.default.length
    : 0;
  return Math.max(
    1,
    trait.value.maxItems ?? 0,
    gachaMaximum ?? 0,
    defaultLength,
  );
}

function singularLabel(label: string): string {
  if (/ies$/i.test(label)) return label.replace(/ies$/i, "y");
  return label.replace(/s$/i, "");
}

function buildGenericBatchStages(
  cats: readonly BatchStreamCat[] | undefined,
  system: CatSystemDefinition,
): BatchStage[] {
  return getSystemRevealTraits(system).flatMap<BatchStage>((trait) => {
    if (BATCH_LEGACY_TRAIT_ID_SET.has(trait.id)) return [];
    const reveal = trait.capabilities.reveal;
    if (!reveal) return [];
    const count = genericStageCount(trait, cats, system);
    return Array.from({ length: count }, (_, slotIndex) => ({
      id: reveal.strategy === "single" ? trait.id : `${trait.id}-${slotIndex}`,
      label:
        reveal.strategy === "single"
          ? trait.label
          : `${singularLabel(trait.label)} ${slotIndex + 1}`,
      type: "registry" as const,
      traitId: trait.id,
      strategy: reveal.strategy,
      ...(reveal.strategy === "single" ? {} : { slotIndex }),
    }));
  });
}

/** Same stage order as the adoption generator page. */
export function buildBatchStagePlan(
  config: BatchLayerConfig,
  cats?: readonly BatchStreamCat[],
  system: CatSystemDefinition = catSystem,
): BatchStage[] {
  const stages: BatchStage[] = [
    {
      id: "colour",
      label: "Colour",
      type: "simple",
      param: "colour",
    },
    {
      id: "peltName",
      label: "Pelt",
      type: "simple",
      param: "peltName",
    },
    {
      id: "eyeColour",
      label: "Eyes",
      type: "simple",
      param: "eyeColour",
    },
    {
      id: "eyeColour2",
      label: "Eye Colour 2",
      type: "simple",
      param: "eyeColour2",
    },
  ];
  for (let i = 0; i < config.tortieCount; i++) {
    stages.push(
      {
        id: `tortie-${i}-mask`,
        label: `Tortie ${i + 1} Mask`,
        type: "tortie-sub",
        layerIndex: i,
        subElement: "mask",
      },
      {
        id: `tortie-${i}-pattern`,
        label: `Tortie ${i + 1} Pelt`,
        type: "tortie-sub",
        layerIndex: i,
        subElement: "pattern",
      },
      {
        id: `tortie-${i}-colour`,
        label: `Tortie ${i + 1} Colour`,
        type: "tortie-sub",
        layerIndex: i,
        subElement: "colour",
      },
    );
  }
  stages.push(
    { id: "tint", label: "Tint", type: "simple", param: "tint" },
    {
      id: "skinColour",
      label: "Skin",
      type: "simple",
      param: "skinColour",
    },
    {
      id: "whitePatches",
      label: "White Patches",
      type: "simple",
      param: "whitePatches",
    },
    {
      id: "points",
      label: "Points",
      type: "simple",
      param: "points",
    },
    {
      id: "whitePatchesTint",
      label: "Patches Tint",
      type: "simple",
      param: "whitePatchesTint",
    },
    {
      id: "vitiligo",
      label: "Vitiligo",
      type: "simple",
      param: "vitiligo",
    },
  );
  for (let i = 0; i < config.accessoryCount; i++) {
    stages.push({
      id: `accessory-${i}`,
      label: `Accessory ${i + 1}`,
      type: "accessory",
      slotIndex: i,
    });
  }
  for (let i = 0; i < config.scarCount; i++) {
    stages.push({
      id: `scar-${i}`,
      label: `Scar ${i + 1}`,
      type: "scar",
      slotIndex: i,
    });
  }
  stages.push(
    ...buildGenericBatchStages(cats, system),
    {
      id: "shading",
      label: "Shading",
      type: "simple",
      param: "shading",
    },
    {
      id: "reverse",
      label: "Reverse",
      type: "simple",
      param: "reverse",
    },
    {
      id: "poseName",
      label: "Pose",
      type: "simple",
      param: "poseName",
    },
  );
  return stages;
}

export function batchStartCount(
  config: BatchLayerConfig,
  finalCount: number,
  cats?: readonly BatchStreamCat[],
  system: CatSystemDefinition = catSystem,
) {
  return finalCount + buildBatchStagePlan(config, cats, system).length;
}

/**
 * Shrinks a registry-upper-bound pool to the exact command invariant. The
 * loop matters when the removed suffix contained the only cat with the
 * maximum number of slots for an added trait.
 */
export function trimBatchPoolToStageCount(
  config: BatchLayerConfig,
  finalCount: number,
  cats: readonly BatchStreamCat[],
  system: CatSystemDefinition = catSystem,
): BatchStreamCat[] {
  let result = [...cats];
  for (;;) {
    const target = batchStartCount(config, finalCount, result, system);
    if (target > result.length) {
      throw new Error(
        `Batch pool is too small: ${result.length} cats for ${target} required`,
      );
    }
    if (target === result.length) return result;
    result = result.slice(0, target);
  }
}

/** Light runtime guard for command payloads coming out of Convex. */
export function parseBatchStreamCommand(
  value: unknown,
): BatchStreamCommand | null {
  if (!value || typeof value !== "object") return null;
  const command = value as Partial<BatchStreamCommand>;
  if (
    typeof command.finalCount !== "number" ||
    !command.config ||
    !Array.isArray(command.cats) ||
    command.cats.length === 0
  ) {
    return null;
  }
  return command as BatchStreamCommand;
}

/** Simple-stage params whose "none" value means "absent" when rendering. */
const NONE_AS_UNDEFINED = new Set([
  "eyeColour2",
  "whitePatches",
  "points",
  "whitePatchesTint",
  "vitiligo",
]);

function cloneValue<T>(value: T): T {
  return structuredClone(value) as T;
}

function hiddenTraitValue(trait: AnyCatTraitDefinition): {
  present: boolean;
  value?: unknown;
} {
  if (trait.value.kind === "stringList" || trait.value.kind === "objectList") {
    return { present: true, value: [] };
  }
  if (trait.value.default !== undefined) {
    return { present: true, value: cloneValue(trait.value.default) };
  }
  if (!trait.value.required) return { present: false };
  if (trait.value.kind === "boolean") return { present: true, value: false };
  if (trait.value.kind === "integer") return { present: true, value: 0 };
  return { present: true, value: "none" };
}

type PartialTraitValue = { present: boolean; value?: unknown };

/** A present list value, cloned; anything else is an empty list. */
function presentList(current: PartialTraitValue): unknown[] {
  return current.present && Array.isArray(current.value)
    ? cloneValue(current.value)
    : [];
}

function writeLegacyList(
  params: Record<string, unknown>,
  key: string,
  singleKey: string | undefined,
  current: PartialTraitValue,
): void {
  const list = presentList(current);
  params[key] = list;
  if (!singleKey) return;
  if (list.length > 0) params[singleKey] = list[0];
  else delete params[singleKey];
}

function writeLegacyTortie(
  params: Record<string, unknown>,
  current: PartialTraitValue,
): void {
  const layers = presentList(current);
  params.tortie = layers;
  params.isTortie = layers.length > 0;
}

function writeLegacyBooleanAlias(
  params: Record<string, unknown>,
  key: string,
  aliases: readonly string[],
  current: PartialTraitValue,
): void {
  const enabled = current.present && Boolean(current.value);
  params[key] = enabled;
  for (const alias of aliases) params[alias] = enabled;
}

function writeLegacyTraitValue(
  params: Record<string, unknown>,
  trait: AnyCatTraitDefinition,
  current: PartialTraitValue,
): void {
  const value = current.value;
  switch (trait.legacy.strategy) {
    case "direct":
      if (current.present) params[trait.legacy.key] = cloneValue(value);
      else delete params[trait.legacy.key];
      break;
    case "list":
      writeLegacyList(
        params,
        trait.legacy.key,
        trait.legacy.singleKey,
        current,
      );
      break;
    case "pose":
      if (current.present) params[trait.legacy.key] = value;
      else delete params[trait.legacy.key];
      break;
    case "tortie":
      writeLegacyTortie(params, current);
      break;
    case "booleanAlias":
      writeLegacyBooleanAlias(
        params,
        trait.legacy.key,
        trait.legacy.aliases,
        current,
      );
      break;
  }
}

function readLegacyTraitValue(
  params: Record<string, unknown>,
  trait: AnyCatTraitDefinition,
): { present: boolean; value?: unknown } {
  switch (trait.legacy.strategy) {
    case "direct":
    case "pose":
      return Object.hasOwn(params, trait.legacy.key)
        ? { present: true, value: params[trait.legacy.key] }
        : { present: false };
    case "list":
      return {
        present: true,
        value: Array.isArray(params[trait.legacy.key])
          ? params[trait.legacy.key]
          : [],
      };
    case "tortie":
      return {
        present: true,
        value: Array.isArray(params.tortie) ? params.tortie : [],
      };
    case "booleanAlias":
      return [trait.legacy.key, ...trait.legacy.aliases].some((key) =>
        Object.hasOwn(params, key),
      )
        ? {
            present: true,
            value: [trait.legacy.key, ...trait.legacy.aliases].some((key) =>
              Boolean(params[key]),
            ),
          }
        : { present: false };
  }
}

function setPartialTrait(
  traits: Record<string, unknown>,
  traitId: string,
  current: { present: boolean; value?: unknown },
): void {
  if (current.present) traits[traitId] = cloneValue(current.value);
  else delete traits[traitId];
}

function normalizePartialTraitValue(
  trait: AnyCatTraitDefinition,
  current: { present: boolean; value?: unknown },
): { present: boolean; value?: unknown } {
  if (
    current.present &&
    !trait.value.required &&
    trait.value.default === undefined &&
    trait.value.kind === "string" &&
    typeof current.value === "string" &&
    ["", "none", "null"].includes(current.value.trim().toLowerCase())
  ) {
    return { present: false };
  }
  return current;
}

/** The bare-kit value each simple param starts from (what `buildPartialBatchParams` reveals over). */
export const BATCH_STAGE_PLACEHOLDERS: Readonly<
  Record<string, string | boolean>
> = {
  poseName: DEFAULT_POSE_NAME,
  peltName: "SingleColour",
  colour: "GINGER",
  tint: "none",
  skinColour: "PINK",
  eyeColour: "BLUE",
  eyeColour2: "none",
  whitePatches: "none",
  whitePatchesTint: "none",
  points: "none",
  vitiligo: "none",
  shading: false,
  reverse: false,
};

export interface BatchStageValue {
  /** Raw token as the renderer sees it ("LITTLE", "Tabby", "adult_long0", "true"). */
  value: string;
  /** Human label ("Little", "Tabby", "Adult Long 0", "Shaded"). */
  label: string;
}

/**
 * Title Case of a raw token: "RED_COLLAR" → "Red Collar". Mixed-case words
 * ("SingleColour", "Marbled") are kept as they are. Pose names go through
 * formatPoseName instead.
 */
export function formatBatchValue(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter((word) => word.length > 0)
    .map((word) => {
      const mixed = word !== word.toUpperCase() && word !== word.toLowerCase();
      if (mixed) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function stringifyTraitValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function isAbsentToken(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === false ||
    value === "" ||
    value === "none"
  );
}

type SimpleStage = Extract<BatchStage, { type: "simple" }>;
type SlotStage = Extract<BatchStage, { type: "accessory" | "scar" }>;
type TortieSubStage = Extract<BatchStage, { type: "tortie-sub" }>;
type RegistryStage = Extract<BatchStage, { type: "registry" }>;

/** The final coat choice (pelt + pattern) as the generator reads it. */
function finalCoatChoice(finalParams: Record<string, unknown>): string {
  return getCoatChoiceValue({
    peltName:
      typeof finalParams.peltName === "string"
        ? finalParams.peltName
        : undefined,
    coatPattern:
      typeof finalParams.coatPattern === "string"
        ? finalParams.coatPattern
        : undefined,
  });
}

function labelledStageValue(value: string): BatchStageValue {
  return { value, label: formatBatchValue(value) };
}

function simpleStageValue(
  finalParams: Record<string, unknown>,
  stage: SimpleStage,
): BatchStageValue | null {
  if (stage.param === "peltName") {
    return labelledStageValue(finalCoatChoice(finalParams));
  }
  if (stage.param === "poseName") {
    const pose = finalParams.poseName;
    if (typeof pose !== "string" || pose === "") return null;
    return { value: pose, label: formatPoseName(pose) };
  }
  if (stage.param === "shading" || stage.param === "reverse") {
    if (finalParams[stage.param] !== true) return null;
    return {
      value: "true",
      label: stage.param === "shading" ? "Shaded" : "Mirrored",
    };
  }
  const raw = finalParams[stage.param];
  if (isAbsentToken(raw)) return null;
  return labelledStageValue(stringifyTraitValue(raw));
}

function slotStageValue(
  cat: BatchStreamCat,
  stage: SlotStage,
): BatchStageValue | null {
  const slots =
    stage.type === "accessory"
      ? cat.catData.accessorySlots
      : cat.catData.scarSlots;
  const slot = slots[stage.slotIndex];
  if (!slot || slot === "none") return null;
  return labelledStageValue(slot);
}

function tortieSubStageValue(
  cat: BatchStreamCat,
  stage: TortieSubStage,
): BatchStageValue | null {
  const value = cat.catData.tortieSlots[stage.layerIndex]?.[stage.subElement];
  if (!value) return null;
  return labelledStageValue(value);
}

function registryStageValue(
  cat: BatchStreamCat,
  stage: RegistryStage,
): BatchStageValue | null {
  const finalValue = canonicalTraits(cat, catSystem)?.[stage.traitId];
  if (stage.strategy === "single") {
    if (isAbsentToken(finalValue)) return null;
    return labelledStageValue(stringifyTraitValue(finalValue));
  }
  const list = Array.isArray(finalValue) ? finalValue : [];
  const item: unknown = list[stage.slotIndex ?? 0];
  if (item === undefined) return null;
  return labelledStageValue(stringifyTraitValue(item));
}

/**
 * The value `stage` reveals on `cat`, or null when the stage leaves the cat
 * as it was ("none", missing slot, false boolean, missing tortie layer).
 * Pure; mirrors the branch of buildPartialBatchParams for that one stage.
 */
export function stageValueFor(
  cat: BatchStreamCat,
  stage: BatchStage,
): BatchStageValue | null {
  switch (stage.type) {
    case "simple":
      return simpleStageValue(
        cat.catData.params as unknown as Record<string, unknown>,
        stage,
      );
    case "accessory":
    case "scar":
      return slotStageValue(cat, stage);
    case "tortie-sub":
      return tortieSubStageValue(cat, stage);
    case "registry":
      return registryStageValue(cat, stage);
  }
}

/**
 * True when rendering stage k changes the cat's pixels versus stage k-1.
 * Not a deep-equal of buildPartialBatchParams (that returns the final
 * params untouched on the last stage, so every cat would read "changed"
 * on Pose): each stage type compares its own value against the bare-kit
 * placeholder it replaces.
 */
export function stageChanged(
  cat: BatchStreamCat,
  stages: BatchStage[],
  k: number,
  placeholders: BatchTortiePlaceholders = BATCH_TORTIE_PLACEHOLDER_FALLBACK,
): boolean {
  const stage = stages[k];
  if (!stage) return false;
  if (stage.type === "simple") {
    const value = stageValueFor(cat, stage);
    if (value === null) return false;
    const placeholder = BATCH_STAGE_PLACEHOLDERS[stage.param];
    return placeholder === undefined || value.value !== String(placeholder);
  }
  if (stage.type === "accessory" || stage.type === "scar") {
    return stageValueFor(cat, stage) !== null;
  }
  if (stage.type === "tortie-sub") {
    const layer = cat.catData.tortieSlots[stage.layerIndex];
    if (!layer) return false;
    const firstForLayer = stages.findIndex(
      (candidate) =>
        candidate.type === "tortie-sub" &&
        candidate.layerIndex === stage.layerIndex,
    );
    // The layer appears with this stage, placeholders and all.
    if (firstForLayer === k) return true;
    return layer[stage.subElement] !== placeholders[stage.subElement];
  }
  const finalValue = canonicalTraits(cat, catSystem)?.[stage.traitId];
  if (stage.strategy === "single") {
    return (
      finalValue !== undefined && finalValue !== "none" && finalValue !== false
    );
  }
  const list = Array.isArray(finalValue) ? finalValue : [];
  return list[stage.slotIndex ?? 0] !== undefined;
}

/** What the stages up to `revealedThrough` have uncovered, per stage type. */
interface BatchReveal {
  simple: Record<string, unknown> & { peltName: string; coatPattern?: string };
  accessorySlots: string[];
  scarSlots: string[];
  genericValues: Map<string, PartialTraitValue>;
  tortieRevealed: Map<number, Record<"mask" | "pattern" | "colour", boolean>>;
}

function revealSimpleStage(
  reveal: BatchReveal,
  finalParams: Record<string, unknown>,
  stage: SimpleStage,
): void {
  if (stage.param === "peltName") {
    applyCoatChoice(reveal.simple, finalCoatChoice(finalParams));
    return;
  }
  reveal.simple[stage.param] = finalParams[stage.param] ?? "none";
}

function revealSlotStage(
  reveal: BatchReveal,
  cat: BatchStreamCat,
  stage: SlotStage,
): void {
  if (stage.type === "accessory") {
    reveal.accessorySlots[stage.slotIndex] =
      cat.catData.accessorySlots[stage.slotIndex] ?? "none";
    return;
  }
  reveal.scarSlots[stage.slotIndex] =
    cat.catData.scarSlots[stage.slotIndex] ?? "none";
}

function revealTortieSubStage(
  reveal: BatchReveal,
  stage: TortieSubStage,
): void {
  const revealed = reveal.tortieRevealed.get(stage.layerIndex) ?? {
    mask: false,
    pattern: false,
    colour: false,
  };
  revealed[stage.subElement] = true;
  reveal.tortieRevealed.set(stage.layerIndex, revealed);
}

function revealRegistryStage(
  reveal: BatchReveal,
  finalTraits: Record<string, unknown> | null,
  stage: RegistryStage,
): void {
  const finalValue = finalTraits?.[stage.traitId];
  if (stage.strategy === "single") {
    reveal.genericValues.set(stage.traitId, {
      present: finalValue !== undefined,
      value: finalValue,
    });
    return;
  }
  const list = Array.isArray(finalValue) ? finalValue : [];
  reveal.genericValues.set(stage.traitId, {
    present: true,
    value: list.slice(0, (stage.slotIndex ?? 0) + 1),
  });
}

function collectReveal(
  cat: BatchStreamCat,
  stages: BatchStage[],
  revealedThrough: number,
  finalParams: Record<string, unknown>,
  finalTraits: Record<string, unknown> | null,
): BatchReveal {
  const reveal: BatchReveal = {
    simple: { ...BATCH_STAGE_PLACEHOLDERS, peltName: "SingleColour" },
    accessorySlots: [],
    scarSlots: [],
    genericValues: new Map(),
    tortieRevealed: new Map(),
  };
  for (
    let index = 0;
    index <= revealedThrough && index < stages.length;
    index++
  ) {
    const stage = stages[index];
    switch (stage.type) {
      case "simple":
        revealSimpleStage(reveal, finalParams, stage);
        break;
      case "accessory":
      case "scar":
        revealSlotStage(reveal, cat, stage);
        break;
      case "tortie-sub":
        revealTortieSubStage(reveal, stage);
        break;
      case "registry":
        revealRegistryStage(reveal, finalTraits, stage);
        break;
    }
  }
  return reveal;
}

/** Revealed tortie layers; unrevealed sub-elements show the placeholders. */
function revealedTortieLayers(
  cat: BatchStreamCat,
  tortieRevealed: BatchReveal["tortieRevealed"],
  placeholders: BatchTortiePlaceholders,
): BatchTortieLayer[] {
  const tortie: BatchTortieLayer[] = [];
  for (const [layerIndex, revealed] of tortieRevealed) {
    const slot = cat.catData.tortieSlots[layerIndex];
    if (!slot) continue;
    tortie.push({
      mask: revealed.mask ? slot.mask : placeholders.mask,
      pattern: revealed.pattern ? slot.pattern : placeholders.pattern,
      colour: revealed.colour ? slot.colour : placeholders.colour,
    });
  }
  return tortie;
}

/** The flat (legacy) render params for the reveal so far. */
function flatPartialParams(
  reveal: BatchReveal,
  finalParams: Record<string, unknown>,
  tortie: BatchTortieLayer[],
): Record<string, unknown> {
  const { simple } = reveal;
  const accessories = reveal.accessorySlots.filter(
    (value) => value && value !== "none",
  );
  const scars = reveal.scarSlots.filter((value) => value && value !== "none");
  const params: Record<string, unknown> = {
    spriteNumber: 8,
    poseName: simple.poseName || DEFAULT_POSE_NAME,
    peltName: simple.peltName,
    coatPattern: simple.coatPattern,
    colour: simple.colour,
    tint: simple.tint,
    skinColour: simple.skinColour,
    eyeColour: simple.eyeColour,
    shading: !!simple.shading,
    reverse: !!simple.reverse,
    darkForest: !!finalParams.darkForest,
    darkMode: !!finalParams.darkForest,
    dead: !!finalParams.dead,
    accessories,
    accessory: accessories[0],
    scars,
    scar: scars[0],
    tortie,
    isTortie: tortie.length > 0,
  };
  for (const key of NONE_AS_UNDEFINED) {
    const value = simple[key];
    if (value && value !== "none") params[key] = value;
  }
  return params;
}

/** The legacy trait id a non-registry stage reveals. */
function legacyTraitIdFor(stage: BatchStage): string | null {
  switch (stage.type) {
    case "registry":
      return null;
    case "accessory":
      return "accessories";
    case "scar":
      return "scars";
    case "tortie-sub":
      return "tortie";
    case "simple":
      if (stage.param === "peltName") return "pelt";
      if (stage.param === "poseName") return "pose";
      return stage.param;
  }
}

function legacyStageTraitIds(stages: BatchStage[]): Set<string> {
  const ids = new Set<string>();
  for (const stage of stages) {
    const id = legacyTraitIdFor(stage);
    if (id !== null) ids.add(id);
  }
  return ids;
}

type TraitDefinitions = Map<string, AnyCatTraitDefinition>;

/** Legacy traits follow the flat params: staged ones always, the rest only when present. */
function applyLegacyPartialTraits(
  partialTraits: Record<string, unknown>,
  params: Record<string, unknown>,
  system: CatSystemDefinition,
  definitions: TraitDefinitions,
  legacyIds: Set<string>,
): void {
  for (const traitId of legacyIds) {
    const definition = definitions.get(traitId);
    if (!definition) continue;
    setPartialTrait(
      partialTraits,
      traitId,
      normalizePartialTraitValue(
        definition,
        readLegacyTraitValue(params, definition),
      ),
    );
  }
  for (const definition of system.traits) {
    if (legacyIds.has(definition.id)) continue;
    const current = readLegacyTraitValue(params, definition);
    if (current.present) {
      setPartialTrait(
        partialTraits,
        definition.id,
        normalizePartialTraitValue(definition, current),
      );
    }
  }
  if (legacyIds.has("pelt")) {
    if (typeof params.coatPattern === "string") {
      partialTraits.coatPattern = params.coatPattern;
    } else {
      delete partialTraits.coatPattern;
    }
  }
}

/** Registry traits: the revealed value, or the hidden default, in both envelopes. */
function applyRegistryPartialTraits(
  partialTraits: Record<string, unknown>,
  params: Record<string, unknown>,
  stages: BatchStage[],
  definitions: TraitDefinitions,
  genericValues: Map<string, PartialTraitValue>,
): void {
  for (const stage of stages) {
    if (stage.type !== "registry") continue;
    const definition = definitions.get(stage.traitId);
    if (!definition) continue;
    const current =
      genericValues.get(stage.traitId) ?? hiddenTraitValue(definition);
    setPartialTrait(partialTraits, stage.traitId, current);
    writeLegacyTraitValue(params, definition, current);
  }
}

interface PartialTraitsArgs {
  finalParams: Record<string, unknown>;
  finalTraits: Record<string, unknown>;
  stages: BatchStage[];
  genericValues: Map<string, PartialTraitValue>;
  system: CatSystemDefinition;
}

/**
 * Keeps the canonical envelope in lockstep with the established flat
 * reveal. This prevents the renderer from seeing final values early.
 */
function attachPartialTraits(
  params: Record<string, unknown>,
  {
    finalParams,
    finalTraits,
    stages,
    genericValues,
    system,
  }: PartialTraitsArgs,
): void {
  const partialTraits = cloneValue(finalTraits);
  const definitions: TraitDefinitions = new Map(
    system.traits.map((trait) => [trait.id, trait] as const),
  );
  const legacyIds = legacyStageTraitIds(stages);
  applyLegacyPartialTraits(
    partialTraits,
    params,
    system,
    definitions,
    legacyIds,
  );
  applyRegistryPartialTraits(
    partialTraits,
    params,
    stages,
    definitions,
    genericValues,
  );
  params.schemaVersion =
    typeof finalParams.schemaVersion === "number"
      ? finalParams.schemaVersion
      : system.schemaVersion;
  params.traits = partialTraits;
  if (finalParams.unknownTraits !== undefined) {
    params.unknownTraits = cloneValue(finalParams.unknownTraits);
  }
}

/**
 * Render params for a cat with stages 0..revealedThrough applied
 * (revealedThrough = -1 renders the unrevealed base kit). Mirrors the
 * adoption generator's buildInitialState/applyStageValue/buildRenderParams.
 */
export function buildPartialBatchParams(
  cat: BatchStreamCat,
  stages: BatchStage[],
  revealedThrough: number,
  placeholders: BatchTortiePlaceholders = BATCH_TORTIE_PLACEHOLDER_FALLBACK,
  system: CatSystemDefinition = catSystem,
): CatParams {
  const finalParams = cat.catData.params as unknown as Record<string, unknown>;
  const finalTraits = canonicalTraits(cat, system);

  // Everything revealed → render the real params untouched.
  if (revealedThrough >= stages.length - 1) {
    return cat.catData.params;
  }

  const reveal = collectReveal(
    cat,
    stages,
    revealedThrough,
    finalParams,
    finalTraits,
  );
  const tortie = revealedTortieLayers(cat, reveal.tortieRevealed, placeholders);
  const params = flatPartialParams(reveal, finalParams, tortie);
  if (finalTraits) {
    attachPartialTraits(params, {
      finalParams,
      finalTraits,
      stages,
      genericValues: reveal.genericValues,
      system,
    });
  }
  return params as unknown as CatParams;
}

/**
 * A cat's fixed show number: its 1-based position in the command's pool.
 * Numbers never change during a show (culled cats keep theirs), so chat
 * can say "number 13" and the streamer finds it on the control board.
 */
export function batchCatNumber(
  cats: readonly { id: string }[],
  catId: string,
): number {
  const index = cats.findIndex((cat) => cat.id === catId);
  return index < 0 ? 0 : index + 1;
}

/** Two-digit show number for overlays and the control board ("07", "23"). */
export function formatBatchNumber(number: number): string {
  return String(Math.max(0, Math.trunc(number))).padStart(2, "0");
}

/**
 * Parse what the streamer typed into the pick-by-number field. Accepts
 * "13", "#13", "no 13" and "cat 13"; rejects anything without a single
 * number inside the pool.
 */
export function parseBatchNumberInput(
  input: string,
  poolSize: number,
): number | null {
  const match = /(\d{1,3})/.exec(input);
  if (!match) return null;
  const number = Number.parseInt(match[1], 10);
  if (!Number.isFinite(number) || number < 1 || number > poolSize) return null;
  return number;
}
