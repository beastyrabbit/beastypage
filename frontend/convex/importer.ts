import { type Infer, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel.js";
import type { ActionCtx, MutationCtx } from "./_generated/server.js";
import { action, mutation } from "./_generated/server.js";

const imageReference = v.object({
  fileName: v.string(),
  storageId: v.id("_storage"),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
});

const optionalImageReference = v.optional(imageReference);

const seasonPayload = v.object({
  name: v.string(),
  shortName: v.optional(v.string()),
  cardBack: optionalImageReference,
});

const rarityPayload = v.object({
  name: v.string(),
  stars: v.optional(v.number()),
  chancePercent: v.optional(v.number()),
});

const catdexRecordPayload = v.object({
  legacyId: v.string(),
  twitchUserName: v.string(),
  catName: v.string(),
  seasonName: v.string(),
  rarityName: v.string(),
  cardNumber: v.optional(v.string()),
  approved: v.boolean(),
  createdAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
  defaultCard: imageReference,
  defaultCardThumb: optionalImageReference,
  customCard: optionalImageReference,
  customCardThumb: optionalImageReference,
});

const collectionRecordPayload = v.object({
  legacyId: v.string(),
  artistName: v.string(),
  animal: v.string(),
  link: v.optional(v.string()),
  createdAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
  blurImage: optionalImageReference,
  previewImage: optionalImageReference,
  fullImage: optionalImageReference,
});
type SeasonPayload = Infer<typeof seasonPayload>;
type RarityPayload = Infer<typeof rarityPayload>;
type CatdexRecordPayload = Infer<typeof catdexRecordPayload>;
type CollectionRecordPayload = Infer<typeof collectionRecordPayload>;

async function requireAdmin(ctx: ActionCtx | MutationCtx) {
  const getAdminIdentity = (
    ctx.auth as { getAdminIdentity?: () => Promise<unknown> }
  ).getAdminIdentity;
  if (!getAdminIdentity) {
    return null;
  }
  try {
    const identity = await getAdminIdentity();
    if (!identity) {
      return null;
    }
    return identity;
  } catch {
    // Missing admin identity is treated as an unauthenticated request.
    return null;
  }
}

export const prepareUploadUrls = action({
  args: {
    assets: v.array(
      v.object({
        key: v.string(),
        contentType: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const uploads = await Promise.all(
      args.assets.map(async (asset) => ({
        key: asset.key,
        uploadUrl: await ctx.storage.generateUploadUrl(),
      })),
    );
    return uploads;
  },
});

export const ingestBundle = mutation({
  args: {
    bundle: v.object({
      seasons: v.array(seasonPayload),
      rarities: v.array(rarityPayload),
      catdex: v.array(catdexRecordPayload),
      collection: v.array(collectionRecordPayload),
    }),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const existingCat = await ctx.db.query("catdex").first();
    const existingCollection = await ctx.db.query("collection").first();

    if (existingCat || existingCollection) {
      throw new Error(
        "Target tables already contain data. Please start with an empty Convex instance or clear the catdex and collection tables before importing.",
      );
    }

    const now = Date.now();

    const seasonIdByName = await upsertSeasons(ctx, args.bundle.seasons, now);
    const rarityIdByName = await upsertRarities(ctx, args.bundle.rarities, now);

    const catdexInserted = await insertCatdexRecords(
      ctx,
      args.bundle.catdex,
      seasonIdByName,
      rarityIdByName,
      now,
    );
    const collectionInserted = await insertCollectionRecords(
      ctx,
      args.bundle.collection,
      now,
    );

    return {
      catdexInserted,
      collectionInserted,
      seasonsInserted: seasonIdByName.size,
      raritiesInserted: rarityIdByName.size,
    } as const;
  },
});

function storageId(id: string): Id<"_storage"> {
  return id as unknown as Id<"_storage">;
}

async function upsertSeasons(
  ctx: MutationCtx,
  seasons: SeasonPayload[],
  now: number,
): Promise<Map<string, Id<"card_season">>> {
  const map = new Map<string, Id<"card_season">>();

  for (const season of seasons) {
    const seasonName = season.name.trim();
    if (!seasonName) {
      throw new Error("Season name cannot be empty");
    }

    const existing = await ctx.db
      .query("card_season")
      .withIndex("byName", (q) => q.eq("seasonName", seasonName))
      .first();

    const cardBack = season.cardBack;
    const patch = buildSeasonPatch(cardBack);

    if (existing) {
      if (existing.shortName !== (season.shortName ?? null)) {
        patch.shortName = season.shortName ?? undefined;
      }
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = now;
        await ctx.db.patch(existing._id, patch);
      }
      map.set(seasonName, existing._id);
      continue;
    }

    const insertDoc: Omit<Doc<"card_season">, "_id" | "_creationTime"> = {
      seasonName,
      createdAt: now,
      updatedAt: now,
    };
    if (season.shortName !== undefined) {
      insertDoc.shortName = season.shortName;
    }
    if (cardBack) {
      insertDoc.cardBackStorageId = storageId(cardBack.storageId);
      insertDoc.cardBackName = cardBack.fileName;
      if (cardBack.width !== undefined)
        insertDoc.cardBackWidth = cardBack.width;
      if (cardBack.height !== undefined)
        insertDoc.cardBackHeight = cardBack.height;
    }

    const id = await ctx.db.insert("card_season", insertDoc);
    map.set(seasonName, id);
  }

  return map;
}

function buildSeasonPatch(cardBack: SeasonPayload["cardBack"]) {
  const patch: Record<string, unknown> = {};
  if (!cardBack) return patch;
  patch.cardBackStorageId = storageId(cardBack.storageId);
  patch.cardBackName = cardBack.fileName;
  if (cardBack.width !== undefined) patch.cardBackWidth = cardBack.width;
  if (cardBack.height !== undefined) patch.cardBackHeight = cardBack.height;
  return patch;
}

async function upsertRarities(
  ctx: MutationCtx,
  rarities: RarityPayload[],
  now: number,
): Promise<Map<string, Id<"rarity">>> {
  const map = new Map<string, Id<"rarity">>();

  for (const rarity of rarities) {
    const rarityName = rarity.name.trim();
    if (!rarityName) {
      throw new Error("Rarity name cannot be empty");
    }

    const existing = await ctx.db
      .query("rarity")
      .withIndex("byName", (q) => q.eq("rarityName", rarityName))
      .first();

    if (existing) {
      const needsUpdate =
        existing.stars !== (rarity.stars ?? null) ||
        existing.chancePercent !== (rarity.chancePercent ?? null);
      if (needsUpdate) {
        await ctx.db.patch(existing._id, {
          stars: rarity.stars ?? undefined,
          chancePercent: rarity.chancePercent ?? undefined,
          updatedAt: now,
        });
      }
      map.set(rarityName, existing._id);
      continue;
    }

    const rarityDoc: Omit<Doc<"rarity">, "_id" | "_creationTime"> = {
      rarityName,
      createdAt: now,
      updatedAt: now,
    };
    if (rarity.stars !== undefined) rarityDoc.stars = rarity.stars;
    if (rarity.chancePercent !== undefined)
      rarityDoc.chancePercent = rarity.chancePercent;

    const id = await ctx.db.insert("rarity", rarityDoc);
    map.set(rarityName, id);
  }

  return map;
}

async function insertCatdexRecords(
  ctx: MutationCtx,
  records: CatdexRecordPayload[],
  seasonIdByName: Map<string, Id<"card_season">>,
  rarityIdByName: Map<string, Id<"rarity">>,
  defaultNow: number,
): Promise<number> {
  let inserted = 0;

  for (const record of records) {
    const seasonId = seasonIdByName.get(record.seasonName.trim());
    if (!seasonId) {
      throw new Error(
        `Unknown season referenced in catdex record: ${record.seasonName}`,
      );
    }
    const rarityId = rarityIdByName.get(record.rarityName.trim());
    if (!rarityId) {
      throw new Error(
        `Unknown rarity referenced in catdex record: ${record.rarityName}`,
      );
    }

    const createdAt = record.createdAt ?? defaultNow;
    const updatedAt = record.updatedAt ?? record.createdAt ?? defaultNow;

    const insertDoc: Omit<Doc<"catdex">, "_id" | "_creationTime"> = {
      twitchUserName: record.twitchUserName,
      catName: record.catName,
      seasonId,
      rarityId,
      approved: record.approved,
      createdAt,
      updatedAt,
      defaultCardStorageId: storageId(record.defaultCard.storageId),
      defaultCardName: record.defaultCard.fileName,
    };
    applyCatdexImages(insertDoc, record);

    await ctx.db.insert("catdex", insertDoc);
    inserted += 1;
  }

  return inserted;
}

function applyCatdexImages(
  insertDoc: Omit<Doc<"catdex">, "_id" | "_creationTime">,
  record: CatdexRecordPayload,
) {
  if (record.cardNumber) insertDoc.cardNumber = record.cardNumber;
  if (record.defaultCard.width !== undefined)
    insertDoc.defaultCardWidth = record.defaultCard.width;
  if (record.defaultCard.height !== undefined)
    insertDoc.defaultCardHeight = record.defaultCard.height;
  const thumb = record.defaultCardThumb;
  if (thumb) {
    insertDoc.defaultCardThumbStorageId = storageId(thumb.storageId);
    insertDoc.defaultCardThumbName = thumb.fileName;
    if (thumb.width !== undefined)
      insertDoc.defaultCardThumbWidth = thumb.width;
    if (thumb.height !== undefined)
      insertDoc.defaultCardThumbHeight = thumb.height;
  }
  applyCustomCatdexImages(insertDoc, record);
}

function applyCustomCatdexImages(
  insertDoc: Omit<Doc<"catdex">, "_id" | "_creationTime">,
  record: CatdexRecordPayload,
) {
  const custom = record.customCard;
  if (custom) {
    insertDoc.customCardStorageId = storageId(custom.storageId);
    insertDoc.customCardName = custom.fileName;
    if (custom.width !== undefined) insertDoc.customCardWidth = custom.width;
    if (custom.height !== undefined) insertDoc.customCardHeight = custom.height;
  }
  const customThumb = record.customCardThumb;
  if (customThumb) {
    insertDoc.customCardThumbStorageId = storageId(customThumb.storageId);
    insertDoc.customCardThumbName = customThumb.fileName;
    if (customThumb.width !== undefined)
      insertDoc.customCardThumbWidth = customThumb.width;
    if (customThumb.height !== undefined)
      insertDoc.customCardThumbHeight = customThumb.height;
  }
}

async function insertCollectionRecords(
  ctx: MutationCtx,
  records: CollectionRecordPayload[],
  defaultNow: number,
): Promise<number> {
  let inserted = 0;

  for (const record of records) {
    const createdAt = record.createdAt ?? defaultNow;
    const updatedAt = record.updatedAt ?? record.createdAt ?? defaultNow;

    const insertDoc: Omit<Doc<"collection">, "_id" | "_creationTime"> = {
      artistName: record.artistName,
      animal: record.animal,
      link: record.link ?? "",
      createdAt,
      updatedAt,
    };
    applyCollectionImages(insertDoc, record);

    await ctx.db.insert("collection", insertDoc);
    inserted += 1;
  }

  return inserted;
}

function applyCollectionImages(
  insertDoc: Omit<Doc<"collection">, "_id" | "_creationTime">,
  record: CollectionRecordPayload,
) {
  const blur = record.blurImage;
  if (blur) {
    insertDoc.blurImgStorageId = storageId(blur.storageId);
    insertDoc.blurImgName = blur.fileName;
  }
  const preview = record.previewImage;
  if (preview) {
    insertDoc.previewImgStorageId = storageId(preview.storageId);
    insertDoc.previewImgName = preview.fileName;
    if (preview.width !== undefined) insertDoc.previewImgWidth = preview.width;
    if (preview.height !== undefined)
      insertDoc.previewImgHeight = preview.height;
  }
  const full = record.fullImage;
  if (full) {
    insertDoc.fullImgStorageId = storageId(full.storageId);
    insertDoc.fullImgName = full.fileName;
    if (full.width !== undefined) insertDoc.fullImgWidth = full.width;
    if (full.height !== undefined) insertDoc.fullImgHeight = full.height;
  }
}
