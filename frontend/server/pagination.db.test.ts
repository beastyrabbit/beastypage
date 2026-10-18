import { randomUUID } from "node:crypto";
import { and, desc, inArray, sql } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { readDatabaseConfig } from "./db/config";
import { createDatabase, createPool, type Database } from "./db/pool";
import { dashSettings } from "./db/schema";
import { createdAtIdBefore } from "./pagination";

let pool: pg.Pool;
let db: Database;

beforeAll(() => {
  pool = createPool(
    readDatabaseConfig("app", { DATABASE_URL: inject("databaseUrl") }),
  );
  db = createDatabase(pool);
});

afterAll(async () => pool.end());

describe("keyset pagination SQL", () => {
  it("uses created_at then id to select the next page", async () => {
    const suffix = randomUUID().slice(0, 8);
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const firstId = "00000000-0000-4000-8000-000000000001";
    const secondId = "00000000-0000-4000-8000-000000000002";
    const inserted = await db
      .insert(dashSettings)
      .values([
        { id: firstId, slug: `page-a-${suffix}`, config: { n: 1 }, createdAt },
        { id: secondId, slug: `page-b-${suffix}`, config: { n: 2 }, createdAt },
      ])
      .returning({ id: dashSettings.id, createdAt: dashSettings.createdAt });
    const newest = inserted.find((row) => row.id === secondId);
    expect(newest).toBeDefined();
    const page = await db
      .select({ id: dashSettings.id })
      .from(dashSettings)
      .where(
        createdAtIdBefore(dashSettings, {
          createdAt: (newest?.createdAt ?? createdAt).toISOString(),
          id: newest?.id ?? secondId,
        }),
      )
      .orderBy(desc(dashSettings.createdAt), desc(dashSettings.id));
    expect(page.some((row) => row.id === firstId)).toBe(true);
  });

  it("keeps sub-millisecond timestamps on the same cursor millisecond", async () => {
    const suffix = randomUUID().slice(0, 8);
    const firstId = randomUUID();
    const secondId = randomUUID();
    await db.execute(sql`
      INSERT INTO dash_settings (id, slug, config, created_at, updated_at)
      VALUES
        (${firstId}, ${`precision-a-${suffix}`}, '{}'::jsonb,
          '2026-01-01T00:00:00.123001Z'::timestamptz,
          '2026-01-01T00:00:00.123001Z'::timestamptz),
        (${secondId}, ${`precision-b-${suffix}`}, '{}'::jsonb,
          '2026-01-01T00:00:00.123499Z'::timestamptz,
          '2026-01-01T00:00:00.123499Z'::timestamptz)
    `);
    const rows = await db
      .select({ id: dashSettings.id, createdAt: dashSettings.createdAt })
      .from(dashSettings)
      .where(sql`${dashSettings.id} IN (${firstId}, ${secondId})`)
      .orderBy(desc(dashSettings.createdAt), desc(dashSettings.id));
    expect(rows).toHaveLength(2);
    expect(rows[0]?.createdAt.getTime()).toBe(rows[1]?.createdAt.getTime());
    const firstPage = rows[0];
    if (!firstPage) throw new Error("precision fixture missing");
    const nextPage = await db
      .select({ id: dashSettings.id })
      .from(dashSettings)
      .where(
        and(
          inArray(dashSettings.id, [firstId, secondId]),
          createdAtIdBefore(dashSettings, {
            createdAt: firstPage.createdAt.toISOString(),
            id: firstPage.id,
          }),
        ),
      )
      .orderBy(desc(dashSettings.createdAt), desc(dashSettings.id));
    expect(nextPage.map((row) => row.id)).toEqual([rows[1]?.id]);
  });
});
