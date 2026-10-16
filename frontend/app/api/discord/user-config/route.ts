import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isDiscordServiceRequest } from "@/convex/discordAuth";
import { discordConfig } from "@/lib/discord-service";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseJsonBody, parseSearchParams } from "@/server/request";
import {
  getUserConfig as getPostgresConfig,
  updateUserConfig as updatePostgresConfig,
} from "@/server/services/discord";

const querySchema = z.object({ discordUserId: z.string().min(1) });
const bodySchema = z.object({
  discordUserId: z.string().min(1),
  reset: z.boolean().optional(),
  addPalette: z.string().optional(),
  removePalette: z.string().optional(),
  accessoriesMin: z.number().optional(),
  accessoriesMax: z.number().optional(),
  scarsMin: z.number().optional(),
  scarsMax: z.number().optional(),
  tortiesMin: z.number().optional(),
  tortiesMax: z.number().optional(),
  darkForest: z.boolean().optional(),
  starclan: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  if (!isDiscordServiceRequest(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { discordUserId } = parseSearchParams(
      request.nextUrl.searchParams,
      querySchema,
    );
    if (dataBackend() === "postgres")
      return NextResponse.json(await getPostgresConfig(getDb(), discordUserId));
    return NextResponse.json(await discordConfig("get", { discordUserId }));
  } catch (error) {
    return errorResponse(
      error,
      "Config service unavailable",
      "discord config get",
    );
  }
}

function resolveConfigUpdate(body: Record<string, unknown>): {
  operation: string;
  fields: Record<string, unknown>;
} {
  const fields: Record<string, unknown> = { discordUserId: body.discordUserId };
  let operation = "upsert";
  if (body.reset === true) operation = "reset";
  else if (typeof body.addPalette === "string") {
    operation = "addPalette";
    fields.paletteId = body.addPalette;
  } else if (typeof body.removePalette === "string") {
    operation = "removePalette";
    fields.paletteId = body.removePalette;
  } else {
    for (const key of [
      "accessoriesMin",
      "accessoriesMax",
      "scarsMin",
      "scarsMax",
      "tortiesMin",
      "tortiesMax",
    ]) {
      if (typeof body[key] === "number") fields[key] = body[key];
    }
    for (const key of ["darkForest", "starclan"]) {
      if (typeof body[key] === "boolean") fields[key] = body[key];
    }
  }
  return { operation, fields };
}

export async function PATCH(request: NextRequest) {
  if (!isDiscordServiceRequest(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await parseJsonBody(request, bodySchema);
    const bodyRecord = body as Record<string, unknown>;
    const { operation, fields } = resolveConfigUpdate(bodyRecord);
    if (dataBackend() === "postgres") {
      await updatePostgresConfig(getDb(), operation, fields);
      return NextResponse.json({ ok: true, action: operation });
    }
    await discordConfig(operation, fields);
    return NextResponse.json({ ok: true, action: operation });
  } catch (error) {
    return errorResponse(
      error,
      "Config update failed",
      "discord config update",
    );
  }
}
