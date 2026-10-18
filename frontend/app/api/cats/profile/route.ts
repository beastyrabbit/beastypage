import { type NextRequest, NextResponse } from "next/server";
import { ANONYMOUS, getRequestIdentity } from "@/server/auth/identity";
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

export async function POST(request: NextRequest) {
  try {
    const payload = await parseJsonBody(request, profileCreateSchema);
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
  } catch (error) {
    return errorResponse(
      error,
      "Failed to update cat profile",
      "Failed to update cat profile",
    );
  }
}
