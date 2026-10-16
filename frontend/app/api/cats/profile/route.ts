import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getServerConvexUrl } from "@/lib/convexUrl";
import { ANONYMOUS, getRequestIdentity } from "@/server/auth/identity";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import {
  createProfile,
  getProfile,
  updateProfileMeta,
} from "@/server/services/cats";

async function body(request: NextRequest) {
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
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  if (dataBackend() === "postgres") {
    try {
      const result = await getProfile(getDb(), slugOrId);
      return result
        ? NextResponse.json(result)
        : NextResponse.json(
            { error: "Not found", code: "not_found" },
            { status: 404 },
          );
    } catch (error) {
      return errorResponse(
        error,
        "Failed to load cat profile",
        "Failed to fetch cat profile",
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
      await new ConvexHttpClient(url).query(api.mapper.getBySlug, { slugOrId }),
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to load cat profile" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const payload = await body(request);
  if (!payload || payload.catData === undefined)
    return NextResponse.json(
      { error: "Invalid JSON body", code: "invalid_input" },
      { status: 400 },
    );
  if (dataBackend() === "postgres") {
    try {
      return NextResponse.json(
        await createProfile(
          getDb(),
          {
            catData: payload.catData,
            catName:
              typeof payload.catName === "string" ? payload.catName : undefined,
            creatorName:
              typeof payload.creatorName === "string"
                ? payload.creatorName
                : undefined,
          },
          await requestIdentity(),
        ),
      );
    } catch (error) {
      return errorResponse(
        error,
        "Failed to create cat profile",
        "Failed to create cat profile",
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
        api.mapper.create,
        payload as never,
      ),
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to create cat profile" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const payload = await body(request);
  if (!payload || typeof payload.id !== "string")
    return NextResponse.json(
      { error: "Invalid JSON body", code: "invalid_input" },
      { status: 400 },
    );
  if (dataBackend() === "postgres") {
    try {
      return NextResponse.json(
        await updateProfileMeta(
          getDb(),
          {
            id: payload.id,
            catName:
              typeof payload.catName === "string" ? payload.catName : undefined,
            creatorName:
              typeof payload.creatorName === "string"
                ? payload.creatorName
                : undefined,
            editToken:
              typeof payload.editToken === "string"
                ? payload.editToken
                : undefined,
          },
          await requestIdentity(),
        ),
      );
    } catch (error) {
      return errorResponse(
        error,
        "Failed to update cat profile",
        "Failed to update cat profile",
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
        api.mapper.updateMeta,
        payload as never,
      ),
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to update cat profile" },
      { status: 500 },
    );
  }
}
