import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { closeDatabase } from "@/server/db/client";

const env = { ...process.env };
let route: typeof import("./route");

beforeAll(async () => {
  process.env.DATA_BACKEND = "postgres";
  process.env.DATABASE_URL = inject("databaseUrl");
  process.env.DISCORD_API_TOKEN = "fixture-discord-service-token-1234567890";
  route = await import("./route");
});

afterAll(async () => {
  await closeDatabase();
  process.env = env;
});

const headers = {
  authorization: `Bearer fixture-discord-service-token-1234567890`,
};

describe("Discord user config route", () => {
  it("denies requests without the service token", async () => {
    const response = await route.GET(
      new NextRequest(
        "http://localhost/api/discord/user-config?discordUserId=denied",
      ),
    );
    expect(response.status).toBe(401);
  });

  it("rejects a configured service token shorter than Convex's minimum", async () => {
    process.env.DISCORD_API_TOKEN = "short-token";
    const response = await route.GET(
      new NextRequest(
        "http://localhost/api/discord/user-config?discordUserId=short",
        { headers: { authorization: "Bearer short-token" } },
      ),
    );
    expect(response.status).toBe(401);
    process.env.DISCORD_API_TOKEN = "fixture-discord-service-token-1234567890";
  });

  it("keeps the bot contract for get and patch", async () => {
    const id = `fixture-${crypto.randomUUID()}`;
    const get = await route.GET(
      new NextRequest(
        `http://localhost/api/discord/user-config?discordUserId=${id}`,
        { headers },
      ),
    );
    expect(get.status).toBe(200);
    expect(await get.json()).toMatchObject({
      discordUserId: id,
      darkForest: false,
      palettes: [],
    });
    const patch = await route.PATCH(
      new NextRequest("http://localhost/api/discord/user-config", {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ discordUserId: id, darkForest: true }),
      }),
    );
    expect(patch.status).toBe(200);
    const updated = await route.GET(
      new NextRequest(
        `http://localhost/api/discord/user-config?discordUserId=${id}`,
        { headers },
      ),
    );
    expect(await updated.json()).toMatchObject({
      discordUserId: id,
      darkForest: true,
    });
  });
});
