import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getServerConvexUrl } from "@/lib/convexUrl";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseSearchParams } from "@/server/request";
import { checkSlug } from "@/server/services/ancestry";
import { ancestryCheckSchema } from "@/server/services/cat-validation";
export async function GET(request: NextRequest) {
  try {
    const { slug } = parseSearchParams(
      request.nextUrl.searchParams,
      ancestryCheckSchema,
    );
    if (dataBackend() === "postgres") {
      return NextResponse.json(await checkSlug(getDb(), slug));
    }
    const url = getServerConvexUrl();
    if (!url)
      return NextResponse.json(
        { error: "Convex URL not configured" },
        { status: 500 },
      );
    return NextResponse.json(
      await new ConvexHttpClient(url).query(api.ancestryTree.checkSlug, {
        slug,
      }),
    );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to check tree slug",
      "Failed to check tree slug",
    );
  }
}
