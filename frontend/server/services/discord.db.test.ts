import type pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { readDatabaseConfig } from "../db/config";
import { createDatabase, createPool, type Database } from "../db/pool";
import {
  getUserConfig,
  issueChallenge,
  redeemChallenge,
  updateUserConfig,
} from "./discord";

let pool: pg.Pool;
let db: Database;

beforeAll(() => {
  process.env.DISCORD_INVITE_SECRET = "https://discord.gg/concurrency";
  pool = createPool(
    readDatabaseConfig("app", { DATABASE_URL: inject("databaseUrl") }),
  );
  db = createDatabase(pool);
});
afterAll(async () => pool.end());

function answer(prompt: string) {
  const [left, right] = prompt.split("+").map((value) => Number(value.trim()));
  return String((left ?? 0) + (right ?? 0));
}

describe("Discord PostgreSQL concurrency", () => {
  it("redeems a challenge only once under concurrent answers", async () => {
    const challenge = await issueChallenge(db);
    const outcomes = await Promise.all(
      Array.from({ length: 4 }, () =>
        redeemChallenge(db, challenge.token, answer(challenge.prompt)),
      ),
    );
    expect(
      outcomes.filter((outcome) => outcome.status === "success"),
    ).toHaveLength(1);
  });

  it("keeps every concurrent palette change for one user", async () => {
    const discordUserId = `concurrency-${Date.now()}`;
    const paletteIds = ["p1", "p2", "p3", "p4"];
    await Promise.all(
      paletteIds.map((paletteId) =>
        updateUserConfig(db, "addPalette", { discordUserId, paletteId }),
      ),
    );
    const config = await getUserConfig(db, discordUserId);
    expect([...config.palettes].sort()).toEqual(paletteIds);
  });
});
