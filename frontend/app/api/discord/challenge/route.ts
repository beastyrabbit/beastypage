import { NextResponse } from "next/server";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { issueChallenge, redeemChallenge } from "@/server/services/discord";

export async function POST(request: Request) {
  if (dataBackend() !== "postgres")
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = await request.json().catch(() => ({}));
    if (
      body &&
      typeof body.token === "string" &&
      typeof body.answer === "string"
    )
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
