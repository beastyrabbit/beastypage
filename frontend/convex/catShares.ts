import { v } from "convex/values";
import { type MutationCtx, mutation, query } from "./_generated/server.js";
import { randomSlug } from "./utils.js";

const SLUG_ALPHABET =
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const SLUG_LENGTH = 7;

async function generateUniqueSlug(ctx: MutationCtx) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = randomSlug(SLUG_LENGTH, SLUG_ALPHABET);
    const existing = await ctx.db
      .query("cat_shares")
      .withIndex("bySlug", (q) => q.eq("slug", candidate))
      .unique();
    if (!existing) {
      return candidate;
    }
  }
  throw new Error("Failed to generate unique share slug");
}

export const create = mutation({
  args: {
    data: v.any(),
    slug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const slug = args.slug?.trim() || (await generateUniqueSlug(ctx));
    const now = Date.now();

    const id = await ctx.db.insert("cat_shares", {
      slug,
      data: args.data,
      createdAt: now,
    });

    return { slug, id };
  },
});

export const get = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("cat_shares")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!record) return null;
    return {
      slug: record.slug,
      data: record.data,
      id: record._id,
      createdAt: record.createdAt,
    };
  },
});
