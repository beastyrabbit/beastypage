import { NextResponse, type NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { getServerConvexUrl } from "@/lib/convexUrl";
import { parsePaletteGeneratorPayload } from "@/utils/paletteGeneratorVariants";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const convexUrl = getServerConvexUrl();
  if (!convexUrl) {
    return NextResponse.json({ error: "Convex URL not configured" }, { status: 500 });
  }

  try {
    const convex = new ConvexHttpClient(convexUrl);
    const record = await convex.query(api.paletteGeneratorSettings.get, { slug });
    if (!record) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      slug: record.slug,
      config: record.config,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  } catch (error) {
    console.error("Failed to fetch palette generator settings", error);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const convexUrl = getServerConvexUrl();
  if (!convexUrl) {
    return NextResponse.json({ error: "Convex URL not configured" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.error("Failed to parse settings payload", error);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = body as { config?: unknown; slug?: string };
  if (!payload.config) {
    return NextResponse.json({ error: "Missing config" }, { status: 400 });
  }

  // Validate and sanitize config before persisting to prevent bloat/malformed data
  const sanitizedConfig = parsePaletteGeneratorPayload(payload.config);

  try {
    const convex = new ConvexHttpClient(convexUrl);
    const result = await convex.mutation(api.paletteGeneratorSettings.save, {
      config: sanitizedConfig,
      slug: typeof payload.slug === "string" && payload.slug.trim() ? payload.slug.trim() : undefined,
    });
    return NextResponse.json({ slug: result.slug, id: result.id, updated: result.updated });
  } catch (error) {
    console.error("Failed to save palette generator settings", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
