import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { getServerConvexUrl } from "@/lib/convexUrl";

const RENDERER_BASE = (process.env.RENDERER_INTERNAL_URL ?? "http://127.0.0.1:8001").replace(/\/$/, "");
const PREVIEW_SIZE = 360;

function dataUrlToBuffer(dataUrl: string): Buffer {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid data URL format");
  }
  const base64 = matches[2].replace(/\s+/g, "");
  return Buffer.from(base64, "base64");
}

function fromBase64(encoded: string): string {
  return Buffer.from(encoded, "base64").toString("utf-8");
}

function decodeEncodedCatData(encoded: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fromBase64(encoded));
  } catch {
    return null;
  }
}

async function renderCatData(catData: Record<string, unknown>): Promise<NextResponse> {
  const baseParams = catData?.params ?? catData?.finalParams ?? catData ?? {};
  const spriteNumber = (baseParams as Record<string, unknown>)?.spriteNumber ?? (catData as Record<string, unknown>)?.spriteNumber ?? 0;
  
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

  const renderResponse = await fetch(`${RENDERER_BASE}/render/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(renderPayload),
  });

  if (!renderResponse.ok) {
    const errorText = await renderResponse.text();
    console.error("Renderer failed", renderResponse.status, errorText);
    return NextResponse.json(
      { error: `Renderer failed: ${renderResponse.status}` },
      { status: 502 }
    );
  }

  const renderData = await renderResponse.json();
  const imageDataUrl = renderData?.sheet ?? null;
  if (!imageDataUrl) {
    return NextResponse.json({ error: "Renderer returned no image" }, { status: 502 });
  }

  const buffer = dataUrlToBuffer(imageDataUrl);
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
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: profileId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const encodedCatData = searchParams.get("cat");

  // Mode 2: Direct cat data provided via query param
  if (encodedCatData) {
    try {
      const catData = decodeEncodedCatData(encodedCatData);
      if (!catData) {
        return NextResponse.json({ error: "Invalid encoded cat data" }, { status: 400 });
      }
      return await renderCatData(catData);
    } catch (error) {
      console.error("Failed to render from encoded data", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to render" },
        { status: 500 }
      );
    }
  }

  // Mode 1: Look up profile from Convex
  if (!profileId) {
    return NextResponse.json({ error: "Missing profile ID" }, { status: 400 });
  }

  const convexUrl = getServerConvexUrl();
  if (!convexUrl) {
    return NextResponse.json({ error: "Convex URL not configured" }, { status: 500 });
  }

  try {
    const convex = new ConvexHttpClient(convexUrl);

    const profile = await convex.query(api.mapper.getBySlug, { slugOrId: profileId });
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const catData = profile.cat_data;
    if (!catData) {
      return NextResponse.json({ error: "Cat data not found" }, { status: 400 });
    }

    return await renderCatData(catData as Record<string, unknown>);
  } catch (error) {
    console.error("Failed to generate preview", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate preview" },
      { status: 500 }
    );
  }
}
