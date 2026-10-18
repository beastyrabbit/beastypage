import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestIdentity } from "@/server/auth/identity";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseJsonBody } from "@/server/request";
import { issueCatdexUploadUrl } from "@/server/services/catalog";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await parseJsonBody(
      request,
      z.object({ clientKey: z.string().optional() }).default({}),
    );
    const uploadUrl = await issueCatdexUploadUrl(
      getDb(),
      await getRequestIdentity(),
      body.clientKey,
    );
    return NextResponse.json({ uploadUrl });
  } catch (error) {
    return errorResponse(
      error,
      "Failed to create upload URL",
      "Failed to create Catdex upload URL",
    );
  }
}
