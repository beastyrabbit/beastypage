import { NextResponse } from "next/server";
import { getRequestIdentity } from "@/server/auth/identity";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { resetSavedVariants } from "@/server/services/users";

export async function POST() {
  try {
    return NextResponse.json(
      await resetSavedVariants(getDb(), await getRequestIdentity()),
    );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to reset variants",
      "users reset variants",
    );
  }
}
