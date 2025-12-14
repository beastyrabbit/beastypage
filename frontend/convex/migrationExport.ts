/**
 * Migration export functions - deploy these to self-hosted Convex
 * to export data for migration to Convex Cloud.
 * 
 * Simple .collect() for all tables since data is small.
 */
import { query } from "./_generated/server.js";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server.js";
import type { Id } from "./_generated/dataModel.js";

export const exportCardSeasons = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    return await ctx.db.query("card_season").collect();
  },
});

export const exportRarities = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    return await ctx.db.query("rarity").collect();
  },
});

export const exportCatdex = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    return await ctx.db.query("catdex").collect();
  },
});

export const exportCollection = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    return await ctx.db.query("collection").collect();
  },
});

export const exportCatProfiles = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    return await ctx.db.query("cat_profile").collect();
  },
});

export const exportCatImages = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    return await ctx.db.query("cat_images").collect();
  },
});

export const exportAdoptionBatches = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    return await ctx.db.query("adoption_batch").collect();
  },
});

export const exportCatShares = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    return await ctx.db.query("cat_shares").collect();
  },
});

export const exportSingleCatSettings = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    return await ctx.db.query("single_cat_settings").collect();
  },
});

export const exportPerfectCats = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    return await ctx.db.query("perfect_cats").collect();
  },
});

export const exportPerfectVotes = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    return await ctx.db.query("perfect_votes").collect();
  },
});

export const exportStreamSessions = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    return await ctx.db.query("stream_sessions").collect();
  },
});

export const exportStreamParticipants = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    return await ctx.db.query("stream_participants").collect();
  },
});

export const exportStreamVotes = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    return await ctx.db.query("stream_votes").collect();
  },
});

export const exportWheelSpins = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    return await ctx.db.query("wheel_spins").collect();
  },
});

export const exportCoinflipperScores = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    return await ctx.db.query("coinflipper_scores").collect();
  },
});

export const exportDiscordChallenges = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    return await ctx.db.query("discord_challenge").collect();
  },
});

// Helper to get a file URL for downloading
export const getStorageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx: QueryCtx, args: { storageId: Id<"_storage"> }) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});
