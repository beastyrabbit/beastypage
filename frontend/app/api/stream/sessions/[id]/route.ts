import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestIdentity } from "@/server/auth/identity";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseSearchParams } from "@/server/request";
import {
  getStreamSession,
  getStreamSessionByLink,
} from "@/server/services/stream";

function unavailable() {
  return NextResponse.json(
    { error: "Not found", code: "not_found" },
    { status: 404 },
  );
}
const querySchema = z.object({ host: z.literal("1").optional() });
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const identity = await getRequestIdentity();
    const { host: hostFlag } = parseSearchParams(
      request.nextUrl.searchParams,
      querySchema,
    );
    const host = hostFlag === "1";
    const result = host
      ? await getStreamSessionByLink(getDb(), id, identity)
      : await getStreamSession(getDb(), id);
    return result
      ? NextResponse.json(result)
      : NextResponse.json(
          { error: "Not found", code: "not_found" },
          { status: 404 },
        );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load stream session",
      "stream session GET",
    );
  }
}
