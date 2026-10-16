import { NextResponse } from "next/server";
import { getRequestIdentity } from "@/server/auth/identity";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { viewer } from "@/server/services/users";

export async function GET() {
  if (dataBackend() !== "postgres")
    return NextResponse.json(null, { status: 404 });
  try {
    return NextResponse.json(await viewer(getDb(), await getRequestIdentity()));
  } catch (error) {
    return errorResponse(error, "Failed to load user", "users viewer");
  }
}
