import { v } from "convex/values";
import { type MutationCtx, mutation, query } from "./_generated/server.js";
import { randomSlug } from "./utils.js";

const SLUG_ALPHABET =
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const SLUG_LENGTH = 7;
const MAX_DATA_BYTES = 256 * 1024;

function assertDataSize(data: unknown) {
  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(data);
  } catch {
    throw new Error("Invalid share payload");
  }
  if (
    !encoded ||
    new TextEncoder().encode(encoded).byteLength > MAX_DATA_BYTES
  ) {
    throw new Error("Share payload is too large");
  }
}

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
    editToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertDataSize(args.data);
    const requestedSlug = args.slug?.trim();
    if (requestedSlug && !/^[A-Za-z0-9]{1,20}$/.test(requestedSlug)) {
      throw new Error("Invalid slug format");
    }
    if (requestedSlug) {
      const existing = await ctx.db
        .query("cat_shares")
        .withIndex("bySlug", (q) => q.eq("slug", requestedSlug))
        .first();
      if (existing) {
        const identity = await ctx.auth.getUserIdentity();
        const owned =
          !!existing.ownerTokenIdentifier &&
          identity?.tokenIdentifier === existing.ownerTokenIdentifier;
        if (
          !owned &&
          (!existing.editToken || args.editToken !== existing.editToken)
        ) {
          throw new Error("Not authorized to edit share");
        }
        await ctx.db.patch(existing._id, { data: args.data });
        return {
          slug: existing.slug,
          id: existing._id,
          updated: true,
          editToken: existing.editToken,
        };
      }
    }
    const slug = requestedSlug || (await generateUniqueSlug(ctx));
    const now = Date.now();
    const editToken = crypto.randomUUID();
    const identity = await ctx.auth.getUserIdentity();

    const id = await ctx.db.insert("cat_shares", {
      slug,
      data: args.data,
      editToken,
      ...(identity?.tokenIdentifier
        ? { ownerTokenIdentifier: identity.tokenIdentifier }
        : {}),
      createdAt: now,
    });

    return { slug, id, updated: false, editToken };
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
      .first();

    if (!record) return null;
    return {
      slug: record.slug,
      data: record.data,
      id: record._id,
      createdAt: record.createdAt,
    };
  },
});
