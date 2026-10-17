import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getServerConvexUrl } from "@/lib/convexUrl";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseSearchParams } from "@/server/request";
import { encodedPreviewQuerySchema } from "@/server/services/cat-validation";
import { findProfile } from "@/server/services/cats";

function normalizeRendererBase(url: string) {
  const trimmed = url.replace(/\/$/, "");
  if (/^http:\/\/[^/]+\.localhost:1355$/i.test(trimmed)) {
    return trimmed.replace(/^http:/i, "https:");
  }
  return trimmed;
}

const RENDERER_BASE = normalizeRendererBase(
  process.env.RENDERER_INTERNAL_URL ?? "http://127.0.0.1:8001",
);
const PREVIEW_SIZE = 360;
const RENDER_TIMEOUT_MS = 30_000;
const MAX_ENCODED_CAT_DATA_CHARS = 512 * 1024;
const MAX_DECODED_CAT_DATA_BYTES = 256 * 1024;
const MAX_CAT_DATA_DEPTH = 32;
const MAX_CAT_DATA_CONTAINER_ENTRIES = 10_000;
const MAX_CAT_DATA_STRING_CHARS = 64 * 1024;
const PNG_DATA_URL_REGEX = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "AbortError"
  );
}

function dataUrlToPngBuffer(dataUrl: string): Buffer | null {
  const matches = PNG_DATA_URL_REGEX.exec(dataUrl);
  if (!matches) {
    return null;
  }
  const base64 = matches[1].replace(/\s+/g, "");
  const buffer = Buffer.from(base64, "base64");
  return buffer.length > 0 ? buffer : null;
}

function isBoundedJsonValue(value: unknown, depth = 0): boolean {
  if (depth > MAX_CAT_DATA_DEPTH) return false;
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return true;
  }
  if (typeof value === "string") {
    return value.length <= MAX_CAT_DATA_STRING_CHARS;
  }
  if (Array.isArray(value)) {
    return (
      value.length <= MAX_CAT_DATA_CONTAINER_ENTRIES &&
      value.every((entry) => isBoundedJsonValue(entry, depth + 1))
    );
  }
  if (!isPlainRecord(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= MAX_CAT_DATA_CONTAINER_ENTRIES &&
    entries.every(
      ([key, entry]) =>
        key.length <= MAX_CAT_DATA_STRING_CHARS &&
        isBoundedJsonValue(entry, depth + 1),
    )
  );
}

type EncodedCatDataResult =
  | { data: Record<string, unknown> }
  | { error: "invalid" | "too-large" };

function decodeEncodedCatData(encoded: string): EncodedCatDataResult {
  try {
    const decoded = Buffer.from(encoded, "base64");
    if (decoded.length > MAX_DECODED_CAT_DATA_BYTES) {
      return { error: "too-large" };
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(decoded);
    const parsed: unknown = JSON.parse(text);
    if (!isBoundedJsonValue(parsed) || !isPlainRecord(parsed)) {
      return { error: "invalid" };
    }
    const params = parsed.params ?? parsed.finalParams;
    if (params !== undefined && !isPlainRecord(params)) {
      return { error: "invalid" };
    }
    return { data: parsed };
  } catch {
    return { error: "invalid" };
  }
}

async function renderCatData(
  catData: Record<string, unknown>,
  requestSignal?: AbortSignal,
): Promise<NextResponse> {
  const baseParams = catData?.params ?? catData?.finalParams ?? catData ?? {};
  const spriteNumber =
    (baseParams as Record<string, unknown>)?.spriteNumber ??
    (catData as Record<string, unknown>)?.spriteNumber ??
    0;

  const renderPayload = {
    payload: {
      spriteNumber,
      params: baseParams,
    },
    variants: [],
    options: {
      includeBase: true,
      includeSources: false,
      columns: 1,
      tileSize: PREVIEW_SIZE,
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS);
  let renderResponse: Response;
  try {
    renderResponse = await fetch(`${RENDERER_BASE}/render/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(renderPayload),
      signal: requestSignal
        ? AbortSignal.any([controller.signal, requestSignal])
        : controller.signal,
    });
  } catch (error) {
    console.error("Renderer request failed", error);
    if (requestSignal?.aborted) {
      return NextResponse.json({ error: "Request aborted" }, { status: 499 });
    }
    if (isAbortError(error)) {
      return NextResponse.json(
        { error: "Renderer request timed out" },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { error: "Renderer service unavailable" },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!renderResponse.ok) {
    const errorText = await renderResponse.text();
    console.error("Renderer failed", renderResponse.status, errorText);
    return NextResponse.json(
      { error: `Renderer failed: ${renderResponse.status}` },
      { status: 502 },
    );
  }

  const renderData: unknown = await renderResponse.json();
  const imageDataUrl = isPlainRecord(renderData) ? renderData.sheet : null;
  if (typeof imageDataUrl !== "string") {
    return NextResponse.json(
      { error: "Renderer returned no image" },
      { status: 502 },
    );
  }

  const buffer = dataUrlToPngBuffer(imageDataUrl);
  if (!buffer) {
    return NextResponse.json(
      { error: "Renderer returned invalid image data" },
      { status: 502 },
    );
  }
  const uint8Array = new Uint8Array(buffer);

  return new NextResponse(uint8Array, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}

/**
 * On-demand preview generation.
 *
 * Supports two modes:
 * 1. /api/preview/{id} - fetch cat data from Convex by ID/slug
 * 2. /api/preview/{id}?cat={encoded} - use encoded cat data directly (for adoption batch cats)
 */
async function renderEncodedPreview(
  encoded: string,
  request: NextRequest,
): Promise<NextResponse> {
  if (encoded.length > MAX_ENCODED_CAT_DATA_CHARS)
    return NextResponse.json(
      { error: "Encoded cat data is too large" },
      { status: 413 },
    );
  try {
    const decoded = decodeEncodedCatData(encoded);
    if (!("data" in decoded)) {
      const status = decoded.error === "too-large" ? 413 : 400;
      const error =
        status === 413
          ? "Decoded cat data is too large"
          : "Invalid encoded cat data";
      return NextResponse.json({ error }, { status });
    }
    return await renderCatData(decoded.data, request.signal);
  } catch (error) {
    console.error("Failed to render from encoded data", error);
    return NextResponse.json(
      { error: "Failed to render preview" },
      { status: 500 },
    );
  }
}

async function renderPostgresPreview(
  profileId: string,
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const profile = await findProfile(getDb(), profileId);
    if (!profile)
      return NextResponse.json(
        { error: "Profile not found", code: "not_found" },
        { status: 404 },
      );
    if (!isPlainRecord(profile.catData))
      return NextResponse.json(
        { error: "Cat data not found", code: "not_found" },
        { status: 404 },
      );
    return await renderCatData(profile.catData, request.signal);
  } catch (error) {
    console.error("Failed to generate PostgreSQL preview", error);
    return NextResponse.json(
      { error: "Failed to generate preview" },
      { status: 500 },
    );
  }
}

async function renderConvexPreview(
  profileId: string,
  request: NextRequest,
): Promise<NextResponse> {
  const convexUrl = getServerConvexUrl();
  if (!convexUrl)
    return NextResponse.json(
      { error: "Convex URL not configured" },
      { status: 500 },
    );
  try {
    const profile = await new ConvexHttpClient(convexUrl).query(
      api.mapper.getBySlug,
      { slugOrId: profileId },
    );
    if (!profile)
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    if (!isPlainRecord(profile.cat_data))
      return NextResponse.json(
        { error: "Cat data not found" },
        { status: 400 },
      );
    return await renderCatData(profile.cat_data, request.signal);
  } catch (error) {
    console.error("Failed to generate preview", error);
    return NextResponse.json(
      { error: "Failed to generate preview" },
      { status: 500 },
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: profileId } = await params;
  let cat: string | undefined;
  try {
    ({ cat } = parseSearchParams(
      request.nextUrl.searchParams,
      encodedPreviewQuerySchema,
    ));
  } catch (error) {
    return errorResponse(
      error,
      "Invalid query parameters",
      "Invalid query parameters",
    );
  }
  if (cat) return renderEncodedPreview(cat, request);
  if (!profileId)
    return NextResponse.json({ error: "Missing profile ID" }, { status: 400 });
  return dataBackend() === "postgres"
    ? renderPostgresPreview(profileId, request)
    : renderConvexPreview(profileId, request);
}
