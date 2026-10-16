import { type NextRequest, NextResponse } from "next/server";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { listForPreview } from "@/server/services/cats";
export async function GET(request: NextRequest) {
  if (dataBackend() !== "postgres")
    return NextResponse.json(
      { error: "Not found", code: "not_found" },
      { status: 404 },
    );
  try {
    const p = request.nextUrl.searchParams;
    return NextResponse.json(
      await listForPreview(getDb(), {
        limit: Number(p.get("limit") ?? 50),
        staleBefore: p.has("staleBefore")
          ? Number(p.get("staleBefore"))
          : undefined,
        force: p.get("force") === "true",
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
