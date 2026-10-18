import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestIdentity } from "@/server/auth/identity";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseJsonBody, parseSearchParams } from "@/server/request";
import * as service from "@/server/services/userVariants";

const querySchema = z.object({ toolKey: z.string().optional() });

const bodySchema = z.object({
  operation: z.enum(["upsert", "remove", "rename", "setActive", "importBatch"]),
  toolKey: z.string(),
  variantId: z.string().optional(),
  name: z.string().optional(),
  slug: z.string().optional(),
  settings: z.unknown().optional(),
  isActive: z.boolean().optional(),
  variants: z
    .array(
      z.object({
        variantId: z.string(),
        name: z.string(),
        slug: z.string().optional(),
        settings: z.unknown(),
        isActive: z.boolean(),
        createdAt: z.number(),
        updatedAt: z.number(),
      }),
    )
    .optional(),
});

export async function GET(request: Request) {
  try {
    return NextResponse.json(
      await service.list(
        getDb(),
        await getRequestIdentity(),
        parseSearchParams(new URL(request.url).searchParams, querySchema)
          .toolKey,
      ),
    );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to list variants",
      "user variants list",
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request, bodySchema);
    const identity = await getRequestIdentity();
    const db = getDb();
    if (
      body.operation === "upsert" &&
      body.variantId &&
      body.name !== undefined &&
      body.settings !== undefined &&
      body.isActive !== undefined
    )
      return NextResponse.json(
        await service.upsert(db, identity, {
          toolKey: body.toolKey,
          variantId: body.variantId,
          name: body.name,
          slug: body.slug,
          settings: body.settings,
          isActive: body.isActive,
        }),
      );
    if (body.operation === "remove" && body.variantId)
      return NextResponse.json(
        await service.remove(db, identity, body.toolKey, body.variantId),
      );
    if (
      body.operation === "rename" &&
      body.variantId &&
      body.name !== undefined
    )
      return NextResponse.json(
        await service.rename(
          db,
          identity,
          body.toolKey,
          body.variantId,
          body.name,
        ),
      );
    if (body.operation === "setActive")
      return NextResponse.json(
        await service.setActive(db, identity, body.toolKey, body.variantId),
      );
    if (body.operation === "importBatch" && body.variants)
      return NextResponse.json(
        await service.importBatch(db, identity, body.toolKey, body.variants),
      );
    return NextResponse.json(
      { error: "Invalid request body", code: "invalid_input" },
      { status: 400 },
    );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to update variants",
      "user variants mutation",
    );
  }
}
