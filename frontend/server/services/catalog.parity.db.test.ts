import { eq } from "drizzle-orm";
import type pg from "pg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { isAdminIdentity } from "../auth/identity";
import { readDatabaseConfig } from "../db/config";
import { createDatabase, createPool, type Database } from "../db/pool";
import { cardSeason, collection, rarity } from "../db/schema";
import { jobKindRegistry } from "../jobs/kinds";
import {
  approveCatdex,
  createCatdex,
  ensureDefaultRarities,
  ensureDefaultSeasons,
  generateCatdexThumbnail,
  issueCatdexUploadUrl,
  listCatdex,
  listCollection,
  setCollectionFocus,
  storeAndAttachCatdexUpload,
} from "./catalog";

let pool: pg.Pool;
let db: Database;

beforeAll(() => {
  pool = createPool(
    readDatabaseConfig("app", { DATABASE_URL: inject("databaseUrl") }),
  );
  db = createDatabase(pool);
});

afterAll(async () => pool.end());

describe("catalog PostgreSQL service", () => {
  beforeAll(() =>
    vi.stubEnv("QUICK_SHARE_ADMIN_TOKEN_IDENTIFIERS", "fixture|admin"),
  );
  afterAll(() => vi.unstubAllEnvs());

  it("keeps public approval and upload reservation boundaries", async () => {
    const now = new Date();
    const [season] = await db
      .insert(cardSeason)
      .values({
        seasonName: "Fixture season",
        shortName: "FS",
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const [rarityRow] = await db
      .insert(rarity)
      .values({
        rarityName: "Fixture rarity",
        stars: 1,
        chancePercent: 100,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const bytes = await sharp({
      create: {
        width: 2,
        height: 3,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const uploadUrl = await issueCatdexUploadUrl(
      db,
      { tokenIdentifier: null },
      "fixture-client-key",
    );
    const token = new URL(
      `https://fixture.invalid${uploadUrl}`,
    ).searchParams.get("token");
    expect(token).toBeTruthy();
    const fileId = await storeAndAttachCatdexUpload(
      db,
      token as string,
      bytes,
      "image/png",
    );
    const created = await createCatdex(db, {
      twitchUserName: "FixtureOwner",
      catName: "Fixture Cat",
      seasonId: season.id,
      rarityId: rarityRow.id,
      defaultCard: {
        storageId: fileId,
        fileName: "fixture.png",
        uploadToken: token as string,
      },
    });
    expect(created).toMatchObject({
      approved: false,
      default_card_width: 2,
      default_card_height: 3,
    });
    await expect(
      generateCatdexThumbnail(db, created.id, 1),
    ).resolves.toMatchObject({ success: true, generated: ["default"] });
    expect(
      (await listCatdex(db)).page.some((entry) => entry.id === created.id),
    ).toBe(false);
    const approved = await approveCatdex(
      db,
      created.id,
      { tokenIdentifier: "fixture|admin" },
      true,
    );
    expect(approved.approved).toBe(true);
    expect(
      (await listCatdex(db)).page.find((entry) => entry.id === created.id),
    ).toMatchObject({ id: created.id, approved: true });
    await expect(
      createCatdex(db, {
        twitchUserName: "FixtureOwner",
        catName: "Replay",
        seasonId: season.id,
        rarityId: rarityRow.id,
        defaultCard: {
          storageId: fileId,
          fileName: "fixture.png",
          uploadToken: token as string,
        },
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("uses the admin allowlist for collection focus", async () => {
    const now = new Date();
    const [entry] = await db
      .insert(collection)
      .values({
        artistName: "Fixture artist",
        animal: "cat",
        link: "https://example.test",
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    expect(
      isAdminIdentity(
        { tokenIdentifier: null },
        { QUICK_SHARE_ADMIN_TOKEN_IDENTIFIERS: "fixture|admin" },
      ),
    ).toBe(false);
    await expect(
      setCollectionFocus(db, entry.id, -5, 120, {
        tokenIdentifier: "fixture|other",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      setCollectionFocus(db, entry.id, -5, 120, {
        tokenIdentifier: "fixture|admin",
      }),
    ).resolves.toEqual({ focusX: 0, focusY: 100 });
    expect(
      (await listCollection(db, { pageSize: 48 })).page.find(
        (item) => item.id === entry.id,
      ),
    ).toMatchObject({ id: entry.id, focusX: 0, focusY: 100 });
  });

  it("runs the orphan sweep only after checking every file reference", async () => {
    const job = jobKindRegistry.get("files.orphan-cleanup");
    expect(job).toBeDefined();
    await expect(
      job?.handler(
        {},
        {
          db,
          jobId: "fixture-job",
          kind: "files.orphan-cleanup",
          attempt: 1,
          signal: new AbortController().signal,
        },
      ),
    ).resolves.toMatchObject({ deleted: 0 });
  });

  it("serializes default setup and upload admission", async () => {
    await Promise.all([
      ensureDefaultSeasons(db),
      ensureDefaultSeasons(db),
      ensureDefaultRarities(db),
      ensureDefaultRarities(db),
    ]);
    const seasonRows = await db
      .select({ id: cardSeason.id })
      .from(cardSeason)
      .where(eq(cardSeason.seasonName, "BETA"));
    const rarityRows = await db
      .select({ id: rarity.id })
      .from(rarity)
      .where(eq(rarity.rarityName, "Moondust"));
    expect(seasonRows).toHaveLength(1);
    expect(rarityRows).toHaveLength(1);

    const clientKey = `race-${Date.now()}-abcdefghijkl`;
    const outcomes = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        issueCatdexUploadUrl(db, { tokenIdentifier: null }, clientKey),
      ),
    );
    expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(
      12,
    );
    expect(outcomes.filter((item) => item.status === "rejected")).toHaveLength(
      8,
    );
  });
});
