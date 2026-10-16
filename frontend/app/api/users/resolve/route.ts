import { NextResponse } from "next/server";
import { getRequestIdentity } from "@/server/auth/identity";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { resolveUsernames } from "@/server/services/users";

export async function GET(request: Request) {
  if (dataBackend() !== "postgres")
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const ids = new URL(request.url).searchParams.getAll("userId");
    return NextResponse.json(
      await resolveUsernames(getDb(), await getRequestIdentity(), ids),
    );
  } catch (error) {
    return errorResponse(error, "Failed to resolve users", "users resolve");
  }
}
