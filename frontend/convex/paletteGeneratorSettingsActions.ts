"use node";

import { Buffer } from "node:buffer";
import { v } from "convex/values";
import { api } from "./_generated/api.js";
import { action } from "./_generated/server.js";

const DATA_URL_REGEX = /^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/;
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_BASE64_CHARS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
const MAX_COLORS = 24;

function hasValidServiceToken(actual: string): boolean {
  const expected = (process.env.DISCORD_API_TOKEN ?? "").trim();
  if (expected.length < 32 || actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |=
      (actual.codePointAt(index) ?? 0) ^ (expected.codePointAt(index) ?? 0);
  }
  return difference === 0;
}

export const storeDiscordImage = action({
  args: {
    dataUrl: v.string(),
    colors: v.any(),
    // Optional during the bridge rollout so older Next route replicas fail
    // with an authorization error instead of an argument-validation error.
    serviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ slug: string; storageId: string }> => {
    if (!args.serviceToken || !hasValidServiceToken(args.serviceToken)) {
      throw new Error("Unauthorized service request");
    }
    const match = DATA_URL_REGEX.exec(args.dataUrl.trim());
    if (!match) {
      throw new Error("Invalid data URL payload");
    }
    const [, rawMime, data] = match;
    const mime = rawMime.toLowerCase();
    if (!/^image\/(?:png|jpe?g|webp|gif)$/.test(mime)) {
      throw new Error("Only image data URLs are accepted");
    }
    const base64 = data.replace(/\s+/g, "");
    if (
      !base64 ||
      base64.length > MAX_BASE64_CHARS ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) ||
      base64.length % 4 === 1
    ) {
      throw new Error("Image payload is too large");
    }
    const buffer = Uint8Array.from(Buffer.from(base64, "base64"));
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new Error("Image payload is too large");
    }
    const encodedColors = JSON.stringify(args.colors);
    if (
      !Array.isArray(args.colors) ||
      args.colors.length > MAX_COLORS ||
      !encodedColors ||
      new TextEncoder().encode(encodedColors).byteLength > 64 * 1024
    ) {
      throw new Error("Too many palette colors");
    }
    const contentType = mime;

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
