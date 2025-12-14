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

    // Get profile and check for existing preview
    const profile = await convex.query(api.mapper.get, { id: profileId as Id<"cat_profile"> });
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // If a real cached preview exists (not the fallback on-demand URL), redirect to it
    const existingPreviewUrl = profile.previews?.preview?.url ?? profile.previews?.full?.url ?? null;
    // Skip redirect if the URL is the on-demand endpoint itself (would cause infinite redirect)
    const isOnDemandUrl = existingPreviewUrl?.includes("/api/preview/");
    if (existingPreviewUrl && !isOnDemandUrl) {
      return NextResponse.redirect(existingPreviewUrl, 302);
    }

    // No preview exists - generate it
    const catData = profile.cat_data;
    if (!catData) {
      return NextResponse.json({ error: "Cat data not found" }, { status: 400 });
    }

    // Render preview via local renderer
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

    // Upload to Convex storage via action
    const buffer = dataUrlToBuffer(imageDataUrl);
    
    // Convert buffer to base64 data URL for the action
    const base64 = buffer.toString("base64");
    const dataUrl = `data:image/png;base64,${base64}`;

    // Upload preview via action
    await convex.action(api.previews.upsertMapperPreviews, {
      id: profileId as Id<"cat_profile">,
      preview: {
        dataUrl,
        filename: `preview-${profileId}.png`,
      },
    });

    // Return the image directly
    // Convert Buffer to Uint8Array for NextResponse
    const uint8Array = new Uint8Array(buffer);
    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
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
