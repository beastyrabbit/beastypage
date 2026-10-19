import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseJsonBody } from "@/server/request";
import { requestPerfectMatchup } from "@/server/services/games";
export const dynamic = "force-dynamic";
const schema = z.object({ clientId: z.string().min(1).max(128) });
export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request, schema);
    return NextResponse.json(
      await requestPerfectMatchup(getDb(), body.clientId),
    );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load matchup",
      "perfect cats matchup",
    );
  }
}
