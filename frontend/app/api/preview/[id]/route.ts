import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getServerConvexUrl } from "@/lib/convexUrl";

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
  const matches = dataUrl.match(PNG_DATA_URL_REGEX);
  if (!matches) {
    return null;
  }
  const base64 = matches[1].replace(/\s+/g, "");
  const buffer = Buffer.from(base64, "base64");
  return buffer.length > 0 ? buffer : null;
}

function fromBase64(encoded: string): string {
  return Buffer.from(encoded, "base64").toString("utf-8");
}

function decodeEncodedCatData(encoded: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(fromBase64(encoded));
    if (!isPlainRecord(parsed)) return null;
    const params = parsed.params ?? parsed.finalParams;
    if (params !== undefined && !isPlainRecord(params)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function renderCatData(
  catData: Record<string, unknown>,
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
      signal: controller.signal,
    });
  } catch (error) {
    console.error("Renderer request failed", error);
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
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: profileId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const encodedCatData = searchParams.get("cat");

  // Mode 2: Direct cat data provided via query param
  if (encodedCatData) {
    try {
      const catData = decodeEncodedCatData(encodedCatData);
      if (!catData) {
        return NextResponse.json(
          { error: "Invalid encoded cat data" },
          { status: 400 },
        );
      }
      return await renderCatData(catData);
    } catch (error) {
      console.error("Failed to render from encoded data", error);
      return NextResponse.json(
        { error: "Failed to render preview" },
        { status: 500 },
      );
    }
  }

  // Mode 1: Look up profile from Convex
  if (!profileId) {
    return NextResponse.json({ error: "Missing profile ID" }, { status: 400 });
  }

  const convexUrl = getServerConvexUrl();
  if (!convexUrl) {
    return NextResponse.json(
      { error: "Convex URL not configured" },
      { status: 500 },
    );
  }

  try {
    const convex = new ConvexHttpClient(convexUrl);

    const profile = await convex.query(api.mapper.getBySlug, {
      slugOrId: profileId,
    });
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const catData = profile.cat_data;
    if (!isPlainRecord(catData)) {
      return NextResponse.json(
        { error: "Cat data not found" },
        { status: 400 },
      );
    }

    return await renderCatData(catData);
  } catch (error) {
    console.error("Failed to generate preview", error);
    return NextResponse.json(
      { error: "Failed to generate preview" },
      { status: 500 },
    );
  }
}
