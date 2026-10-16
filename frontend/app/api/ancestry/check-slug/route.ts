import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getServerConvexUrl } from "@/lib/convexUrl";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { checkSlug } from "@/server/services/ancestry";
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug)
    return NextResponse.json(
      { error: "Missing slug", code: "invalid_input" },
      { status: 400 },
    );
  if (dataBackend() === "postgres") {
    try {
      return NextResponse.json(await checkSlug(getDb(), slug));
    } catch (error) {
      return errorResponse(
        error,
        "Failed to check tree slug",
        "Failed to check tree slug",
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
      await new ConvexHttpClient(url).query(api.ancestryTree.checkSlug, {
        slug,
      }),
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to check tree slug" },
      { status: 500 },
    );
  }
}
