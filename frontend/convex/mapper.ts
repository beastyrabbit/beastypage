import { mutation, query } from "./_generated/server.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel.js";
import { docIdToString, toId } from "./utils.js";
import { api } from "./_generated/api.js";

const SLUG_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const SLUG_LENGTH = 8;

type ProfileDoc = Doc<"cat_profile">;
type ProfileInsert = Omit<ProfileDoc, "_id" | "_creationTime">;
type ImageDoc = Doc<"cat_images">;
type ImageInsert = Omit<ImageDoc, "_id" | "_creationTime">;


function randomSlug(): string {
  let slug = "";
  for (let i = 0; i < SLUG_LENGTH; i += 1) {
    const index = Math.floor(Math.random() * SLUG_ALPHABET.length);
    slug += SLUG_ALPHABET[index];
  }
  return slug;
}

async function generateUniqueSlug(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = randomSlug();
    const existing = await ctx.db
      .query("cat_profile")
      .withIndex("bySlug", (q) => q.eq("slug", candidate))
      .first();
    if (!existing) {
      return candidate;
    }
  }
  throw new Error("Failed to generate unique slug after several attempts");
}

function sanitizeOptionalString(value: string | undefined | null) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 80);
}

export const create = mutation({
  args: {
    catData: v.any(),
    catName: v.optional(v.string()),
    creatorName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const slug = await generateUniqueSlug(ctx);

    const base: ProfileInsert = {
      slug,
      catData: {
        ...args.catData,
        metaLocked: args.catData?.metaLocked ?? false,
      },
      createdAt: now,
      updatedAt: now,
    };

    const catName = sanitizeOptionalString(args.catName);
    const creatorName = sanitizeOptionalString(args.creatorName);
    if (catName) base.catName = catName;
    if (creatorName) base.creatorName = creatorName;

    const id = await ctx.db.insert("cat_profile", base);

    return { id: docIdToString(id), shareToken: slug, slug };
  },
});

export const get = query({
  args: { id: v.id("cat_profile") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    return doc ? await profileToClient(ctx, doc) : null;
  },
});

export const getBySlug = query({
  args: { slugOrId: v.string() },
  handler: async (ctx, args) => {
    const bySlug = await ctx.db
      .query("cat_profile")
      .withIndex("bySlug", (q) => q.eq("slug", args.slugOrId))
      .unique();
    if (bySlug) {
      return profileToClient(ctx, bySlug);
    }

    try {
      const asId = await ctx.db.get(toId("cat_profile", args.slugOrId));
      return asId ? await profileToClient(ctx, asId) : null;
    } catch (error) {
      return null;
    }
  },
});

export const updateMeta = mutation({
  args: {
    id: v.id("cat_profile"),
    catName: v.optional(v.string()),
    creatorName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Profile not found");

    await ctx.db.patch(args.id, {
      catName: sanitizeOptionalString(args.catName),
      creatorName: sanitizeOptionalString(args.creatorName),
      catData: {
        ...doc.catData,
        metaLocked: true,
      },
      updatedAt: Date.now(),
    });

    const updated = await ctx.db.get(args.id);
    return updated ? await profileToClient(ctx, updated) : null;
  },
});

export const listHistory = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit && args.limit > 0 ? Math.min(args.limit, 500) : 200;
    const docs = await ctx.db
      .query("cat_profile")
      .withIndex("byCreated")
      .order("desc")
      .take(limit);
    return Promise.all(docs.map((doc) => profileToClient(ctx, doc)));
  },
});

export const listForPreview = query({
  args: {
    limit: v.number(),
    staleBefore: v.optional(v.number()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit, 1), 200);
    const threshold = args.staleBefore ?? Date.now() - 7 * 24 * 60 * 60 * 1000;
    const docs = await ctx.db
      .query("cat_profile")
      .withIndex("byCreated")
      .order("desc")
      .take(1000);

    const filtered = docs
      .filter((doc) => {
        if (!doc.catData) return false;
        if (args.force) return true;
        const updated = doc.previewsUpdatedAt ?? 0;
        return updated <= threshold;
      })
      .slice(0, limit);

    return filtered.map((doc) => ({
      id: doc._id,
      catData: doc.catData,
      updatedAt: doc.previewsUpdatedAt ?? null,
      createdAt: doc.createdAt,
    }));
  },
});

export const getPreviewRefs = query({
  args: { id: v.id("cat_profile") },
  handler: async (ctx, args) => {
    return await loadImageRefs(ctx, args.id);
  },
});

export const applyPreviewUpdates = mutation({
  args: {
    id: v.id("cat_profile"),
    previewsUpdatedAt: v.number(),
    tiny: v.optional(
      v.object({
        storageId: v.id("_storage"),
        filename: v.optional(v.string()),
      })
    ),
    preview: v.optional(
      v.object({
        storageId: v.id("_storage"),
        filename: v.optional(v.string()),
      })
    ),
    full: v.optional(
      v.object({
        storageId: v.id("_storage"),
        filename: v.optional(v.string()),
      })
    ),
    spriteSheet: v.optional(
      v.object({
        storageId: v.id("_storage"),
        filename: v.optional(v.string()),
        meta: v.optional(v.any()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Profile not found");

    await Promise.all([
      upsertImage(ctx, args.id, "tiny", args.tiny),
      upsertImage(ctx, args.id, "preview", args.preview),
      upsertImage(ctx, args.id, "full", args.full),
      upsertImage(ctx, args.id, "spriteSheet", args.spriteSheet),
    ]);

    await ctx.db.patch(args.id, {
      previewsUpdatedAt: args.previewsUpdatedAt,
      updatedAt: Date.now(),
    });

    const updated = await ctx.db.get(args.id);
    return updated ? await profileToClient(ctx, updated) : null;
  },
});

async function upsertImage(
  ctx: MutationCtx,
  profileId: Id<"cat_profile">,
  kind: "tiny" | "preview" | "full" | "spriteSheet",
  payload?: { storageId: Id<"_storage">; filename?: string | null; meta?: unknown }
) {
  if (!payload) return;

  const existing = await ctx.db
    .query("cat_images")
    .withIndex("byProfileKind", (q) => q.eq("catProfileId", profileId).eq("kind", kind))
    .unique();

  const now = Date.now();
  if (existing) {
    const patch: Partial<ImageDoc> = {
      storageId: payload.storageId,
      updatedAt: now,
    };
    if (payload.filename !== undefined && payload.filename !== null) {
      patch.filename = payload.filename;
    }
    if (payload.meta !== undefined) {
      patch.meta = payload.meta;
    }
    await ctx.db.patch(existing._id, patch);
  } else {
    const insertData: ImageInsert = {
      catProfileId: profileId,
      kind,
      storageId: payload.storageId,
      createdAt: now,
      updatedAt: now,
    };
    if (payload.filename !== undefined && payload.filename !== null) {
      insertData.filename = payload.filename;
    }
    if (payload.meta !== undefined) {
      insertData.meta = payload.meta;
    }
    await ctx.db.insert("cat_images", insertData);
  }
}

async function loadImageRefs(ctx: QueryCtx | MutationCtx, profileId: Id<"cat_profile">) {
  const entries = await ctx.db
    .query("cat_images")
    .withIndex("byProfile", (q) => q.eq("catProfileId", profileId))
    .collect();

  const refs: Record<string, { storageId: Id<"_storage">; filename?: string | null; meta?: unknown } | null> = {
    tiny: null,
    preview: null,
    full: null,
    spriteSheet: null,
  };

  entries.forEach((entry) => {
    refs[entry.kind] = {
      storageId: entry.storageId,
      filename: entry.filename ?? null,
      meta: entry.meta ?? null,
    };
  });

  return refs;
}

async function profileToClient(ctx: QueryCtx | MutationCtx, doc: ProfileDoc) {
  const previews = await buildPreviewPayload(ctx, doc._id, doc.previewsUpdatedAt ?? null);
  return {
    id: docIdToString(doc._id),
    shareToken: doc.slug,
    slug: doc.slug,
    cat_data: doc.catData,
    catName: doc.catName ?? null,
    creatorName: doc.creatorName ?? null,
    adoptionBatchId: doc.adoptionBatchId ? docIdToString(doc.adoptionBatchId) : null,
    previews,
    created: doc.createdAt,
    updated: doc.updatedAt,
  };
}

/**
 * Build preview payload - returns cached storage URLs when available, null otherwise.
 * The frontend uses /api/preview/{id} for on-demand rendering when no cached URL exists.
 */
async function buildPreviewPayload(
  ctx: QueryCtx | MutationCtx,
  profileId: Id<"cat_profile">,
  updatedAt: number | null
) {
  const refs = await loadImageRefs(ctx, profileId);

  const tinyUrl = refs.tiny ? await safeGetUrl(ctx, refs.tiny.storageId) : null;
  const previewUrl = refs.preview ? await safeGetUrl(ctx, refs.preview.storageId) : null;
  const fullUrl = refs.full ? await safeGetUrl(ctx, refs.full.storageId) : null;
  const spriteSheetUrl = refs.spriteSheet ? await safeGetUrl(ctx, refs.spriteSheet.storageId) : null;
  const computedUpdatedAt =
    updatedAt ?? (tinyUrl || previewUrl || fullUrl || spriteSheetUrl ? Date.now() : null);

  return {
    tiny: tinyUrl ? { url: tinyUrl, name: refs.tiny?.filename ?? null } : null,
    preview: previewUrl ? { url: previewUrl, name: refs.preview?.filename ?? null } : null,
    full: fullUrl ? { url: fullUrl, name: refs.full?.filename ?? null } : null,
    spriteSheet: spriteSheetUrl
      ? {
          url: spriteSheetUrl,
          name: refs.spriteSheet?.filename ?? null,
          meta: (refs.spriteSheet?.meta as unknown) ?? null,
        }
      : null,
    updatedAt: computedUpdatedAt,
  };
}

async function safeGetUrl(ctx: QueryCtx | MutationCtx, id: Id<"_storage">): Promise<string | null> {
  try {
    // Convex Cloud returns proper absolute URLs from storage.getUrl()
    // Return directly without normalization to avoid URL object property access restrictions
    const url = await ctx.storage.getUrl(id);
    return url ?? null;
  } catch (error) {
    console.warn("Failed to obtain storage URL", error);
    return null;
  }
}
