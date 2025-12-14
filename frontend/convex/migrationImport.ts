/**
 * Migration import functions for self-hosted -> Convex Cloud migration
 *
 * These mutations accept documents and insert them into the database.
 * Deploy this to Convex Cloud, then call from migration script.
 */
import { mutation, action, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

// ============================================================================
// Tier 1: Reference tables (no dependencies)
// ============================================================================

export const importCardSeason = mutation({
  args: {
    seasonName: v.string(),
    shortName: v.optional(v.string()),
    cardBackStorageId: v.optional(v.string()),
    cardBackName: v.optional(v.string()),
    cardBackWidth: v.optional(v.number()),
    cardBackHeight: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Check if already exists
    const existing = await ctx.db
      .query("card_season")
      .withIndex("byName", (q) => q.eq("seasonName", args.seasonName))
      .first();

    if (existing) {
      return { id: existing._id, existed: true };
    }

    const id = await ctx.db.insert("card_season", {
      seasonName: args.seasonName,
      shortName: args.shortName,
      cardBackStorageId: args.cardBackStorageId as Id<"_storage"> | undefined,
      cardBackName: args.cardBackName,
      cardBackWidth: args.cardBackWidth,
      cardBackHeight: args.cardBackHeight,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
    });

    return { id, existed: false };
  },
});

export const importRarity = mutation({
  args: {
    rarityName: v.string(),
    stars: v.optional(v.number()),
    chancePercent: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Check if already exists
    const existing = await ctx.db
      .query("rarity")
      .withIndex("byName", (q) => q.eq("rarityName", args.rarityName))
      .first();

    if (existing) {
      return { id: existing._id, existed: true };
    }

    const id = await ctx.db.insert("rarity", {
      rarityName: args.rarityName,
      stars: args.stars,
      chancePercent: args.chancePercent,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
    });

    return { id, existed: false };
  },
});

// ============================================================================
// Tier 2: Core data
// ============================================================================

export const importCatdexRecord = mutation({
  args: {
    twitchUserName: v.string(),
    catName: v.string(),
    seasonName: v.string(), // Will lookup by name
    rarityName: v.string(), // Will lookup by name
    cardNumber: v.optional(v.string()),
    approved: v.boolean(),
    defaultCardStorageId: v.optional(v.string()),
    defaultCardName: v.optional(v.string()),
    defaultCardWidth: v.optional(v.number()),
    defaultCardHeight: v.optional(v.number()),
    defaultCardThumbStorageId: v.optional(v.string()),
    defaultCardThumbName: v.optional(v.string()),
    defaultCardThumbWidth: v.optional(v.number()),
    defaultCardThumbHeight: v.optional(v.number()),
    customCardStorageId: v.optional(v.string()),
    customCardName: v.optional(v.string()),
    customCardWidth: v.optional(v.number()),
    customCardHeight: v.optional(v.number()),
    customCardThumbStorageId: v.optional(v.string()),
    customCardThumbName: v.optional(v.string()),
    customCardThumbWidth: v.optional(v.number()),
    customCardThumbHeight: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Lookup season and rarity by name
    const season = await ctx.db
      .query("card_season")
      .withIndex("byName", (q) => q.eq("seasonName", args.seasonName))
      .first();

    if (!season) {
      throw new Error(`Season not found: ${args.seasonName}`);
    }

    const rarity = await ctx.db
      .query("rarity")
      .withIndex("byName", (q) => q.eq("rarityName", args.rarityName))
      .first();

    if (!rarity) {
      throw new Error(`Rarity not found: ${args.rarityName}`);
    }

    const id = await ctx.db.insert("catdex", {
      twitchUserName: args.twitchUserName,
      catName: args.catName,
      seasonId: season._id,
      rarityId: rarity._id,
      cardNumber: args.cardNumber,
      approved: args.approved,
      defaultCardStorageId: args.defaultCardStorageId as Id<"_storage"> | undefined,
      defaultCardName: args.defaultCardName,
      defaultCardWidth: args.defaultCardWidth,
      defaultCardHeight: args.defaultCardHeight,
      defaultCardThumbStorageId: args.defaultCardThumbStorageId as Id<"_storage"> | undefined,
      defaultCardThumbName: args.defaultCardThumbName,
      defaultCardThumbWidth: args.defaultCardThumbWidth,
      defaultCardThumbHeight: args.defaultCardThumbHeight,
      customCardStorageId: args.customCardStorageId as Id<"_storage"> | undefined,
      customCardName: args.customCardName,
      customCardWidth: args.customCardWidth,
      customCardHeight: args.customCardHeight,
      customCardThumbStorageId: args.customCardThumbStorageId as Id<"_storage"> | undefined,
      customCardThumbName: args.customCardThumbName,
      customCardThumbWidth: args.customCardThumbWidth,
      customCardThumbHeight: args.customCardThumbHeight,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
    });

    return { id };
  },
});

export const importCollection = mutation({
  args: {
    artistName: v.string(),
    animal: v.string(),
    link: v.string(),
    blurImgStorageId: v.optional(v.string()),
    blurImgName: v.optional(v.string()),
    previewImgStorageId: v.optional(v.string()),
    previewImgName: v.optional(v.string()),
    previewImgWidth: v.optional(v.number()),
    previewImgHeight: v.optional(v.number()),
    fullImgStorageId: v.optional(v.string()),
    fullImgName: v.optional(v.string()),
    fullImgWidth: v.optional(v.number()),
    fullImgHeight: v.optional(v.number()),
    focusX: v.optional(v.number()),
    focusY: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("collection", {
      artistName: args.artistName,
      animal: args.animal,
      link: args.link,
      blurImgStorageId: args.blurImgStorageId as Id<"_storage"> | undefined,
      blurImgName: args.blurImgName,
      previewImgStorageId: args.previewImgStorageId as Id<"_storage"> | undefined,
      previewImgName: args.previewImgName,
      previewImgWidth: args.previewImgWidth,
      previewImgHeight: args.previewImgHeight,
      fullImgStorageId: args.fullImgStorageId as Id<"_storage"> | undefined,
      fullImgName: args.fullImgName,
      fullImgWidth: args.fullImgWidth,
      fullImgHeight: args.fullImgHeight,
      focusX: args.focusX,
      focusY: args.focusY,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
    });

    return { id };
  },
});

export const importCatProfile = mutation({
  args: {
    oldId: v.string(), // Track old ID for mapping
    slug: v.string(),
    catData: v.any(),
    catName: v.optional(v.string()),
    creatorName: v.optional(v.string()),
    previewsUpdatedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Check if slug already exists
    const existing = await ctx.db
      .query("cat_profile")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
      .first();

    if (existing) {
      return { id: existing._id, oldId: args.oldId, existed: true };
    }

    const id = await ctx.db.insert("cat_profile", {
      slug: args.slug,
      catData: args.catData,
      catName: args.catName,
      creatorName: args.creatorName,
      // adoptionBatchId will be set later if needed
      previewsUpdatedAt: args.previewsUpdatedAt,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
    });

    return { id, oldId: args.oldId, existed: false };
  },
});

export const importCatImage = mutation({
  args: {
    catProfileId: v.id("cat_profile"),
    kind: v.union(
      v.literal("tiny"),
      v.literal("preview"),
      v.literal("full"),
      v.literal("spriteSheet")
    ),
    storageId: v.string(),
    filename: v.optional(v.string()),
    meta: v.optional(v.any()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("cat_images", {
      catProfileId: args.catProfileId,
      kind: args.kind,
      storageId: args.storageId as Id<"_storage">,
      filename: args.filename,
      meta: args.meta,
      width: args.width,
      height: args.height,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
    });

    return { id };
  },
});

// ============================================================================
// Tier 3: Simple data
// ============================================================================

export const importCatShare = mutation({
  args: {
    slug: v.string(),
    data: v.any(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Check if slug already exists
    const existing = await ctx.db
      .query("cat_shares")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
      .first();

    if (existing) {
      return { id: existing._id, existed: true };
    }

    const id = await ctx.db.insert("cat_shares", {
      slug: args.slug,
      data: args.data,
      createdAt: args.createdAt,
    });

    return { id, existed: false };
  },
});

export const importSingleCatSettings = mutation({
  args: {
    slug: v.string(),
    config: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Check if slug already exists
    const existing = await ctx.db
      .query("single_cat_settings")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
      .first();

    if (existing) {
      return { id: existing._id, existed: true };
    }

    const id = await ctx.db.insert("single_cat_settings", {
      slug: args.slug,
      config: args.config,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
    });

    return { id, existed: false };
  },
});

export const importPerfectCat = mutation({
  args: {
    oldId: v.string(),
    hash: v.string(),
    params: v.any(),
    rating: v.number(),
    wins: v.number(),
    losses: v.number(),
    appearances: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastShownAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Check if hash already exists
    const existing = await ctx.db
      .query("perfect_cats")
      .withIndex("byHash", (q) => q.eq("hash", args.hash))
      .first();

    if (existing) {
      return { id: existing._id, oldId: args.oldId, existed: true };
    }

    const id = await ctx.db.insert("perfect_cats", {
      hash: args.hash,
      params: args.params,
      rating: args.rating,
      wins: args.wins,
      losses: args.losses,
      appearances: args.appearances,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
      lastShownAt: args.lastShownAt,
    });

    return { id, oldId: args.oldId, existed: false };
  },
});

export const importPerfectVote = mutation({
  args: {
    catAId: v.id("perfect_cats"),
    catBId: v.id("perfect_cats"),
    winnerId: v.id("perfect_cats"),
    clientId: v.optional(v.string()),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("perfect_votes", {
      catAId: args.catAId,
      catBId: args.catBId,
      winnerId: args.winnerId,
      clientId: args.clientId,
      createdAt: args.createdAt,
    });

    return { id };
  },
});

// ============================================================================
// Tier 4: Session data
// ============================================================================

export const importStreamSession = mutation({
  args: {
    oldId: v.string(),
    viewerKey: v.string(),
    status: v.string(),
    currentStep: v.optional(v.string()),
    stepIndex: v.optional(v.number()),
    stepHistory: v.optional(v.any()),
    params: v.optional(v.any()),
    allowRepeatIps: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("stream_sessions", {
      viewerKey: args.viewerKey,
      status: args.status,
      currentStep: args.currentStep,
      stepIndex: args.stepIndex,
      stepHistory: args.stepHistory,
      params: args.params,
      allowRepeatIps: args.allowRepeatIps,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
    });

    return { id, oldId: args.oldId };
  },
});

export const importStreamParticipant = mutation({
  args: {
    oldId: v.string(),
    sessionId: v.id("stream_sessions"),
    viewerSession: v.optional(v.string()),
    displayName: v.string(),
    status: v.string(),
    fingerprint: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("stream_participants", {
      sessionId: args.sessionId,
      viewerSession: args.viewerSession,
      displayName: args.displayName,
      status: args.status,
      fingerprint: args.fingerprint,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
    });

    return { id, oldId: args.oldId };
  },
});

export const importStreamVote = mutation({
  args: {
    sessionId: v.id("stream_sessions"),
    stepId: v.string(),
    optionKey: v.string(),
    optionMeta: v.optional(v.any()),
    votedBy: v.optional(v.id("stream_participants")),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("stream_votes", {
      sessionId: args.sessionId,
      stepId: args.stepId,
      optionKey: args.optionKey,
      optionMeta: args.optionMeta,
      votedBy: args.votedBy,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
    });

    return { id };
  },
});

export const importWheelSpin = mutation({
  args: {
    prizeName: v.string(),
    forced: v.boolean(),
    randomBucket: v.optional(v.number()),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("wheel_spins", {
      prizeName: args.prizeName,
      forced: args.forced,
      randomBucket: args.randomBucket,
      createdAt: args.createdAt,
    });

    return { id };
  },
});

export const importCoinflipperScore = mutation({
  args: {
    playerName: v.string(),
    score: v.number(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("coinflipper_scores", {
      playerName: args.playerName,
      score: args.score,
      createdAt: args.createdAt,
    });

    return { id };
  },
});

export const importDiscordChallenge = mutation({
  args: {
    token: v.string(),
    answerHash: v.string(),
    salt: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    usedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Check if token already exists
    const existing = await ctx.db
      .query("discord_challenge")
      .withIndex("byToken", (q) => q.eq("token", args.token))
      .first();

    if (existing) {
      return { id: existing._id, existed: true };
    }

    const id = await ctx.db.insert("discord_challenge", {
      token: args.token,
      answerHash: args.answerHash,
      salt: args.salt,
      expiresAt: args.expiresAt,
      createdAt: args.createdAt,
      usedAt: args.usedAt,
    });

    return { id, existed: false };
  },
});

export const importAdoptionBatch = mutation({
  args: {
    slug: v.optional(v.string()),
    title: v.optional(v.string()),
    creatorName: v.optional(v.string()),
    settings: v.optional(v.any()),
    cats: v.array(
      v.object({
        label: v.string(),
        catData: v.any(),
        profileId: v.optional(v.id("cat_profile")),
        encoded: v.optional(v.string()),
        shareToken: v.optional(v.string()),
        catName: v.optional(v.string()),
        creatorName: v.optional(v.string()),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Check if slug already exists (if provided)
    if (args.slug) {
      const existing = await ctx.db
        .query("adoption_batch")
        .withIndex("bySlug", (q) => q.eq("slug", args.slug))
        .first();

      if (existing) {
        return { id: existing._id, existed: true };
      }
    }

    const id = await ctx.db.insert("adoption_batch", {
      slug: args.slug,
      title: args.title,
      creatorName: args.creatorName,
      settings: args.settings,
      cats: args.cats,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
    });

    return { id, existed: false };
  },
});

// ============================================================================
// Storage upload helper
// ============================================================================

export const generateMigrationUploadUrl = mutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});
