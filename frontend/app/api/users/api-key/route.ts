import { NextResponse } from "next/server";
import { getRequestIdentity } from "@/server/auth/identity";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { regenerateApiKey } from "@/server/services/users";

export async function POST() {
  try {
    return NextResponse.json(
      await regenerateApiKey(getDb(), await getRequestIdentity()),
    );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to regenerate API key",
      "users api key",
    );
  }
}
