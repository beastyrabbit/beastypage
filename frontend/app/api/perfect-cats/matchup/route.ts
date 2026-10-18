import { NextResponse } from "next/server";
import { z } from "zod";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseJsonBody } from "@/server/request";
import { requestPerfectMatchup } from "@/server/services/games";
export const dynamic = "force-dynamic";
const schema = z.object({ clientId: z.string().max(128).optional() });
const notFound = () =>
  NextResponse.json({ error: "Not found", code: "not_found" }, { status: 404 });
export async function POST(request: Request) {
  if (dataBackend() !== "postgres") return notFound();
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
