import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestIdentity } from "@/server/auth/identity";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseJsonBody } from "@/server/request";
import { updateProfile } from "@/server/services/users";

const schema = z.object({ username: z.string().optional() });
export async function PATCH(request: Request) {
  if (dataBackend() !== "postgres")
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = await parseJsonBody(request, schema);
    return NextResponse.json(
      await updateProfile(getDb(), await getRequestIdentity(), body.username),
    );
  } catch (error) {
    return errorResponse(error, "Failed to update profile", "users profile");
  }
}
