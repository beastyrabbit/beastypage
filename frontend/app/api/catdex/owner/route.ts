import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseSearchParams } from "@/server/request";
import { listCatdexForOwner } from "@/server/services/catalog";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = parseSearchParams(
      request.nextUrl.searchParams,
      z.object({
        owner: z.string().min(1).max(200),
        cursor: z.string().optional(),
        pageSize: z.coerce.number().int().positive().optional(),
      }),
    );
    const result = await listCatdexForOwner(getDb(), params.owner, params);
    return NextResponse.json({ ...result, results: result.page });
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load owner Catdex records",
      "Failed to load owner Catdex records",
    );
  }
}
