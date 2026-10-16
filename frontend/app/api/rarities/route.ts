import { NextResponse } from "next/server";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { ensureDefaultRarities, listRarities } from "@/server/services/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  if (dataBackend() !== "postgres") {
    return NextResponse.json(
      { error: "Not found", code: "not_found" },
      { status: 404 },
    );
  }
  try {
    return NextResponse.json(await listRarities(getDb()));
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load rarities",
      "Failed to load rarities",
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
    await ensureDefaultRarities(getDb());
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(
      error,
      "Failed to ensure rarities",
      "Failed to ensure rarities",
    );
  }
}
