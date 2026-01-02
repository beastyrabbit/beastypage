"use node";
import { action } from "./_generated/server.js";
import type { ActionCtx } from "./_generated/server.js";
import type { Id } from "./_generated/dataModel.js";
import { v } from "convex/values";
import { api } from "./_generated/api.js";
import sharp from "sharp";

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

    // Get original image metadata
    const originalMetadata = await sharp(Buffer.from(buffer)).metadata();

    // Resize with sharp (256px max dimension, 85% quality)
    const processed = await sharp(Buffer.from(buffer))
      .resize(256, 256, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    const processedMetadata = await sharp(processed).metadata();

    // Store the thumbnail
    const thumbStorageId = await ctx.storage.store(
      new Blob([processed], { type: "image/jpeg" })
    );

    const thumbName = `${name ?? variant}-card-thumb.jpg`;

    return {
      variant,
      payload: {
        thumbStorageId,
        thumbName,
        thumbWidth: processedMetadata.width,
        thumbHeight: processedMetadata.height,
        width: originalMetadata.width,
        height: originalMetadata.height,
      },
    };
  } catch (error) {
    console.warn("Error generating thumbnail with sharp", { catId, variant, error });
    return null;
  }
}
