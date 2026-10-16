import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestIdentity } from "@/server/auth/identity";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseJsonBody } from "@/server/request";
import { approveCatdex } from "@/server/services/catalog";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (dataBackend() !== "postgres") {
    return NextResponse.json(
      { error: "Not found", code: "not_found" },
      { status: 404 },
    );
  }
  try {
    const body = await parseJsonBody(
      request,
      z
        .object({ approved: z.boolean().default(true) })
        .default({ approved: true }),
    );
    const { id } = await context.params;
    return NextResponse.json(
      await approveCatdex(
        getDb(),
        id,
        await getRequestIdentity(),
        body.approved,
      ),
    );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to update Catdex approval",
      "Failed to update Catdex approval",
    );
  }
}
