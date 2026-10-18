import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { closeDatabase } from "@/server/db/client";

const env = { ...process.env };
let route: typeof import("./route");

beforeAll(async () => {
  process.env.DATABASE_URL = inject("databaseUrl");
  process.env.DISCORD_INVITE_SECRET = "https://discord.gg/routes";
  route = await import("./route");
});

afterAll(async () => {
  await closeDatabase();
  process.env = env;
});

function post(body: unknown) {
  return route.POST(
    new NextRequest("http://localhost/api/discord/challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("Discord challenge route", () => {
  it("issues a challenge", async () => {
    const response = await post({});
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      token: expect.any(String),
      prompt: expect.stringMatching(/^\d+ \+ \d+$/),
      expiresAt: expect.any(Number),
    });
  });

  it("rejects malformed challenge requests", async () => {
    const response = await post({ token: 123, answer: true });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_input" });
  });
});
