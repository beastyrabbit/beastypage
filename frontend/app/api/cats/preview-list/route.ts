import { type NextRequest, NextResponse } from "next/server";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseSearchParams } from "@/server/request";
import { previewListQuerySchema } from "@/server/services/cat-validation";
import { listForPreview } from "@/server/services/cats";
export async function GET(request: NextRequest) {
  let params: {
    limit?: number;
    staleBefore?: number;
    force?: "true" | "false";
  };
  try {
    params = parseSearchParams(
      request.nextUrl.searchParams,
      previewListQuerySchema,
    );
  } catch (error) {
    return errorResponse(
      error,
      "Invalid query parameters",
      "Invalid query parameters",
    );
  }
  if (dataBackend() !== "postgres")
    return NextResponse.json(
      { error: "Not found", code: "not_found" },
      { status: 404 },
    );
  try {
    return NextResponse.json(
      await listForPreview(getDb(), {
        limit: params.limit ?? 50,
        staleBefore: params.staleBefore,
        force: params.force === "true",
      }),
    );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load preview queue",
      "Failed to load preview queue",
    );
  }
}
