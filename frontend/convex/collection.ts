import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server.js";

export const totalCount = internalQuery({
  args: {},
  handler: async (ctx) => {
    let count = 0;
    for await (const _ of ctx.db.query("collection")) {
      count += 1;
    }
    return count;
  },
});

import type { Doc } from "./_generated/dataModel.js";
import type { QueryCtx } from "./_generated/server.js";
import { docIdToString } from "./utils.js";

type CollectionDoc = Doc<"collection">;

export type CollectionEntry = Awaited<ReturnType<typeof collectionDocToClient>>;

const PAGE_SIZE = 36;

/** Paginated collection archive used by the public gallery. */
export const page = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("collection")
      .withIndex("byCreated", (q) => q)
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(
          PAGE_SIZE,
          Math.max(1, args.paginationOpts.numItems),
        ),
      });

    return {
      ...result,
      page: await Promise.all(
        result.page.map((doc) => collectionDocToClient(ctx, doc)),
      ),
    };
  },
});

/**
 * Legacy bounded collection query. New clients should use page so older
 * artwork remains reachable as the archive grows.
 */
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 200, 200));
    const entries = await ctx.db
      .query("collection")
      .withIndex("byCreated", (q) => q)
      .order("desc")
      .take(limit);
    return Promise.all(entries.map((doc) => collectionDocToClient(ctx, doc)));
  },
});

export const setFocus = mutation({
  args: {
    id: v.id("collection"),
    focusX: v.number(),
    focusY: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const admins = (process.env.QUICK_SHARE_ADMIN_TOKEN_IDENTIFIERS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (!admins.includes(identity.tokenIdentifier)) {
      throw new Error("Not authorized to edit collection focus");
    }
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("Collection entry not found.");
    }

    const focusX = clampFocus(args.focusX);
    const focusY = clampFocus(args.focusY);

    await ctx.db.patch(args.id, {
      focusX,
      focusY,
      updatedAt: Date.now(),
    });

    return { focusX, focusY } as const;
  },
});

export const getDoc = internalQuery({
  args: {
    id: v.id("collection"),
  },
  handler: async (ctx, args) => ctx.db.get(args.id),
});

async function collectionDocToClient(ctx: QueryCtx, doc: CollectionDoc) {
  // Convex Cloud returns proper absolute URLs - no normalization needed
  const blurUrl = doc.blurImgStorageId
    ? await ctx.storage.getUrl(doc.blurImgStorageId)
    : null;
  const previewUrl = doc.previewImgStorageId
    ? await ctx.storage.getUrl(doc.previewImgStorageId)
    : null;
  const fullUrl = doc.fullImgStorageId
    ? await ctx.storage.getUrl(doc.fullImgStorageId)
    : null;

  return {
    id: docIdToString(doc._id),
    artist_name: doc.artistName,
    animal: doc.animal,
    link: doc.link,
    blur_img: blurUrl,
    preview_img: previewUrl,
    full_img: fullUrl,
    blur_img_storage_id: doc.blurImgStorageId ?? null,
    preview_img_storage_id: doc.previewImgStorageId ?? null,
    full_img_storage_id: doc.fullImgStorageId ?? null,
    preview_img_width: doc.previewImgWidth ?? null,
    preview_img_height: doc.previewImgHeight ?? null,
    full_img_width: doc.fullImgWidth ?? null,
    full_img_height: doc.fullImgHeight ?? null,
    focusX: clampFocus(doc.focusX ?? 50),
    focusY: clampFocus(doc.focusY ?? 50),
    created: doc.createdAt,
    updated: doc.updatedAt,
  } as const;
}

function clampFocus(value: number) {
  if (!Number.isFinite(value)) return 50;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}
