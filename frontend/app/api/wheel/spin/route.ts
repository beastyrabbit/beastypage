import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestIdentity } from "@/server/auth/identity";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseJsonBody } from "@/server/request";
import { logWheelSpin } from "@/server/services/games";
export const dynamic = "force-dynamic";
const schema = z.object({
  prizeName: z.string(),
  forced: z.boolean(),
  randomBucket: z.number().optional(),
  clientKey: z.string().optional(),
});
export async function POST(request: Request) {
  if (dataBackend() !== "postgres")
    return NextResponse.json(
      { error: "Not found", code: "not_found" },
      { status: 404 },
    );
  try {
    const identity = await getRequestIdentity();
    await logWheelSpin(
      getDb(),
      await parseJsonBody(request, schema),
      identity.tokenIdentifier,
    );
    return NextResponse.json(null);
  } catch (error) {
    return errorResponse(error, "Failed to log wheel spin", "wheel spin");
  }
}
