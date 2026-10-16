/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { readDatabaseConfig } from "../db/config";
import { createDatabase, createPool, type Database } from "../db/pool";
import { coinflipLeaderboard, submitCoinflipScore } from "./games";

const modules = import.meta.glob("../../convex/**/*.ts");
let pool: import("pg").Pool;
let db: Database;

beforeAll(() => {
  pool = createPool(
    readDatabaseConfig("app", { DATABASE_URL: inject("databaseUrl") }),
  );
  db = createDatabase(pool);
});
afterAll(async () => pool.end());

describe("games Convex/PostgreSQL parity", () => {
  it("matches score normalization and validation", async () => {
    const convex = convexTest(schema, modules);
    await expect(
      convex.mutation(api.coinflipper.submitScore, {
        name: "  Alice  ",
        score: 4.9,
      }),
    ).resolves.toMatchObject({ name: "Alice", score: 4 });
    await expect(
      submitCoinflipScore(db, { name: "  Alice  ", score: 4.9 }),
    ).resolves.toMatchObject({ name: "Alice", score: 4 });
    await expect(
      convex.mutation(api.coinflipper.submitScore, { name: " ", score: 2 }),
    ).rejects.toThrow("Name must be provided");
    await expect(
      submitCoinflipScore(db, { name: " ", score: 2 }),
    ).rejects.toMatchObject({
      code: "invalid_input",
      message: "Name must be provided",
    });
  });

  it("keeps bounded leaderboard limits on both backends", async () => {
    const convex = convexTest(schema, modules);
    await convex.mutation(api.coinflipper.submitScore, { name: "A", score: 3 });
    await submitCoinflipScore(db, { name: `PG-${Date.now()}`, score: 3 });
    const convexRows = await convex.query(api.coinflipper.leaderboard, {
      limit: 1,
    });
    const postgresRows = await coinflipLeaderboard(db, 1);
    expect(convexRows).toHaveLength(1);
    expect(postgresRows).toHaveLength(1);
  });
});
