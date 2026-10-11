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
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("palette_generator_settings")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
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
