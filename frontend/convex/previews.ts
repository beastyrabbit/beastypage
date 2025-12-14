"use node";

import { Buffer } from "buffer";
import { action } from "./_generated/server.js";
import type { ActionCtx } from "./_generated/server.js";
import { v } from "convex/values";
import { api } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";

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
  spriteSheet?: { dataUrl: string; filename?: string; meta?: unknown } | undefined;
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


function parseDataUrl(dataUrl: string): { buffer: Uint8Array; contentType: string } {
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
  previousId?: Id<"_storage">
) {
  if (previousId) {
    try {
      await ctx.storage.delete(previousId);
    } catch (error) {
      console.warn("Failed to delete previous storage object", error);
    }
  }
  const { buffer, contentType } = parseDataUrl(payload.dataUrl);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: contentType });
  const id = await ctx.storage.store(blob);
  return { id, name: payload.filename ?? fallbackName };
}


async function applyMapperPreviewUpdate(ctx: ActionCtx, args: MapperPreviewUpdate) {
  const existing = await ctx.runQuery(api.mapper.getPreviewRefs, { id: args.id });
  if (existing === null) {
    throw new Error("Mapper record not found");
  }

  const updatesForMutation: ApplyPreviewArgs = {
    id: args.id,
    previewsUpdatedAt: args.previewsUpdatedAt ?? Date.now(),
  };

  if (args.tiny) {
    const stored = await storeImage(
      ctx,
      args.tiny,
      `mapper-${args.id}-tiny.png`,
      existing.tiny?.storageId ?? undefined
    );
    updatesForMutation.tiny = { storageId: stored.id, filename: stored.name };
  }
  if (args.preview) {
    const stored = await storeImage(
      ctx,
      args.preview,
      `mapper-${args.id}-preview.png`,
      existing.preview?.storageId ?? undefined
    );
    updatesForMutation.preview = { storageId: stored.id, filename: stored.name };
  }
  if (args.full) {
    const stored = await storeImage(
      ctx,
      args.full,
      `mapper-${args.id}-full.png`,
      existing.full?.storageId ?? undefined
    );
    updatesForMutation.full = { storageId: stored.id, filename: stored.name };
  }
  if (args.spriteSheet) {
    const stored = await storeImage(
      ctx,
      args.spriteSheet,
      `mapper-${args.id}-spritesheet.png`,
      existing.spriteSheet?.storageId ?? undefined
    );
    updatesForMutation.spriteSheet = {
      storageId: stored.id,
      filename: stored.name,
      meta: args.spriteSheet.meta,
    };
  }

  await ctx.runMutation(api.mapper.applyPreviewUpdates, updatesForMutation as any);
}

export const upsertMapperPreviews = action({
  args: {
    id: v.id("cat_profile"),
    tiny: v.optional(v.object({ dataUrl: v.string(), filename: v.optional(v.string()) })),
    preview: v.optional(v.object({ dataUrl: v.string(), filename: v.optional(v.string()) })),
    full: v.optional(v.object({ dataUrl: v.string(), filename: v.optional(v.string()) })),
    spriteSheet: v.optional(
      v.object({
        dataUrl: v.string(),
        filename: v.optional(v.string()),
        meta: v.optional(v.any()),
      })
    ),
  },
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

