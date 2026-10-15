import type { PgTable } from "drizzle-orm/pg-core";
import {
  ADOPTION_BATCH_MAX_BYTES,
  ADOPTION_BATCH_MAX_CATS,
  adoptionBatchCat,
  adoptionBatchSettingsShape,
  ancestryCats,
  ancestryTreeConfig,
  catImageMeta,
  catProfileData,
  catShareData,
  catStreamSettings,
  dashConfig,
  jsonByteLength,
  paletteGeneratorConfig,
  perfectCatParams,
  pixelatorConfig,
  singleCatConfig,
  streamParams,
  streamStepHistory,
  streamVoteOptionMeta,
  userVariantSettingsByTool,
  userVariantToolKeys,
} from "../../../server/db/contracts";
import * as schema from "../../../server/db/schema";
import {
  baseColumns,
  type ConvexDocument,
  contract,
  fileRef,
  type MapContext,
  onlyFields,
  optionalRef,
  Reject,
  read,
  requiredRef,
  tokenIdentifier,
} from "./convert";
import { importedId, uuidv5 } from "./ids";

export type Row = Record<string, unknown>;
export type MapResult = { rows: Row[] } | { skip: string };

export interface ImportStep {
  /** Checkpoint name; equals the target table except for derived steps. */
  name: string;
  /** Convex table read from the archive. */
  source: string;
  target: PgTable;
  map(doc: ConvexDocument, ctx: MapContext): MapResult;
}

const one = (row: Row): MapResult => ({ rows: [row] });
const timestamps = (doc: ConvexDocument) => ({
  createdAt: read.time(doc, "createdAt"),
  updatedAt: read.time(doc, "updatedAt"),
});
const expired = (doc: ConvexDocument, ctx: MapContext, field = "expiresAt") =>
  read.time(doc, field).getTime() <= ctx.freezeAt.getTime();

function slugSettings(
  name: string,
  target: PgTable,
  config: Parameters<typeof contract>[0],
): ImportStep {
  return {
    name,
    source: name,
    target,
    map(doc, ctx) {
      onlyFields(doc, [
        "slug",
        "config",
        "editToken",
        "ownerTokenIdentifier",
        "createdAt",
        "updatedAt",
      ]);
      return one({
        ...baseColumns(name, doc),
        slug: read.str(doc, "slug"),
        config: contract(config, doc.config, "config"),
        editToken: read.optStr(doc, "editToken"),
        ownerTokenIdentifier: tokenIdentifier(
          ctx,
          read.optStr(doc, "ownerTokenIdentifier"),
          "ownerTokenIdentifier",
        ),
        ...timestamps(doc),
      });
    },
  };
}

/** Embedded cat_profile ids in adoption settings point at a profile when it was imported. */
function rewriteStarterProfile(settings: Row, ctx: MapContext): Row {
  const starter = settings.starter as Row | null | undefined;
  const profileId = starter?.profileId;
  if (typeof profileId !== "string") return settings;
  if (!ctx.imported("cat_profile", profileId)) {
    ctx.repair(
      "settings.starter.profileId: dangling reference kept as legacy id",
    );
    return settings;
  }
  return {
    ...settings,
    starter: { ...starter, profileId: importedId("cat_profile", profileId) },
  };
}

function adoptionBatchRow(
  doc: ConvexDocument,
  ctx: MapContext,
  resolveEmbedded: boolean,
): MapResult {
  onlyFields(doc, [
    "editToken",
    "ownerTokenIdentifier",
    "slug",
    "title",
    "creatorName",
    "settings",
    "cats",
    "createdAt",
    "updatedAt",
  ]);
  if (!Array.isArray(doc.cats)) throw new Reject("cats: expected array");
  if (doc.cats.length > ADOPTION_BATCH_MAX_CATS)
    throw new Reject("cats: more than 200");
  if (
    jsonByteLength({ cats: doc.cats, settings: doc.settings }) >
    ADOPTION_BATCH_MAX_BYTES
  ) {
    throw new Reject("batch exceeds 900 KiB");
  }
  // Validate the cats here so a batch is either complete or quarantined.
  for (const [index, cat] of doc.cats.entries()) {
    contract(adoptionBatchCat, cat, `cats[${index}]`);
  }
  let settings: Row | null =
    doc.settings === undefined
      ? null
      : contract(adoptionBatchSettingsShape, doc.settings, "settings");
  if (settings && resolveEmbedded)
    settings = rewriteStarterProfile(settings, ctx);
  return one({
    ...baseColumns("adoption_batch", doc),
    editToken: read.optStr(doc, "editToken"),
    ownerTokenIdentifier: tokenIdentifier(
      ctx,
      read.optStr(doc, "ownerTokenIdentifier"),
      "ownerTokenIdentifier",
    ),
    slug: read.optStr(doc, "slug"),
    title: read.optStr(doc, "title"),
    creatorName: read.optStr(doc, "creatorName"),
    settings,
    ...timestamps(doc),
  });
}

/** Dependency order: parents before children, files before their users. */
export const STEPS: ImportStep[] = [
  {
    name: "users",
    source: "users",
    target: schema.users,
    map(doc, ctx) {
      onlyFields(doc, [
        "tokenIdentifier",
        "username",
        "usernameSearch",
        "showProfilePic",
        "apiKey",
        "createdAt",
        "updatedAt",
      ]);
      const username = read.optStr(doc, "username");
      if (username !== null && !/^[A-Za-z0-9_-]{1,30}$/.test(username)) {
        throw new Reject("username: not a valid username");
      }
      return one({
        ...baseColumns("users", doc),
        tokenIdentifier: tokenIdentifier(
          ctx,
          read.str(doc, "tokenIdentifier"),
          "tokenIdentifier",
        ),
        username,
        showProfilePic: read.bool(doc, "showProfilePic"),
        apiKey: read.optStr(doc, "apiKey"),
        ...timestamps(doc),
      });
    },
  },
  {
    name: "card_season",
    source: "card_season",
    target: schema.cardSeason,
    map(doc, ctx) {
      onlyFields(doc, [
        "seasonName",
        "shortName",
        "cardBackStorageId",
        "cardBackName",
        "cardBackWidth",
        "cardBackHeight",
        "createdAt",
        "updatedAt",
      ]);
      return one({
        ...baseColumns("card_season", doc),
        seasonName: read.str(doc, "seasonName"),
        shortName: read.optStr(doc, "shortName"),
        cardBackFileId: fileRef(
          ctx,
          doc.cardBackStorageId,
          "cardBackStorageId",
          false,
        ),
        cardBackName: read.optStr(doc, "cardBackName"),
        cardBackWidth: read.optInt(doc, "cardBackWidth"),
        cardBackHeight: read.optInt(doc, "cardBackHeight"),
        ...timestamps(doc),
      });
    },
  },
  {
    name: "rarity",
    source: "rarity",
    target: schema.rarity,
    map(doc) {
      onlyFields(doc, [
        "rarityName",
        "stars",
        "chancePercent",
        "createdAt",
        "updatedAt",
      ]);
      return one({
        ...baseColumns("rarity", doc),
        rarityName: read.str(doc, "rarityName"),
        stars: read.optInt(doc, "stars"),
        chancePercent: read.optNum(doc, "chancePercent"),
        ...timestamps(doc),
      });
    },
  },
  {
    name: "catdex",
    source: "catdex",
    target: schema.catdex,
    map(doc, ctx) {
      const cards = [
        "defaultCard",
        "defaultCardThumb",
        "customCard",
        "customCardThumb",
      ] as const;
      onlyFields(doc, [
        "twitchUserName",
        "catName",
        "seasonId",
        "rarityId",
        "cardNumber",
        "approved",
        ...cards.flatMap((c) => [
          `${c}StorageId`,
          `${c}Name`,
          `${c}Width`,
          `${c}Height`,
        ]),
        "thumbnailStatus",
        "thumbnailAttemptedAt",
        "thumbnailAttemptCount",
        "createdAt",
        "updatedAt",
      ]);
      const card = Object.fromEntries(
        cards.flatMap((c) => [
          [
            `${c}FileId`,
            fileRef(ctx, doc[`${c}StorageId`], `${c}StorageId`, false),
          ],
          [`${c}Name`, read.optStr(doc, `${c}Name`)],
          [`${c}Width`, read.optInt(doc, `${c}Width`)],
          [`${c}Height`, read.optInt(doc, `${c}Height`)],
        ]),
      );
      return one({
        ...baseColumns("catdex", doc),
        twitchUserName: read.str(doc, "twitchUserName"),
        catName: read.str(doc, "catName"),
        seasonId: requiredRef(ctx, "card_season", doc.seasonId, "seasonId"),
        rarityId: requiredRef(ctx, "rarity", doc.rarityId, "rarityId"),
        cardNumber: read.optStr(doc, "cardNumber"),
        approved: read.bool(doc, "approved"),
        ...card,
        thumbnailStatus: read.optOneOf(
          doc,
          "thumbnailStatus",
          schema.thumbnailStatuses,
        ),
        thumbnailAttemptedAt: read.optTime(doc, "thumbnailAttemptedAt"),
        thumbnailAttemptCount: read.optInt(doc, "thumbnailAttemptCount"),
        ...timestamps(doc),
      });
    },
  },
  {
    name: "catdex_uploads",
    source: "catdex_uploads",
    target: schema.catdexUploads,
    map(doc, ctx) {
      onlyFields(doc, [
        "token",
        "rateKey",
        "storageId",
        "status",
        "expiresAt",
        "createdAt",
        "updatedAt",
      ]);
      const status = read.oneOf(doc, "status", [
        "pending",
        "attached",
        "consumed",
      ] as const);
      if (expired(doc, ctx)) return { skip: "expired at freeze" };
      if (status === "consumed") return { skip: "already consumed" };
      return one({
        ...baseColumns("catdex_uploads", doc),
        token: read.str(doc, "token"),
        rateKey: read.optStr(doc, "rateKey"),
        fileId: fileRef(ctx, doc.storageId, "storageId", false),
        status,
        expiresAt: read.time(doc, "expiresAt"),
        ...timestamps(doc),
      });
    },
  },
  {
    name: "collection",
    source: "collection",
    target: schema.collection,
    map(doc, ctx) {
      onlyFields(doc, [
        "artistName",
        "animal",
        "link",
        "blurImgStorageId",
        "blurImgName",
        "previewImgStorageId",
        "previewImgName",
        "fullImgStorageId",
        "fullImgName",
        "previewImgWidth",
        "previewImgHeight",
        "fullImgWidth",
        "fullImgHeight",
        "focusX",
        "focusY",
        "createdAt",
        "updatedAt",
      ]);
      return one({
        ...baseColumns("collection", doc),
        artistName: read.str(doc, "artistName"),
        animal: read.str(doc, "animal"),
        link: read.str(doc, "link"),
        blurImgFileId: fileRef(
          ctx,
          doc.blurImgStorageId,
          "blurImgStorageId",
          false,
        ),
        blurImgName: read.optStr(doc, "blurImgName"),
        previewImgFileId: fileRef(
          ctx,
          doc.previewImgStorageId,
          "previewImgStorageId",
          false,
        ),
        previewImgName: read.optStr(doc, "previewImgName"),
        fullImgFileId: fileRef(
          ctx,
          doc.fullImgStorageId,
          "fullImgStorageId",
          false,
        ),
        fullImgName: read.optStr(doc, "fullImgName"),
        previewImgWidth: read.optInt(doc, "previewImgWidth"),
        previewImgHeight: read.optInt(doc, "previewImgHeight"),
        fullImgWidth: read.optInt(doc, "fullImgWidth"),
        fullImgHeight: read.optInt(doc, "fullImgHeight"),
        focusX: read.optNum(doc, "focusX"),
        focusY: read.optNum(doc, "focusY"),
        ...timestamps(doc),
      });
    },
  },
  {
    name: "coinflipper_scores",
    source: "coinflipper_scores",
    target: schema.coinflipperScores,
    map(doc) {
      onlyFields(doc, ["playerName", "score", "createdAt"]);
      return one({
        ...baseColumns("coinflipper_scores", doc),
        playerName: read.str(doc, "playerName"),
        score: read.int(doc, "score"),
        createdAt: read.time(doc, "createdAt"),
      });
    },
  },
  {
    // Profiles reference batches, so batches come first with embedded
    // profile ids untouched; adoption_batch_refs resolves them later.
    name: "adoption_batch",
    source: "adoption_batch",
    target: schema.adoptionBatch,
    map: (doc, ctx) => adoptionBatchRow(doc, ctx, false),
  },
  {
    name: "cat_profile",
    source: "cat_profile",
    target: schema.catProfile,
    map(doc, ctx) {
      onlyFields(doc, [
        "slug",
        "catData",
        "catName",
        "creatorName",
        "ownerTokenIdentifier",
        "editToken",
        "adoptionBatchId",
        "previewsUpdatedAt",
        "createdAt",
        "updatedAt",
      ]);
      return one({
        ...baseColumns("cat_profile", doc),
        slug: read.str(doc, "slug"),
        catData: contract(catProfileData, doc.catData, "catData"),
        catName: read.optStr(doc, "catName"),
        creatorName: read.optStr(doc, "creatorName"),
        ownerTokenIdentifier: tokenIdentifier(
          ctx,
          read.optStr(doc, "ownerTokenIdentifier"),
          "ownerTokenIdentifier",
        ),
        editToken: read.optStr(doc, "editToken"),
        adoptionBatchId: optionalRef(
          ctx,
          "adoption_batch",
          doc.adoptionBatchId,
          "adoptionBatchId",
        ),
        previewsUpdatedAt: read.optTime(doc, "previewsUpdatedAt"),
        ...timestamps(doc),
      });
    },
  },
  {
    // Second pass over the same batches, now that profiles exist: the row
    // is upserted again with `settings.starter.profileId` rewritten.
    name: "adoption_batch_refs",
    source: "adoption_batch",
    target: schema.adoptionBatch,
    map(doc, ctx) {
      if (!ctx.imported("adoption_batch", doc._id))
        return { skip: "batch not imported" };
      return adoptionBatchRow(doc, ctx, true);
    },
  },
  {
    // Derived from adoption_batch.cats[] once profiles exist.
    name: "adoption_batch_cats",
    source: "adoption_batch",
    target: schema.adoptionBatchCats,
    map(doc, ctx) {
      if (!ctx.imported("adoption_batch", doc._id))
        return { skip: "parent batch not imported" };
      const cats = doc.cats as unknown[];
      return {
        rows: cats.map((value, position) => {
          const cat = contract(adoptionBatchCat, value, `cats[${position}]`);
          return {
            id: uuidv5(`adoption_batch_cats:${doc._id}:${position}`),
            batchId: importedId("adoption_batch", doc._id),
            position,
            label: cat.label,
            catData: cat.catData,
            profileId: optionalRef(
              ctx,
              "cat_profile",
              cat.profileId ?? undefined,
              "cats[].profileId",
            ),
            encoded: cat.encoded ?? null,
            shareToken: cat.shareToken ?? null,
            editToken: cat.editToken ?? null,
            catName: cat.catName ?? null,
            creatorName: cat.creatorName ?? null,
          };
        }),
      };
    },
  },
  {
    name: "cat_images",
    source: "cat_images",
    target: schema.catImages,
    map(doc, ctx) {
      onlyFields(doc, [
        "catProfileId",
        "kind",
        "storageId",
        "filename",
        "meta",
        "width",
        "height",
        "createdAt",
        "updatedAt",
      ]);
      return one({
        ...baseColumns("cat_images", doc),
        catProfileId: requiredRef(
          ctx,
          "cat_profile",
          doc.catProfileId,
          "catProfileId",
        ),
        kind: read.oneOf(doc, "kind", [
          "tiny",
          "preview",
          "full",
          "spriteSheet",
        ] as const),
        fileId: fileRef(ctx, doc.storageId, "storageId", true),
        filename: read.optStr(doc, "filename"),
        meta:
          doc.meta === undefined
            ? null
            : contract(catImageMeta, doc.meta, "meta"),
        width: read.optInt(doc, "width"),
        height: read.optInt(doc, "height"),
        ...timestamps(doc),
      });
    },
  },
  {
    name: "cat_shares",
    source: "cat_shares",
    target: schema.catShares,
    map(doc, ctx) {
      onlyFields(doc, [
        "slug",
        "data",
        "editToken",
        "ownerTokenIdentifier",
        "createdAt",
      ]);
      return one({
        ...baseColumns("cat_shares", doc),
        slug: read.str(doc, "slug"),
        data: contract(catShareData, doc.data, "data"),
        editToken: read.optStr(doc, "editToken"),
        ownerTokenIdentifier: tokenIdentifier(
          ctx,
          read.optStr(doc, "ownerTokenIdentifier"),
          "ownerTokenIdentifier",
        ),
        createdAt: read.time(doc, "createdAt"),
      });
    },
  },
  slugSettings(
    "single_cat_settings",
    schema.singleCatSettings,
    singleCatConfig,
  ),
  slugSettings("pixelator_settings", schema.pixelatorSettings, pixelatorConfig),
  slugSettings("dash_settings", schema.dashSettings, dashConfig),
  {
    name: "palette_generator_settings",
    source: "palette_generator_settings",
    target: schema.paletteGeneratorSettings,
    map(doc, ctx) {
      onlyFields(doc, [
        "slug",
        "config",
        "editToken",
        "ownerTokenIdentifier",
        "createdAt",
        "updatedAt",
      ]);
      if (
        !doc.config ||
        typeof doc.config !== "object" ||
        Array.isArray(doc.config)
      ) {
        throw new Reject("config: expected object");
      }
      // The nested storage id becomes a real foreign-key column.
      const { imageStorageId, ...config } = doc.config as Record<
        string,
        unknown
      >;
      return one({
        ...baseColumns("palette_generator_settings", doc),
        slug: read.str(doc, "slug"),
        config: contract(paletteGeneratorConfig, config, "config"),
        imageFileId: fileRef(
          ctx,
          imageStorageId,
          "config.imageStorageId",
          false,
        ),
        editToken: read.optStr(doc, "editToken"),
        ownerTokenIdentifier: tokenIdentifier(
          ctx,
          read.optStr(doc, "ownerTokenIdentifier"),
          "ownerTokenIdentifier",
        ),
        ...timestamps(doc),
      });
    },
  },
  {
    name: "ancestry_tree",
    source: "ancestry_tree",
    target: schema.ancestryTree,
    map(doc, ctx) {
      onlyFields(doc, [
        "slug",
        "editToken",
        "ownerTokenIdentifier",
        "name",
        "foundingMotherId",
        "foundingFatherId",
        "cats",
        "config",
        "creatorName",
        "passwordHash",
        "createdAt",
        "updatedAt",
      ]);
      const cats = contract(ancestryCats, doc.cats, "cats").map((cat) => {
        const profile = cat.historyProfileId;
        if (profile === undefined || !ctx.imported("cat_profile", profile))
          return cat;
        return { ...cat, historyProfileId: importedId("cat_profile", profile) };
      });
      return one({
        ...baseColumns("ancestry_tree", doc),
        slug: read.str(doc, "slug"),
        editToken: read.optStr(doc, "editToken"),
        ownerTokenIdentifier: tokenIdentifier(
          ctx,
          read.optStr(doc, "ownerTokenIdentifier"),
          "ownerTokenIdentifier",
        ),
        name: read.str(doc, "name"),
        foundingMotherId: read.str(doc, "foundingMotherId"),
        foundingFatherId: read.str(doc, "foundingFatherId"),
        cats,
        config: contract(ancestryTreeConfig, doc.config, "config"),
        creatorName: read.optStr(doc, "creatorName"),
        passwordHash: read.optStr(doc, "passwordHash"),
        ...timestamps(doc),
      });
    },
  },
  {
    name: "perfect_cats",
    source: "perfect_cats",
    target: schema.perfectCats,
    map(doc) {
      onlyFields(doc, [
        "hash",
        "params",
        "rating",
        "wins",
        "losses",
        "appearances",
        "createdAt",
        "updatedAt",
        "lastShownAt",
      ]);
      return one({
        ...baseColumns("perfect_cats", doc),
        hash: read.str(doc, "hash"),
        params: contract(perfectCatParams, doc.params, "params"),
        rating: read.num(doc, "rating"),
        wins: read.int(doc, "wins"),
        losses: read.int(doc, "losses"),
        appearances: read.int(doc, "appearances"),
        lastShownAt: read.optTime(doc, "lastShownAt"),
        ...timestamps(doc),
      });
    },
  },
  {
    name: "perfect_votes",
    source: "perfect_votes",
    target: schema.perfectVotes,
    map(doc, ctx) {
      onlyFields(doc, [
        "catAId",
        "catBId",
        "winnerId",
        "clientId",
        "createdAt",
      ]);
      return one({
        ...baseColumns("perfect_votes", doc),
        catAId: requiredRef(ctx, "perfect_cats", doc.catAId, "catAId"),
        catBId: requiredRef(ctx, "perfect_cats", doc.catBId, "catBId"),
        winnerId: requiredRef(ctx, "perfect_cats", doc.winnerId, "winnerId"),
        clientId: read.optStr(doc, "clientId"),
        createdAt: read.time(doc, "createdAt"),
      });
    },
  },
  {
    name: "perfect_matchups",
    source: "perfect_matchups",
    target: schema.perfectMatchups,
    map(doc, ctx) {
      onlyFields(doc, [
        "clientId",
        "catAId",
        "catBId",
        "token",
        "createdAt",
        "expiresAt",
        "consumed",
      ]);
      if (expired(doc, ctx)) return { skip: "expired at freeze" };
      if (read.bool(doc, "consumed")) return { skip: "already consumed" };
      return one({
        ...baseColumns("perfect_matchups", doc),
        clientId: read.str(doc, "clientId"),
        catAId: requiredRef(ctx, "perfect_cats", doc.catAId, "catAId"),
        catBId: requiredRef(ctx, "perfect_cats", doc.catBId, "catBId"),
        token: read.str(doc, "token"),
        expiresAt: read.time(doc, "expiresAt"),
        consumed: false,
        createdAt: read.time(doc, "createdAt"),
      });
    },
  },
  {
    name: "discord_challenge",
    source: "discord_challenge",
    target: schema.discordChallenge,
    map(doc, ctx) {
      onlyFields(doc, [
        "token",
        "answerHash",
        "salt",
        "expiresAt",
        "createdAt",
        "usedAt",
      ]);
      if (expired(doc, ctx)) return { skip: "expired at freeze" };
      return one({
        ...baseColumns("discord_challenge", doc),
        token: read.str(doc, "token"),
        answerHash: read.str(doc, "answerHash"),
        salt: read.str(doc, "salt"),
        expiresAt: read.time(doc, "expiresAt"),
        createdAt: read.time(doc, "createdAt"),
        usedAt: read.optTime(doc, "usedAt"),
      });
    },
  },
  {
    name: "discord_user_configs",
    source: "discord_user_configs",
    target: schema.discordUserConfigs,
    map(doc) {
      const counts = [
        "accessoriesMin",
        "accessoriesMax",
        "scarsMin",
        "scarsMax",
        "tortiesMin",
        "tortiesMax",
      ] as const;
      onlyFields(doc, [
        "discordUserId",
        ...counts,
        "darkForest",
        "starclan",
        "palettes",
        "createdAt",
        "updatedAt",
      ]);
      return one({
        ...baseColumns("discord_user_configs", doc),
        discordUserId: read.str(doc, "discordUserId"),
        ...Object.fromEntries(
          counts.map((field) => [field, read.int(doc, field)]),
        ),
        darkForest: read.bool(doc, "darkForest"),
        starclan: read.bool(doc, "starclan"),
        palettes: read.strArray(doc, "palettes"),
        ...timestamps(doc),
      });
    },
  },
  {
    name: "stream_sessions",
    source: "stream_sessions",
    target: schema.streamSessions,
    map(doc, ctx) {
      onlyFields(doc, [
        "ownerTokenIdentifier",
        "allowedOptions",
        "voteRound",
        "viewerKey",
        "status",
        "currentStep",
        "stepIndex",
        "stepHistory",
        "params",
        "allowRepeatIps",
        "createdAt",
        "updatedAt",
      ]);
      return one({
        ...baseColumns("stream_sessions", doc),
        ownerTokenIdentifier: tokenIdentifier(
          ctx,
          read.optStr(doc, "ownerTokenIdentifier"),
          "ownerTokenIdentifier",
        ),
        allowedOptions: read.optStrArray(doc, "allowedOptions"),
        voteRound: read.optInt(doc, "voteRound"),
        viewerKey: read.str(doc, "viewerKey"),
        status: read.str(doc, "status"),
        currentStep: read.optStr(doc, "currentStep"),
        stepIndex: read.optInt(doc, "stepIndex"),
        stepHistory:
          doc.stepHistory === undefined
            ? null
            : contract(streamStepHistory, doc.stepHistory, "stepHistory"),
        params:
          doc.params === undefined
            ? null
            : contract(streamParams, doc.params, "params"),
        allowRepeatIps: read.optBool(doc, "allowRepeatIps"),
        ...timestamps(doc),
      });
    },
  },
  {
    name: "stream_participants",
    source: "stream_participants",
    target: schema.streamParticipants,
    map(doc, ctx) {
      onlyFields(doc, [
        "sessionId",
        "viewerSession",
        "displayName",
        "status",
        "fingerprint",
        "createdAt",
        "updatedAt",
      ]);
      return one({
        ...baseColumns("stream_participants", doc),
        sessionId: requiredRef(
          ctx,
          "stream_sessions",
          doc.sessionId,
          "sessionId",
        ),
        viewerSession: read.optStr(doc, "viewerSession"),
        displayName: read.str(doc, "displayName"),
        status: read.str(doc, "status"),
        fingerprint: read.optStr(doc, "fingerprint"),
        ...timestamps(doc),
      });
    },
  },
  {
    name: "stream_votes",
    source: "stream_votes",
    target: schema.streamVotes,
    map(doc, ctx) {
      onlyFields(doc, [
        "voteRound",
        "sessionId",
        "stepId",
        "optionKey",
        "optionMeta",
        "votedBy",
        "createdAt",
        "updatedAt",
      ]);
      let optionMeta =
        doc.optionMeta === undefined
          ? null
          : contract(streamVoteOptionMeta, doc.optionMeta, "optionMeta");
      if (optionMeta && "participantId" in optionMeta) {
        const participant = optionMeta.participantId;
        if (ctx.imported("stream_participants", participant)) {
          optionMeta = {
            ...optionMeta,
            participantId: importedId("stream_participants", participant),
          };
        } else {
          ctx.repair(
            "optionMeta.participantId: dangling reference kept as legacy id",
          );
        }
      }
      return one({
        ...baseColumns("stream_votes", doc),
        voteRound: read.optInt(doc, "voteRound"),
        sessionId: requiredRef(
          ctx,
          "stream_sessions",
          doc.sessionId,
          "sessionId",
        ),
        stepId: read.str(doc, "stepId"),
        optionKey: read.str(doc, "optionKey"),
        optionMeta,
        votedBy: optionalRef(
          ctx,
          "stream_participants",
          doc.votedBy,
          "votedBy",
        ),
        ...timestamps(doc),
      });
    },
  },
  {
    name: "wheel_spins",
    source: "wheel_spins",
    target: schema.wheelSpins,
    map(doc) {
      onlyFields(doc, [
        "prizeName",
        "forced",
        "randomBucket",
        "actorKey",
        "createdAt",
      ]);
      return one({
        ...baseColumns("wheel_spins", doc),
        prizeName: read.str(doc, "prizeName"),
        forced: read.bool(doc, "forced"),
        randomBucket: read.optNum(doc, "randomBucket"),
        actorKey: read.optStr(doc, "actorKey"),
        createdAt: read.time(doc, "createdAt"),
      });
    },
  },
  {
    name: "cat_stream_sessions",
    source: "cat_stream_sessions",
    target: schema.catStreamSessions,
    map(doc, ctx) {
      onlyFields(doc, [
        "userId",
        "status",
        "settings",
        "currentCommand",
        "testMode",
        "lastWheelSpinForSeq",
        "batchState",
        "evolutionState",
        "createdAt",
        "updatedAt",
      ]);
      read.oneOf(doc, "status", ["active", "idle"] as const);
      // Live show state does not survive the cutover maintenance window; the
      // streamer's settings do (ADR §6).
      if (
        doc.currentCommand !== undefined ||
        doc.batchState !== undefined ||
        doc.evolutionState !== undefined
      ) {
        ctx.repair("live command and show state reset to idle");
      }
      return one({
        ...baseColumns("cat_stream_sessions", doc),
        userId: requiredRef(ctx, "users", doc.userId, "userId"),
        status: "idle",
        settings: contract(catStreamSettings, doc.settings, "settings"),
        currentCommand: null,
        testMode: read.bool(doc, "testMode"),
        lastWheelSpinForSeq: read.optInt(doc, "lastWheelSpinForSeq"),
        batchState: null,
        evolutionState: null,
        ...timestamps(doc),
      });
    },
  },
  {
    name: "user_variants",
    source: "user_variants",
    target: schema.userVariants,
    map(doc, ctx) {
      onlyFields(doc, [
        "userId",
        "toolKey",
        "variantId",
        "name",
        "slug",
        "settings",
        "isActive",
        "createdAt",
        "updatedAt",
      ]);
      const toolKey = read.oneOf(doc, "toolKey", userVariantToolKeys);
      return one({
        ...baseColumns("user_variants", doc),
        userId: requiredRef(ctx, "users", doc.userId, "userId"),
        toolKey,
        variantId: read.str(doc, "variantId"),
        name: read.str(doc, "name"),
        slug: read.optStr(doc, "slug"),
        settings: contract(
          userVariantSettingsByTool[toolKey],
          doc.settings,
          "settings",
        ),
        isActive: read.bool(doc, "isActive"),
        ...timestamps(doc),
      });
    },
  },
  {
    name: "quick_share_uploads",
    source: "quick_share_uploads",
    target: schema.quickShareUploads,
    map(doc, ctx) {
      onlyFields(doc, [
        "slug",
        "source",
        "originalName",
        "declaredMime",
        "detectedMime",
        "originalSize",
        "originalKey",
        "multipartUploadId",
        "publicKey",
        "publicMime",
        "publicSize",
        "importReservedBytes",
        "state",
        "receiptHash",
        "ownerTokenIdentifier",
        "rateIdentity",
        "ipHash",
        "rawIp",
        "publicExpiresAt",
        "retainedUntil",
        "active",
        "extendedAt",
        "completedAt",
        "failureCode",
        "failureMessage",
        "compatibilityWarning",
        "createdAt",
        "updatedAt",
      ]);
      return one({
        ...baseColumns("quick_share_uploads", doc),
        slug: read.str(doc, "slug"),
        source: read.oneOf(doc, "source", ["file", "url"] as const),
        originalName: read.str(doc, "originalName"),
        declaredMime: read.optStr(doc, "declaredMime"),
        detectedMime: read.optStr(doc, "detectedMime"),
        originalSize: read.int(doc, "originalSize"),
        originalKey: read.str(doc, "originalKey"),
        multipartUploadId: read.optStr(doc, "multipartUploadId"),
        publicKey: read.optStr(doc, "publicKey"),
        publicMime: read.optStr(doc, "publicMime"),
        publicSize: read.optInt(doc, "publicSize"),
        importReservedBytes: read.optInt(doc, "importReservedBytes"),
        state: read.oneOf(doc, "state", [
          "uploading",
          "processing",
          "ready",
          "unsupported",
          "failed",
          "removed",
        ] as const),
        receiptHash: read.str(doc, "receiptHash"),
        ownerTokenIdentifier: tokenIdentifier(
          ctx,
          read.optStr(doc, "ownerTokenIdentifier"),
          "ownerTokenIdentifier",
        ),
        rateIdentity: read.str(doc, "rateIdentity"),
        ipHash: read.str(doc, "ipHash"),
        rawIp: read.str(doc, "rawIp"),
        publicExpiresAt: read.time(doc, "publicExpiresAt"),
        retainedUntil: read.time(doc, "retainedUntil"),
        active: read.bool(doc, "active"),
        extendedAt: read.optTime(doc, "extendedAt"),
        completedAt: read.optTime(doc, "completedAt"),
        failureCode: read.optStr(doc, "failureCode"),
        failureMessage: read.optStr(doc, "failureMessage"),
        compatibilityWarning: read.optStr(doc, "compatibilityWarning"),
        ...timestamps(doc),
      });
    },
  },
  {
    name: "quick_share_parts",
    source: "quick_share_parts",
    target: schema.quickShareParts,
    map(doc, ctx) {
      onlyFields(doc, ["uploadId", "partNumber", "etag", "size", "createdAt"]);
      const uploadId = read.str(doc, "uploadId");
      if (
        ctx.imported("quick_share_uploads", uploadId) &&
        ctx.facts.get(uploadId) !== "uploading"
      ) {
        return { skip: "upload no longer uploading" };
      }
      return one({
        ...baseColumns("quick_share_parts", doc),
        uploadId: requiredRef(ctx, "quick_share_uploads", uploadId, "uploadId"),
        partNumber: read.int(doc, "partNumber"),
        etag: read.str(doc, "etag"),
        size: read.int(doc, "size"),
        createdAt: read.time(doc, "createdAt"),
      });
    },
  },
  {
    name: "quick_share_jobs",
    source: "quick_share_jobs",
    target: schema.quickShareJobs,
    map(doc, ctx) {
      onlyFields(doc, [
        "uploadId",
        "kind",
        "status",
        "attempts",
        "leaseId",
        "leaseExpiresAt",
        "createdAt",
        "updatedAt",
      ]);
      const status = read.oneOf(doc, "status", [
        "pending",
        "leased",
        "done",
      ] as const);
      // Workers are drained at the freeze; a lease cannot still be held.
      if (status === "leased") ctx.repair("leased job returned to pending");
      return one({
        ...baseColumns("quick_share_jobs", doc),
        uploadId: requiredRef(
          ctx,
          "quick_share_uploads",
          doc.uploadId,
          "uploadId",
        ),
        kind: read.oneOf(doc, "kind", ["process", "delete"] as const),
        status: status === "leased" ? "pending" : status,
        attempts: read.int(doc, "attempts"),
        leaseId: status === "leased" ? null : read.optStr(doc, "leaseId"),
        leaseExpiresAt:
          status === "leased" ? null : read.optTime(doc, "leaseExpiresAt"),
        ...timestamps(doc),
      });
    },
  },
  {
    name: "quick_share_usage",
    source: "quick_share_usage",
    target: schema.quickShareUsage,
    map(doc, ctx) {
      onlyFields(doc, [
        "identity",
        "kind",
        "windowStart",
        "starts",
        "bytes",
        "expiresAt",
        "updatedAt",
      ]);
      if (expired(doc, ctx)) return { skip: "window closed at freeze" };
      return one({
        ...baseColumns("quick_share_usage", doc),
        identity: read.str(doc, "identity"),
        kind: read.oneOf(doc, "kind", ["hour", "day"] as const),
        windowStart: read.time(doc, "windowStart"),
        starts: read.int(doc, "starts"),
        bytes: read.int(doc, "bytes"),
        expiresAt: read.time(doc, "expiresAt"),
        updatedAt: read.time(doc, "updatedAt"),
      });
    },
  },
  {
    name: "quick_share_bans",
    source: "quick_share_bans",
    target: schema.quickShareBans,
    map(doc) {
      onlyFields(doc, [
        "ipHash",
        "rawIp",
        "rawIpExpiresAt",
        "reason",
        "active",
        "createdBy",
        "createdAt",
        "removedAt",
      ]);
      return one({
        ...baseColumns("quick_share_bans", doc),
        ipHash: read.str(doc, "ipHash"),
        rawIp: read.optStr(doc, "rawIp"),
        rawIpExpiresAt: read.optTime(doc, "rawIpExpiresAt"),
        reason: read.optStr(doc, "reason"),
        active: read.bool(doc, "active"),
        createdBy: read.str(doc, "createdBy"),
        createdAt: read.time(doc, "createdAt"),
        removedAt: read.optTime(doc, "removedAt"),
      });
    },
  },
];

/** Convex tables the importer reads but deliberately does not import. */
export const NOT_IMPORTED: Record<string, string> = {
  user_search_migrations:
    "bookkeeping; users.username_search is a generated column",
};

/** Schema-level `_storage` fields, plus the nested palette id, per source table. */
export const STORAGE_FIELDS: Record<string, readonly string[]> = {
  card_season: ["cardBackStorageId"],
  catdex: [
    "defaultCardStorageId",
    "defaultCardThumbStorageId",
    "customCardStorageId",
    "customCardThumbStorageId",
  ],
  catdex_uploads: ["storageId"],
  collection: ["blurImgStorageId", "previewImgStorageId", "fullImgStorageId"],
  cat_images: ["storageId"],
  palette_generator_settings: ["config.imageStorageId"],
};
