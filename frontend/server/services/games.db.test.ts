import type pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { readDatabaseConfig } from "../db/config";
import { createDatabase, createPool, type Database } from "../db/pool";
import { perfectCats, perfectVotes, wheelSpins } from "../db/schema";
import { ServiceError } from "../errors";
import {
  logWheelSpin,
  registerPerfectCats,
  requestPerfectMatchup,
  submitPerfectVote,
} from "./games";

let pool: pg.Pool;
let db: Database;

beforeAll(() => {
  pool = createPool(
    readDatabaseConfig("app", { DATABASE_URL: inject("databaseUrl") }),
  );
  db = createDatabase(pool);
});
afterAll(async () => pool.end());

describe("games PostgreSQL concurrency", () => {
  it("counts exactly one of two concurrent votes for one matchup", async () => {
    await registerPerfectCats(db, [
      { params: { params: {}, name: `vote-a-${Date.now()}` } },
      { params: { params: {}, name: `vote-b-${Date.now()}` } },
    ]);
    const matchup = await requestPerfectMatchup(
      db,
      `vote-client-${Date.now()}`,
    );
    expect(matchup.cats).toHaveLength(2);
    const [winner, loser] = matchup.cats;
    if (!winner || !loser || !matchup.clientId || !matchup.matchupToken)
      throw new Error("missing matchup fixture");
    const args = {
      clientId: matchup.clientId,
      winnerId: winner.id,
      loserId: loser.id,
      matchupToken: matchup.matchupToken,
    };
    const outcomes = await Promise.allSettled([
      submitPerfectVote(db, args),
      submitPerfectVote(db, args),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === "rejected"),
    ).toHaveLength(1);
    const rows = await db
      .select()
      .from(perfectVotes)
      .where(
        (await import("drizzle-orm")).eq(
          perfectVotes.clientId,
          matchup.clientId,
        ),
      );
    expect(rows).toHaveLength(1);
    const ratings = await db
      .select({
        id: perfectCats.id,
        wins: perfectCats.wins,
        losses: perfectCats.losses,
      })
      .from(perfectCats)
      .where(
        (await import("drizzle-orm")).inArray(perfectCats.id, [
          winner.id,
          loser.id,
        ]),
      );
    expect(ratings.reduce((sum, row) => sum + row.wins + row.losses, 0)).toBe(
      2,
    );
  });

  it("serializes anonymous wheel rate limits under concurrent requests", async () => {
    const clientKey = `wheel-${Date.now()}-abcdefghijkl`;
    const requests = Array.from({ length: 35 }, () =>
      logWheelSpin(db, {
        prizeName: "Moondust",
        forced: false,
        randomBucket: 0,
        clientKey,
      }),
    );
    const outcomes = await Promise.allSettled(requests);
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(30);
    expect(
      outcomes.filter(
        (outcome) =>
          outcome.status === "rejected" &&
          outcome.reason instanceof ServiceError &&
          outcome.reason.code === "rate_limited",
      ),
    ).toHaveLength(5);
    const rows = await db
      .select()
      .from(wheelSpins)
      .where(
        (await import("drizzle-orm")).eq(
          wheelSpins.actorKey,
          `anonymous:${clientKey}`,
        ),
      );
    expect(rows).toHaveLength(30);
  });
});
