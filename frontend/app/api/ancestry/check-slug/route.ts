import { type NextRequest, NextResponse } from "next/server";
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
    return NextResponse.json(await checkSlug(getDb(), slug));
  } catch (error) {
    return errorResponse(
      error,
      "Failed to check tree slug",
      "Failed to check tree slug",
    );
  }
}
