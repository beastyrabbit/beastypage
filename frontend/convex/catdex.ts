import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server.js";
import { docIdToString } from "./utils.js";

type CatdexDoc = Doc<"catdex">;
type SeasonDoc = Doc<"card_season">;
type RarityDoc = Doc<"rarity">;

const MAX_CARD_UPLOAD_BYTES = 10 * 1024 * 1024;
const CARD_UPLOAD_CONTENT_TYPES = new Set(["image/png", "image/jpeg"]);
const THUMBNAIL_RETRY_AFTER_MS = 30 * 60 * 1000;
const CATDEX_UPLOAD_TTL_MS = 30 * 60 * 1000;
const MAX_UPLOAD_CLEANUP_BATCH = 100;
const MAX_UPLOADS_PER_CLIENT_PER_HOUR = 12;
const MAX_GLOBAL_UPLOADS_PER_HOUR = 600;
const MAX_THUMBNAIL_ATTEMPTS = 3;

export type CatdexPayload = Awaited<ReturnType<typeof catdexRecordToClient>>;

async function thumbnailCandidates(
  ctx: MutationCtx,
  max: number,
): Promise<CatdexDoc[]> {
  const candidates = [
    ...(await ctx.db
      .query("catdex")
      .withIndex("byThumbnailStatusAndAttemptedAt", (q) =>
        q.eq("thumbnailStatus", "pending"),
      )
      .order("asc")
      .take(max)),
    ...(await ctx.db
      .query("catdex")
      .withIndex("byThumbnailStatusAndAttemptedAt", (q) =>
        q.eq("thumbnailStatus", "processing"),
      )
      .order("asc")
      .take(max)),
    // Legacy imports predate thumbnailStatus. Keep this fallback bounded;
    // successful/failing rows are stamped on their first attempt.
    ...(await ctx.db
      .query("catdex")
      .withIndex("byThumbnailStatusAndAttemptedAt", (q) =>
        q.eq("thumbnailStatus", undefined),
      )
      .order("asc")
      .take(max)),
  ];
  const seen = new Set<string>();
  return candidates.filter((cat) => {
    if (seen.has(cat._id)) return false;
    seen.add(cat._id);
    return true;
  });
}

function thumbnailNeeds(cat: CatdexDoc) {
  return {
    default: Boolean(
      cat.defaultCardStorageId && !cat.defaultCardThumbStorageId,
    ),
    custom: Boolean(cat.customCardStorageId && !cat.customCardThumbStorageId),
  };
}

function shouldSkipThumbnail(cat: CatdexDoc, now: number): boolean {
  if (cat.thumbnailStatus === "failed" || cat.thumbnailStatus === "complete") {
    return true;
  }
  if (cat.thumbnailAttemptedAt === undefined) return false;
  if (cat.thumbnailStatus === "pending") {
    return cat.thumbnailAttemptedAt > now;
  }
  return (
    cat.thumbnailStatus === "processing" &&
    cat.thumbnailAttemptedAt > now - THUMBNAIL_RETRY_AFTER_MS
  );
}

function isCurrentThumbnailAttempt(cat: CatdexDoc, attempt?: number) {
  if (attempt === undefined) {
    return (
      cat.thumbnailAttemptCount === undefined &&
      cat.thumbnailStatus !== "complete" &&
      cat.thumbnailStatus !== "failed"
    );
  }
  return (
    cat.thumbnailStatus === "processing" &&
    cat.thumbnailAttemptCount === attempt
  );
}

function thumbnailOutcomeUpdates(
  cat: CatdexDoc,
  updates: Partial<CatdexDoc>,
  retryableFailure = false,
): Partial<CatdexDoc> {
  const needs = thumbnailNeeds({ ...cat, ...updates });
  if (!needs.default && !needs.custom) {
    return { ...updates, thumbnailStatus: "complete" };
  }
  const canRetry =
    retryableFailure &&
    (cat.thumbnailAttemptCount ?? 1) < MAX_THUMBNAIL_ATTEMPTS;
  const attemptedAt = Date.now();
  // A pending row stores its next eligible retry in this field; processing
  // rows store the start time used by stale-job recovery.
  return {
    ...updates,
    thumbnailStatus: canRetry ? "pending" : "failed",
    thumbnailAttemptedAt: canRetry
      ? attemptedAt + THUMBNAIL_RETRY_AFTER_MS
      : attemptedAt,
  };
}

export const page = query({
  args: { paginationOpts: paginationOptsValidator, approved: v.boolean() },
  handler: async (ctx, args) => {
    if (!args.approved) {
      throw new Error("Pending Catdex records require moderation access");
    }
    // Pending submissions are moderation data and must never be returned by
    // this public query. Keep the argument for generated-client compatibility.
    const result = await ctx.db
      .query("catdex")
      .withIndex("byApproval", (q) => q.eq("approved", true))
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(48, Math.max(1, args.paginationOpts.numItems)),
      });
    const seasons = new Map<string, Promise<SeasonDoc | null>>();
    const rarities = new Map<string, Promise<RarityDoc | null>>();
    return {
      ...result,
      page: await Promise.all(
        result.page.map((doc) =>
          catdexRecordToClient(ctx, doc, { seasons, rarities }),
        ),
      ),
    };
  },
});

export const hasPending = query({
  args: {},
  handler: async (ctx) =>
    Boolean(
      await ctx.db
        .query("catdex")
        .withIndex("byApproval", (q) => q.eq("approved", false))
        .first(),
    ),
});

/** Legacy compatibility query: returns at most 48 cards. Use page for the full archive. */
export const list = query({
  args: {
    approved: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.approved === false) {
      throw new Error("Pending Catdex records require moderation access");
    }
    const approved = true;
    const cats = await ctx.db
      .query("catdex")
      .withIndex("byApproval", (q) => q.eq("approved", approved))
      .order("desc")
      .take(48);
    cats.sort(
      (a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt),
    );
    return Promise.all(cats.map((doc) => catdexRecordToClient(ctx, doc)));
  },
});

export const pendingCount = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Compatibility endpoint for older clients. New clients use hasPending.
    const cats = await ctx.db
      .query("catdex")
      .withIndex("byApproval", (q) => q.eq("approved", false))
      .take(500);
    return cats.length;
  },
});

export const get = query({
  args: {
    id: v.id("catdex"),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc?.approved) return null;
    return catdexRecordToClient(ctx, doc);
  },
});

export const getDoc = internalQuery({
  args: {
    id: v.id("catdex"),
  },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

/**
 * Generate a short-lived managed upload URL for a Catdex submission.
 *
 * This is intentionally public because submissions are available to visitors
 * without an account. The HTTP upload action validates and records the stored
 * object before the create mutation attaches it to a Catdex record.
 */
export const generateUploadUrl = mutation({
  args: { clientKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const identity = await ctx.auth.getUserIdentity();
    const anonymousRateKey =
      args.clientKey && /^[A-Za-z0-9_-]{16,80}$/.test(args.clientKey)
        ? `client:${args.clientKey}`
        : undefined;
    const rateKey = identity?.tokenIdentifier
      ? `identity:${identity.tokenIdentifier}`
      : anonymousRateKey;
    if (rateKey) {
      const recentClientUploads = await ctx.db
        .query("catdex_uploads")
        .withIndex("byRateKeyAndCreatedAt", (q) =>
          q.eq("rateKey", rateKey).gt("createdAt", now - 60 * 60 * 1000),
        )
        .take(MAX_UPLOADS_PER_CLIENT_PER_HOUR + 1);
      if (recentClientUploads.length >= MAX_UPLOADS_PER_CLIENT_PER_HOUR) {
        throw new Error("Too many pending uploads; try again later");
      }
    }
    const recentUploads = await ctx.db
      .query("catdex_uploads")
      .withIndex("byCreatedAt", (q) => q.gt("createdAt", now - 60 * 60 * 1000))
      .take(MAX_GLOBAL_UPLOADS_PER_HOUR + 1);
    if (recentUploads.length >= MAX_GLOBAL_UPLOADS_PER_HOUR) {
      throw new Error("Too many pending uploads; try again later");
    }
    const token = crypto.randomUUID();
    await ctx.db.insert("catdex_uploads", {
      token,
      ...(rateKey ? { rateKey } : {}),
      status: "pending",
      expiresAt: now + CATDEX_UPLOAD_TTL_MS,
      createdAt: now,
      updatedAt: now,
    });

    // HTTP actions are served from the Convex site origin. Refuse to return a
    // relative URL: browsers would resolve it against the frontend origin,
    // bypassing the upload action on self-hosted deployments.
    const configuredOrigin =
      process.env.CONVEX_SITE_URL ?? process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
    const origin = configuredOrigin?.replace(/\/$/, "");
    if (!origin) {
      throw new Error("CONVEX_SITE_URL is not configured");
    }
    return `${origin}/catdex/upload?token=${encodeURIComponent(token)}`;
  },
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
      fileName: v.string(),
      uploadToken: v.optional(v.string()),
    }),
    customCard: v.optional(
      v.object({
        storageId: v.id("_storage"),
        fileName: v.string(),
        uploadToken: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await consumeCardUpload(
      ctx,
      args.defaultCard.uploadToken,
      args.defaultCard.storageId,
    );
    if (args.customCard) {
      await consumeCardUpload(
        ctx,
        args.customCard.uploadToken,
        args.customCard.storageId,
      );
    }
    await validateCardUpload(ctx, args.defaultCard.storageId);
    if (args.customCard) {
      await validateCardUpload(ctx, args.customCard.storageId);
    }

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
      thumbnailStatus: "processing" as const,
      thumbnailAttemptedAt: nowTs,
      thumbnailAttemptCount: 1,
      ...(args.cardNumber !== undefined ? { cardNumber: args.cardNumber } : {}),
      ...(args.customCard
        ? {
            customCardStorageId: args.customCard.storageId,
            customCardName: args.customCard.fileName,
          }
        : {}),
    } satisfies Omit<CatdexDoc, "_id" | "_creationTime">;

    const docId = await ctx.db.insert("catdex", insertDoc);
    const doc = await ctx.db.get(docId);
    if (!doc) {
      throw new Error("Failed to create catdex record");
    }
    await ctx.scheduler.runAfter(0, internal.imageService.generateForCat, {
      id: docId,
      attempt: 1,
    });
    return catdexRecordToClient(ctx, doc);
  },
});

async function validateCardUpload(
  ctx: Pick<MutationCtx, "db">,
  storageId: Id<"_storage">,
) {
  const metadata = await ctx.db.system.get("_storage", storageId);
  if (!metadata) {
    throw new Error("Card upload was not found or has expired.");
  }
  if (metadata.size > MAX_CARD_UPLOAD_BYTES) {
    throw new Error("Card uploads must be 10 MiB or smaller.");
  }
  // The managed HTTP endpoint validates the request header before storing.
  // Some Convex test/storage backends omit contentType from system metadata,
  // so only reject an explicitly unsupported type here.
  if (
    metadata.contentType !== undefined &&
    !CARD_UPLOAD_CONTENT_TYPES.has(metadata.contentType)
  ) {
    throw new Error("Card uploads must be PNG or JPEG images.");
  }
}

async function consumeCardUpload(
  ctx: Pick<MutationCtx, "db">,
  token: string | undefined,
  storageId: Id<"_storage">,
) {
  const upload = token
    ? await ctx.db
        .query("catdex_uploads")
        .withIndex("byToken", (q) => q.eq("token", token))
        .unique()
    : await ctx.db
        .query("catdex_uploads")
        .withIndex("byStorageId", (q) => q.eq("storageId", storageId))
        .unique();
  if (!upload) {
    throw new Error("Card upload was not issued for this submission.");
  }
  if (
    upload.status !== "attached" ||
    upload.storageId !== storageId ||
    upload.expiresAt <= Date.now()
  ) {
    throw new Error("Card upload was not issued for this submission.");
  }
  await ctx.db.delete(upload._id);
}

export const getUploadReservation = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const upload = await ctx.db
      .query("catdex_uploads")
      .withIndex("byToken", (q) => q.eq("token", args.token))
      .unique();
    if (!upload) return null;
    if (upload.status !== "pending" || upload.expiresAt <= Date.now()) {
      return null;
    }
    return upload;
  },
});

export const attachUpload = internalMutation({
  args: {
    token: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const upload = await ctx.db
      .query("catdex_uploads")
      .withIndex("byToken", (q) => q.eq("token", args.token))
      .unique();
    if (!upload) {
      throw new Error("Card upload URL has expired.");
    }
    if (upload.status !== "pending" || upload.expiresAt <= Date.now()) {
      throw new Error("Card upload URL has expired.");
    }
    await validateCardUpload(ctx, args.storageId);
    await ctx.db.patch(upload._id, {
      storageId: args.storageId,
      status: "attached",
      updatedAt: Date.now(),
    });
  },
});

export const cleanupExpiredUploads = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(
      1,
      Math.min(
        args.limit ?? MAX_UPLOAD_CLEANUP_BATCH,
        MAX_UPLOAD_CLEANUP_BATCH,
      ),
    );
    const expired = await ctx.db
      .query("catdex_uploads")
      .withIndex("byExpiresAt", (q) => q.lt("expiresAt", Date.now()))
      .take(limit);
    for (const upload of expired) {
      if (upload.storageId) await ctx.storage.delete(upload.storageId);
      await ctx.db.delete(upload._id);
    }
    if (expired.length === limit) {
      await ctx.scheduler.runAfter(0, internal.catdex.cleanupExpiredUploads, {
        limit,
      });
    }
    return { deleted: expired.length };
  },
});

async function catdexRecordToClient(
  ctx: QueryCtx,
  doc: CatdexDoc,
  cache?: {
    seasons: Map<string, Promise<SeasonDoc | null>>;
    rarities: Map<string, Promise<RarityDoc | null>>;
  },
) {
  const lookupCache = cache ?? {
    seasons: new Map<string, Promise<SeasonDoc | null>>(),
    rarities: new Map<string, Promise<RarityDoc | null>>(),
  };
  const id = docIdToString(doc._id);
  if (!lookupCache.seasons.has(doc.seasonId))
    lookupCache.seasons.set(doc.seasonId, ctx.db.get(doc.seasonId));
  if (!lookupCache.rarities.has(doc.rarityId))
    lookupCache.rarities.set(doc.rarityId, ctx.db.get(doc.rarityId));
  const seasonDoc = await lookupCache.seasons.get(doc.seasonId);
  const rarityDoc = await lookupCache.rarities.get(doc.rarityId);
  const seasonInfo = seasonDoc ? seasonRecordToClient(seasonDoc) : null;
  const rarityInfo = rarityDoc ? rarityRecordToClient(rarityDoc) : null;

  const seasonName = seasonInfo?.season_name ?? null;
  const rarityName = rarityInfo?.rarity_name ?? null;

  // Convex Cloud returns proper absolute URLs - no normalization needed
  const defaultCardUrl = doc.defaultCardStorageId
    ? await ctx.storage.getUrl(doc.defaultCardStorageId)
    : null;
  const defaultCardThumbUrl = doc.defaultCardThumbStorageId
    ? await ctx.storage.getUrl(doc.defaultCardThumbStorageId)
    : null;
  const customCardUrl = doc.customCardStorageId
    ? await ctx.storage.getUrl(doc.customCardStorageId)
    : null;
  const customCardThumbUrl = doc.customCardThumbStorageId
    ? await ctx.storage.getUrl(doc.customCardThumbStorageId)
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
    updated: doc.updatedAt,
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
    updated: doc.updatedAt,
  };
}

function rarityRecordToClient(doc: RarityDoc) {
  return {
    id: docIdToString(doc._id),
    rarity_name: doc.rarityName,
    stars: doc.stars ?? null,
    chance_percent: doc.chancePercent ?? null,
    created: doc.createdAt,
    updated: doc.updatedAt,
  };
}

type ThumbnailUpdate = {
  thumbStorageId: Id<"_storage">;
  thumbName: string;
  thumbWidth?: number;
  thumbHeight?: number;
  width?: number;
  height?: number;
};

function applyDefaultCardThumbnail(
  updates: Partial<CatdexDoc>,
  card: ThumbnailUpdate,
) {
  updates.defaultCardThumbStorageId = card.thumbStorageId;
  updates.defaultCardThumbName = card.thumbName;
  if (card.thumbWidth !== undefined) {
    updates.defaultCardThumbWidth = card.thumbWidth;
  }
  if (card.thumbHeight !== undefined) {
    updates.defaultCardThumbHeight = card.thumbHeight;
  }
  if (card.width !== undefined) {
    updates.defaultCardWidth = card.width;
  }
  if (card.height !== undefined) {
    updates.defaultCardHeight = card.height;
  }
}

function applyCustomCardThumbnail(
  updates: Partial<CatdexDoc>,
  card: ThumbnailUpdate,
) {
  updates.customCardThumbStorageId = card.thumbStorageId;
  updates.customCardThumbName = card.thumbName;
  if (card.thumbWidth !== undefined) {
    updates.customCardThumbWidth = card.thumbWidth;
  }
  if (card.thumbHeight !== undefined) {
    updates.customCardThumbHeight = card.thumbHeight;
  }
  if (card.width !== undefined) {
    updates.customCardWidth = card.width;
  }
  if (card.height !== undefined) {
    updates.customCardHeight = card.height;
  }
}

export const applyThumbnailUpdates = internalMutation({
  args: {
    id: v.id("catdex"),
    defaultCard: v.optional(
      v.object({
        thumbStorageId: v.id("_storage"),
        thumbName: v.string(),
        thumbWidth: v.optional(v.number()),
        thumbHeight: v.optional(v.number()),
        width: v.optional(v.number()),
        height: v.optional(v.number()),
      }),
    ),
    customCard: v.optional(
      v.object({
        thumbStorageId: v.id("_storage"),
        thumbName: v.string(),
        thumbWidth: v.optional(v.number()),
        thumbHeight: v.optional(v.number()),
        width: v.optional(v.number()),
        height: v.optional(v.number()),
      }),
    ),
    attempt: v.optional(v.number()),
    retryableFailure: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.id);
    if (!current || !isCurrentThumbnailAttempt(current, args.attempt)) {
      return { success: false, reason: "stale_attempt" } as const;
    }
    const updates: Partial<CatdexDoc> = {
      updatedAt: Date.now(),
    };

    if (args.defaultCard) {
      applyDefaultCardThumbnail(updates, args.defaultCard);
    }

    if (args.customCard) {
      applyCustomCardThumbnail(updates, args.customCard);
    }

    await ctx.db.patch(
      args.id,
      thumbnailOutcomeUpdates(current, updates, args.retryableFailure),
    );
    return { success: true };
  },
});

export const markThumbnailFailed = internalMutation({
  args: {
    id: v.id("catdex"),
    attempt: v.optional(v.number()),
    retryableFailure: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.id);
    if (!current || !isCurrentThumbnailAttempt(current, args.attempt)) return;
    await ctx.db.patch(
      args.id,
      thumbnailOutcomeUpdates(
        current,
        { updatedAt: Date.now() },
        args.retryableFailure,
      ),
    );
  },
});

export const enqueueMissingThumbnails = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const max = Math.max(1, Math.min(args.limit ?? 25, 200));
    let enqueued = 0;
    const now = Date.now();
    const candidates = await thumbnailCandidates(ctx, max);

    for (const cat of candidates) {
      if (shouldSkipThumbnail(cat, now)) continue;
      const needs = thumbnailNeeds(cat);
      if (!needs.default && !needs.custom) {
        await ctx.db.patch(cat._id, { thumbnailStatus: "complete" });
        continue;
      }

      if ((cat.thumbnailAttemptCount ?? 0) >= MAX_THUMBNAIL_ATTEMPTS) {
        await ctx.db.patch(cat._id, { thumbnailStatus: "failed" });
        continue;
      }

      await ctx.db.patch(cat._id, {
        thumbnailStatus: "processing",
        thumbnailAttemptedAt: now,
        thumbnailAttemptCount: (cat.thumbnailAttemptCount ?? 0) + 1,
      });
      await ctx.scheduler.runAfter(0, internal.imageService.generateForCat, {
        id: cat._id,
        attempt: (cat.thumbnailAttemptCount ?? 0) + 1,
      });
      enqueued += 1;
      if (enqueued >= max) break;
    }

    return { enqueued };
  },
});
