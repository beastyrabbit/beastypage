import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getServerConvexUrl } from "@/lib/convexUrl";
import { ANONYMOUS, getRequestIdentity } from "@/server/auth/identity";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseJsonBody, parseSearchParams } from "@/server/request";
import {
  profileCreateSchema,
  profileUpdateSchema,
  slugOrIdQuerySchema,
} from "@/server/services/cat-validation";
import {
  createProfile,
  getProfile,
  updateProfileMeta,
} from "@/server/services/cats";

async function requestIdentity() {
  try {
    return await getRequestIdentity();
  } catch {
    return ANONYMOUS;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { slugOrId } = parseSearchParams(
      request.nextUrl.searchParams,
      slugOrIdQuerySchema,
    );
    if (dataBackend() === "postgres") {
      const result = await getProfile(getDb(), slugOrId);
      return result
        ? NextResponse.json(result)
        : NextResponse.json(
            { error: "Not found", code: "not_found" },
            { status: 404 },
          );
    }
    const url = getServerConvexUrl();
    if (!url)
      return NextResponse.json(
        { error: "Convex URL not configured" },
        { status: 500 },
      );
    return NextResponse.json(
      await new ConvexHttpClient(url).query(api.mapper.getBySlug, { slugOrId }),
    );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load cat profile",
      "Failed to fetch cat profile",
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await parseJsonBody(request, profileCreateSchema);
    if (dataBackend() === "postgres") {
      return NextResponse.json(
        await createProfile(
          getDb(),
          {
            catData: payload.catData,
            catName: payload.catName,
            creatorName: payload.creatorName,
          },
          await requestIdentity(),
        ),
      );
    }
    const url = getServerConvexUrl();
    if (!url)
      return NextResponse.json(
        { error: "Convex URL not configured" },
        { status: 500 },
      );
    return NextResponse.json(
      await new ConvexHttpClient(url).mutation(
        api.mapper.create,
        payload as never,
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

export async function PATCH(request: NextRequest) {
  try {
    const payload = await parseJsonBody(request, profileUpdateSchema);
    if (dataBackend() === "postgres") {
      return NextResponse.json(
        await updateProfileMeta(
          getDb(),
          {
            id: payload.id,
            catName: payload.catName,
            creatorName: payload.creatorName,
            editToken: payload.editToken,
          },
          await requestIdentity(),
        ),
      );
    }
    const url = getServerConvexUrl();
    if (!url)
      return NextResponse.json(
        { error: "Convex URL not configured" },
        { status: 500 },
      );
    return NextResponse.json(
      await new ConvexHttpClient(url).mutation(
        api.mapper.updateMeta,
        payload as never,
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
