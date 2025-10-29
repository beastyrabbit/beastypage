import { internalQuery, mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

export const totalCount = query({
  args: {},
  handler: async (ctx) => {
    let count = 0;
    for await (const _ of ctx.db.query("collection")) {
      count += 1;
    }
    return count;
  }
});
import type { Doc } from "./_generated/dataModel.js";
import type { QueryCtx } from "./_generated/server.js";
import { docIdToString, normalizeStorageUrl } from "./utils.js";

type CollectionDoc = Doc<"collection">;

export type CollectionEntry = Awaited<ReturnType<typeof collectionDocToClient>>;

export const list = query({
  args: {},
  handler: async (ctx) => {
    const entries = await ctx.db.query("collection").collect();
    entries.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return Promise.all(entries.map((doc) => collectionDocToClient(ctx, doc)));
  }
});

export const setFocus = mutation({
  args: {
    id: v.id("collection"),
    focusX: v.number(),
    focusY: v.number()
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("Collection entry not found.");
    }

    const focusX = clampFocus(args.focusX);
    const focusY = clampFocus(args.focusY);

    await ctx.db.patch(args.id, {
      focusX,
      focusY,
      updatedAt: Date.now()
    });

    return { focusX, focusY } as const;
  }
});

export const getDoc = internalQuery({
  args: {
    id: v.id("collection")
  },
  handler: async (ctx, args) => ctx.db.get(args.id)
});

async function collectionDocToClient(ctx: QueryCtx, doc: CollectionDoc) {
  const blurRaw = doc.blurImgStorageId ? await ctx.storage.getUrl(doc.blurImgStorageId) : null;
  const blurUrl = doc.blurImgStorageId ? normalizeStorageUrl(blurRaw) : null;
  const previewUrl = doc.previewImgStorageId
    ? normalizeStorageUrl(await ctx.storage.getUrl(doc.previewImgStorageId))
    : null;
  const fullUrl = doc.fullImgStorageId
    ? normalizeStorageUrl(await ctx.storage.getUrl(doc.fullImgStorageId))
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
    updated: doc.updatedAt
  } as const;
}

function clampFocus(value: number) {
  if (!Number.isFinite(value)) return 50;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}
