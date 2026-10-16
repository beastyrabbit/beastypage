/// <reference types="vite/client" />

import { randomUUID } from "node:crypto";
import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { readDatabaseConfig } from "../db/config";
import { createDatabase, createPool, type Database } from "../db/pool";
import { perfectCats, perfectMatchups, wheelSpins } from "../db/schema";
import {
  cleanupPerfectMatchups,
  coinflipLeaderboard,
  coinflipScores,
  logWheelSpin,
  registerPerfectCats,
  requestPerfectMatchup,
  submitCoinflipScore,
  submitPerfectVote,
  wheelStats,
} from "./games";

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

  it("matches perfect-cat matchup consumption, ratings, stale tokens and limits", async () => {
    const convex = convexTest(schema, modules);
    const unique = randomUUID();
    const params = [
      { params: { params: {}, name: `parity-a-${unique}` } },
      { params: { params: {}, name: `parity-b-${unique}` } },
    ];
    const cvxCats = await convex.mutation(api.perfectCats.registerCats, {
      cats: params,
    });
    const pgCats = await registerPerfectCats(db, params);
    expect(cvxCats).toHaveLength(2);
    expect(pgCats).toHaveLength(2);
    const clientId = `parity-client-${Date.now()}`;
    const cvx = await convex.mutation(api.perfectCats.requestMatchup, {
      clientId,
    });
    const pg = await requestPerfectMatchup(db, clientId);
    const cvxWinner = cvx.cats[0];
    const cvxLoser = cvx.cats[1];
    const pgWinner = pg.cats[0];
    const pgLoser = pg.cats[1];
    if (
      !cvxWinner ||
      !cvxLoser ||
      !cvx.matchupToken ||
      !pgWinner ||
      !pgLoser ||
      !pg.matchupToken
    )
      throw new Error("complete matchup expected");
    const cvxVote = await convex.mutation(api.perfectCats.submitVote, {
      clientId,
      winnerId: cvxWinner.id,
      loserId: cvxLoser.id,
      matchupToken: cvx.matchupToken,
    });
    const pgVote = await submitPerfectVote(db, {
      clientId,
      winnerId: pgWinner.id,
      loserId: pgLoser.id,
      matchupToken: pg.matchupToken,
    });
    const expectedWinner = (rating: number, loserRating: number) =>
      rating + 24 * (1 - 1 / (1 + 10 ** ((loserRating - rating) / 400)));
    const expectedLoser = (rating: number, winnerRating: number) =>
      rating + 24 * (0 - 1 / (1 + 10 ** ((winnerRating - rating) / 400)));
    expect(cvxVote.winner.rating).toBeCloseTo(
      expectedWinner(cvxWinner.rating, cvxLoser.rating),
      8,
    );
    expect(cvxVote.loser.rating).toBeCloseTo(
      expectedLoser(cvxLoser.rating, cvxWinner.rating),
      8,
    );
    expect(pgVote.winner.rating).toBeCloseTo(
      expectedWinner(pgWinner.rating, pgLoser.rating),
      8,
    );
    expect(pgVote.loser.rating).toBeCloseTo(
      expectedLoser(pgLoser.rating, pgWinner.rating),
      8,
    );
    await expect(
      convex.mutation(api.perfectCats.submitVote, {
        clientId,
        winnerId: cvxWinner.id,
        loserId: cvxLoser.id,
        matchupToken: cvx.matchupToken,
      }),
    ).rejects.toThrow("current unused matchup");
    await expect(
      submitPerfectVote(db, {
        clientId,
        winnerId: pgWinner.id,
        loserId: pgLoser.id,
        matchupToken: pg.matchupToken,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      convex.mutation(api.perfectCats.registerCats, { cats: [] }),
    ).rejects.toThrow("Register between 1 and 32 cats");
    await expect(registerPerfectCats(db, [])).rejects.toMatchObject({
      code: "invalid_input",
    });
  });

  it("matches coinflip limits and wheel validation/rate limiting", async () => {
    const convex = convexTest(schema, modules);
    await expect(
      convex.mutation(api.coinflipper.submitScore, { name: " ", score: 1 }),
    ).rejects.toThrow("Name must be provided");
    await expect(
      submitCoinflipScore(db, { name: " ", score: 1 }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      convex.mutation(api.coinflipper.submitScore, { name: "bad", score: 0 }),
    ).rejects.toThrow("Score must be greater than zero");
    await expect(
      submitCoinflipScore(db, { name: "bad", score: 0 }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      convex.mutation(api.coinflipper.submitScore, { name: "A", score: 3.9 }),
    ).resolves.toMatchObject({ score: 3 });
    await expect(
      submitCoinflipScore(db, { name: "A", score: 3.9 }),
    ).resolves.toMatchObject({ score: 3 });
    expect(
      await convex.query(api.coinflipper.listScores, { limit: 1 }),
    ).toHaveLength(1);
    expect(await coinflipScores(db, 1)).toHaveLength(1);
    expect(await coinflipLeaderboard(db, 1)).toHaveLength(1);
    await expect(
      convex.mutation(api.wheel.logSpin, {
        prizeName: "Singularity",
        forced: false,
        randomBucket: 0,
      }),
    ).rejects.toThrow("Prize does not match random bucket");
    await expect(
      logWheelSpin(db, {
        prizeName: "Singularity",
        forced: false,
        randomBucket: 0,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    const actor = `parity-wheel-${Date.now()}-abcdefghijkl`;
    for (let index = 0; index < 30; index += 1) {
      await convex.mutation(api.wheel.logSpin, {
        prizeName: "Moondust",
        forced: false,
        randomBucket: 0,
        clientKey: actor,
      });
      await logWheelSpin(db, {
        prizeName: "Moondust",
        forced: false,
        randomBucket: 0,
        clientKey: `${actor}x`,
      });
    }
    await expect(
      convex.mutation(api.wheel.logSpin, {
        prizeName: "Moondust",
        forced: false,
        randomBucket: 0,
        clientKey: actor,
      }),
    ).rejects.toThrow("rate limit");
    await expect(
      logWheelSpin(db, {
        prizeName: "Moondust",
        forced: false,
        randomBucket: 0,
        clientKey: `${actor}x`,
      }),
    ).rejects.toMatchObject({ code: "rate_limited" });
    expect(await convex.query(api.wheel.stats, { limit: 2 })).toMatchObject({
      sampleSize: 2,
    });
    expect(await wheelStats(db, 2)).toMatchObject({ sampleSize: 2 });
  });

  it("uses Convex's forcedCount wheel field", async () => {
    const now = Date.now() + 60_000;
    const convex = convexTest(schema, modules);
    await convex.run((ctx) =>
      ctx.db.insert("wheel_spins", {
        prizeName: "Moondust",
        forced: true,
        actorKey: `forced-${now}`,
        createdAt: now,
      }),
    );
    await db.insert(wheelSpins).values({
      prizeName: "Moondust",
      forced: true,
      actorKey: `forced-${now}`,
      createdAt: new Date(now),
    });
    const convexStats = await convex.query(api.wheel.stats, { limit: 1 });
    const postgresStats = await wheelStats(db, 1);
    expect(convexStats.prizes[0]).toHaveProperty("forcedCount", 1);
    expect(postgresStats.prizes[0]).toHaveProperty("forcedCount", 1);
    expect(postgresStats.prizes[0]).not.toHaveProperty("forced");
  });

  it("matches bounded expiry cleanup and idempotency", async () => {
    const convex = convexTest(schema, modules);
    const now = Date.now();
    await convex.run(async (ctx) => {
      const [a, b] = await Promise.all([
        ctx.db.insert("perfect_cats", {
          hash: `cvx-clean-${now}-a`,
          params: { params: {} },
          rating: 1500,
          wins: 0,
          losses: 0,
          appearances: 0,
          createdAt: now,
          updatedAt: now,
        }),
        ctx.db.insert("perfect_cats", {
          hash: `cvx-clean-${now}-b`,
          params: { params: {} },
          rating: 1500,
          wins: 0,
          losses: 0,
          appearances: 0,
          createdAt: now,
          updatedAt: now,
        }),
      ]);
      for (let i = 0; i < 2; i += 1)
        await ctx.db.insert("perfect_matchups", {
          clientId: `cvx-clean-${now}-${i}`,
          catAId: a,
          catBId: b,
          token: `cvx-clean-token-${now}-${i}`,
          createdAt: now - 2_000,
          expiresAt: now - 1_000,
          consumed: false,
        });
    });
    const [a, b] = await db
      .insert(perfectCats)
      .values([
        {
          hash: `pg-clean-${now}-a`,
          params: { params: {} },
          rating: 1500,
          wins: 0,
          losses: 0,
          appearances: 0,
        },
        {
          hash: `pg-clean-${now}-b`,
          params: { params: {} },
          rating: 1500,
          wins: 0,
          losses: 0,
          appearances: 0,
        },
      ])
      .returning();
    await db.insert(perfectMatchups).values([
      {
        clientId: `pg-clean-${now}-expired`,
        catAId: a.id,
        catBId: b.id,
        token: `pg-clean-token-${now}-expired`,
        expiresAt: new Date(now - 1_000),
        consumed: false,
      },
      {
        clientId: `pg-clean-${now}-fresh`,
        catAId: a.id,
        catBId: b.id,
        token: `pg-clean-token-${now}-fresh`,
        expiresAt: new Date(now + 60_000),
        consumed: false,
      },
    ]);
    await expect(
      convex.mutation(internal.perfectCats.cleanupExpiredMatchups, {}),
    ).resolves.toMatchObject({ deleted: 2 });
    await expect(cleanupPerfectMatchups(db)).resolves.toEqual({ deleted: 1 });
    await expect(cleanupPerfectMatchups(db)).resolves.toEqual({ deleted: 0 });
  });
});
