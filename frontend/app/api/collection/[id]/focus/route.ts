import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestIdentity } from "@/server/auth/identity";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseJsonBody } from "@/server/request";
import { setCollectionFocus } from "@/server/services/catalog";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const body = await parseJsonBody(
      request,
      z.object({ focusX: z.number(), focusY: z.number() }),
    );
    const { id } = await context.params;
    return NextResponse.json(
      await setCollectionFocus(
        getDb(),
        id,
        body.focusX,
        body.focusY,
        await getRequestIdentity(),
      ),
    );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to update collection focus",
      "Failed to update collection focus",
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return POST(request, context);
}
