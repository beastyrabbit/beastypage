import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestIdentity } from "@/server/auth/identity";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseJsonBody, parseSearchParams } from "@/server/request";
import {
  listCollection,
  listCollectionLegacy,
  setCollectionFocus,
} from "@/server/services/catalog";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = parseSearchParams(
      request.nextUrl.searchParams,
      z.object({
        cursor: z.string().optional(),
        pageSize: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().positive().optional(),
      }),
    );
    if (params.limit !== undefined && params.cursor === undefined) {
      return NextResponse.json(
        await listCollectionLegacy(getDb(), params.limit),
      );
    }
    const result = await listCollection(getDb(), {
      cursor: params.cursor,
      pageSize: params.pageSize,
    });
    return NextResponse.json({
      page: result.page,
      results: result.page,
      nextCursor: result.nextCursor,
      continueCursor: result.nextCursor,
      isDone: result.isDone,
    });
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load collection",
      "Failed to load collection",
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await parseJsonBody(
      request,
      z.object({
        id: z.string().min(1),
        focusX: z.number(),
        focusY: z.number(),
      }),
    );
    return NextResponse.json(
      await setCollectionFocus(
        getDb(),
        body.id,
        body.focusX,
        body.focusY,
        await getRequestIdentity(),
      ),
    );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to update collection focus",
      "Failed to update collection focus",
    );
  }
}
