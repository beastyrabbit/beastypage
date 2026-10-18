import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseSearchParams } from "@/server/request";
import { listBatches, listBatchesPage } from "@/server/services/adoption";
import { listQuerySchema } from "@/server/services/cat-validation";

export async function GET(request: NextRequest) {
  try {
    const p = parseSearchParams(request.nextUrl.searchParams, listQuerySchema);
    const result =
      p.cursor || p.pageSize
        ? await listBatchesPage(getDb(), {
            limit: p.pageSize ?? p.limit ?? 50,
            cursor: p.cursor,
          })
        : await listBatches(getDb(), p.limit ?? 50);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load adoption history",
      "Failed to load adoption history",
    );
  }
}
