import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestIdentity } from "@/server/auth/identity";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseSearchParams } from "@/server/request";
import { resolveUsernames } from "@/server/services/users";

const querySchema = z.object({
  userId: z.union([z.string(), z.array(z.string())]).optional(),
});

export async function GET(request: Request) {
  if (dataBackend() !== "postgres")
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const parsed = parseSearchParams(
      new URL(request.url).searchParams,
      querySchema,
    );
    let ids: string[] = [];
    if (parsed.userId) {
      ids = Array.isArray(parsed.userId) ? parsed.userId : [parsed.userId];
    }
    return NextResponse.json(
      await resolveUsernames(getDb(), await getRequestIdentity(), ids),
    );
  } catch (error) {
    return errorResponse(error, "Failed to resolve users", "users resolve");
  }
}
