import { api, internal } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import type { ActionCtx } from "./_generated/server.js";
import { httpAction } from "./_generated/server.js";

const MAX_CARD_UPLOAD_BYTES = 10 * 1024 * 1024;
const CARD_UPLOAD_CONTENT_TYPES = new Set(["image/png", "image/jpeg"]);
const CORS_HEADERS = {
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-origin": "*",
  "access-control-max-age": "600",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

async function readBody(request: Request): Promise<Uint8Array> {
  if (!request.body) throw new Error("UPLOAD_BODY_REQUIRED");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_CARD_UPLOAD_BYTES) {
        await reader.cancel();
        throw new Error("FILE_TOO_LARGE");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) throw new Error("EMPTY_UPLOAD");
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export const options = httpAction(
  async () =>
    new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    }),
);

/**
 * Compatibility endpoint for frontend bundles that predate managed Catdex
 * upload tokens. It returns the managed endpoint, so the storage ID is still
 * bound to a short-lived reservation before a legacy create call attaches it.
 */
export const legacyUploadUrl = httpAction(async (ctx) => {
  const uploadUrl = await ctx.runMutation(api.catdex.generateUploadUrl, {});
  return json({ uploadUrl });
});

export const upload = httpAction(async (ctx, request) => {
  const token = new URL(request.url).searchParams.get("token");
  if (!token || token.length > 100)
    return json({ error: "INVALID_TOKEN" }, 400);

  const reservation = await ctx.runQuery(internal.catdex.getUploadReservation, {
    token,
  });
  if (!reservation) return json({ error: "UPLOAD_EXPIRED" }, 410);

  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (!contentType || !CARD_UPLOAD_CONTENT_TYPES.has(contentType)) {
    return json({ error: "UNSUPPORTED_MEDIA_TYPE" }, 415);
  }

  let body: Uint8Array;
  try {
    body = await readBody(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UPLOAD_FAILED";
    return json({ error: message }, message === "FILE_TOO_LARGE" ? 413 : 400);
  }

  const arrayBuffer = body.buffer.slice(
    body.byteOffset,
    body.byteOffset + body.byteLength,
  ) as ArrayBuffer;
  let storageId: Id<"_storage">;
  try {
    storageId = await ctx.storage.store(
      new Blob([arrayBuffer], { type: contentType }),
    );
  } catch {
    return json({ error: "UPLOAD_FAILED" }, 500);
  }
  return (
    (await attachStoredUpload(ctx, token, storageId)) ?? json({ storageId })
  );
});

async function attachStoredUpload(
  ctx: ActionCtx,
  token: string,
  storageId: Id<"_storage">,
): Promise<Response | null> {
  try {
    await ctx.runMutation(internal.catdex.attachUpload, {
      token,
      storageId,
    });
    return null;
  } catch (error) {
    try {
      await ctx.storage.delete(storageId);
    } catch (cleanupError) {
      console.warn("Failed to clean up rejected Catdex upload", cleanupError);
    }
    const message = error instanceof Error ? error.message : "UPLOAD_FAILED";
    return json({ error: message }, message.includes("expired") ? 410 : 400);
  }
}
