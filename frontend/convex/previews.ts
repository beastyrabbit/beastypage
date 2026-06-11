"use node";

import { Buffer } from "node:buffer";
import { v } from "convex/values";
import { api, internal } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import type { ActionCtx } from "./_generated/server.js";
import { action, internalAction } from "./_generated/server.js";

const DATA_URL_REGEX = /^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/;

type StoragePayload = {
  dataUrl: string;
  filename?: string;
};

type ImageUpdatePayload = {
  storageId: Id<"_storage">;
  filename?: string;
  meta?: unknown;
};

type MapperPreviewUpdate = {
  id: Id<"cat_profile">;
  tiny?: StoragePayload | undefined;
  preview?: StoragePayload | undefined;
  full?: StoragePayload | undefined;
  spriteSheet?:
    | { dataUrl: string; filename?: string; meta?: unknown }
    | undefined;
  previewsUpdatedAt?: number;
};

type ApplyPreviewArgs = {
  id: Id<"cat_profile">;
  previewsUpdatedAt: number;
  tiny?: ImageUpdatePayload;
  preview?: ImageUpdatePayload;
  full?: ImageUpdatePayload;
  spriteSheet?: ImageUpdatePayload;
};

const previewUpdateArgs = {
  id: v.id("cat_profile"),
  tiny: v.optional(
    v.object({ dataUrl: v.string(), filename: v.optional(v.string()) }),
  ),
  preview: v.optional(
    v.object({ dataUrl: v.string(), filename: v.optional(v.string()) }),
  ),
  full: v.optional(
    v.object({ dataUrl: v.string(), filename: v.optional(v.string()) }),
  ),
  spriteSheet: v.optional(
    v.object({
      dataUrl: v.string(),
      filename: v.optional(v.string()),
      meta: v.optional(v.any()),
    }),
  ),
} as const;

function parseDataUrl(dataUrl: string): {
  buffer: Uint8Array;
  contentType: string;
} {
  const match = DATA_URL_REGEX.exec(dataUrl.trim());
  if (!match) {
    throw new Error("Invalid data URL payload");
  }
  const [, mime, data] = match;
  const base64 = data.replace(/\s+/g, "");
  const buffer = Uint8Array.from(Buffer.from(base64, "base64"));
  const contentType = mime || "application/octet-stream";
  return { buffer, contentType };
}

async function storeImage(
  ctx: ActionCtx,
  payload: StoragePayload,
  fallbackName: string,
) {
  const { buffer, contentType } = parseDataUrl(payload.dataUrl);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: contentType });
  const id = await ctx.storage.store(blob);
  return { id, name: payload.filename ?? fallbackName };
}

async function deleteStorageObject(ctx: ActionCtx, id: Id<"_storage">) {
  try {
    await ctx.storage.delete(id);
  } catch (error) {
    console.warn("Failed to delete previous storage object", error);
  }
}

async function applyMapperPreviewUpdate(
  ctx: ActionCtx,
  args: MapperPreviewUpdate,
) {
  const existing = await ctx.runQuery(api.mapper.getPreviewRefs, {
    id: args.id,
  });
  if (existing === null) {
    throw new Error("Mapper record not found");
  }

  const updatesForMutation: ApplyPreviewArgs = {
    id: args.id,
    previewsUpdatedAt: args.previewsUpdatedAt ?? Date.now(),
  };
  const newStorageIds: Id<"_storage">[] = [];
  const previousStorageIds: Id<"_storage">[] = [];

  try {
    if (args.tiny) {
      const stored = await storeImage(
        ctx,
        args.tiny,
        `mapper-${args.id}-tiny.png`,
      );
      newStorageIds.push(stored.id);
      if (existing.tiny?.storageId)
        previousStorageIds.push(existing.tiny.storageId);
      updatesForMutation.tiny = { storageId: stored.id, filename: stored.name };
    }
    if (args.preview) {
      const stored = await storeImage(
        ctx,
        args.preview,
        `mapper-${args.id}-preview.png`,
      );
      newStorageIds.push(stored.id);
      if (existing.preview?.storageId) {
        previousStorageIds.push(existing.preview.storageId);
      }
      updatesForMutation.preview = {
        storageId: stored.id,
        filename: stored.name,
      };
    }
    if (args.full) {
      const stored = await storeImage(
        ctx,
        args.full,
        `mapper-${args.id}-full.png`,
      );
      newStorageIds.push(stored.id);
      if (existing.full?.storageId)
        previousStorageIds.push(existing.full.storageId);
      updatesForMutation.full = { storageId: stored.id, filename: stored.name };
    }
    if (args.spriteSheet) {
      const stored = await storeImage(
        ctx,
        args.spriteSheet,
        `mapper-${args.id}-spritesheet.png`,
      );
      newStorageIds.push(stored.id);
      if (existing.spriteSheet?.storageId) {
        previousStorageIds.push(existing.spriteSheet.storageId);
      }
      updatesForMutation.spriteSheet = {
        storageId: stored.id,
        filename: stored.name,
        meta: args.spriteSheet.meta,
      };
    }

    await ctx.runMutation(
      internal.mapper.applyPreviewUpdates,
      // biome-ignore lint/suspicious/noExplicitAny: Convex mutation arg types don't align with the constructed payload
      updatesForMutation as any,
    );

    await Promise.all(
      previousStorageIds.map((id) => deleteStorageObject(ctx, id)),
    );
  } catch (error) {
    await Promise.all(newStorageIds.map((id) => deleteStorageObject(ctx, id)));
    throw error;
  }
}

export const upsertMapperPreviewsInternal = internalAction({
  args: previewUpdateArgs,
  handler: async (ctx, args): Promise<unknown> => {
    const payload: MapperPreviewUpdate = {
      id: args.id,
      previewsUpdatedAt: Date.now(),
    };
    if (args.tiny) payload.tiny = args.tiny;
    if (args.preview) payload.preview = args.preview;
    if (args.full) payload.full = args.full;
    if (args.spriteSheet) payload.spriteSheet = args.spriteSheet;
    await applyMapperPreviewUpdate(ctx, payload);
    return await ctx.runQuery(api.mapper.get, { id: args.id });
  },
});

export const upsertMapperPreviews = action({
  args: {
    ...previewUpdateArgs,
    adminToken: v.string(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const expectedToken = process.env.PREVIEW_REFRESH_TOKEN;
    if (!expectedToken || args.adminToken !== expectedToken) {
      throw new Error("Not authorized to update mapper previews");
    }
    const payload: MapperPreviewUpdate = {
      id: args.id,
      previewsUpdatedAt: Date.now(),
    };
    if (args.tiny) payload.tiny = args.tiny;
    if (args.preview) payload.preview = args.preview;
    if (args.full) payload.full = args.full;
    if (args.spriteSheet) payload.spriteSheet = args.spriteSheet;
    await applyMapperPreviewUpdate(ctx, payload);
    return await ctx.runQuery(api.mapper.get, { id: args.id });
  },
});
