import { eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { readDatabaseConfig } from "../../db/config";
import { createDatabase, createPool, type Database } from "../../db/pool";
import { perfectCats, perfectMatchups } from "../../db/schema";
import { jobKindRegistry } from ".";

let pool: pg.Pool;
let db: Database;
beforeAll(() => {
  pool = createPool(
    readDatabaseConfig("app", { DATABASE_URL: inject("databaseUrl") }),
  );
  db = createDatabase(pool);
});
afterAll(async () => pool.end());

describe("perfect-matchup.retention job", () => {
  it("deletes at most one bounded batch and is idempotent", async () => {
    const [a, b] = await db
      .insert(perfectCats)
      .values([
        {
          hash: `job-a-${Date.now()}`,
          params: { params: {} },
          rating: 1500,
          wins: 0,
          losses: 0,
          appearances: 0,
        },
        {
          hash: `job-b-${Date.now()}`,
          params: { params: {} },
          rating: 1500,
          wins: 0,
          losses: 0,
          appearances: 0,
        },
      ])
      .returning();
    const now = Date.now();
    await db.insert(perfectMatchups).values(
      Array.from({ length: 100 }, (_, index) => ({
        clientId: `job-${now}-${index}`,
        catAId: a.id,
        catBId: b.id,
        token: `job-token-${now}-${index}`,
        expiresAt: new Date(now - 60_000),
        consumed: false,
        createdAt: new Date(now - 120_000),
      })),
    );
    await db.insert(perfectMatchups).values({
      clientId: `job-${now}-consumed`,
      catAId: a.id,
      catBId: b.id,
      token: `job-token-${now}-consumed`,
      expiresAt: new Date(now - 60_000),
      consumed: true,
      createdAt: new Date(now - 120_000),
    });
    await db.insert(perfectMatchups).values({
      clientId: `job-${now}-fresh`,
      catAId: a.id,
      catBId: b.id,
      token: `job-token-${now}-fresh`,
      expiresAt: new Date(now + 60_000),
      consumed: false,
      createdAt: new Date(),
    });
    const kind = jobKindRegistry.get("perfect-matchup.retention");
    expect(kind).toBeDefined();
    expect(kind?.recurringIntervalMs).toBe(60 * 60_000);
    expect(kind?.recurringDedupeKey).toBe("singleton");
    const context = {
      db,
      jobId: `job-${now}`,
      kind: "perfect-matchup.retention",
      attempt: 1,
      signal: new AbortController().signal,
    };
    await expect(kind?.handler({}, context)).resolves.toEqual({ deleted: 100 });
    await expect(kind?.handler({}, context)).resolves.toEqual({ deleted: 1 });
    const remaining = await db
      .select({ clientId: perfectMatchups.clientId })
      .from(perfectMatchups)
      .where(eq(perfectMatchups.clientId, `job-${now}-fresh`));
    expect(remaining).toHaveLength(1);
  });
});
