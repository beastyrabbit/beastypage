/**
 * Runtime contracts for every JSON column that replaces a Convex `v.any()`
 * field (#107). The importer validates archived documents with these schemas,
 * and the server data layer validates writes with the same ones.
 *
 * Policy (docs/migration/data-contract.md):
 * - Known keys are type-checked. Shapes come from the frontend writers.
 * - Unknown keys are kept, but only as JSON values. The tolerant readers
 *   (normalizeCatViewPayload, parse*Payload) depend on legacy aliases such as
 *   `pose_name` or `autoClearSeconds`, so dropping keys would change behavior.
 *   NaN, Infinity, undefined, functions and class instances are rejected.
 * - Optional keys inside formerly untyped payloads also accept `null`:
 *   Convex stored nulls there and readers use `??`.
 * - Size caps match what Convex enforced (or its 1 MiB document limit).
 * - Records that fail are quarantined by the importer, never coerced.
 */
import { z } from "zod";

export const CONTRACT_VERSION = 1;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);

const jsonObject = z.record(z.string(), jsonValue);

const encoder = new TextEncoder();

/** Serialized UTF-8 size of a JSON value. */
export function jsonByteLength(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).length;
}

function capped<T extends z.ZodType>(
  schema: T,
  maxBytes: number,
  label: string,
) {
  return schema.superRefine((value, ctx) => {
    const size = jsonByteLength(value);
    if (size > maxBytes) {
      ctx.addIssue({
        code: "custom",
        message: `${label} is ${size} bytes; the limit is ${maxBytes}`,
      });
    }
  });
}

const KIB = 1024;
const opt = <T extends z.ZodType>(schema: T) => schema.nullish();
const str = z.string();
const num = z.number();
const bool = z.boolean();
const nullableString = z.string().nullable();
const range = z.object({ min: num, max: num }).catchall(jsonValue);

// ------------------------------------------------------------ cat params

/** `TortieLayer` (lib/cat-v3/types.ts). Readers also accept `peltName`/`color`. */
export const tortieLayer = z
  .object({ pattern: opt(str), colour: opt(str), mask: opt(str) })
  .catchall(jsonValue);

/** Legacy flat `CatParams` (lib/cat-v3/types.ts:15) plus the canonical envelope. */
export const catParams = z
  .object({
    spriteNumber: opt(num),
    peltName: opt(str),
    colour: opt(str),
    isTortie: opt(bool),
    eyeColour: opt(str),
    skinColour: opt(str),
    shading: opt(bool),
    reverse: opt(bool),
    poseName: opt(str),
    coatPattern: opt(str),
    tortiePattern: opt(str),
    tortieColour: opt(str),
    tortieMask: opt(str),
    eyeColour2: opt(str),
    whitePatches: opt(str),
    whitePatchesTint: opt(str),
    points: opt(str),
    vitiligo: opt(str),
    tint: opt(str),
    accessory: opt(str),
    scar: opt(str),
    basePalette: opt(str),
    experimentalColourMode: opt(str),
    tortiePalette: opt(str),
    tortie: opt(z.array(tortieLayer.nullable())),
    accessories: opt(z.array(nullableString)),
    scars: opt(z.array(nullableString)),
    darkForest: opt(bool),
    darkMode: opt(bool),
    dead: opt(bool),
    schemaVersion: opt(num),
    traits: opt(jsonObject),
    unknownTraits: opt(jsonObject),
  })
  .catchall(jsonValue);
export type CatParamsContract = z.infer<typeof catParams>;

/**
 * Structural check of the canonical cat document. Catalog validation
 * (`catDocumentSchema`) stays a write-time concern of the app; historical
 * documents must not be quarantined because the trait catalog later changed.
 */
export const catDocument = z
  .object({
    schemaVersion: num,
    traits: jsonObject,
    unknownTraits: opt(jsonObject),
  })
  .catchall(jsonValue);

const timelineStep = z
  .object({
    id: opt(str),
    title: opt(str),
    summary: opt(str),
    optionKey: opt(str),
    label: opt(str),
    votes: opt(num),
    params: opt(catParams),
  })
  .catchall(jsonValue);

/**
 * Saved cat payload (`cat_profile.catData`, adoption cats). One envelope
 * covers every producer: SingleCatPlus, stream spin, builders, streamer
 * voting, evolution, adoption, stream batch and Discord.
 */
export const catData = z
  .object({
    mode: opt(str),
    version: opt(num),
    params: opt(catParams),
    finalParams: opt(catParams),
    spriteNumber: opt(num),
    poseName: opt(str),
    basePalette: opt(str),
    tortiePalette: opt(str),
    accessorySlots: opt(z.array(nullableString)),
    scarSlots: opt(z.array(nullableString)),
    tortieSlots: opt(z.array(tortieLayer.nullable())),
    counts: opt(z.record(z.string(), num)),
    metaLocked: opt(bool),
    shareSlug: opt(str),
    steps: opt(z.array(timelineStep)),
    timeline: opt(z.array(timelineStep)),
    document: opt(catDocument),
    evolution: opt(jsonObject),
  })
  .catchall(jsonValue);
export type CatData = z.infer<typeof catData>;

/** Profiles had no Convex cap; 900 KiB matches the batch and tree caps. */
export const catProfileData = capped(catData, 900 * KIB, "cat_profile.catData");

// -------------------------------------------------------- simple fields

/** No reader uses `cat_images.meta`; it is kept as bounded JSON. */
export const catImageMeta = capped(jsonValue, 64 * KIB, "cat_images.meta");

/** `CatShareStoredPayloadV1` (v: 1) and the canonical-only v: 2. */
export const catShareData = capped(
  z.discriminatedUnion("v", [
    z
      .object({
        v: z.literal(1),
        document: opt(catDocument),
        params: jsonObject,
        slots: z.record(z.string(), z.array(jsonValue)),
        counts: z.record(z.string(), num),
      })
      .catchall(jsonValue),
    z
      .object({
        v: z.literal(2),
        document: catDocument,
        slots: opt(z.record(z.string(), z.array(jsonValue))),
        counts: opt(z.record(z.string(), num)),
      })
      .catchall(jsonValue),
  ]),
  256 * KIB,
  "cat_shares.data",
);
export type CatShareData = z.infer<typeof catShareData>;

// -------------------------------------------------------------- settings

/** `SingleCatSettings` (utils/singleCatVariants.ts). Read through parseSingleCatPayload. */
export const singleCatConfigShape = z
  .object({
    v: opt(num),
    mode: opt(z.enum(["flashy", "calm"])),
    timing: opt(
      z
        .object({
          allowFastFlips: opt(bool),
          delays: opt(z.record(z.string(), num)),
          pauseDelays: opt(
            z.object({ flashyMs: num, calmMs: num }).catchall(jsonValue),
          ),
        })
        .catchall(jsonValue),
    ),
    speedMultiplier: opt(num),
    accessoryRange: opt(range),
    scarRange: opt(range),
    tortieRange: opt(range),
    exactLayerCounts: opt(bool),
    afterlifeMode: opt(str),
    extendedModes: opt(z.array(str)),
    includeBaseColours: opt(bool),
    includeNewSprites: opt(bool),
    catName: opt(str),
    creatorName: opt(str),
  })
  .catchall(jsonValue);
export const singleCatConfig = capped(
  singleCatConfigShape,
  256 * KIB,
  "single_cat_settings.config",
);
export type SingleCatConfig = z.infer<typeof singleCatConfigShape>;

const generatedPalette = z
  .object({
    id: str,
    colors: z.array(str),
    seed: opt(z.union([str, num])),
    mode: opt(str),
    ms: opt(num),
    source: opt(str),
    timestamp: opt(num),
  })
  .catchall(jsonValue);

const discordColor = z
  .object({
    hex: str,
    rgb: jsonValue,
    prevalence: num,
  })
  .catchall(jsonValue);

/**
 * Web palette settings or a Discord palette. The Discord variant's
 * `imageStorageId` moves into the `image_file_id` column on import, so it
 * may not appear in the stored config.
 */
export const paletteGeneratorConfigShape = z.union([
  z
    .object({
      source: z.literal("discord"),
      colors: z.array(discordColor).max(24),
    })
    .catchall(jsonValue)
    .refine((value) => !("imageStorageId" in value), {
      message:
        "imageStorageId belongs in palette_generator_settings.image_file_id",
    }),
  z
    .object({
      v: opt(num),
      paletteSize: opt(num),
      displayFormat: opt(str),
      collection: opt(z.array(generatedPalette)),
    })
    .catchall(jsonValue)
    .refine((value) => value.source !== "discord", {
      message: "invalid discord palette",
    }),
]);
export const paletteGeneratorConfig = capped(
  paletteGeneratorConfigShape,
  256 * KIB,
  "palette_generator_settings.config",
);
export type PaletteGeneratorConfig = z.infer<
  typeof paletteGeneratorConfigShape
>;

const pipelineStep = z
  .object({
    id: str,
    algorithm: str,
    params: opt(jsonObject),
    inputSource: opt(str),
    blendWith: opt(
      z.object({ stepId: str, mode: str, opacity: num }).catchall(jsonValue),
    ),
    enabled: opt(bool),
    label: opt(str),
  })
  .catchall(jsonValue);

/** `PixelatorSettings` (utils/pixelatorVariants.ts). */
export const pixelatorConfigShape = z
  .object({
    v: opt(num),
    pipeline: opt(
      z.object({ steps: z.array(pipelineStep) }).catchall(jsonValue),
    ),
    pixelArtMode: opt(bool),
    pixelArtGridSize: opt(num),
  })
  .catchall(jsonValue);
export const pixelatorConfig = capped(
  pixelatorConfigShape,
  256 * KIB,
  "pixelator_settings.config",
);
export type PixelatorConfig = z.infer<typeof pixelatorConfigShape>;

/** `DashSettings` (lib/dash/types.ts). */
export const dashConfigShape = z
  .object({
    v: opt(num),
    widgets: opt(z.array(str)),
    lastSeenVersion: opt(str),
  })
  .catchall(jsonValue);
export const dashConfig = capped(
  dashConfigShape,
  256 * KIB,
  "dash_settings.config",
);
export type DashConfig = z.infer<typeof dashConfigShape>;

/** `user_variants.settings` is checked against the shape for its `tool_key`. */
export const userVariantToolKeys = [
  "singleCatPlus",
  "pixelator",
  "dash",
] as const;
export type UserVariantToolKey = (typeof userVariantToolKeys)[number];
export const userVariantSettingsByTool = {
  singleCatPlus: singleCatConfig,
  pixelator: pixelatorConfig,
  dash: dashConfig,
} as const satisfies Record<UserVariantToolKey, z.ZodType>;
export type UserVariantSettings =
  | SingleCatConfig
  | PixelatorConfig
  | DashConfig;

// --------------------------------------------------------------- adoption

const evolutionStarter = z
  .object({
    type: opt(z.enum(["random", "history"])),
    slug: opt(str),
    profileId: opt(str),
    catName: opt(str),
    creatorName: opt(str),
    colour: opt(str),
    peltName: opt(str),
    coatPattern: opt(str),
  })
  .catchall(jsonValue);

/**
 * Batch settings from the evolution generator, the adoption generator or a
 * stream batch (`source`). Older batches may have no `source`.
 * `starter.profileId` is a cat_profile id and is rewritten on import.
 */
export const adoptionBatchSettingsShape = z
  .object({
    source: opt(
      z.enum(["evolution-generator", "adoption-generator", "stream-batch"]),
    ),
    batchTitle: opt(str),
    batchCreator: opt(str),
    starter: opt(evolutionStarter),
    accessoryCount: opt(num),
    scarCount: opt(num),
    tortieCount: opt(num),
    totalFinalCats: opt(num),
    totalCats: opt(num),
    afterlifeMode: opt(str),
    extendedModes: opt(z.array(str)),
    selectedExtendedModes: opt(z.array(str)),
    includeBaseColours: opt(bool),
    branchCount: opt(num),
    targetLevel: opt(num),
    branchArchetypes: opt(z.array(str)),
  })
  .catchall(jsonValue);
export type AdoptionBatchSettings = z.infer<typeof adoptionBatchSettingsShape>;

/** One `adoption_batch.cats[]` element (normalized into adoption_batch_cats). */
export const adoptionBatchCat = z.object({
  label: str,
  catData,
  profileId: opt(str),
  encoded: opt(str),
  shareToken: opt(str),
  editToken: opt(str),
  catName: opt(str),
  creatorName: opt(str),
});

/** Convex `createBatch` limits: 200 cats, 900 KiB of JSON. */
export const ADOPTION_BATCH_MAX_CATS = 200;
export const ADOPTION_BATCH_MAX_BYTES = 900 * KIB;

// ---------------------------------------------------------------- ancestry

const geneticTrait = <T extends z.ZodType>(value: T) =>
  z
    .object({ allele1: value, allele2: value, expressed: value })
    .catchall(jsonValue);

const tortieGenetics = z
  .object({
    hasTortieGene: bool,
    patterns: z.array(str),
    masks: z.array(str),
    colours: z.array(str),
  })
  .catchall(jsonValue);

/** `CatGenetics` (lib/ancestry-tree/types.ts). Old trees may lack `tortieData`. */
export const catGenetics = z
  .object({
    pelt: geneticTrait(str),
    colour: geneticTrait(str),
    eyeColour: geneticTrait(str),
    skinColour: geneticTrait(str),
    whitePatches: geneticTrait(nullableString),
    isTortie: geneticTrait(bool),
    tortieData: opt(geneticTrait(tortieGenetics.nullable())),
  })
  .catchall(jsonValue);

/** Mirrors the Convex validator; ids are tree-local strings. */
export const ancestryCat = z.object({
  id: str,
  name: z.object({ prefix: str, suffix: str, full: str }),
  gender: z.enum(["M", "F"]),
  lifeStage: str,
  params: catParams,
  motherId: nullableString,
  fatherId: nullableString,
  partnerIds: z.array(str),
  childrenIds: z.array(str),
  genetics: catGenetics,
  source: str,
  historyProfileId: z.string().optional(),
  generation: num,
});
export type AncestryCat = z.infer<typeof ancestryCat>;

/** Convex `assertTreeSize`: at most 500 cats and 900 KiB. */
export const ancestryCats = capped(
  z.array(ancestryCat).max(500),
  900 * KIB,
  "ancestry_tree.cats",
);

export const ancestryTreeConfig = z.object({
  minChildren: num,
  maxChildren: num,
  depth: num,
  genderRatio: num,
  partnerChance: z.number().optional(),
  paletteModes: z.array(str).optional(),
  offspringOptions: z
    .object({
      accessoryChance: num,
      maxAccessories: num,
      scarChance: num,
      maxScars: num,
    })
    .optional(),
});
export type AncestryTreeConfig = z.infer<typeof ancestryTreeConfig>;

// -------------------------------------------------------------- streamer

/** `StreamerHistoryEntry` (lib/streamer/share.ts). */
export const streamStepHistory = z.array(
  z
    .object({
      step_id: opt(str),
      title: opt(str),
      option_key: opt(str),
      label: opt(str),
      votes: opt(num),
    })
    .catchall(jsonValue),
);
export type StreamStepHistory = z.infer<typeof streamStepHistory>;

/** `StreamerParams` (lib/streamer/steps.d.ts): cat params plus `_` control keys. */
export const streamParamsShape = catParams.extend({
  _tortieLayers: opt(num),
  _accessorySlots: opt(num),
  _scarSlots: opt(num),
  _tieIteration: opt(num),
  _signupsOpen: opt(bool),
  _votesOpen: opt(bool),
  _disabledOptions: opt(z.record(z.string(), z.array(str))),
  _tieFilter: opt(z.array(str)),
  _streamerVoteKeys: opt(z.record(z.string(), str)),
  _finalShareSlug: opt(str),
  _finalShareUrl: opt(str),
  _paletteMode: opt(str),
  _finalName: opt(str),
  _finalCreator: opt(str),
});
export const streamParams = capped(
  streamParamsShape,
  900 * KIB,
  "stream_sessions.params",
);
export type StreamParams = z.infer<typeof streamParamsShape>;

/**
 * Rebuilt by the server in Convex: a participant vote or a host vote.
 * `participantId` is a stream_participants id and is rewritten on import.
 */
export const streamVoteOptionMeta = z.union([
  z.object({ participantId: str, participantName: str }).strict(),
  z
    .object({
      streamer: z.literal(true),
      label: z.string().max(160).optional(),
      step: z.string().max(160).optional(),
      via: z.literal("coinFlip").optional(),
    })
    .strict(),
]);
export type StreamVoteOptionMeta = z.infer<typeof streamVoteOptionMeta>;

// ------------------------------------------------------- perfect cat finder

/**
 * `CatRenderParams` without `document`. The stored value feeds the dedupe
 * hash (`stableStringify`), so it is stored exactly as received.
 */
export const perfectCatParams = capped(
  z
    .object({
      spriteNumber: opt(num),
      poseName: opt(str),
      params: catParams,
    })
    .catchall(jsonValue),
  32 * KIB,
  "perfect_cats.params",
);
export type PerfectCatParams = z.infer<typeof perfectCatParams>;

// --------------------------------------------------------- OBS stream show

/**
 * Overlay settings: SingleCatSettings plus lobby, auto-clear, BRB and look
 * keys. Writes merge into the stored bag, so legacy keys remain.
 */
export const catStreamSettingsShape = singleCatConfigShape.extend({
  lobbyMode: opt(str),
  lobbyCatCount: opt(num),
  lobbyMoveSpeed: opt(num),
  lobbySwapSpeed: opt(num),
  lobbyCatMinSize: opt(num),
  lobbyCatMaxSize: opt(num),
  lobbyAutoClearSeconds: opt(num),
  lobbyClearSeq: opt(num),
  paletteDisplayMode: opt(str),
  lobbyInfoMode: opt(str),
  evolutionInfo: opt(jsonObject),
  batchInfo: opt(jsonObject),
  resultAutoClearEnabled: opt(bool),
  resultAutoClearSeconds: opt(num),
  autoClearEnabled: opt(bool),
  autoClearSeconds: opt(num),
  brbSettingsCode: opt(str),
  obsLayoutMode: opt(str),
  obsBgMode: opt(str),
  obsBgColour: opt(str),
  obsBgOpacity: opt(num),
  overlayTheme: opt(str),
  batchTheme: opt(str),
  evolutionLook: opt(str),
});
export const catStreamSettings = capped(
  catStreamSettingsShape,
  256 * KIB,
  "cat_stream_sessions.settings",
);
export type CatStreamSettings = z.infer<typeof catStreamSettingsShape>;

/** `SlotSelections` (lib/cat-v3/types.ts). */
export const slotSelections = z
  .object({
    accessories: opt(z.array(nullableString)),
    scars: opt(z.array(nullableString)),
    tortie: opt(z.array(tortieLayer.nullable())),
  })
  .catchall(jsonValue);

export const wheelSpin = z.object({
  prizeName: str,
  prizeIndex: num,
  color: str,
  chance: num,
  randomBucket: z.number().optional(),
  forced: bool,
});

const evolutionAddition = z
  .object({ traitId: str, label: str })
  .catchall(jsonValue);

/** `EvolutionStreamCommand` (lib/evolution/streamEvolution.ts). */
export const evolutionCommand = z.object({
  slug: str,
  totalCount: num,
  chargeDurationMs: z.number().optional(),
  cats: z.array(
    z.object({
      key: str,
      label: str,
      level: num,
      branchLabel: nullableString,
      archetype: nullableString,
      additions: z.array(evolutionAddition),
      catData,
    }),
  ),
});

/** `BatchStreamCommand` (lib/adoption/streamBatch.ts). */
export const batchCommand = z.object({
  slug: z.string().optional(),
  title: z.string().optional(),
  finalCount: num,
  config: z.object({ accessoryCount: num, scarCount: num, tortieCount: num }),
  cats: z.array(z.object({ id: str, label: str, catData })),
});

export const catStreamCommandShape = z.object({
  type: z.enum([
    "spin",
    "wheel",
    "countdown",
    "clear",
    "test",
    "lobby",
    "brb",
    "evolution",
    "batch",
  ]),
  seq: num,
  params: catParams.optional(),
  slots: slotSelections.optional(),
  wheelSpin: wheelSpin.optional(),
  evolution: evolutionCommand.optional(),
  batch: batchCommand.optional(),
  countdownSeconds: z.number().optional(),
  viewSlug: z.string().optional(),
  timestamp: num,
});
/** Params-only payloads; the overlay re-renders sprites locally. */
export const catStreamCommand = capped(
  catStreamCommandShape,
  1_000_000,
  "cat_stream_sessions.currentCommand",
);
export type CatStreamCommand = z.infer<typeof catStreamCommandShape>;

export const batchLiveState = z.object({
  seq: num,
  stageIndex: num,
  awaitingCull: bool,
  eliminatedIds: z.array(str),
  markedId: z.string().optional(),
  potentialIds: z.array(str).optional(),
  favoriteIds: z.array(str).optional(),
  spotlightId: z.string().optional(),
  pendingCullId: z.string().optional(),
  verdictAt: z.number().optional(),
  stageStartedAt: z.number().optional(),
  lastCullAt: z.number().optional(),
});
export type BatchLiveState = z.infer<typeof batchLiveState>;

export const evolutionLiveState = z.object({
  seq: num,
  offsetMs: num,
  holdStartedAt: z.number().optional(),
  skipToBoard: z.boolean().optional(),
});
export type EvolutionLiveState = z.infer<typeof evolutionLiveState>;
