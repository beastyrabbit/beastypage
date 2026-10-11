"use node";
import { v } from "convex/values";
import { Jimp } from "jimp";
import {
  assertImageSourceWithinLimits,
  MAX_SOURCE_DIMENSION,
  MAX_SOURCE_PIXELS,
} from "../lib/image-source-limits.js";
import { internal } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import type { ActionCtx } from "./_generated/server.js";
import { internalAction } from "./_generated/server.js";

type Variant = "default" | "custom";
type ThumbnailFailure = "temporary" | "permanent";

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

type VariantOutcome =
  | VariantResult
  | { variant: Variant; failure: ThumbnailFailure };

type VariantFailure = { failure: ThumbnailFailure };

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
  if (originalWidth > maxDim || originalHeight > maxDim) {
    const dimensions =
      originalWidth > originalHeight
        ? {
            w: maxDim,
            h: Math.round((originalHeight / originalWidth) * maxDim),
          }
        : {
            w: Math.round((originalWidth / originalHeight) * maxDim),
            h: maxDim,
          };
    image.resize(dimensions);
  }
  return { width: originalWidth, height: originalHeight };
}

export const generateForCat = internalAction({
  args: {
    id: v.id("catdex"),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cat: Doc<"catdex"> | null = await ctx.runQuery(
      internal.catdex.getDoc,
      { id: args.id },
    );
    if (!cat) {
      return { success: false, reason: "cat_not_found" } as const;
    }
    if (
      (args.attempt === undefined &&
        (cat.thumbnailAttemptCount !== undefined ||
          cat.thumbnailStatus === "complete" ||
          cat.thumbnailStatus === "failed")) ||
      (args.attempt !== undefined &&
        (cat.thumbnailAttemptCount !== args.attempt ||
          cat.thumbnailStatus !== "processing"))
    ) {
      return { success: false, reason: "stale_attempt" } as const;
    }

    const results: VariantResult[] = [];

    const tasks: Array<Promise<VariantOutcome>> = [];
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
      if ("payload" in item) results.push(item);
    }
    const failures = resolved.filter(
      (item): item is { variant: Variant; failure: ThumbnailFailure } =>
        "failure" in item,
    );
    const retryableFailure =
      failures.length > 0 &&
      failures.every((item) => item.failure === "temporary");

    if (!results.length) {
      await ctx.runMutation(internal.catdex.markThumbnailFailed, {
        id: args.id,
        attempt: args.attempt,
        retryableFailure,
      });
      return { success: false, reason: "nothing_to_generate" } as const;
    }

    const defaultCard = results.find(
      (entry) => entry.variant === "default",
    )?.payload;
    const customCard = results.find(
      (entry) => entry.variant === "custom",
    )?.payload;

    const applied: { success: boolean; reason?: string } =
      await ctx.runMutation(internal.catdex.applyThumbnailUpdates, {
        id: args.id,
        attempt: args.attempt,
        retryableFailure,
        ...(defaultCard ? { defaultCard } : {}),
        ...(customCard ? { customCard } : {}),
      });

    if ("reason" in applied && applied.reason === "stale_attempt") {
      await deleteGeneratedThumbnails(ctx, [defaultCard, customCard]);
      return applied;
    }

    return {
      success: true,
      generated: results.map((entry) => entry.variant),
    } as const;
  },
});

async function deleteGeneratedThumbnails(
  ctx: ActionCtx,
  cards: Array<ThumbnailPayload | undefined>,
) {
  await Promise.all(
    cards.flatMap((card) => {
      if (!card) return [];
      return [
        ctx.storage.delete(card.thumbStorageId).catch((error) => {
          console.warn("Failed to clean up stale Catdex thumbnail", error);
        }),
      ];
    }),
  );
}

async function generateThumbnail(
  ctx: ActionCtx,
  catId: Id<"catdex">,
  variant: Variant,
  storageId: string,
  name: string | null | undefined,
): Promise<VariantOutcome> {
  const downloadUrl = await resolveDownloadUrl(ctx, storageId, catId, variant);
  if (typeof downloadUrl !== "string") {
    return { variant, ...downloadUrl };
  }

  const source = await fetchThumbnailSource(downloadUrl, catId, variant);
  if ("failure" in source) return { variant, ...source };

  const processed = await processThumbnail(source.buffer, catId, variant);
  if ("failure" in processed) return { variant, ...processed };

  const thumbStorageId = await storeThumbnail(
    ctx,
    processed.buffer,
    catId,
    variant,
  );
  if ("failure" in thumbStorageId) return { variant, ...thumbStorageId };

  const thumbName = `${name ?? variant}-card-thumb.jpg`;

  return {
    variant,
    payload: {
      thumbStorageId,
      thumbName,
      thumbWidth: processed.image.width,
      thumbHeight: processed.image.height,
      width: processed.dimensions.width,
      height: processed.dimensions.height,
    },
  };
}

async function resolveDownloadUrl(
  ctx: ActionCtx,
  storageId: string,
  catId: Id<"catdex">,
  variant: Variant,
): Promise<string | VariantFailure> {
  try {
    const downloadUrl = await ctx.storage.getUrl(storageId);
    if (downloadUrl) return downloadUrl;
  } catch (error) {
    console.warn("Unable to resolve storage URL for thumbnail variant", {
      catId,
      variant,
      error,
    });
    return { failure: "temporary" };
  }
  console.warn("Unable to resolve storage URL for thumbnail variant", {
    catId,
    variant,
  });
  return { failure: "permanent" };
}

async function fetchThumbnailSource(
  downloadUrl: string,
  catId: Id<"catdex">,
  variant: Variant,
): Promise<{ buffer: Buffer } | VariantFailure> {
  let response: Response;
  try {
    response = await fetch(downloadUrl);
  } catch (error) {
    console.warn("Failed to fetch image for thumbnail", {
      catId,
      variant,
      error,
    });
    return { failure: "temporary" };
  }

  if (!response.ok) {
    console.warn("Failed to fetch image for thumbnail", {
      catId,
      variant,
      status: response.status,
    });
    return { failure: classifyHttpFailure(response.status) };
  }

  try {
    const buffer = await readResponseBody(response);
    return buffer ? { buffer } : { failure: "permanent" };
  } catch (error) {
    console.warn("Failed to read image for thumbnail", {
      catId,
      variant,
      error,
    });
    return { failure: "temporary" };
  }
}

function classifyHttpFailure(status: number): ThumbnailFailure {
  return status === 408 || status === 429 || status >= 500
    ? "temporary"
    : "permanent";
}

async function processThumbnail(
  buffer: Buffer,
  catId: Id<"catdex">,
  variant: Variant,
): Promise<
  | {
      image: Awaited<ReturnType<typeof Jimp.read>>;
      dimensions: { width: number; height: number };
      buffer: Buffer;
    }
  | VariantFailure
> {
  try {
    // Reject oversized or unsupported raster headers before Jimp allocates a
    // decoded pixel buffer. These are source problems and should not retry.
    assertImageSourceWithinLimits(buffer);
    const image = await Jimp.read(buffer);
    const dimensions = resizeThumbnail(image);
    if (!dimensions) {
      console.warn("Source image dimensions exceed thumbnail limits", {
        catId,
        variant,
      });
      return { failure: "permanent" };
    }
    const processed = await image.getBuffer("image/jpeg", { quality: 85 });
    return { image, dimensions, buffer: processed };
  } catch (error) {
    console.warn("Error decoding thumbnail source", {
      catId,
      variant,
      error,
    });
    return { failure: "permanent" };
  }
}

async function storeThumbnail(
  ctx: ActionCtx,
  buffer: Buffer,
  catId: Id<"catdex">,
  variant: Variant,
): Promise<Id<"_storage"> | VariantFailure> {
  try {
    return await ctx.storage.store(
      new Blob([new Uint8Array(buffer)], { type: "image/jpeg" }),
    );
  } catch (error) {
    console.warn("Error storing generated thumbnail", {
      catId,
      variant,
      error,
    });
    return { failure: "temporary" };
  }
}
