import { v } from "convex/values";
import type { Id } from "./_generated/dataModel.js";
import { mutation, query } from "./_generated/server.js";
import {
  getSettings,
  saveSettings,
  settingsArgs,
  settingsSlugArgs,
} from "./settings.js";

export const save = mutation({
  args: settingsArgs,
  handler: (ctx, args) => saveSettings(ctx, "palette_generator_settings", args),
});

export const get = query({
  args: settingsSlugArgs,
  handler: (ctx, args) =>
    getSettings(ctx, "palette_generator_settings", args.slug),
});

export const getImageUrl = query({
  // Keep storageId optional for one rollout window so an older frontend
  // bundle can continue to resolve images while new bundles use the slug.
  args: {
    slug: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const slug = args.slug;
    if (!slug) {
      return args.storageId ? await ctx.storage.getUrl(args.storageId) : null;
    }
    const record = await ctx.db
      .query("palette_generator_settings")
      .withIndex("bySlug", (q) => q.eq("slug", slug))
      .unique();
    if (
      !record ||
      typeof record.config !== "object" ||
      record.config === null
    ) {
      return null;
    }
    const imageStorageId = (record.config as { imageStorageId?: unknown })
      .imageStorageId;
    if (typeof imageStorageId !== "string") return null;
    return await ctx.storage.getUrl(imageStorageId as Id<"_storage">);
  },
});
