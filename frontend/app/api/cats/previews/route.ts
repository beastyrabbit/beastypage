import { type NextRequest, NextResponse } from "next/server";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { upsertMapperPreviews } from "@/server/services/previews";
export async function POST(request: NextRequest) {
  if (dataBackend() !== "postgres")
    return NextResponse.json(
      { error: "Not found", code: "not_found" },
      { status: 404 },
    );
  try {
    const payload = await request.json();
    if (!payload || typeof payload.id !== "string")
      return NextResponse.json(
        { error: "Invalid JSON body", code: "invalid_input" },
        { status: 400 },
      );
    return NextResponse.json(await upsertMapperPreviews(getDb(), payload));
  } catch (error) {
    return errorResponse(
      error,
      "Failed to update mapper previews",
      "Failed to update mapper previews",
    );
  }
}
