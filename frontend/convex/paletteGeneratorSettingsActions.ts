"use node";

import { Buffer } from "buffer";
import { action } from "./_generated/server.js";
import { v } from "convex/values";
import { api } from "./_generated/api.js";

const DATA_URL_REGEX = /^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/;

export const storeDiscordImage = action({
  args: {
    dataUrl: v.string(),
    colors: v.any(),
  },
  handler: async (ctx, args): Promise<{ slug: string; storageId: string }> => {
    const match = DATA_URL_REGEX.exec(args.dataUrl.trim());
    if (!match) {
      throw new Error("Invalid data URL payload");
    }
    const [, mime, data] = match;
    const base64 = data.replace(/\s+/g, "");
    const buffer = Uint8Array.from(Buffer.from(base64, "base64"));
    const contentType = mime || "application/octet-stream";

    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: contentType });
    const storageId = await ctx.storage.store(blob);

    const config = {
      source: "discord",
      imageStorageId: storageId,
      colors: args.colors,
    };

    const result: { slug: string } = await ctx.runMutation(
      api.paletteGeneratorSettings.save,
      { config },
    );

    return { slug: result.slug, storageId: storageId as string };
  },
});
