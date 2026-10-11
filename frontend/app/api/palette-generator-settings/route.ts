import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import {
  RequestBodyTooLargeError,
  readRequestBody,
} from "@/app/api/_lib/request-body";
import { api } from "@/convex/_generated/api";
import { getServerConvexUrl } from "@/lib/convexUrl";
import { parsePaletteGeneratorPayload } from "@/utils/paletteGeneratorVariants";

const MAX_BODY_BYTES = 512 * 1024;

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
    const record = await convex.query(api.paletteGeneratorSettings.get, {
      slug,
    });
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
    return NextResponse.json(
      { error: "Failed to load settings" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const convexUrl = getServerConvexUrl();
  if (!convexUrl) {
    return NextResponse.json(
      { error: "Convex URL not configured" },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(await readRequestBody(request, MAX_BODY_BYTES));
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
    console.error("Failed to parse settings payload", error);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const payload = body as {
    config?: unknown;
    slug?: string;
    editToken?: string;
  };
  if (!payload.config) {
    return NextResponse.json({ error: "Missing config" }, { status: 400 });
  }

  // Validate and sanitize config before persisting to prevent bloat/malformed data
  let sanitizedConfig: unknown;
  try {
    sanitizedConfig = parsePaletteGeneratorPayload(payload.config);
  } catch {
    return NextResponse.json({ error: "Invalid config" }, { status: 400 });
  }

  try {
    const convex = new ConvexHttpClient(convexUrl);
    const result = await convex.mutation(api.paletteGeneratorSettings.save, {
      config: sanitizedConfig,
      slug:
        typeof payload.slug === "string" && payload.slug.trim()
          ? payload.slug.trim()
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
    console.error("Failed to save palette generator settings", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 },
    );
  }
}
