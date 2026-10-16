import { NextResponse } from "next/server";
import { z } from "zod";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseJsonBody } from "@/server/request";
import { issueChallenge, redeemChallenge } from "@/server/services/discord";

const bodySchema = z.union([
  z.object({ token: z.string(), answer: z.string() }),
  z.object({}).strict(),
]);

export async function POST(request: Request) {
  if (dataBackend() !== "postgres")
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = await parseJsonBody(request, bodySchema);
    if ("token" in body)
      return NextResponse.json(
        await redeemChallenge(getDb(), body.token, body.answer),
      );
    return NextResponse.json(await issueChallenge(getDb()));
  } catch (error) {
    return errorResponse(
      error,
      "Failed to process challenge",
      "discord challenge",
    );
  }
}
