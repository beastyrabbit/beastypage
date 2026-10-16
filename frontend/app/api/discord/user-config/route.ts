import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { isDiscordServiceRequest } from "@/convex/discordAuth";
import { discordConfig } from "@/lib/discord-service";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import {
  getUserConfig as getPostgresConfig,
  updateUserConfig as updatePostgresConfig,
} from "@/server/services/discord";

function postgresDiscordServiceRequest(request: Request): boolean {
  const token = process.env.DISCORD_API_TOKEN ?? "";
  const actual = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${token}`;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return Boolean(token) && a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (
    !(dataBackend() === "postgres"
      ? postgresDiscordServiceRequest(request)
      : isDiscordServiceRequest(request))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const discordUserId = request.nextUrl.searchParams.get("discordUserId");
  if (!discordUserId)
    return NextResponse.json(
      { error: "Missing discordUserId" },
      { status: 400 },
    );
  try {
    if (dataBackend() === "postgres")
      return NextResponse.json(await getPostgresConfig(getDb(), discordUserId));
    return NextResponse.json(await discordConfig("get", { discordUserId }));
  } catch {
    return NextResponse.json(
      { error: "Config service unavailable" },
      { status: 503 },
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
  if (
    !(dataBackend() === "postgres"
      ? postgresDiscordServiceRequest(request)
      : isDiscordServiceRequest(request))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
    if (!body || typeof body.discordUserId !== "string")
      throw new Error("Invalid body");
  } catch {
    return NextResponse.json(
      { error: "Invalid config request" },
      { status: 400 },
    );
  }
  const { operation, fields } = resolveConfigUpdate(body);
  try {
    if (dataBackend() === "postgres") {
      await updatePostgresConfig(getDb(), operation, fields);
      return NextResponse.json({ ok: true, action: operation });
    }
    await discordConfig(operation, fields);
    return NextResponse.json({ ok: true, action: operation });
  } catch {
    return NextResponse.json(
      { error: "Config update failed" },
      { status: 503 },
    );
  }
}

/** Compatibility endpoint for the former Convex HTTP handler. */
export async function POST(request: NextRequest) {
  if (
    !(dataBackend() === "postgres"
      ? postgresDiscordServiceRequest(request)
      : isDiscordServiceRequest(request))
  )
    return new Response("Unauthorized", { status: 401 });
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const operation = typeof body.operation === "string" ? body.operation : "";
    const args = { ...body };
    delete args.operation;
    if (
      !["get", "upsert", "reset", "addPalette", "removePalette"].includes(
        operation,
      )
    )
      return new Response("Unknown operation", { status: 400 });
    if (dataBackend() === "postgres") {
      if (operation === "get" && typeof args.discordUserId === "string")
        return NextResponse.json(
          await getPostgresConfig(getDb(), args.discordUserId),
          { headers: { "cache-control": "no-store" } },
        );
      await updatePostgresConfig(getDb(), operation, args);
      return NextResponse.json(null, {
        headers: { "cache-control": "no-store" },
      });
    }
    return NextResponse.json(await discordConfig(operation, args), {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return new Response("Invalid config request", { status: 400 });
  }
}
