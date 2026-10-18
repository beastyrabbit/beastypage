import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { closeDatabase, getDb } from "@/server/db/client";
import { cardSeason, rarity } from "@/server/db/schema";

const originalEnv = { ...process.env };
let seasonsRoute: typeof import("./seasons/route");
let raritiesRoute: typeof import("./rarities/route");
let catdexRoute: typeof import("./catdex/route");
let collectionRoute: typeof import("./collection/route");

beforeAll(async () => {
  process.env.DATA_BACKEND = "postgres";
  process.env.DATABASE_URL = inject("databaseUrl");
  seasonsRoute = await import("./seasons/route");
  raritiesRoute = await import("./rarities/route");
  catdexRoute = await import("./catdex/route");
  collectionRoute = await import("./collection/route");
  const db = getDb();
  const now = new Date();
  await db
    .insert(cardSeason)
    .values({ seasonName: "Route season", createdAt: now, updatedAt: now });
  await db.insert(rarity).values({
    rarityName: "Route rarity",
    stars: 1,
    chancePercent: 100,
    createdAt: now,
    updatedAt: now,
  });
});

afterAll(async () => {
  await closeDatabase();
  process.env = originalEnv;
});

describe("catalog routes on PostgreSQL", () => {
  it("serves seasons, rarities, and bounded catalog pages", async () => {
    expect((await seasonsRoute.GET()).status).toBe(200);
    expect((await raritiesRoute.GET()).status).toBe(200);
    const response = await catdexRoute.GET(
      new NextRequest("http://localhost/api/catdex?pageSize=48"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      isDone: true,
      results: expect.any(Array),
    });
    const collectionResponse = await collectionRoute.GET(
      new NextRequest("http://localhost/api/collection?pageSize=36"),
    );
    expect(collectionResponse.status).toBe(200);
    expect(await collectionResponse.json()).toMatchObject({
      isDone: true,
      results: expect.any(Array),
    });
  });
});
