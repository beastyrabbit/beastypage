import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const RENDERER_BASE = (process.env.RENDERER_INTERNAL_URL ?? "http://127.0.0.1:8001").replace(/\/$/, "");
const PREVIEW_SIZE = 360;

function getConvexUrl(): string {
  return (
    process.env.NEXT_PUBLIC_CONVEX_URL ||
    process.env.CONVEX_SITE_ORIGIN ||
    process.env.CONVEX_SELF_HOSTED_URL ||
    process.env.CONVEX_URL ||
    ""
  );
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid data URL format");
  }
  const base64 = matches[2].replace(/\s+/g, "");
  return Buffer.from(base64, "base64");
}

/**
 * Simple on-demand preview generation.
 * 1. Fetch cat data from Convex
 * 2. Render locally via renderer service
 * 3. Return image directly (HTTP caching handles the rest)
 * 
 * No database caching, no redirects, no complexity.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: profileId } = await params;

  if (!profileId) {
    return NextResponse.json({ error: "Missing profile ID" }, { status: 400 });
  }

  const convexUrl = getConvexUrl();
  if (!convexUrl) {
    return NextResponse.json({ error: "Convex URL not configured" }, { status: 500 });
  }

  try {
    const convex = new ConvexHttpClient(convexUrl);

    // Fetch cat profile from Convex
    const profile = await convex.query(api.mapper.get, { id: profileId as Id<"cat_profile"> });
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const catData = profile.cat_data;
    if (!catData) {
      return NextResponse.json({ error: "Cat data not found" }, { status: 400 });
    }

    // Render preview via local renderer service
    const baseParams = catData?.params ?? catData?.finalParams ?? catData ?? {};
    const spriteNumber = baseParams?.spriteNumber ?? catData?.spriteNumber ?? 0;
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

    // Convert data URL to buffer and return directly
    const buffer = dataUrlToBuffer(imageDataUrl);
    const uint8Array = new Uint8Array(buffer);

    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        // Cache for 1 day, allow CDN/browser caching
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    console.error("Failed to generate preview", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate preview" },
      { status: 500 }
    );
  }
}
