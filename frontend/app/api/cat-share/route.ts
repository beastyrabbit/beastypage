import { type NextRequest, NextResponse } from "next/server";
import { ANONYMOUS, getRequestIdentity } from "@/server/auth/identity";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseJsonBody, parseSearchParams } from "@/server/request";
import { createCatShare, getCatShare } from "@/server/services/cat-shares";
import {
  catShareCreateSchema,
  slugQuerySchema,
} from "@/server/services/cat-validation";

async function requestIdentity() {
  try {
    return await getRequestIdentity();
  } catch {
    return ANONYMOUS;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { slug } = parseSearchParams(
      request.nextUrl.searchParams,
      slugQuerySchema,
    );
    const record = await getCatShare(getDb(), slug);
    if (!record)
      return NextResponse.json(
        { error: "Not found", code: "not_found" },
        { status: 404 },
      );
    return NextResponse.json({
      data: record.data,
      slug: record.slug,
      createdAt: record.createdAt,
    });
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load cat share",
      "Failed to load cat share",
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await parseJsonBody(request, catShareCreateSchema, {
      maxBytes: 256 * 1024,
    });
    const result = await createCatShare(
      getDb(),
      { data: payload.data, slug: payload.slug, editToken: payload.editToken },
      await requestIdentity(),
    );
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(
      error,
      "Failed to create cat share",
      "Failed to create cat share",
    );
  }
}
