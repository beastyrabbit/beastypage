import { type NextRequest, NextResponse } from "next/server";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseJsonBody } from "@/server/request";
import { previewUpdateSchema } from "@/server/services/cat-validation";
import {
  type PreviewUpdateInput,
  upsertMapperPreviews,
} from "@/server/services/previews";
export async function POST(request: NextRequest) {
  let payload: PreviewUpdateInput;
  try {
    payload = await parseJsonBody(request, previewUpdateSchema);
  } catch (error) {
    return errorResponse(error, "Invalid request body", "Invalid request body");
  }
  if (dataBackend() !== "postgres")
    return NextResponse.json(
      { error: "Not found", code: "not_found" },
      { status: 404 },
    );
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
