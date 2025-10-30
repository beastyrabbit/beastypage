import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import type { QueryCtx } from "./_generated/server.js";
import { docIdToString, normalizeStorageUrl } from "./utils.js";
import { api } from "./_generated/api.js";

type CatdexDoc = Doc<"catdex">;
type SeasonDoc = Doc<"card_season">;
type RarityDoc = Doc<"rarity">;

export type CatdexPayload = Awaited<ReturnType<typeof catdexRecordToClient>>;

export const list = query({
  args: {
    approved: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    let cats = await ctx.db.query("catdex").collect();
    if (typeof args.approved === "boolean") {
      cats = cats.filter((c) => Boolean(c.approved) === args.approved);
    }
    cats.sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
    return Promise.all(cats.map((doc) => catdexRecordToClient(ctx, doc)));
  }
});

export const pendingCount = query({
  args: {},
  handler: async (ctx) => {
    const cats = await ctx.db.query("catdex").collect();
    return cats.filter((c) => !c.approved).length;
  }
});

export const totalCount = query({
  args: {},
  handler: async (ctx) => {
    let count = 0;
    for await (const _ of ctx.db.query("catdex")) {
      count += 1;
    }
    return count;
  }
});

export const get = query({
  args: {
    id: v.id("catdex")
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) return null;
    return catdexRecordToClient(ctx, doc);
  }
});

export const getDoc = query({
  args: {
    id: v.id("catdex")
  },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  }
});

export const create = mutation({
  args: {
    twitchUserName: v.string(),
    catName: v.string(),
    seasonId: v.id("card_season"),
    rarityId: v.id("rarity"),
    cardNumber: v.optional(v.string()),
    defaultCard: v.object({
      storageId: v.id("_storage"),
      fileName: v.string()
    }),
    customCard: v.optional(
      v.object({
        storageId: v.id("_storage"),
        fileName: v.string()
      })
    )
  },
  handler: async (ctx, args) => {
    const nowTs = Date.now();
    const insertDoc = {
      twitchUserName: args.twitchUserName,
      catName: args.catName,
      seasonId: args.seasonId,
      rarityId: args.rarityId,
      approved: false,
      defaultCardStorageId: args.defaultCard.storageId,
      defaultCardName: args.defaultCard.fileName,
      createdAt: nowTs,
      updatedAt: nowTs,
      ...(args.cardNumber !== undefined ? { cardNumber: args.cardNumber } : {}),
      ...(args.customCard
        ? {
            customCardStorageId: args.customCard.storageId,
            customCardName: args.customCard.fileName
          }
        : {})
    } satisfies Omit<CatdexDoc, "_id" | "_creationTime">;

    const docId = await ctx.db.insert("catdex", insertDoc);
    const doc = await ctx.db.get(docId);
    if (!doc) {
      throw new Error("Failed to create catdex record");
    }
    await ctx.scheduler.runAfter(0, api.imageService.generateForCat, { id: docId });
    return catdexRecordToClient(ctx, doc);
  }
});

async function catdexRecordToClient(ctx: QueryCtx, doc: CatdexDoc) {
  const id = docIdToString(doc._id);
  const seasonDoc = doc.seasonId ? await ctx.db.get(doc.seasonId) : null;
  const rarityDoc = doc.rarityId ? await ctx.db.get(doc.rarityId) : null;
  const seasonInfo = seasonDoc ? seasonRecordToClient(seasonDoc) : null;
  const rarityInfo = rarityDoc ? rarityRecordToClient(rarityDoc) : null;

  const seasonName = seasonInfo?.season_name ?? null;
  const rarityName = rarityInfo?.rarity_name ?? null;

  const defaultCardUrl = doc.defaultCardStorageId
    ? normalizeStorageUrl(await ctx.storage.getUrl(doc.defaultCardStorageId))
    : null;
  const defaultCardThumbUrl = doc.defaultCardThumbStorageId
    ? normalizeStorageUrl(await ctx.storage.getUrl(doc.defaultCardThumbStorageId))
    : null;
  const customCardUrl = doc.customCardStorageId
    ? normalizeStorageUrl(await ctx.storage.getUrl(doc.customCardStorageId))
    : null;
  const customCardThumbUrl = doc.customCardThumbStorageId
    ? normalizeStorageUrl(await ctx.storage.getUrl(doc.customCardThumbStorageId))
    : null;

  return {
    id,
    twitch_user_name: doc.twitchUserName,
    cat_name: doc.catName,
    card_number: doc.cardNumber ?? null,
    approved: doc.approved,
    default_card: doc.defaultCardName ?? null,
    default_card_storage_id: doc.defaultCardStorageId ?? null,
    default_card_url: defaultCardUrl,
    default_card_width: doc.defaultCardWidth ?? null,
    default_card_height: doc.defaultCardHeight ?? null,
    default_card_thumb: doc.defaultCardThumbName ?? null,
    default_card_thumb_storage_id: doc.defaultCardThumbStorageId ?? null,
    default_card_thumb_url: defaultCardThumbUrl,
    default_card_thumb_width: doc.defaultCardThumbWidth ?? null,
    default_card_thumb_height: doc.defaultCardThumbHeight ?? null,
    custom_card: doc.customCardName ?? null,
    custom_card_storage_id: doc.customCardStorageId ?? null,
    custom_card_url: customCardUrl,
    custom_card_width: doc.customCardWidth ?? null,
    custom_card_height: doc.customCardHeight ?? null,
    custom_card_thumb: doc.customCardThumbName ?? null,
    custom_card_thumb_storage_id: doc.customCardThumbStorageId ?? null,
    custom_card_thumb_url: customCardThumbUrl,
    custom_card_thumb_width: doc.customCardThumbWidth ?? null,
    custom_card_thumb_height: doc.customCardThumbHeight ?? null,
    season: seasonName,
    seasonRaw: seasonInfo,
    seasonShort: seasonInfo?.short_name ?? null,
    rarity: rarityName,
    rarityRaw: rarityInfo,
    rarityStars: rarityInfo?.stars ?? null,
    created: doc.createdAt,
    updated: doc.updatedAt
  } as const;
}

function seasonRecordToClient(doc: SeasonDoc) {
  const id = docIdToString(doc._id);
  return {
    id,
    season_name: doc.seasonName,
    short_name: doc.shortName ?? null,
    card_back: doc.cardBackName ?? null,
    card_back_storage_id: doc.cardBackStorageId ?? null,
    created: doc.createdAt,
    updated: doc.updatedAt
  };
}

function rarityRecordToClient(doc: RarityDoc) {
  return {
    id: docIdToString(doc._id),
    rarity_name: doc.rarityName,
    stars: doc.stars ?? null,
    chance_percent: doc.chancePercent ?? null,
    created: doc.createdAt,
    updated: doc.updatedAt
  };
}

export const applyThumbnailUpdates = mutation({
  args: {
    id: v.id("catdex"),
    defaultCard: v.optional(
      v.object({
        thumbStorageId: v.id("_storage"),
        thumbName: v.string(),
        thumbWidth: v.optional(v.number()),
        thumbHeight: v.optional(v.number()),
        width: v.optional(v.number()),
        height: v.optional(v.number())
      })
    ),
    customCard: v.optional(
      v.object({
        thumbStorageId: v.id("_storage"),
        thumbName: v.string(),
        thumbWidth: v.optional(v.number()),
        thumbHeight: v.optional(v.number()),
        width: v.optional(v.number()),
        height: v.optional(v.number())
      })
    )
  },
  handler: async (ctx, args) => {
    const updates: Partial<CatdexDoc> = {
      updatedAt: Date.now()
    };

    if (args.defaultCard) {
      updates.defaultCardThumbStorageId = args.defaultCard.thumbStorageId;
      updates.defaultCardThumbName = args.defaultCard.thumbName;
      if (args.defaultCard.thumbWidth !== undefined) {
        updates.defaultCardThumbWidth = args.defaultCard.thumbWidth;
      }
      if (args.defaultCard.thumbHeight !== undefined) {
        updates.defaultCardThumbHeight = args.defaultCard.thumbHeight;
      }
      if (args.defaultCard.width !== undefined) {
        updates.defaultCardWidth = args.defaultCard.width;
      }
      if (args.defaultCard.height !== undefined) {
        updates.defaultCardHeight = args.defaultCard.height;
      }
    }

    if (args.customCard) {
      updates.customCardThumbStorageId = args.customCard.thumbStorageId;
      updates.customCardThumbName = args.customCard.thumbName;
      if (args.customCard.thumbWidth !== undefined) {
        updates.customCardThumbWidth = args.customCard.thumbWidth;
      }
      if (args.customCard.thumbHeight !== undefined) {
        updates.customCardThumbHeight = args.customCard.thumbHeight;
      }
      if (args.customCard.width !== undefined) {
        updates.customCardWidth = args.customCard.width;
      }
      if (args.customCard.height !== undefined) {
        updates.customCardHeight = args.customCard.height;
      }
    }

    await ctx.db.patch(args.id, updates);
    return { success: true };
  }
});

export const enqueueMissingThumbnails = mutation({
  args: {
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const max = Math.max(1, Math.min(args.limit ?? 25, 200));
    let enqueued = 0;

    for await (const cat of ctx.db.query("catdex")) {
      const needsDefault = Boolean(cat.defaultCardStorageId && !cat.defaultCardThumbStorageId);
      const needsCustom = Boolean(cat.customCardStorageId && !cat.customCardThumbStorageId);
      if (!needsDefault && !needsCustom) continue;

      await ctx.scheduler.runAfter(0, api.imageService.generateForCat, { id: cat._id });
      enqueued += 1;
      if (enqueued >= max) break;
    }

    return { enqueued };
  }
});
