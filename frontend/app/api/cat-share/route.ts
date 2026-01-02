import { NextResponse, type NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { getServerConvexUrl } from "@/lib/convexUrl";

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
    const record = await convex.query(api.catShares.get, { slug });
    if (!record) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: record.data, slug: record.slug, createdAt: record.createdAt });
  } catch (error) {
    console.error("Failed to fetch cat share", error);
    return NextResponse.json({ error: "Failed to load cat share" }, { status: 500 });
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
    console.error("Failed to parse cat share payload", error);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = (body as { data?: unknown; slug?: string }) ?? {};
  if (!payload.data) {
    return NextResponse.json({ error: "Missing data" }, { status: 400 });
  }

  try {
    const convex = new ConvexHttpClient(convexUrl);
    const result = await convex.mutation(api.catShares.create, {
      data: payload.data,
      slug: typeof payload.slug === "string" && payload.slug.trim() ? payload.slug.trim() : undefined,
    });
    return NextResponse.json({ slug: result.slug, id: result.id });
  } catch (error) {
    console.error("Failed to create cat share", error);
    return NextResponse.json({ error: "Failed to create cat share" }, { status: 500 });
  }
}
