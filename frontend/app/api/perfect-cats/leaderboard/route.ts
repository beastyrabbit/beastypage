import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseSearchParams } from "@/server/request";
import { perfectLeaderboard } from "@/server/services/games";
export const dynamic = "force-dynamic";
const notFound = () =>
  NextResponse.json({ error: "Not found", code: "not_found" }, { status: 404 });
export async function GET(request: Request) {
  try {
    const params = parseSearchParams(
      new URL(request.url).searchParams,
      z.object({ limit: z.coerce.number().int().positive().optional() }),
    );
    return NextResponse.json(await perfectLeaderboard(getDb(), params.limit));
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load leaderboard",
      "perfect cats leaderboard",
    );
  }
}
