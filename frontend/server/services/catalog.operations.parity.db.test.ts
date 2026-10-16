import { convexTest } from "convex-test";
import type pg from "pg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { readDatabaseConfig } from "../db/config";
import { createDatabase, createPool, type Database } from "../db/pool";
import { cardSeason, catdex, collection, rarity } from "../db/schema";
import {
  approveCatdex,
  createCatdex,
  editCatdex,
  hasPendingCatdex,
  issueCatdexUploadUrl,
  listCatdex,
  listCatdexForModeration,
  listCatdexForOwner,
  listCollection,
  listRarities,
  listSeasons,
  setCollectionFocus,
  storeAndAttachCatdexUpload,
} from "./catalog";

const modules = import.meta.glob("../../convex/**/*.ts");
const ADMIN = "https://identity.example|catalog-admin";
const OWNER = "https://identity.example|catalog-owner";
const OTHER = "https://identity.example|catalog-other";

let pool: pg.Pool;
let db: Database;

beforeAll(() => {
  pool = createPool(
    readDatabaseConfig("app", { DATABASE_URL: inject("databaseUrl") }),
  );
  db = createDatabase(pool);
  vi.stubEnv("QUICK_SHARE_ADMIN_TOKEN_IDENTIFIERS", ADMIN);
  vi.stubEnv("CONVEX_SITE_URL", "https://fixture.convex.site");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await pool.end();
});

function catShape(value: {
  twitch_user_name: string;
  cat_name: string;
  card_number: string | null;
  approved: boolean;
  season: string | null;
  rarity: string | null;
}) {
  return {
    twitch_user_name: value.twitch_user_name,
    cat_name: value.cat_name,
    card_number: value.card_number,
    approved: value.approved,
    season: value.season,
    rarity: value.rarity,
  };
}

async function seedConvexCatalog(prefix: string) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const seasonId = await ctx.db.insert("card_season", {
      seasonName: `${prefix} season`,
      shortName: "CS",
      createdAt: 10,
      updatedAt: 10,
    });
    const rarityId = await ctx.db.insert("rarity", {
      rarityName: `${prefix} rarity`,
      stars: 3,
      chancePercent: 20,
      createdAt: 10,
      updatedAt: 10,
    });
    const approvedId = await ctx.db.insert("catdex", {
      twitchUserName: `${prefix} owner`,
      catName: `${prefix} approved`,
      cardNumber: "A-1",
      seasonId,
      rarityId,
      approved: true,
      createdAt: 30,
      updatedAt: 31,
    });
    const pendingId = await ctx.db.insert("catdex", {
      twitchUserName: `${prefix} owner`,
      catName: `${prefix} pending`,
      seasonId,
      rarityId,
      approved: false,
      createdAt: 20,
      updatedAt: 20,
    });
    const collectionId = await ctx.db.insert("collection", {
      artistName: `${prefix} artist`,
      animal: "cat",
      link: "https://example.test/catalog",
      createdAt: 40,
      updatedAt: 40,
      focusX: 12,
      focusY: 88,
    });
    return { seasonId, rarityId, approvedId, pendingId, collectionId };
  });
  return { t, ids };
}

async function seedPostgresCatalog(prefix: string) {
  const season = await db
    .insert(cardSeason)
    .values({
      seasonName: `${prefix} season`,
      shortName: "CS",
      createdAt: new Date(10),
      updatedAt: new Date(10),
    })
    .returning();
  const rarityRow = await db
    .insert(rarity)
    .values({
      rarityName: `${prefix} rarity`,
      stars: 3,
      chancePercent: 20,
      createdAt: new Date(10),
      updatedAt: new Date(10),
    })
    .returning();
  const [approved] = await db
    .insert(catdex)
    .values({
      twitchUserName: `${prefix} owner`,
      catName: `${prefix} approved`,
      cardNumber: "A-1",
      seasonId: season[0].id,
      rarityId: rarityRow[0].id,
      approved: true,
      createdAt: new Date(30),
      updatedAt: new Date(31),
    })
    .returning();
  const [pending] = await db
    .insert(catdex)
    .values({
      twitchUserName: `${prefix} owner`,
      catName: `${prefix} pending`,
      seasonId: season[0].id,
      rarityId: rarityRow[0].id,
      approved: false,
      createdAt: new Date(20),
      updatedAt: new Date(20),
    })
    .returning();
  const [collectionRow] = await db
    .insert(collection)
    .values({
      artistName: `${prefix} artist`,
      animal: "cat",
      link: "https://example.test/catalog",
      createdAt: new Date(40),
      updatedAt: new Date(40),
      focusX: 12,
      focusY: 88,
    })
    .returning();
  return {
    season: season[0],
    rarity: rarityRow[0],
    approved,
    pending,
    collection: collectionRow,
  };
}

describe("catalog operation parity", () => {
  it("matches seasons, rarities, public/filter pages, owner views, pending, and collection reads", async () => {
    const prefix = `parity-${Date.now()}`;
    const convex = await seedConvexCatalog(`${prefix}-convex`);
    const postgres = await seedPostgresCatalog(`${prefix}-postgres`);

    const convexSeasons = await convex.t.query(api.seasons.list, {});
    const postgresSeasons = await listSeasons(db);
    expect(postgresSeasons.map((row) => row.season_name)).toContain(
      `${prefix}-postgres season`,
    );
    expect(convexSeasons.map((row) => row.season_name)).toEqual([
      `${prefix}-convex season`,
    ]);

    const convexRarities = await convex.t.query(api.rarities.list, {});
    const postgresRarities = await listRarities(db);
    expect(convexRarities.map((row) => row.rarity_name)).toEqual([
      `${prefix}-convex rarity`,
    ]);
    expect(postgresRarities.map((row) => row.rarity_name)).toContain(
      `${prefix}-postgres rarity`,
    );

    const convexPublic = await convex.t.query(api.catdex.list, {});
    const postgresPublic = await listCatdex(db, { pageSize: 48 });
    expect(convexPublic.map(catShape)).toEqual([
      catShape({
        twitch_user_name: `${prefix}-convex owner`,
        cat_name: `${prefix}-convex approved`,
        card_number: "A-1",
        approved: true,
        season: `${prefix}-convex season`,
        rarity: `${prefix}-convex rarity`,
      }),
    ]);
    const postgresPublicFixture = postgresPublic.page.find(
      (row) => row.cat_name === `${prefix}-postgres approved`,
    );
    expect(postgresPublicFixture && catShape(postgresPublicFixture)).toEqual(
      catShape({
        twitch_user_name: `${prefix}-postgres owner`,
        cat_name: `${prefix}-postgres approved`,
        card_number: "A-1",
        approved: true,
        season: `${prefix}-postgres season`,
        rarity: `${prefix}-postgres rarity`,
      }),
    );

    const convexOwner = await convex.t.query(api.catdex.list, {});
    const postgresOwner = await listCatdexForOwner(
      db,
      `${prefix}-postgres owner`,
      { pageSize: 48 },
    );
    expect(convexOwner.map((row) => row.twitch_user_name)).toEqual([
      `${prefix}-convex owner`,
    ]);
    expect(postgresOwner.page.map((row) => row.twitch_user_name)).toEqual([
      `${prefix}-postgres owner`,
    ]);

    await expect(
      convex.t.query(api.catdex.list, { approved: false }),
    ).rejects.toThrow("Pending Catdex records require moderation access");
    await expect(listCatdex(db, { approved: false })).rejects.toMatchObject({
      code: "forbidden",
      message: "Pending Catdex records require moderation access",
    });
    await expect(convex.t.query(api.catdex.hasPending, {})).resolves.toBe(true);
    await expect(hasPendingCatdex(db)).resolves.toBe(true);

    const convexCollection = await convex.t.query(api.collection.list, {});
    const postgresCollection = await listCollection(db, { pageSize: 48 });
    expect(convexCollection.map((row) => row.artist_name)).toEqual([
      `${prefix}-convex artist`,
    ]);
    const postgresCollectionFixture = postgresCollection.page.find(
      (row) => row.artist_name === `${prefix}-postgres artist`,
    );
    expect(postgresCollectionFixture).toMatchObject({ focusX: 12, focusY: 88 });
    expect(
      await listCatdexForOwner(db, `${prefix}-other owner`, { pageSize: 48 }),
    ).toMatchObject({ page: [] });
    expect(postgresPublicFixture).toBeDefined();
    expect(convex.ids.approvedId).toBeTruthy();
    expect(postgres.approved.id).toBeTruthy();
  });

  it("keeps create, malformed input, upload consumption, and moderation boundaries explicit", async () => {
    const prefix = `lifecycle-${Date.now()}`;
    const convex = await seedConvexCatalog(`${prefix}-convex`);
    const postgres = await seedPostgresCatalog(`${prefix}-postgres`);
    const bytes = await sharp({
      create: {
        width: 4,
        height: 3,
        channels: 4,
        background: { r: 40, g: 80, b: 120, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const convexUrl = await convex.t.mutation(api.catdex.generateUploadUrl, {
      clientKey: "parity-client-1234",
    });
    const convexToken = new URL(convexUrl).searchParams.get("token");
    const convexStorageId = await convex.t.run((ctx) =>
      ctx.storage.store(new Blob([bytes], { type: "image/png" })),
    );
    const { internal } = await import("../../convex/_generated/api");
    await convex.t.mutation(internal.catdex.attachUpload, {
      token: convexToken as string,
      storageId: convexStorageId,
    });
    const convexCreated = await convex.t.mutation(api.catdex.create, {
      twitchUserName: `${prefix} owner`,
      catName: `${prefix} cat`,
      seasonId: convex.ids.seasonId,
      rarityId: convex.ids.rarityId,
      defaultCard: {
        storageId: convexStorageId,
        fileName: "parity.png",
        uploadToken: convexToken as string,
      },
    });

    const postgresUrl = await issueCatdexUploadUrl(
      db,
      { tokenIdentifier: null },
      "parity-client-5678",
    );
    const postgresToken = new URL(
      `https://fixture.invalid${postgresUrl}`,
    ).searchParams.get("token");
    const postgresFileId = await storeAndAttachCatdexUpload(
      db,
      postgresToken as string,
      bytes,
      "image/png",
    );
    const postgresCreated = await createCatdex(db, {
      twitchUserName: `${prefix} owner`,
      catName: `${prefix} cat`,
      seasonId: postgres.season.id,
      rarityId: postgres.rarity.id,
      defaultCard: {
        storageId: postgresFileId,
        fileName: "parity.png",
        uploadToken: postgresToken as string,
      },
    });
    expect(catShape(convexCreated)).toMatchObject({
      twitch_user_name: `${prefix} owner`,
      cat_name: `${prefix} cat`,
      approved: false,
      season: `${prefix}-convex season`,
      rarity: `${prefix}-convex rarity`,
    });
    expect(catShape(postgresCreated)).toMatchObject({
      twitch_user_name: `${prefix} owner`,
      cat_name: `${prefix} cat`,
      approved: false,
      season: `${prefix}-postgres season`,
      rarity: `${prefix}-postgres rarity`,
    });

    await expect(
      convex.t.mutation(api.catdex.create, {
        twitchUserName: "",
        catName: "bad",
        seasonId: convex.ids.seasonId,
        rarityId: convex.ids.rarityId,
        defaultCard: {
          storageId: "not-a-storage-id" as never,
          fileName: "bad.png",
        },
      }),
    ).rejects.toThrow();
    await expect(
      createCatdex(db, {
        twitchUserName: "",
        catName: "bad",
        seasonId: postgres.season.id,
        rarityId: postgres.rarity.id,
        defaultCard: { storageId: "not-a-file-id", fileName: "bad.png" },
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });

    await expect(
      approveCatdex(db, postgres.pending.id, { tokenIdentifier: null }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      approveCatdex(db, postgres.pending.id, { tokenIdentifier: OTHER }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      listCatdexForModeration(db, false, {}, { tokenIdentifier: null }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      listCatdexForModeration(db, false, {}, { tokenIdentifier: OTHER }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      editCatdex(
        db,
        postgres.pending.id,
        { catName: "edited" },
        { tokenIdentifier: OWNER },
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      editCatdex(
        db,
        postgres.pending.id,
        { catName: "edited" },
        { tokenIdentifier: ADMIN },
      ),
    ).resolves.toMatchObject({ cat_name: "edited" });
    await expect(
      approveCatdex(db, postgres.pending.id, { tokenIdentifier: ADMIN }),
    ).resolves.toMatchObject({ approved: true });
  });

  it("clamps pagination and collection focus while rejecting anonymous and non-admin writes", async () => {
    const prefix = `limits-${Date.now()}`;
    const convex = await seedConvexCatalog(`${prefix}-convex`);
    const postgres = await seedPostgresCatalog(`${prefix}-postgres`);

    await expect(
      convex.t.query(api.catdex.page, {
        approved: true,
        paginationOpts: { numItems: 0, cursor: null },
      }),
    ).resolves.toMatchObject({ page: expect.any(Array) });
    await expect(listCatdex(db, { pageSize: 0 })).resolves.toMatchObject({
      page: expect.any(Array),
    });
    await expect(
      listCatdexForModeration(
        db,
        false,
        { pageSize: 0 },
        {
          tokenIdentifier: ADMIN,
        },
      ),
    ).resolves.toMatchObject({ page: expect.any(Array) });

    await expect(
      convex.t.mutation(api.collection.setFocus, {
        id: convex.ids.collectionId,
        focusX: -10,
        focusY: 120,
      }),
    ).rejects.toThrow("Not authenticated");
    await expect(
      setCollectionFocus(db, postgres.collection.id, -10, 120, {
        tokenIdentifier: null,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      setCollectionFocus(db, postgres.collection.id, -10, 120, {
        tokenIdentifier: OTHER,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      setCollectionFocus(db, postgres.collection.id, -10, 120, {
        tokenIdentifier: ADMIN,
      }),
    ).resolves.toEqual({ focusX: 0, focusY: 100 });
  });
});
