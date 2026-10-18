import { NextResponse } from "next/server";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { ensureDefaultSeasons, listSeasons } from "@/server/services/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  if (dataBackend() !== "postgres") {
    return NextResponse.json(
      { error: "Not found", code: "not_found" },
      { status: 404 },
    );
  }
  try {
    return NextResponse.json(await listSeasons(getDb()));
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load seasons",
      "Failed to load seasons",
    );
  }
}

export async function POST() {
  if (dataBackend() !== "postgres") {
    return NextResponse.json(
      { error: "Not found", code: "not_found" },
      { status: 404 },
    );
  }
  try {
    await ensureDefaultSeasons(getDb());
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(
      error,
      "Failed to ensure seasons",
      "Failed to ensure seasons",
    );
  }
}
