import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestIdentity } from "@/server/auth/identity";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseSearchParams } from "@/server/request";
import { searchByUsername } from "@/server/services/users";

const querySchema = z.object({ prefix: z.string().default("") });

export async function GET(request: Request) {
  try {
    return NextResponse.json(
      await searchByUsername(
        getDb(),
        await getRequestIdentity(),
        parseSearchParams(new URL(request.url).searchParams, querySchema)
          .prefix,
      ),
    );
  } catch (error) {
    return errorResponse(error, "Failed to search users", "users search");
  }
}
