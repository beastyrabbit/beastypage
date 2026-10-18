import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseJsonBody, parseSearchParams } from "@/server/request";
import {
  createCatdex,
  listCatdex,
  listCatdexLegacy,
} from "@/server/services/catalog";

export const dynamic = "force-dynamic";

const cardSchema = z.object({
  storageId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  uploadToken: z.string().optional(),
});

const createSchema = z.object({
  twitchUserName: z.string().min(1).max(200),
  catName: z.string().min(1).max(200),
  seasonId: z.string().uuid(),
  rarityId: z.string().uuid(),
  cardNumber: z.string().max(100).optional(),
  defaultCard: cardSchema,
  customCard: cardSchema.optional(),
});

function notFound() {
  return NextResponse.json(
    { error: "Not found", code: "not_found" },
    { status: 404 },
  );
}

export async function GET(request: NextRequest) {
  if (dataBackend() !== "postgres") return notFound();
  try {
    const params = parseSearchParams(
      request.nextUrl.searchParams,
      z.object({
        cursor: z.string().optional(),
        pageSize: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().positive().optional(),
        approved: z.enum(["true", "false"]).optional(),
      }),
    );
    if (params.limit !== undefined && params.cursor === undefined) {
      return NextResponse.json(await listCatdexLegacy(getDb(), params.limit));
    }
    const result = await listCatdex(getDb(), {
      cursor: params.cursor,
      pageSize: params.pageSize,
      approved:
        params.approved === undefined ? true : params.approved === "true",
    });
    return NextResponse.json({
      page: result.page,
      results: result.page,
      nextCursor: result.nextCursor,
      continueCursor: result.nextCursor,
      isDone: result.isDone,
    });
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load Catdex",
      "Failed to load Catdex",
    );
  }
}

export async function POST(request: NextRequest) {
  if (dataBackend() !== "postgres") return notFound();
  try {
    const body = await parseJsonBody(request, createSchema);
    return NextResponse.json(await createCatdex(getDb(), body));
  } catch (error) {
    return errorResponse(
      error,
      "Failed to create Catdex record",
      "Failed to create Catdex record",
    );
  }
}
