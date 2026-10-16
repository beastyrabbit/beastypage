import { NextResponse } from "next/server";
import { getRequestIdentity } from "@/server/auth/identity";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { resetSavedVariants } from "@/server/services/users";

export async function POST() {
  if (dataBackend() !== "postgres")
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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
