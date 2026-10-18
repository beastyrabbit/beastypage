import { type NextRequest, NextResponse } from "next/server";
import { getRequestIdentity } from "@/server/auth/identity";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { triggerCatStreamWheel } from "@/server/services/catStream";

export async function POST(_request: NextRequest) {
  try {
    return NextResponse.json(
      await triggerCatStreamWheel(getDb(), await getRequestIdentity()),
    );
  } catch (error) {
    return errorResponse(error, "Failed to spin wheel", "stream wheel POST");
  }
}
