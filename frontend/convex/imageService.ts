import { action } from "./_generated/server.js";
import type { ActionCtx } from "./_generated/server.js";
import type { Id } from "./_generated/dataModel.js";
import { v } from "convex/values";
import { api } from "./_generated/api.js";

const IMAGE_SERVICE_URL = (() => {
  const raw = (process.env.CONVEX_IMAGE_SERVICE_URL ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.includes("://") ? raw : `http://${raw}`);
    url.pathname = url.pathname.replace(/\/$/, "");
    return url.toString();
  } catch (error) {
    console.warn("Invalid CONVEX_IMAGE_SERVICE_URL", { raw, error });
    return null;
  }
})();

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
    if (!IMAGE_SERVICE_URL) {
      console.warn("Image service URL not configured; skipping thumbnail generation.");
      return { success: false, reason: "missing_service_url" } as const;
    }

    const cat = await ctx.runQuery(api.catdex.getDoc, { id: args.id });
    if (!cat) {
      return { success: false, reason: "cat_not_found" } as const;
    }

    const results: VariantResult[] = [];

    const tasks: Array<Promise<VariantResult | null>> = [];
    if (cat.defaultCardStorageId && !cat.defaultCardThumbStorageId) {
      tasks.push(
        generateVariant(ctx, IMAGE_SERVICE_URL, args.id, "default", cat.defaultCardStorageId, cat.defaultCardName),
      );
    }
    if (cat.customCardStorageId && !cat.customCardThumbStorageId) {
      tasks.push(
        generateVariant(ctx, IMAGE_SERVICE_URL, args.id, "custom", cat.customCardStorageId, cat.customCardName),
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

async function generateVariant(
  ctx: ActionCtx,
  serviceUrl: string,
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

  const endpoint = `${serviceUrl}/thumbnail/url`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source_url: downloadUrl,
      filename: name ?? `${variant}-card`,
    }),
  });

  if (!response.ok) {
    console.warn("Image service responded with an error", { catId, variant, status: response.status });
    return null;
  }

  const data = (await response.json()) as {
    image_data_url: string;
    width: number;
    height: number;
    original_width: number;
    original_height: number;
    filename: string;
    content_type: string;
  };

  const blob = dataUrlToBlob(data.image_data_url, data.content_type);
  const thumbStorageId = await ctx.storage.store(blob);

  return {
    variant,
    payload: {
      thumbStorageId,
      thumbName: data.filename,
      thumbWidth: data.width,
      thumbHeight: data.height,
      width: data.original_width,
      height: data.original_height,
    },
  };
}

function dataUrlToBlob(dataUrl: string, fallbackType: string) {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  const contentType = matches?.[1] ?? fallbackType;
  const base64 = matches?.[2] ?? dataUrl;

  const binary = atob(base64);
  const view = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    view[index] = binary.charCodeAt(index);
  }

  return new Blob([view], { type: contentType || "application/octet-stream" });
}
