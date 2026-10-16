import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getServerConvexUrl } from "@/lib/convexUrl";
import { ANONYMOUS, getRequestIdentity } from "@/server/auth/identity";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import {
  getBySlug,
  removeTree,
  saveTree,
  updateTree,
} from "@/server/services/ancestry";

async function body(request: NextRequest) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function requestIdentity() {
  try {
    return await getRequestIdentity();
  } catch {
    return ANONYMOUS;
  }
}

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug)
    return NextResponse.json(
      { error: "Missing slug", code: "invalid_input" },
      { status: 400 },
    );
  if (dataBackend() === "postgres") {
    try {
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
  const url = getServerConvexUrl();
  if (!url)
    return NextResponse.json(
      { error: "Convex URL not configured" },
      { status: 500 },
    );
  try {
    return NextResponse.json(
      await new ConvexHttpClient(url).query(api.ancestryTree.getBySlug, {
        slug,
      }),
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to load ancestry tree" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const input = await body(request);
  if (!input || typeof input.operation !== "string")
    return NextResponse.json(
      { error: "Invalid JSON body", code: "invalid_input" },
      { status: 400 },
    );
  if (dataBackend() === "postgres") {
    try {
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
  const url = getServerConvexUrl();
  if (!url)
    return NextResponse.json(
      { error: "Convex URL not configured" },
      { status: 500 },
    );
  const convex = new ConvexHttpClient(url);
  try {
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
  } catch {
    return NextResponse.json(
      { error: "Failed to save ancestry tree" },
      { status: 500 },
    );
  }
}
