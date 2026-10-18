import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseSearchParams } from "@/server/request";
import { listTrees, listTreesPage } from "@/server/services/ancestry";
import { listQuerySchema } from "@/server/services/cat-validation";

export async function GET(request: NextRequest) {
  try {
    const p = parseSearchParams(request.nextUrl.searchParams, listQuerySchema);
    return NextResponse.json(
      p.cursor || p.pageSize
        ? await listTreesPage(getDb(), {
            limit: p.pageSize ?? p.limit ?? 20,
            cursor: p.cursor,
          })
        : await listTrees(getDb(), p.limit ?? 20),
    );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load ancestry history",
      "Failed to load ancestry history",
    );
  }
}
