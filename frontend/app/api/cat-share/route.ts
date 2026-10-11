import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import {
  RequestBodyTooLargeError,
  readRequestBody,
} from "@/app/api/_lib/request-body";
import { api } from "@/convex/_generated/api";
import { getServerConvexUrl } from "@/lib/convexUrl";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
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
    const record = await convex.query(api.catShares.get, { slug });
    if (!record) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      data: record.data,
      slug: record.slug,
      createdAt: record.createdAt,
    });
  } catch (error) {
    console.error("Failed to fetch cat share", error);
    return NextResponse.json(
      { error: "Failed to load cat share" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const MAX_BODY_BYTES = 256 * 1024;
  const convexUrl = getServerConvexUrl();
  if (!convexUrl) {
    return NextResponse.json(
      { error: "Convex URL not configured" },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    const rawBody = await readRequestBody(request, MAX_BODY_BYTES);
    body = JSON.parse(rawBody);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: "Request body is too large" },
        { status: 413 },
      );
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json({ error: "Request aborted" }, { status: 499 });
    }
    console.error("Failed to parse cat share payload", error);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const payload = body as {
    data?: unknown;
    slug?: string;
    editToken?: string;
  };
  if (!payload.data) {
    return NextResponse.json({ error: "Missing data" }, { status: 400 });
  }

  try {
    const convex = new ConvexHttpClient(convexUrl);
    const result = await convex.mutation(api.catShares.create, {
      data: payload.data,
      slug:
        typeof payload.slug === "string" && payload.slug.trim()
          ? payload.slug.trim().slice(0, 128)
          : undefined,
      editToken:
        typeof payload.editToken === "string" && payload.editToken.trim()
          ? payload.editToken.trim()
          : undefined,
    });
    return NextResponse.json({
      slug: result.slug,
      id: result.id,
      updated: result.updated,
      editToken: result.editToken,
    });
  } catch (error) {
    console.error("Failed to create cat share", error);
    return NextResponse.json(
      { error: "Failed to create cat share" },
      { status: 500 },
    );
  }
}
