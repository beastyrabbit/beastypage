import { type NextRequest, NextResponse } from "next/server";
import {
  RequestBodyTooLargeError,
  readRequestBytes,
} from "@/app/api/_lib/request-body";
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

function uploadStatus(message: string): number {
  if (message === "FILE_TOO_LARGE") return 413;
  if (message === "UNSUPPORTED_MEDIA_TYPE") return 415;
  return 400;
}

function validateUploadRequest(
  request: NextRequest,
): { token: string; contentType: string } | NextResponse {
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
  return { token, contentType };
}

function knownUploadError(error: unknown): NextResponse | null {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "not_found"
  ) {
    return json({ error: "UPLOAD_EXPIRED" }, 410);
  }
  if (!(error instanceof Error)) return null;
  const known = [
    "FILE_TOO_LARGE",
    "UNSUPPORTED_MEDIA_TYPE",
    "EMPTY_UPLOAD",
    "INVALID_IMAGE",
  ];
  return known.includes(error.message)
    ? json({ error: error.message }, uploadStatus(error.message))
    : null;
}

export async function POST(request: NextRequest) {
  if (dataBackend() !== "postgres") return json({ error: "NOT_FOUND" }, 404);
  const validated = validateUploadRequest(request);
  if (validated instanceof NextResponse) return validated;
  try {
    const bytes = Buffer.from(
      await readRequestBytes(request, MAX_CARD_UPLOAD_BYTES),
    );
    if (!bytes.length) return json({ error: "EMPTY_UPLOAD" }, 400);
    const storageId = await storeAndAttachCatdexUpload(
      getDb(),
      validated.token,
      bytes,
      validated.contentType,
    );
    return json({ storageId, fileId: storageId });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError)
      return json({ error: "FILE_TOO_LARGE" }, 413);
    if (error instanceof DOMException && error.name === "AbortError")
      return json({ error: "Request aborted" }, 499);
    const known = knownUploadError(error);
    if (known) return known;
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
