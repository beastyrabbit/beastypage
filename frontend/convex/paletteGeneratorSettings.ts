import { v } from "convex/values";
import type { Id } from "./_generated/dataModel.js";
import { type MutationCtx, mutation, query } from "./_generated/server.js";
import { randomSlug } from "./utils.js";

// Omits 0, 1, O, I, l to avoid visual ambiguity in URLs
const SLUG_ALPHABET =
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const SLUG_LENGTH = 7;
const MAX_CONFIG_BYTES = 256 * 1024;

function assertConfigSize(config: unknown) {
  let encoded: string;
  try {
    encoded = JSON.stringify(config);
  } catch {
    throw new Error("Invalid settings payload");
  }
  if (new TextEncoder().encode(encoded).byteLength > MAX_CONFIG_BYTES) {
    throw new Error("Settings payload is too large");
  }
}

async function generateUniqueSlug(ctx: MutationCtx) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = randomSlug(SLUG_LENGTH, SLUG_ALPHABET);
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
    editToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertConfigSize(args.config);
    const now = Date.now();
    const trimmed = args.slug?.trim();

    if (trimmed && !/^[A-Za-z0-9]{1,20}$/.test(trimmed)) {
      throw new Error("Invalid slug format");
    }
    if (trimmed) {
      const existing = await ctx.db
        .query("palette_generator_settings")
        .withIndex("bySlug", (q) => q.eq("slug", trimmed))
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
          throw new Error("Not authorized to edit settings");
        }
        await ctx.db.patch(existing._id, {
          config: args.config,
          updatedAt: now,
        });
        return {
          slug: existing.slug,
          id: existing._id,
          updated: true,
          editToken: existing.editToken,
        };
      }
    }

    const slug = trimmed || (await generateUniqueSlug(ctx));
    const editToken = crypto.randomUUID();
    const identity = await ctx.auth.getUserIdentity();
    const id = await ctx.db.insert("palette_generator_settings", {
      slug,
      config: args.config,
      editToken,
      ...(identity?.tokenIdentifier
        ? { ownerTokenIdentifier: identity.tokenIdentifier }
        : {}),
      createdAt: now,
      updatedAt: now,
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
