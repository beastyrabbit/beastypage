import { type NextRequest, NextResponse } from "next/server";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { storeAndAttachCatdexUpload } from "@/server/services/catalog";
import {
  CARD_UPLOAD_CONTENT_TYPES,
  MAX_CARD_UPLOAD_BYTES,
} from "@/server/services/files";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-origin": "*",
  "access-control-max-age": "600",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      ...CORS_HEADERS,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  if (dataBackend() !== "postgres") return json({ error: "NOT_FOUND" }, 404);
  const token = request.nextUrl.searchParams.get("token");
  if (!token || token.length > 100)
    return json({ error: "INVALID_TOKEN" }, 400);
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (!contentType || !CARD_UPLOAD_CONTENT_TYPES.has(contentType)) {
    return json({ error: "UNSUPPORTED_MEDIA_TYPE" }, 415);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_CARD_UPLOAD_BYTES
  ) {
    return json({ error: "FILE_TOO_LARGE" }, 413);
  }
  try {
    const bytes = Buffer.from(await request.arrayBuffer());
    if (!bytes.length) return json({ error: "EMPTY_UPLOAD" }, 400);
    if (bytes.length > MAX_CARD_UPLOAD_BYTES)
      return json({ error: "FILE_TOO_LARGE" }, 413);
    const storageId = await storeAndAttachCatdexUpload(
      getDb(),
      token,
      bytes,
      contentType,
    );
    return json({ storageId, fileId: storageId });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "not_found"
    ) {
      return json({ error: "UPLOAD_EXPIRED" }, 410);
    }
    if (error instanceof Error) {
      const status =
        error.message === "FILE_TOO_LARGE"
          ? 413
          : error.message === "UNSUPPORTED_MEDIA_TYPE"
            ? 415
            : error.message === "EMPTY_UPLOAD"
              ? 400
              : error.message === "INVALID_IMAGE"
                ? 400
                : 400;
      if (
        [
          "FILE_TOO_LARGE",
          "UNSUPPORTED_MEDIA_TYPE",
          "EMPTY_UPLOAD",
          "INVALID_IMAGE",
        ].includes(error.message)
      )
        return json({ error: error.message }, status);
    }
    const response = errorResponse(
      error,
      "Upload failed",
      "Failed to store Catdex upload",
    );
    const body = await response
      .json()
      .catch(() => ({ error: "Upload failed" }));
    return json(body, response.status);
  }
}
