import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestIdentity } from "@/server/auth/identity";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseJsonBody, parseSearchParams } from "@/server/request";
import { createStreamVote, listStreamVotes } from "@/server/services/stream";

const querySchema = z.object({
  session: z.string().uuid(),
  stepId: z.string().optional(),
  limit: z.coerce.number().optional(),
});
const bodySchema = z.object({
  sessionId: z.string().uuid(),
  viewerSession: z.string().optional(),
  voteRound: z.number().optional(),
  stepId: z.string(),
  optionKey: z.string(),
  optionMeta: z.record(z.string(), z.unknown()).optional(),
  votedBy: z.string().uuid().optional(),
});
function unavailable() {
  return NextResponse.json(
    { error: "Not found", code: "not_found" },
    { status: 404 },
  );
}
export async function GET(request: NextRequest) {
  if (dataBackend() !== "postgres") return unavailable();
  try {
    return NextResponse.json(
      await listStreamVotes(
        getDb(),
        parseSearchParams(request.nextUrl.searchParams, querySchema),
      ),
    );
  } catch (error) {
    return errorResponse(error, "Failed to load votes", "stream votes GET");
  }
}
export async function POST(request: NextRequest) {
  if (dataBackend() !== "postgres") return unavailable();
  try {
    return NextResponse.json(
      await createStreamVote(
        getDb(),
        await parseJsonBody(request, bodySchema),
        await getRequestIdentity(),
      ),
    );
  } catch (error) {
    return errorResponse(error, "Failed to record vote", "stream votes POST");
  }
}
