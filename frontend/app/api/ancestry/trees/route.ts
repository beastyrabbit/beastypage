import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getServerConvexUrl } from "@/lib/convexUrl";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { listTrees, listTreesPage } from "@/server/services/ancestry";
export async function GET(request: NextRequest) {
  if (dataBackend() === "postgres") {
    try {
      const p = request.nextUrl.searchParams;
      return NextResponse.json(
        p.has("cursor") || p.has("pageSize")
          ? await listTreesPage(getDb(), {
              limit: Number(p.get("pageSize") ?? p.get("limit") ?? 20),
              cursor: p.get("cursor"),
            })
          : await listTrees(getDb(), Number(p.get("limit") ?? 20)),
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
        limit: Number(request.nextUrl.searchParams.get("limit") ?? 20),
      }),
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to load ancestry history" },
      { status: 500 },
    );
  }
}
