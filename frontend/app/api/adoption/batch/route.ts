import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getServerConvexUrl } from "@/lib/convexUrl";
import { ANONYMOUS, getRequestIdentity } from "@/server/auth/identity";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import {
  createBatch,
  getBatch,
  updateBatchMeta,
} from "@/server/services/adoption";

async function payload(request: NextRequest) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function requestIdentity() {
  try {
    return await getRequestIdentity();
  } catch {
    return ANONYMOUS;
  }
}

export async function GET(request: NextRequest) {
  const slugOrId = request.nextUrl.searchParams.get("slugOrId");
  if (!slugOrId)
    return NextResponse.json(
      { error: "Missing slug", code: "invalid_input" },
      { status: 400 },
    );
  if (dataBackend() === "postgres") {
    try {
      const result = await getBatch(getDb(), slugOrId);
      return result
        ? NextResponse.json(result)
        : NextResponse.json(
            { error: "Not found", code: "not_found" },
            { status: 404 },
          );
    } catch (error) {
      return errorResponse(
        error,
        "Failed to load adoption batch",
        "Failed to load adoption batch",
      );
    }
  }
  const url = getServerConvexUrl();
  if (!url)
    return NextResponse.json(
      { error: "Convex URL not configured" },
      { status: 500 },
    );
  try {
    return NextResponse.json(
      await new ConvexHttpClient(url).query(api.adoptionV2.getBySlug, {
        slugOrId,
      }),
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to load adoption batch" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await payload(request);
  if (!body || !Array.isArray(body.cats))
    return NextResponse.json(
      { error: "Invalid JSON body", code: "invalid_input" },
      { status: 400 },
    );
  if (dataBackend() === "postgres") {
    try {
      return NextResponse.json(
        await createBatch(
          getDb(),
          {
            cats: body.cats as never,
            title: typeof body.title === "string" ? body.title : undefined,
            creatorName:
              typeof body.creatorName === "string"
                ? body.creatorName
                : undefined,
            settings: body.settings,
          },
          await requestIdentity(),
        ),
      );
    } catch (error) {
      return errorResponse(
        error,
        "Failed to create adoption batch",
        "Failed to create adoption batch",
      );
    }
  }
  const url = getServerConvexUrl();
  if (!url)
    return NextResponse.json(
      { error: "Convex URL not configured" },
      { status: 500 },
    );
  try {
    return NextResponse.json(
      await new ConvexHttpClient(url).mutation(
        api.adoptionV2.createBatch,
        body as never,
      ),
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to create adoption batch" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const body = await payload(request);
  if (!body || typeof body.id !== "string")
    return NextResponse.json(
      { error: "Invalid JSON body", code: "invalid_input" },
      { status: 400 },
    );
  if (dataBackend() === "postgres") {
    try {
      return NextResponse.json(
        await updateBatchMeta(
          getDb(),
          {
            id: body.id,
            editToken:
              typeof body.editToken === "string" ? body.editToken : undefined,
            title: typeof body.title === "string" ? body.title : undefined,
            creatorName:
              typeof body.creatorName === "string"
                ? body.creatorName
                : undefined,
          },
          await requestIdentity(),
        ),
      );
    } catch (error) {
      return errorResponse(
        error,
        "Failed to update adoption batch",
        "Failed to update adoption batch",
      );
    }
  }
  const url = getServerConvexUrl();
  if (!url)
    return NextResponse.json(
      { error: "Convex URL not configured" },
      { status: 500 },
    );
  try {
    return NextResponse.json(
      await new ConvexHttpClient(url).mutation(
        api.adoptionV2.updateBatchMeta,
        body as never,
      ),
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to update adoption batch" },
      { status: 500 },
    );
  }
}
