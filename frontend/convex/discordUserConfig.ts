import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const DEFAULTS = {
  accessoriesMin: 0,
  accessoriesMax: 4,
  scarsMin: 0,
  scarsMax: 4,
  tortiesMin: 0,
  tortiesMax: 4,
  darkForest: false,
  starclan: false,
  palettes: [] as string[],
};

export const get = query({
  args: { discordUserId: v.string() },
  handler: async (ctx, { discordUserId }) => {
    const row = await ctx.db
      .query("discord_user_configs")
      .withIndex("byDiscordUserId", (q) => q.eq("discordUserId", discordUserId))
      .unique();

    if (!row) {
      return { ...DEFAULTS, discordUserId };
    }

    return {
      discordUserId: row.discordUserId,
      accessoriesMin: row.accessoriesMin,
      accessoriesMax: row.accessoriesMax,
      scarsMin: row.scarsMin,
      scarsMax: row.scarsMax,
      tortiesMin: row.tortiesMin,
      tortiesMax: row.tortiesMax,
      darkForest: row.darkForest,
      starclan: row.starclan,
      palettes: row.palettes,
    };
  },
});

export const upsert = mutation({
  args: {
    discordUserId: v.string(),
    accessoriesMin: v.optional(v.number()),
    accessoriesMax: v.optional(v.number()),
    scarsMin: v.optional(v.number()),
    scarsMax: v.optional(v.number()),
    tortiesMin: v.optional(v.number()),
    tortiesMax: v.optional(v.number()),
    darkForest: v.optional(v.boolean()),
    starclan: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { discordUserId, ...fields } = args;
    const now = Date.now();

    const existing = await ctx.db
      .query("discord_user_configs")
      .withIndex("byDiscordUserId", (q) => q.eq("discordUserId", discordUserId))
      .unique();

    // Build partial update from provided fields
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) updates[key] = value;
    }

    if (existing) {
      await ctx.db.patch(existing._id, { ...updates, updatedAt: now });
    } else {
      await ctx.db.insert("discord_user_configs", {
        discordUserId,
        ...DEFAULTS,
        ...updates,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const addPalette = mutation({
  args: {
    discordUserId: v.string(),
    paletteId: v.string(),
  },
  handler: async (ctx, { discordUserId, paletteId }) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("discord_user_configs")
      .withIndex("byDiscordUserId", (q) => q.eq("discordUserId", discordUserId))
      .unique();

    if (existing) {
      if (!existing.palettes.includes(paletteId)) {
        await ctx.db.patch(existing._id, {
          palettes: [...existing.palettes, paletteId],
          updatedAt: now,
        });
      }
    } else {
      await ctx.db.insert("discord_user_configs", {
        discordUserId,
        ...DEFAULTS,
        palettes: [paletteId],
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const removePalette = mutation({
  args: {
    discordUserId: v.string(),
    paletteId: v.string(),
  },
  handler: async (ctx, { discordUserId, paletteId }) => {
    const existing = await ctx.db
      .query("discord_user_configs")
      .withIndex("byDiscordUserId", (q) => q.eq("discordUserId", discordUserId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        palettes: existing.palettes.filter((p) => p !== paletteId),
        updatedAt: Date.now(),
      });
    }
  },
});

export const reset = mutation({
  args: { discordUserId: v.string() },
  handler: async (ctx, { discordUserId }) => {
    const existing = await ctx.db
      .query("discord_user_configs")
      .withIndex("byDiscordUserId", (q) => q.eq("discordUserId", discordUserId))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
