import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseSearchParams } from "@/server/request";
import { getCatStreamSessionByApiKey } from "@/server/services/catStream";

const querySchema = z.object({ key: z.string().optional() });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { key } = parseSearchParams(
      request.nextUrl.searchParams,
      querySchema,
    );
    const result = key ? await getCatStreamSessionByApiKey(getDb(), key) : null;
    return result?.id === id
      ? NextResponse.json(result)
      : NextResponse.json(
          { error: "Not found", code: "not_found" },
          { status: 404 },
        );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load stream overlay",
      "cat stream id GET",
    );
  }
}
