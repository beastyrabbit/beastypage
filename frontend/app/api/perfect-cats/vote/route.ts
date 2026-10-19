import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseJsonBody } from "@/server/request";
import { submitPerfectVote } from "@/server/services/games";
export const dynamic = "force-dynamic";
const schema = z.object({
  clientId: z.string().min(1).max(128),
  winnerId: z.string().min(1),
  loserId: z.string().min(1),
  matchupToken: z.string().min(1).max(128),
});
export async function POST(request: Request) {
  try {
    return NextResponse.json(
      await submitPerfectVote(getDb(), await parseJsonBody(request, schema)),
    );
  } catch (error) {
    return errorResponse(error, "Failed to submit vote", "perfect cats vote");
  }
}
