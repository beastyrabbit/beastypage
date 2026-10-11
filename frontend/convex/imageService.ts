"use node";
import { v } from "convex/values";
import { Jimp } from "jimp";
import {
  assertImageSourceWithinLimits,
  MAX_SOURCE_DIMENSION,
  MAX_SOURCE_PIXELS,
} from "../lib/image-source-limits.js";
import { internal } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import type { ActionCtx } from "./_generated/server.js";
import { internalAction } from "./_generated/server.js";

type Variant = "default" | "custom";

type ThumbnailPayload = {
  thumbStorageId: Id<"_storage">;
  thumbName: string;
  thumbWidth?: number;
  thumbHeight?: number;
  width?: number;
  height?: number;
};

type VariantResult = {
  variant: Variant;
  payload: ThumbnailPayload;
};

const MAX_SOURCE_BYTES = 16 * 1024 * 1024;

async function readResponseBody(response: Response): Promise<Buffer | null> {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_SOURCE_BYTES) {
    return null;
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_SOURCE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return byteLength
    ? Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
    : null;
}

type ResizableImage = {
  width: number;
  height: number;
  resize(options: { w: number; h: number }): unknown;
};

function resizeThumbnail(image: ResizableImage) {
  const originalWidth = image.width;
  const originalHeight = image.height;
  if (
    originalWidth < 1 ||
    originalHeight < 1 ||
    originalWidth > MAX_SOURCE_DIMENSION ||
    originalHeight > MAX_SOURCE_DIMENSION ||
    originalWidth * originalHeight > MAX_SOURCE_PIXELS
  ) {
    return null;
  }

  const maxDim = 256;
  let newWidth = originalWidth;
  let newHeight = originalHeight;
  if (originalWidth > maxDim || originalHeight > maxDim) {
    if (originalWidth > originalHeight) {
      newWidth = maxDim;
      newHeight = Math.round((originalHeight / originalWidth) * maxDim);
    } else {
      newHeight = maxDim;
      newWidth = Math.round((originalWidth / originalHeight) * maxDim);
    }
    image.resize({ w: newWidth, h: newHeight });
  }
  return { width: originalWidth, height: originalHeight };
}

export const generateForCat = internalAction({
  args: {
    id: v.id("catdex"),
  },
  handler: async (ctx, args) => {
    const cat = await ctx.runQuery(internal.catdex.getDoc, { id: args.id });
    if (!cat) {
      return { success: false, reason: "cat_not_found" } as const;
    }

    const results: VariantResult[] = [];

    const tasks: Array<Promise<VariantResult | null>> = [];
    if (cat.defaultCardStorageId && !cat.defaultCardThumbStorageId) {
      tasks.push(
        generateThumbnail(
          ctx,
          args.id,
          "default",
          cat.defaultCardStorageId,
          cat.defaultCardName,
        ),
      );
    }
    if (cat.customCardStorageId && !cat.customCardThumbStorageId) {
      tasks.push(
        generateThumbnail(
          ctx,
          args.id,
          "custom",
          cat.customCardStorageId,
          cat.customCardName,
        ),
      );
    }

    const resolved = await Promise.all(tasks);
    for (const item of resolved) {
      if (item) results.push(item);
    }

    if (!results.length) {
      await ctx.runMutation(internal.catdex.markThumbnailFailed, {
        id: args.id,
      });
      return { success: false, reason: "nothing_to_generate" } as const;
    }

    const defaultCard = results.find(
      (entry) => entry.variant === "default",
    )?.payload;
    const customCard = results.find(
      (entry) => entry.variant === "custom",
    )?.payload;

    await ctx.runMutation(internal.catdex.applyThumbnailUpdates, {
      id: args.id,
      ...(defaultCard ? { defaultCard } : {}),
      ...(customCard ? { customCard } : {}),
    });

    return {
      success: true,
      generated: results.map((entry) => entry.variant),
    } as const;
  },
});

async function generateThumbnail(
  ctx: ActionCtx,
  catId: Id<"catdex">,
  variant: Variant,
  storageId: string,
  name: string | null | undefined,
): Promise<VariantResult | null> {
  const downloadUrl = await ctx.storage.getUrl(storageId);
  if (!downloadUrl) {
    console.warn("Unable to resolve storage URL for thumbnail variant", {
      catId,
      variant,
    });
    return null;
  }

  try {
    // Fetch the original image
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      console.warn("Failed to fetch image for thumbnail", {
        catId,
        variant,
        status: response.status,
      });
      return null;
    }

    const buffer = await readResponseBody(response);
    if (!buffer) return null;

    // Reject oversized or unsupported raster headers before Jimp allocates a
    // decoded pixel buffer.
    assertImageSourceWithinLimits(buffer);

    // Read the original image with Jimp
    const image = await Jimp.read(buffer);
    const dimensions = resizeThumbnail(image);
    if (!dimensions) {
      console.warn("Source image dimensions exceed thumbnail limits", {
        catId,
        variant,
      });
      return null;
    }

    // Convert to JPEG with 85% quality
    const processed = await image.getBuffer("image/jpeg", { quality: 85 });

    // Store the thumbnail
    const thumbStorageId = await ctx.storage.store(
      new Blob([new Uint8Array(processed)], { type: "image/jpeg" }),
    );

    const thumbName = `${name ?? variant}-card-thumb.jpg`;

    return {
      variant,
      payload: {
        thumbStorageId,
        thumbName,
        thumbWidth: image.width,
        thumbHeight: image.height,
        width: dimensions.width,
        height: dimensions.height,
      },
    };
  } catch (error) {
    console.warn("Error generating thumbnail with jimp", {
      catId,
      variant,
      error,
    });
    return null;
  }
}
