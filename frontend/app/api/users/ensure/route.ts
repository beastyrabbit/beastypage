import { NextResponse } from "next/server";
import { getRequestIdentity } from "@/server/auth/identity";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { getOrCreateUser } from "@/server/services/users";

export async function POST() {
  try {
    return NextResponse.json(
      await getOrCreateUser(getDb(), await getRequestIdentity()),
    );
  } catch (error) {
    return errorResponse(error, "Failed to create user", "users ensure");
  }
}
