import { type NextRequest, NextResponse } from "next/server";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseSearchParams } from "@/server/request";
import { listQuerySchema } from "@/server/services/cat-validation";
import { listHistory, listHistoryPage } from "@/server/services/cats";
export async function GET(request: NextRequest) {
  let params: { limit?: number; pageSize?: number; cursor?: string };
  try {
    params = parseSearchParams(request.nextUrl.searchParams, listQuerySchema);
  } catch (error) {
    return errorResponse(
      error,
      "Invalid query parameters",
      "Invalid query parameters",
    );
  }
  if (dataBackend() !== "postgres")
    return NextResponse.json(
      { error: "Not found", code: "not_found" },
      { status: 404 },
    );
  try {
    const cursor = params.cursor;
    const limit =
      params.cursor || params.pageSize
        ? (params.pageSize ?? params.limit ?? 50)
        : (params.limit ?? 200);
    const result =
      cursor || params.pageSize
        ? await listHistoryPage(getDb(), { limit, cursor })
        : await listHistory(getDb(), limit);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load cat history",
      "Failed to load cat history",
    );
  }
}
