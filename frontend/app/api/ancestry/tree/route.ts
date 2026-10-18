import { type NextRequest, NextResponse } from "next/server";
import { ANONYMOUS, getRequestIdentity } from "@/server/auth/identity";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseJsonBody, parseSearchParams } from "@/server/request";
import {
  getBySlug,
  removeTree,
  saveTree,
  updateTree,
} from "@/server/services/ancestry";
import {
  ancestryCheckSchema,
  ancestryMutationSchema,
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
    const { slug } = parseSearchParams(
      request.nextUrl.searchParams,
      ancestryCheckSchema,
    );
    const tree = await getBySlug(getDb(), slug);
    return tree
      ? NextResponse.json(tree)
      : NextResponse.json(
          { error: "Not found", code: "not_found" },
          { status: 404 },
        );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load ancestry tree",
      "Failed to load ancestry tree",
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = await parseJsonBody(request, ancestryMutationSchema);
    const identity = await requestIdentity();
    if (input.operation === "remove")
      return NextResponse.json(
        await removeTree(getDb(), input as never, identity),
      );
    if (input.operation === "update")
      return NextResponse.json(
        await updateTree(getDb(), input as never, identity),
      );
    if (input.operation === "save" || input.operation === "saveAsNew")
      return NextResponse.json(
        await saveTree(
          getDb(),
          input as never,
          identity,
          input.operation === "saveAsNew",
        ),
      );
    return NextResponse.json(
      { error: "Invalid operation", code: "invalid_input" },
      { status: 400 },
    );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to save ancestry tree",
      "Failed to save ancestry tree",
    );
  }
}
