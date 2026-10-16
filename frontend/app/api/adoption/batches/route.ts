import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getServerConvexUrl } from "@/lib/convexUrl";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseSearchParams } from "@/server/request";
import { listBatches, listBatchesPage } from "@/server/services/adoption";
import { listQuerySchema } from "@/server/services/cat-validation";
export async function GET(request: NextRequest) {
  let p: { limit?: number; pageSize?: number; cursor?: string };
  try {
    p = parseSearchParams(request.nextUrl.searchParams, listQuerySchema);
  } catch (error) {
    return errorResponse(
      error,
      "Invalid query parameters",
      "Invalid query parameters",
    );
  }
  if (dataBackend() === "postgres") {
    try {
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
  const url = getServerConvexUrl();
  if (!url)
    return NextResponse.json(
      { error: "Convex URL not configured" },
      { status: 500 },
    );
  try {
    return NextResponse.json(
      await new ConvexHttpClient(url).query(api.adoptionV2.listBatches, {
        limit: p.limit ?? 50,
      }),
    );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load adoption history",
      "Failed to load adoption history",
    );
  }
}
