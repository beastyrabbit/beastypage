import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getServerConvexUrl } from "@/lib/convexUrl";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseSearchParams } from "@/server/request";
import { listTrees, listTreesPage } from "@/server/services/ancestry";
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
  const url = getServerConvexUrl();
  if (!url)
    return NextResponse.json(
      { error: "Convex URL not configured" },
      { status: 500 },
    );
  try {
    return NextResponse.json(
      await new ConvexHttpClient(url).query(api.ancestryTree.list, {
        limit: p.limit ?? 20,
      }),
    );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load ancestry history",
      "Failed to load ancestry history",
    );
  }
}
