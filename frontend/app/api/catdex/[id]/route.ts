import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestIdentity } from "@/server/auth/identity";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseJsonBody } from "@/server/request";
import { editCatdex, getCatdexByLink } from "@/server/services/catalog";

export const dynamic = "force-dynamic";

const editSchema = z.object({
  twitchUserName: z.string().min(1).max(200).optional(),
  catName: z.string().min(1).max(200).optional(),
  cardNumber: z.string().max(100).optional(),
  seasonId: z.string().min(1).optional(),
  rarityId: z.string().min(1).optional(),
});

function notFound() {
  return NextResponse.json(
    { error: "Not found", code: "not_found" },
    { status: 404 },
  );
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (dataBackend() !== "postgres") return notFound();
  try {
    const { id } = await context.params;
    const result = await getCatdexByLink(getDb(), id);
    return result ? NextResponse.json(result) : notFound();
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load Catdex record",
      "Failed to load Catdex record",
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (dataBackend() !== "postgres") return notFound();
  try {
    const { id } = await context.params;
    const body = await parseJsonBody(request, editSchema);
    return NextResponse.json(
      await editCatdex(getDb(), id, body, await getRequestIdentity()),
    );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to edit Catdex record",
      "Failed to edit Catdex record",
    );
  }
}
