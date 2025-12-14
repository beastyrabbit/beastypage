/**
 * Migration export functions - deploy these to self-hosted Convex
 * to export data for migration to Convex Cloud.
 * 
 * These are queries that return all documents from each table.
 */
import { query } from "./_generated/server";
import { v } from "convex/values";

// Generic paginated export for any table
// Returns up to 1000 documents per call, use cursor for pagination

export const exportCardSeasons = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("card_season").collect();
  },
});

export const exportRarities = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("rarity").collect();
  },
});

export const exportCatdex = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    let query = ctx.db.query("catdex").order("asc");
    
    const results = await query.take(limit + 1);
    const hasMore = results.length > limit;
    const documents = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore ? documents[documents.length - 1]._id : null;
    
    return { documents, nextCursor, hasMore };
  },
});

export const exportCollection = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("collection").collect();
  },
});

export const exportCatProfiles = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const results = await ctx.db.query("cat_profile").order("asc").take(limit + 1);
    const hasMore = results.length > limit;
    const documents = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore ? documents[documents.length - 1]._id : null;
    
    return { documents, nextCursor, hasMore };
  },
});

export const exportCatImages = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const results = await ctx.db.query("cat_images").order("asc").take(limit + 1);
    const hasMore = results.length > limit;
    const documents = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore ? documents[documents.length - 1]._id : null;
    
    return { documents, nextCursor, hasMore };
  },
});

export const exportAdoptionBatches = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("adoption_batch").collect();
  },
});

export const exportCatShares = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const results = await ctx.db.query("cat_shares").order("asc").take(limit + 1);
    const hasMore = results.length > limit;
    const documents = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore ? documents[documents.length - 1]._id : null;
    
    return { documents, nextCursor, hasMore };
  },
});

export const exportSingleCatSettings = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("single_cat_settings").collect();
  },
});

export const exportPerfectCats = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const results = await ctx.db.query("perfect_cats").order("asc").take(limit + 1);
    const hasMore = results.length > limit;
    const documents = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore ? documents[documents.length - 1]._id : null;
    
    return { documents, nextCursor, hasMore };
  },
});

export const exportPerfectVotes = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const results = await ctx.db.query("perfect_votes").order("asc").take(limit + 1);
    const hasMore = results.length > limit;
    const documents = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore ? documents[documents.length - 1]._id : null;
    
    return { documents, nextCursor, hasMore };
  },
});

export const exportStreamSessions = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("stream_sessions").collect();
  },
});

export const exportStreamParticipants = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const results = await ctx.db.query("stream_participants").order("asc").take(limit + 1);
    const hasMore = results.length > limit;
    const documents = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore ? documents[documents.length - 1]._id : null;
    
    return { documents, nextCursor, hasMore };
  },
});

export const exportStreamVotes = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const results = await ctx.db.query("stream_votes").order("asc").take(limit + 1);
    const hasMore = results.length > limit;
    const documents = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore ? documents[documents.length - 1]._id : null;
    
    return { documents, nextCursor, hasMore };
  },
});

export const exportWheelSpins = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const results = await ctx.db.query("wheel_spins").order("asc").take(limit + 1);
    const hasMore = results.length > limit;
    const documents = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore ? documents[documents.length - 1]._id : null;
    
    return { documents, nextCursor, hasMore };
  },
});

export const exportCoinflipperScores = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("coinflipper_scores").collect();
  },
});

export const exportDiscordChallenges = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("discord_challenge").collect();
  },
});

// Helper to get a file URL for downloading
export const getStorageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});
