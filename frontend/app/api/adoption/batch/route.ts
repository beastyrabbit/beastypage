import { type NextRequest, NextResponse } from "next/server";
import { ANONYMOUS, getRequestIdentity } from "@/server/auth/identity";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseJsonBody, parseSearchParams } from "@/server/request";
import {
  createBatch,
  getBatch,
  updateBatchMeta,
} from "@/server/services/adoption";
import {
  adoptionCreateSchema,
  adoptionUpdateSchema,
  slugOrIdQuerySchema,
} from "@/server/services/cat-validation";

async function requestIdentity() {
  try {
    return await getRequestIdentity();
  } catch {
    return ANONYMOUS;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { slugOrId } = parseSearchParams(
      request.nextUrl.searchParams,
      slugOrIdQuerySchema,
    );
    const result = await getBatch(getDb(), slugOrId);
    return result
      ? NextResponse.json(result)
      : NextResponse.json(
          { error: "Not found", code: "not_found" },
          { status: 404 },
        );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load adoption batch",
      "Failed to load adoption batch",
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await parseJsonBody(request, adoptionCreateSchema);
    return NextResponse.json(
      await createBatch(
        getDb(),
        {
          cats: body.cats as never,
          title: body.title,
          creatorName: body.creatorName,
          settings: body.settings,
        },
        await requestIdentity(),
      ),
    );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to create adoption batch",
      "Failed to create adoption batch",
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await parseJsonBody(request, adoptionUpdateSchema);
    return NextResponse.json(
      await updateBatchMeta(
        getDb(),
        {
          id: body.id,
          editToken: body.editToken,
          title: body.title,
          creatorName: body.creatorName,
        },
        await requestIdentity(),
      ),
    );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to update adoption batch",
      "Failed to update adoption batch",
    );
  }
}
