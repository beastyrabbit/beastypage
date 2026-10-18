import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { hasPendingCatdex } from "@/server/services/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
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
