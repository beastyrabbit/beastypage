import { NextResponse } from "next/server";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { hasPendingCatdex } from "@/server/services/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  if (dataBackend() !== "postgres") {
    return NextResponse.json(
      { error: "Not found", code: "not_found" },
      { status: 404 },
    );
  }
  try {
    return NextResponse.json(await hasPendingCatdex(getDb()));
  } catch (error) {
    return errorResponse(
      error,
      "Failed to check Catdex moderation",
      "Failed to check Catdex moderation",
    );
  }
}
