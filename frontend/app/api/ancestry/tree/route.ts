import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getServerConvexUrl } from "@/lib/convexUrl";
import { ANONYMOUS, getRequestIdentity } from "@/server/auth/identity";
import { dataBackend } from "@/server/backend";
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
    if (dataBackend() === "postgres") {
      const tree = await getBySlug(getDb(), slug);
      return tree
        ? NextResponse.json(tree)
        : NextResponse.json(
            { error: "Not found", code: "not_found" },
            { status: 404 },
          );
    }
    const url = getServerConvexUrl();
    if (!url)
      return NextResponse.json(
        { error: "Convex URL not configured" },
        { status: 500 },
      );
    return NextResponse.json(
      await new ConvexHttpClient(url).query(api.ancestryTree.getBySlug, {
        slug,
      }),
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
    if (dataBackend() === "postgres") {
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
    }
    const url = getServerConvexUrl();
    if (!url)
      return NextResponse.json(
        { error: "Convex URL not configured" },
        { status: 500 },
      );
    const convex = new ConvexHttpClient(url);
    const { operation: _operation, ...args } = input;
    if (input.operation === "remove")
      return NextResponse.json(
        await convex.mutation(api.ancestryTree.remove, args as never),
      );
    if (input.operation === "update")
      return NextResponse.json(
        await convex.mutation(api.ancestryTree.update, args as never),
      );
    if (input.operation === "saveAsNew")
      return NextResponse.json(
        await convex.mutation(api.ancestryTree.saveAsNew, args as never),
      );
    return NextResponse.json(
      await convex.mutation(api.ancestryTree.save, args as never),
    );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to save ancestry tree",
      "Failed to save ancestry tree",
    );
  }
}
