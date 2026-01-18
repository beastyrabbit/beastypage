"use node";
import { action } from "./_generated/server.js";
import type { ActionCtx } from "./_generated/server.js";
import type { Id } from "./_generated/dataModel.js";
import { v } from "convex/values";
import { api } from "./_generated/api.js";
import { Jimp } from "jimp";

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

export const generateForCat = action({
  args: {
    id: v.id("catdex"),
  },
  handler: async (ctx, args) => {
    const cat = await ctx.runQuery(api.catdex.getDoc, { id: args.id });
    if (!cat) {
      return { success: false, reason: "cat_not_found" } as const;
    }

    const results: VariantResult[] = [];

    const tasks: Array<Promise<VariantResult | null>> = [];
    if (cat.defaultCardStorageId && !cat.defaultCardThumbStorageId) {
      tasks.push(
        generateThumbnail(ctx, args.id, "default", cat.defaultCardStorageId, cat.defaultCardName),
      );
    }
    if (cat.customCardStorageId && !cat.customCardThumbStorageId) {
      tasks.push(
        generateThumbnail(ctx, args.id, "custom", cat.customCardStorageId, cat.customCardName),
      );
    }

    const resolved = await Promise.all(tasks);
    for (const item of resolved) {
      if (item) results.push(item);
    }

    if (!results.length) {
      return { success: false, reason: "nothing_to_generate" } as const;
    }

    const defaultCard = results.find((entry) => entry.variant === "default")?.payload;
    const customCard = results.find((entry) => entry.variant === "custom")?.payload;

    await ctx.runMutation(api.catdex.applyThumbnailUpdates, {
      id: args.id,
      ...(defaultCard ? { defaultCard } : {}),
      ...(customCard ? { customCard } : {}),
    });

    return { success: true, generated: results.map((entry) => entry.variant) } as const;
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
    console.warn("Unable to resolve storage URL for thumbnail variant", { catId, variant });
    return null;
  }

  try {
    // Fetch the original image
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      console.warn("Failed to fetch image for thumbnail", { catId, variant, status: response.status });
      return null;
    }

    const buffer = await response.arrayBuffer();

    // Read the original image with Jimp
    const image = await Jimp.read(Buffer.from(buffer));
    const originalWidth = image.width;
    const originalHeight = image.height;

    // Resize with Jimp (256px max dimension, maintain aspect ratio)
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

    // Convert to JPEG with 85% quality
    const processed = await image.getBuffer("image/jpeg", { quality: 85 });

    // Store the thumbnail
    const thumbStorageId = await ctx.storage.store(
      new Blob([new Uint8Array(processed)], { type: "image/jpeg" })
    );

    const thumbName = `${name ?? variant}-card-thumb.jpg`;

    return {
      variant,
      payload: {
        thumbStorageId,
        thumbName,
        thumbWidth: newWidth,
        thumbHeight: newHeight,
        width: originalWidth,
        height: originalHeight,
      },
    };
  } catch (error) {
    console.warn("Error generating thumbnail with jimp", { catId, variant, error });
    return null;
  }
}
