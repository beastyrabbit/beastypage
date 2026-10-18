import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestIdentity } from "@/server/auth/identity";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseSearchParams } from "@/server/request";
import { listCatdexForModeration } from "@/server/services/catalog";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const identity = await getRequestIdentity();
    const params = parseSearchParams(
      request.nextUrl.searchParams,
      z.object({
        approved: z.enum(["true", "false"]).optional(),
        cursor: z.string().optional(),
        pageSize: z.coerce.number().int().positive().optional(),
      }),
    );
    const result = await listCatdexForModeration(
      getDb(),
      params.approved === "true",
      params,
      identity,
    );
    return NextResponse.json({ ...result, results: result.page });
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load Catdex moderation records",
      "Failed to load Catdex moderation records",
    );
  }
}
