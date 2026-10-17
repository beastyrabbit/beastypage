import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getServerConvexUrl } from "@/lib/convexUrl";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseSearchParams } from "@/server/request";
import { paletteImageQuerySchema } from "@/server/services/cat-validation";
import { getPaletteImageUrl } from "@/server/services/palette";
export async function GET(request: NextRequest) {
  try {
    const { slug } = parseSearchParams(
      request.nextUrl.searchParams,
      paletteImageQuerySchema,
    );
    if (dataBackend() === "postgres")
      return NextResponse.json(await getPaletteImageUrl(getDb(), slug));
    const url = getServerConvexUrl();
    if (!url)
      return NextResponse.json(
        { error: "Convex URL not configured" },
        { status: 500 },
      );
    return NextResponse.json(
      await new ConvexHttpClient(url).query(
        api.paletteGeneratorSettings.getImageUrl,
        { slug },
      ),
    );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load palette image",
      "Failed to load palette image",
    );
  }
}
