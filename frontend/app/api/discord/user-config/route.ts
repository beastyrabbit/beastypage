import { type NextRequest, NextResponse } from "next/server";
import { isDiscordServiceRequest } from "@/convex/discordAuth";
import { discordConfig } from "@/lib/discord-service";

export async function GET(request: NextRequest) {
  if (!isDiscordServiceRequest(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const discordUserId = request.nextUrl.searchParams.get("discordUserId");
  if (!discordUserId)
    return NextResponse.json(
      { error: "Missing discordUserId" },
      { status: 400 },
    );
  try {
    return NextResponse.json(await discordConfig("get", { discordUserId }));
  } catch {
    return NextResponse.json(
      { error: "Config service unavailable" },
      { status: 503 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!isDiscordServiceRequest(request))
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
  try {
    await discordConfig(operation, fields);
    return NextResponse.json({ ok: true, action: operation });
  } catch {
    return NextResponse.json(
      { error: "Config update failed" },
      { status: 503 },
    );
  }
}
