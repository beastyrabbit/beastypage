import { type NextRequest, NextResponse } from "next/server";
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
    return NextResponse.json(await getPaletteImageUrl(getDb(), slug));
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load palette image",
      "Failed to load palette image",
    );
  }
}
