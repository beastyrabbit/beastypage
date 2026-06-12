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
  | { id: string; label: string; type: "scar"; slotIndex: number };

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

/** Same stage order as the adoption generator page. */
export function buildBatchStagePlan(config: BatchLayerConfig): BatchStage[] {
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

export function batchStartCount(config: BatchLayerConfig, finalCount: number) {
  return finalCount + buildBatchStagePlan(config).length;
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
): CatParams {
  const finalParams = cat.catData.params as unknown as Record<string, unknown>;

  // Everything revealed → render the real params untouched.
  if (revealedThrough >= stages.length - 1) {
    return cat.catData.params;
  }

  const simple: Record<string, unknown> = {
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
      simple[stage.param] = finalParams[stage.param] ?? "none";
    } else if (stage.type === "accessory") {
      accessorySlots[stage.slotIndex] =
        cat.catData.accessorySlots[stage.slotIndex] ?? "none";
    } else if (stage.type === "scar") {
      scarSlots[stage.slotIndex] =
        cat.catData.scarSlots[stage.slotIndex] ?? "none";
    } else {
      const revealed = tortieRevealed.get(stage.layerIndex) ?? {
        mask: false,
        pattern: false,
        colour: false,
      };
      revealed[stage.subElement] = true;
      tortieRevealed.set(stage.layerIndex, revealed);
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
  return params as unknown as CatParams;
}
