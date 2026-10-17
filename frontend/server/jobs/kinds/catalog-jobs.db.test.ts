import { createHash, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type pg from "pg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { readDatabaseConfig } from "../../db/config";
import { createDatabase, createPool, type Database } from "../../db/pool";
import {
  cardSeason,
  catdex,
  catdexUploads,
  catImages,
  catProfile,
  collection,
  files,
  paletteGeneratorSettings,
  rarity,
} from "../../db/schema";
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

function context(kind: string) {
  return {
    db,
    jobId: `catalog-job-${kind}-${randomUUID()}`,
    kind,
    attempt: 1,
    signal: new AbortController().signal,
  };
}

async function insertFile(
  label: string,
  createdAt = new Date(Date.now() - 48 * 60 * 60 * 1000),
  bytes = Buffer.from(label),
) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const [file] = await db
    .insert(files)
    .values({
      sha256,
      mimeType: "image/png",
      byteSize: bytes.length,
      bytes,
      createdAt,
    })
    .returning();
  return file;
}

describe("catalog jobs against PostgreSQL", () => {
  it("deletes old orphans, preserves every reference family, and keeps fresh uploads", async () => {
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const orphan = await insertFile("orphan-old", old);
    const fresh = await insertFile("orphan-fresh", new Date());
    const referenced = await insertFile("referenced-old", old);
    const season = await db
      .insert(cardSeason)
      .values({ seasonName: "orphan season", cardBackFileId: referenced.id })
      .returning();
    const rarityRow = await db
      .insert(rarity)
      .values({ rarityName: "orphan rarity", stars: 1, chancePercent: 100 })
      .returning();
    await db.insert(catdex).values({
      twitchUserName: "orphan-owner",
      catName: "orphan-cat",
      seasonId: season[0].id,
      rarityId: rarityRow[0].id,
      approved: true,
      defaultCardFileId: referenced.id,
      defaultCardThumbFileId: referenced.id,
      customCardFileId: referenced.id,
      customCardThumbFileId: referenced.id,
    });
    await db.insert(catdexUploads).values({
      token: `orphan-upload-${randomUUID()}`,
      fileId: referenced.id,
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000),
    });
    await db.insert(collection).values({
      artistName: "orphan artist",
      animal: "cat",
      link: "https://example.test/orphan",
      blurImgFileId: referenced.id,
      previewImgFileId: referenced.id,
      fullImgFileId: referenced.id,
    });
    const profile = await db
      .insert(catProfile)
      .values({ slug: `orphan-profile-${randomUUID()}`, catData: {} })
      .returning();
    await db.insert(catImages).values({
      catProfileId: profile[0].id,
      kind: "full",
      fileId: referenced.id,
    });
    await db.insert(paletteGeneratorSettings).values({
      slug: `orphan-palette-${randomUUID()}`,
      config: {},
      imageFileId: referenced.id,
    });

    const job = jobKindRegistry.get("files.orphan-cleanup");
    expect(job).toBeDefined();
    await expect(
      job?.handler({}, context("files.orphan-cleanup")),
    ).resolves.toMatchObject({
      deleted: 1,
    });
    const rows = await db
      .select({ id: files.id })
      .from(files)
      .where(sql`${files.id} in (${orphan.id}, ${fresh.id}, ${referenced.id})`);
    expect(rows.map((row) => row.id).sort()).toEqual(
      [fresh.id, referenced.id].sort(),
    );
  });

  it("fails closed when the live files FK inventory differs from the checked set", async () => {
    const job = jobKindRegistry.get("files.orphan-cleanup");
    expect(job).toBeDefined();
    const mismatchedDb = {
      execute: async () => ({ rows: [] }),
    } as unknown as Database;
    await expect(
      job?.handler(
        {},
        { ...context("files.orphan-cleanup"), db: mismatchedDb },
      ),
    ).rejects.toThrow("files reference coverage mismatch");
  });

  it("generates JPEG thumbnails once per cat and keeps the Convex 256px bound", async () => {
    const bytes = await sharp({
      create: {
        width: 512,
        height: 256,
        channels: 4,
        background: { r: 80, g: 120, b: 160, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const source = await insertFile(
      `thumbnail-source-${randomUUID()}`,
      undefined,
      bytes,
    );
    const season = await db
      .insert(cardSeason)
      .values({ seasonName: `thumbnail-season-${randomUUID()}` })
      .returning();
    const rarityRow = await db
      .insert(rarity)
      .values({ rarityName: `thumbnail-rarity-${randomUUID()}`, stars: 1 })
      .returning();
    const [cat] = await db
      .insert(catdex)
      .values({
        twitchUserName: "thumbnail-owner",
        catName: `thumbnail-cat-${randomUUID()}`,
        seasonId: season[0].id,
        rarityId: rarityRow[0].id,
        approved: false,
        defaultCardFileId: source.id,
        defaultCardName: "source.png",
        thumbnailStatus: "processing",
        thumbnailAttemptedAt: new Date(),
        thumbnailAttemptCount: 1,
      })
      .returning();

    const job = jobKindRegistry.get("catdex.thumbnail");
    expect(job).toBeDefined();
    await expect(
      job?.handler({ id: cat.id, attempt: 1 }, context("catdex.thumbnail")),
    ).resolves.toMatchObject({ generated: 1, stale: 0 });
    const [updated] = await db
      .select()
      .from(catdex)
      .where(eq(catdex.id, cat.id));
    expect(updated.defaultCardThumbFileId).toBeTruthy();
    expect(updated.defaultCardThumbWidth).toBe(256);
    expect(updated.defaultCardThumbHeight).toBe(128);
    const [thumb] = await db
      .select()
      .from(files)
      .where(eq(files.id, updated.defaultCardThumbFileId as string));
    expect(thumb.mimeType).toBe("image/jpeg");
    expect((await sharp(thumb.bytes).metadata()).format).toBe("jpeg");
    expect(thumb.width).toBe(256);
    expect(thumb.height).toBe(128);
    const fileCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(files);
    await expect(
      job?.handler({ id: cat.id, attempt: 1 }, context("catdex.thumbnail")),
    ).resolves.toMatchObject({ generated: 0, stale: 1 });
    const nextFileCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(files);
    expect(Number(nextFileCount[0].count)).toBe(Number(fileCount[0].count));
  });

  it("respects the 25-card thumbnail backfill and 100-upload retention limits", async () => {
    const season = await db
      .insert(cardSeason)
      .values({ seasonName: `backfill-season-${randomUUID()}` })
      .returning();
    const rarityRow = await db
      .insert(rarity)
      .values({ rarityName: `backfill-rarity-${randomUUID()}`, stars: 1 })
      .returning();
    const prefix = `backfill-${randomUUID()}`;
    for (let index = 0; index < 30; index += 1) {
      await db.insert(catdex).values({
        twitchUserName: prefix,
        catName: `${prefix}-${index}`,
        seasonId: season[0].id,
        rarityId: rarityRow[0].id,
        approved: false,
      });
    }
    const backfill = jobKindRegistry.get("catdex.thumbnail-backfill");
    expect(backfill).toBeDefined();
    const backfillResult = await backfill?.handler(
      {},
      context("catdex.thumbnail-backfill"),
    );
    expect(backfillResult).toEqual({ enqueued: 25 });
    const processing = await db
      .select({ count: sql<number>`count(*)` })
      .from(catdex)
      .where(
        sql`${catdex.twitchUserName} = ${prefix} and ${catdex.thumbnailStatus} = 'processing'`,
      );
    expect(Number(processing[0].count)).toBeLessThanOrEqual(25);

    const uploadPrefix = `retention-${randomUUID()}`;
    for (let index = 0; index < 101; index += 1) {
      await db.insert(catdexUploads).values({
        token: `${uploadPrefix}-${index}`,
        status: "pending",
        expiresAt: new Date(Date.now() - 60_000),
      });
    }
    const retention = jobKindRegistry.get("catdex.upload-retention");
    expect(retention).toBeDefined();
    await expect(
      retention?.handler({}, context("catdex.upload-retention")),
    ).resolves.toEqual({ deleted: 100 });
    const remaining = await db
      .select({ count: sql<number>`count(*)` })
      .from(catdexUploads)
      .where(sql`${catdexUploads.token} like ${`${uploadPrefix}-%`}`);
    expect(Number(remaining[0].count)).toBe(1);
  });
});
