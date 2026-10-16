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
  createCatShare as createPostgresCatShare,
  getCatShare as getPostgresCatShare,
} from "@/server/services/cat-shares";
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
    if (dataBackend() === "postgres") {
      const record = await getPostgresCatShare(getDb(), slug);
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
    }
    const convexUrl = getServerConvexUrl();
    if (!convexUrl) {
      return NextResponse.json(
        { error: "Convex URL not configured" },
        { status: 500 },
      );
    }
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
    return errorResponse(
      error,
      "Failed to load cat share",
      "Failed to load cat share",
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await parseJsonBody(request, catShareCreateSchema);
    if (dataBackend() === "postgres") {
      const result = await createPostgresCatShare(
        getDb(),
        {
          data: payload.data,
          slug: payload.slug,
          editToken: payload.editToken,
        },
        await requestIdentity(),
      );
      return NextResponse.json(result);
    }
    const convexUrl = getServerConvexUrl();
    if (!convexUrl) {
      return NextResponse.json(
        { error: "Convex URL not configured" },
        { status: 500 },
      );
    }
    const convex = new ConvexHttpClient(convexUrl);
    const result = await convex.mutation(api.catShares.create, {
      data: payload.data,
      slug: payload.slug,
      editToken: payload.editToken,
    });
    return NextResponse.json({
      slug: result.slug,
      id: result.id,
      updated: result.updated,
      editToken: result.editToken,
    });
  } catch (error) {
    return errorResponse(
      error,
      "Failed to create cat share",
      "Failed to create cat share",
    );
  }
}
