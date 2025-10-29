"use node";

import { Buffer } from "buffer";
import { action } from "./_generated/server.js";
import type { ActionCtx } from "./_generated/server.js";
import { v } from "convex/values";
import { api } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";

const DATA_URL_REGEX = /^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/;
const RENDERER_URL = (() => {
  const raw = (process.env.CONVEX_RENDERER_URL ?? "").trim();
  const candidates: string[] = [];
  if (raw.length > 0) {
    candidates.push(raw);
    if (!raw.includes("://")) {
      candidates.push(`http://${raw}`);
      candidates.push(`https://${raw}`);
    }
  }
  candidates.push("http://renderer:8001");

  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate);
      parsed.pathname = parsed.pathname.replace(/\/$/, "");
      return parsed.toString().replace(/\/$/, "");
    } catch (error) {
      // try next candidate
    }
  }
  console.warn(
    "Unable to derive a valid renderer URL from CONVEX_RENDERER_URL; mapper previews will be skipped.",
    { raw, candidates }
  );
  return null;
})();
const FULL_SIZE = 720;
const PREVIEW_SIZE = 360;
const TINY_SIZE = 48;
const VARIANT_SPRITES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18];

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

async function renderCatImage(catData: any): Promise<string | null> {
  if (!RENDERER_URL) {
    console.warn("renderCatImage: renderer URL not configured", process.env.CONVEX_RENDERER_URL);
    return null;
  }
  const baseParams = catData?.params ?? catData?.finalParams ?? catData ?? {};
  const spriteNumber = baseParams?.spriteNumber ?? catData?.spriteNumber ?? 0;
  const payload = {
    payload: {
      spriteNumber,
      params: baseParams,
    },
    options: {},
  };
  const response = await fetch(`${RENDERER_URL}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    console.warn("Renderer failed", response.status, await response.text());
    return null;
  }
  const data = await response.json();
  return data?.image ?? null;
}

async function renderResizedImage(catData: any, tileSize: number): Promise<string | null> {
  if (!RENDERER_URL) {
    console.warn("renderResizedImage: renderer URL not configured", process.env.CONVEX_RENDERER_URL);
    return null;
  }
  const baseParams = catData?.params ?? catData?.finalParams ?? catData ?? {};
  const spriteNumber = baseParams?.spriteNumber ?? catData?.spriteNumber ?? 0;
  const payload = {
    payload: {
      spriteNumber,
      params: baseParams,
    },
    variants: [],
    options: {
      includeBase: true,
      includeSources: false,
      columns: 1,
      tileSize,
    },
  };
  const response = await fetch(`${RENDERER_URL}/render/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    console.warn("Renderer batch resize failed", response.status, await response.text());
    return null;
  }
  const data = await response.json();
  return data?.sheet ?? null;
}

async function renderSpriteSheet(catData: any, baseSprite?: number | null) {
  if (!RENDERER_URL) return null;
  const variants = VARIANT_SPRITES.filter((sprite) => sprite !== baseSprite).map((sprite) => ({
    id: `sprite-${sprite}`,
    spriteNumber: sprite,
    params: { ...(catData?.params ?? catData ?? {}), spriteNumber: sprite },
  }));
  if (!variants.length) return null;
  const payload = {
    payload: {
      spriteNumber: catData?.params?.spriteNumber ?? catData?.spriteNumber ?? 0,
      params: catData?.params ?? catData ?? {},
    },
    variants: variants.map((variant) => ({
      id: variant.id,
      spriteNumber: variant.spriteNumber,
      params: variant.params,
    })),
    options: {
      includeBase: false,
      includeSources: false,
      columns: 4,
      tileSize: 120,
    },
  };
  const response = await fetch(`${RENDERER_URL}/render/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    console.warn("Renderer batch failed", response.status, await response.text());
    return null;
  }
  const data = await response.json();
  return {
    dataUrl: data.sheet,
    meta: {
      width: data.width,
      height: data.height,
      tileSize: data.tileSize,
      frames: (Array.isArray(data.frames) ? data.frames : []).map((frame: any, index: number) => ({
        id: frame.id ?? `frame-${index}`,
        spriteNumber: typeof frame.index === "number" ? frame.index : undefined,
        label: frame.label ?? null,
        column: frame.column ?? null,
        row: frame.row ?? null,
        x: frame.x ?? 0,
        y: frame.y ?? 0,
        width: frame.width ?? data.tileSize,
        height: frame.height ?? data.tileSize,
      })),
    },
  };
}

async function createPreviewVariants(catData: any): Promise<{ tiny: string; preview: string; full: string }> {
  const full =
    (await renderResizedImage(catData, FULL_SIZE)) ??
    (await renderCatImage(catData));
  if (!full) {
    throw new Error("Renderer did not return image data");
  }
  const preview = await renderResizedImage(catData, PREVIEW_SIZE);
  const tiny = await renderResizedImage(catData, TINY_SIZE);
  return {
    tiny: tiny ?? full,
    preview: preview ?? full,
    full,
  };
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

export const generateMapperPreviews = action({
  args: {
    id: v.id("cat_profile"),
    catData: v.any(),
  },
  handler: async (ctx, args): Promise<{ success: true } | null> => {
    if (!RENDERER_URL) {
      console.warn("generateMapperPreviews: renderer URL not configured", process.env.CONVEX_RENDERER_URL);
      return null;
    }
    console.log("generateMapperPreviews using renderer", RENDERER_URL);

    const variants = await createPreviewVariants(args.catData);
    let spriteSheetData = null as { dataUrl: string; meta: unknown } | null;
    try {
      spriteSheetData = await renderSpriteSheet(args.catData, args.catData?.params?.spriteNumber ?? null);
    } catch (error) {
      console.warn("Sprite sheet generation failed", error);
    }

    const payload: MapperPreviewUpdate = {
      id: args.id,
      previewsUpdatedAt: Date.now(),
      tiny: { dataUrl: variants.tiny, filename: `mapper-${args.id}-tiny.png` },
      preview: { dataUrl: variants.preview, filename: `mapper-${args.id}-preview.png` },
      full: { dataUrl: variants.full, filename: `mapper-${args.id}-full.png` },
    };
    if (spriteSheetData) {
      payload.spriteSheet = {
        dataUrl: spriteSheetData.dataUrl,
        filename: `mapper-${args.id}-spritesheet.png`,
        meta: spriteSheetData.meta,
      };
    }
    await applyMapperPreviewUpdate(ctx, payload);
    return { success: true };
  },
});

export const refreshMapperPreviews = action({
  args: {
    limit: v.optional(v.number()),
    staleBefore: v.optional(v.number()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ scheduled: number; processed: number }> => {
    const limit = args.limit ?? 10;
    const staleBefore = args.staleBefore ?? Date.now() - 7 * 24 * 60 * 60 * 1000;
    const targets = await ctx.runQuery(api.mapper.listForPreview, {
      limit,
      staleBefore,
      force: args.force ?? false,
    });
    await Promise.all(
      targets.map((target: any) =>
        ctx.scheduler.runAfter(0, api.previews.generateMapperPreviews, {
          id: target.id,
          catData: target.catData,
        })
      )
    );

    let processed = 0;
    for (const target of targets) {
      try {
        await ctx.runAction(api.previews.generateMapperPreviews, {
          id: target.id,
          catData: target.catData,
        });
        processed += 1;
      } catch (error) {
        console.warn("Failed to refresh mapper preview immediately", error);
      }
    }

    return { scheduled: targets.length, processed };
  },
});
