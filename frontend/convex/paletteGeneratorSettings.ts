import { mutation, query, type MutationCtx } from "./_generated/server.js";
import { v } from "convex/values";

// Omits 0, 1, O, I, l to avoid visual ambiguity in URLs
const SLUG_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const SLUG_LENGTH = 7;

function randomSlug() {
  let slug = "";
  for (let i = 0; i < SLUG_LENGTH; i += 1) {
    const index = Math.floor(Math.random() * SLUG_ALPHABET.length);
    slug += SLUG_ALPHABET[index];
  }
  return slug;
}

async function generateUniqueSlug(ctx: MutationCtx) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = randomSlug();
    const existing = await ctx.db
      .query("palette_generator_settings")
      .withIndex("bySlug", (q) => q.eq("slug", candidate))
      .unique();
    if (!existing) {
      return candidate;
    }
  }
  throw new Error("Failed to generate unique settings slug");
}

export const save = mutation({
  args: {
    config: v.any(),
    slug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const trimmed = args.slug?.trim();

    if (trimmed) {
      const existing = await ctx.db
        .query("palette_generator_settings")
        .withIndex("bySlug", (q) => q.eq("slug", trimmed))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          config: args.config,
          updatedAt: now,
        });
        return { slug: existing.slug, id: existing._id, updated: true };
      }
    }

    const slug = trimmed || (await generateUniqueSlug(ctx));
    const id = await ctx.db.insert("palette_generator_settings", {
      slug,
      config: args.config,
      createdAt: now,
      updatedAt: now,
    });

    return { slug, id, updated: false };
  },
});

export const get = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("palette_generator_settings")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!record) return null;
    return {
      slug: record.slug,
      config: record.config,
      id: record._id,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  },
});

export const getImageUrl = query({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});
