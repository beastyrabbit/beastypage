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
import { DEFAULT_POSE_NAME } from "@/lib/cat-v3/poseOptions";
import type { CatParams } from "@/lib/cat-v3/types";

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
      return traits && traits[trait.id] !== undefined ? [traits[trait.id]] : [];
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
  const stages: BatchStage[] = [];
  stages.push({
    id: "colour",
    label: "Colour",
    type: "simple",
    param: "colour",
  });
  stages.push({
    id: "peltName",
    label: "Pelt",
    type: "simple",
    param: "peltName",
  });
  stages.push({
    id: "eyeColour",
    label: "Eyes",
    type: "simple",
    param: "eyeColour",
  });
  stages.push({
    id: "eyeColour2",
    label: "Eye Colour 2",
    type: "simple",
    param: "eyeColour2",
  });
  for (let i = 0; i < config.tortieCount; i++) {
    stages.push({
      id: `tortie-${i}-mask`,
      label: `Tortie ${i + 1} Mask`,
      type: "tortie-sub",
      layerIndex: i,
      subElement: "mask",
    });
    stages.push({
      id: `tortie-${i}-pattern`,
      label: `Tortie ${i + 1} Pelt`,
      type: "tortie-sub",
      layerIndex: i,
      subElement: "pattern",
    });
    stages.push({
      id: `tortie-${i}-colour`,
      label: `Tortie ${i + 1} Colour`,
      type: "tortie-sub",
      layerIndex: i,
      subElement: "colour",
    });
  }
  stages.push({ id: "tint", label: "Tint", type: "simple", param: "tint" });
  stages.push({
    id: "skinColour",
    label: "Skin",
    type: "simple",
    param: "skinColour",
  });
  stages.push({
    id: "whitePatches",
    label: "White Patches",
    type: "simple",
    param: "whitePatches",
  });
  stages.push({
    id: "points",
    label: "Points",
    type: "simple",
    param: "points",
  });
  stages.push({
    id: "whitePatchesTint",
    label: "Patches Tint",
    type: "simple",
    param: "whitePatchesTint",
  });
  stages.push({
    id: "vitiligo",
    label: "Vitiligo",
    type: "simple",
    param: "vitiligo",
  });
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
  stages.push(...buildGenericBatchStages(cats, system));
  stages.push({
    id: "shading",
    label: "Shading",
    type: "simple",
    param: "shading",
  });
  stages.push({
    id: "reverse",
    label: "Reverse",
    type: "simple",
    param: "reverse",
  });
  stages.push({
    id: "poseName",
    label: "Pose",
    type: "simple",
    param: "poseName",
  });
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

function writeLegacyTraitValue(
  params: Record<string, unknown>,
  trait: AnyCatTraitDefinition,
  current: { present: boolean; value?: unknown },
): void {
  const value = current.value;
  switch (trait.legacy.strategy) {
    case "direct":
      if (current.present) params[trait.legacy.key] = cloneValue(value);
      else delete params[trait.legacy.key];
      break;
    case "list": {
      const list =
        current.present && Array.isArray(value) ? cloneValue(value) : [];
      params[trait.legacy.key] = list;
      if (trait.legacy.singleKey) {
        if (list.length > 0) params[trait.legacy.singleKey] = list[0];
        else delete params[trait.legacy.singleKey];
      }
      break;
    }
    case "pose":
      if (current.present) params[trait.legacy.key] = value;
      else delete params[trait.legacy.key];
      break;
    case "tortie": {
      const layers =
        current.present && Array.isArray(value) ? cloneValue(value) : [];
      params.tortie = layers;
      params.isTortie = layers.length > 0;
      break;
    }
    case "booleanAlias": {
      const enabled = current.present && Boolean(value);
      params[trait.legacy.key] = enabled;
      for (const alias of trait.legacy.aliases) params[alias] = enabled;
      break;
    }
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

  const simple: Record<string, unknown> & {
    peltName: string;
    coatPattern?: string;
  } = {
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
  const accessorySlots: string[] = [];
  const scarSlots: string[] = [];
  const genericValues = new Map<
    string,
    { present: boolean; value?: unknown }
  >();
  const tortieRevealed = new Map<
    number,
    { mask: boolean; pattern: boolean; colour: boolean }
  >();

  for (
    let index = 0;
    index <= revealedThrough && index < stages.length;
    index++
  ) {
    const stage = stages[index];
    if (stage.type === "simple") {
      if (stage.param === "peltName") {
        applyCoatChoice(
          simple,
          getCoatChoiceValue({
            peltName:
              typeof finalParams.peltName === "string"
                ? finalParams.peltName
                : undefined,
            coatPattern:
              typeof finalParams.coatPattern === "string"
                ? finalParams.coatPattern
                : undefined,
          }),
        );
      } else {
        simple[stage.param] = finalParams[stage.param] ?? "none";
      }
    } else if (stage.type === "accessory") {
      accessorySlots[stage.slotIndex] =
        cat.catData.accessorySlots[stage.slotIndex] ?? "none";
    } else if (stage.type === "scar") {
      scarSlots[stage.slotIndex] =
        cat.catData.scarSlots[stage.slotIndex] ?? "none";
    } else if (stage.type === "tortie-sub") {
      const revealed = tortieRevealed.get(stage.layerIndex) ?? {
        mask: false,
        pattern: false,
        colour: false,
      };
      revealed[stage.subElement] = true;
      tortieRevealed.set(stage.layerIndex, revealed);
    } else {
      const finalValue = finalTraits?.[stage.traitId];
      if (stage.strategy === "single") {
        genericValues.set(stage.traitId, {
          present: finalValue !== undefined,
          value: finalValue,
        });
      } else {
        const list = Array.isArray(finalValue) ? finalValue : [];
        genericValues.set(stage.traitId, {
          present: true,
          value: list.slice(0, (stage.slotIndex ?? 0) + 1),
        });
      }
    }
  }

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

  const accessories = accessorySlots.filter(
    (value) => value && value !== "none",
  );
  const scars = scarSlots.filter((value) => value && value !== "none");

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

  if (finalTraits) {
    const partialTraits = cloneValue(finalTraits);
    const definitions = new Map(
      system.traits.map((trait) => [trait.id, trait] as const),
    );

    // Keep the canonical envelope in lockstep with the established flat
    // reveal. This prevents the renderer from seeing final values early.
    const legacyStageTraitIds = new Set<string>();
    for (const stage of stages) {
      if (stage.type === "registry") continue;
      if (stage.type === "accessory") legacyStageTraitIds.add("accessories");
      else if (stage.type === "scar") legacyStageTraitIds.add("scars");
      else if (stage.type === "tortie-sub") legacyStageTraitIds.add("tortie");
      else if (stage.param === "peltName") legacyStageTraitIds.add("pelt");
      else if (stage.param === "poseName") legacyStageTraitIds.add("pose");
      else legacyStageTraitIds.add(stage.param);
    }
    for (const traitId of legacyStageTraitIds) {
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
      if (legacyStageTraitIds.has(definition.id)) continue;
      const current = readLegacyTraitValue(params, definition);
      if (current.present) {
        setPartialTrait(
          partialTraits,
          definition.id,
          normalizePartialTraitValue(definition, current),
        );
      }
    }
    if (legacyStageTraitIds.has("pelt")) {
      if (typeof params.coatPattern === "string") {
        partialTraits.coatPattern = params.coatPattern;
      } else {
        delete partialTraits.coatPattern;
      }
    }

    for (const stage of stages) {
      if (stage.type !== "registry") continue;
      const definition = definitions.get(stage.traitId);
      if (!definition) continue;
      const current =
        genericValues.get(stage.traitId) ?? hiddenTraitValue(definition);
      setPartialTrait(partialTraits, stage.traitId, current);
      writeLegacyTraitValue(params, definition, current);
    }

    params.schemaVersion =
      typeof finalParams.schemaVersion === "number"
        ? finalParams.schemaVersion
        : system.schemaVersion;
    params.traits = partialTraits;
    if (finalParams.unknownTraits !== undefined) {
      params.unknownTraits = cloneValue(finalParams.unknownTraits);
    }
  }
  return params as unknown as CatParams;
}
