import { NextResponse } from "next/server";
import { z } from "zod";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseJsonBody } from "@/server/request";
import { submitCoinflipScore } from "@/server/services/games";

const schema = z.object({ name: z.string().max(12), score: z.number() });
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (dataBackend() !== "postgres")
    return NextResponse.json(
      { error: "Not found", code: "not_found" },
      { status: 404 },
    );
  try {
    return NextResponse.json(
      await submitCoinflipScore(getDb(), await parseJsonBody(request, schema)),
    );
  } catch (error) {
    return errorResponse(error, "Failed to submit score", "coinflip score");
  }
}
