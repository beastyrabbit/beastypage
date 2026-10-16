import { type NextRequest, NextResponse } from "next/server";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { listHistory, listHistoryPage } from "@/server/services/cats";
export async function GET(request: NextRequest) {
  if (dataBackend() !== "postgres")
    return NextResponse.json(
      { error: "Not found", code: "not_found" },
      { status: 404 },
    );
  try {
    const params = request.nextUrl.searchParams;
    const cursor = params.get("cursor");
    const limit =
      params.has("cursor") || params.has("pageSize")
        ? Number(params.get("pageSize") ?? params.get("limit") ?? 50)
        : Number(params.get("limit") ?? 200);
    const result =
      cursor || params.has("pageSize")
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
