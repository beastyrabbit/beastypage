import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseJsonBody } from "@/server/request";
import { previewUpdateSchema } from "@/server/services/cat-validation";
import {
  type PreviewUpdateInput,
  upsertMapperPreviews,
} from "@/server/services/previews";

// Up to four image data URLs of at most 24 MiB each (previewUpdateSchema).
const PREVIEW_BODY_BYTES = 4 * 24 * 1024 * 1024 + 64 * 1024;

export async function POST(request: NextRequest) {
  let payload: PreviewUpdateInput;
  try {
    payload = await parseJsonBody(request, previewUpdateSchema, {
      maxBytes: PREVIEW_BODY_BYTES,
    });
  } catch (error) {
    return errorResponse(error, "Invalid request body", "Invalid request body");
  }
  try {
    return NextResponse.json(await upsertMapperPreviews(getDb(), payload));
  } catch (error) {
    return errorResponse(
      error,
      "Failed to update mapper previews",
      "Failed to update mapper previews",
    );
  }
}
