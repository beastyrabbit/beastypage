import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getServerConvexUrl } from "@/lib/convexUrl";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { listBatches, listBatchesPage } from "@/server/services/adoption";
export async function GET(request: NextRequest) {
  if (dataBackend() === "postgres") {
    try {
      const p = request.nextUrl.searchParams;
      const result =
        p.has("cursor") || p.has("pageSize")
          ? await listBatchesPage(getDb(), {
              limit: Number(p.get("pageSize") ?? p.get("limit") ?? 50),
              cursor: p.get("cursor"),
            })
          : await listBatches(getDb(), Number(p.get("limit") ?? 50));
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
        limit: Number(request.nextUrl.searchParams.get("limit") ?? 50),
      }),
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to load adoption history" },
      { status: 500 },
    );
  }
}
