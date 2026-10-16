/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { readDatabaseConfig } from "../db/config";
import { createDatabase, createPool, type Database } from "../db/pool";
import { ServiceError } from "../errors";
import { createBatch, getBatch } from "./adoption";
import { checkSlug, getBySlug, removeTree, saveTree } from "./ancestry";
import { createCatShare, getCatShare } from "./cat-shares";
import { createProfile, getProfile, updateProfileMeta } from "./cats";
import { storeDiscordImage } from "./palette";
import { upsertMapperPreviews } from "./previews";

const modules = import.meta.glob("../../convex/**/*.ts");
const ANON = { tokenIdentifier: null };

let pool: pg.Pool;
let db: Database;

beforeAll(() => {
  pool = createPool(
    readDatabaseConfig("app", { DATABASE_URL: inject("databaseUrl") }),
  );
  db = createDatabase(pool);
});
afterAll(async () => pool.end());

const treeCats = [
  {
    id: "mother",
    name: { prefix: "Bright", suffix: "star", full: "Brightstar" },
    gender: "F" as const,
    lifeStage: "adult",
    params: {},
    motherId: null,
    fatherId: null,
    partnerIds: [],
    childrenIds: [],
    genetics: {
      pelt: { allele1: "a", allele2: "a", expressed: "a" },
      colour: { allele1: "a", allele2: "a", expressed: "a" },
      eyeColour: { allele1: "a", allele2: "a", expressed: "a" },
      skinColour: { allele1: "a", allele2: "a", expressed: "a" },
      whitePatches: { allele1: null, allele2: null, expressed: null },
      isTortie: { allele1: false, allele2: false, expressed: false },
    },
    source: "generated",
    generation: 0,
  },
];
const treeConfig = {
  minChildren: 1,
  maxChildren: 2,
  depth: 1,
  genderRatio: 0.5,
};

describe("cats PostgreSQL services", () => {
  it("keeps profile creation, lookup, metadata authorization and limits aligned", async () => {
    const convex = convexTest(schema, modules);
    const convexCreated = await convex.mutation(api.mapper.create, {
      catData: {},
    });
    const created = await createProfile(db, { catData: {} }, ANON);
    expect(created.slug).toMatch(/^[2-9A-HJ-NP-Za-km-z]{8}$/);
    expect((await getProfile(db, created.slug))?.cat_data).toMatchObject({
      metaLocked: false,
    });
    await expect(
      updateProfileMeta(
        db,
        { id: created.id, catName: "Misty", editToken: "wrong" },
        ANON,
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      updateProfileMeta(
        db,
        { id: created.id, catName: "Misty", editToken: created.editToken },
        ANON,
      ),
    ).resolves.toMatchObject({ catName: "Misty" });
    expect(convexCreated.shareToken).toBeTruthy();
    await expect(
      createProfile(db, { catData: { blob: "x".repeat(901 * 1024) } }, ANON),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("covers mapper history, preview queue, image refs, malformed input, and pagination", async () => {
    const convex = convexTest(schema, modules);
    const convexProfile = await convex.mutation(api.mapper.create, {
      catData: {},
    });
    const profile = await createProfile(db, { catData: {} }, ANON);
    expect(
      (await convex.query(api.mapper.listHistory, { limit: 1 })).length,
    ).toBeGreaterThan(0);
    expect((await (await import("./cats")).listHistory(db, 1)).length).toBe(1);
    expect(
      (await (await import("./cats")).listForPreview(db, { limit: 1 }))[0],
    ).toHaveProperty("id");
    expect(
      await (await import("./cats")).getPreviewRefs(db, profile.slug),
    ).toEqual({
      tiny: null,
      preview: null,
      full: null,
      spriteSheet: null,
    });
    await expect(
      createProfile(db, { catData: { params: [] } }, ANON),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      createProfile(db, { catData: { blob: "x".repeat(901 * 1024) } }, ANON),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(convexProfile.slug).toMatch(/^[2-9A-HJ-NP-Za-km-z]{8}$/);
  });

  it("normalizes adoption children and preserves old-style links", async () => {
    const profile = await createProfile(db, { catData: {} }, ANON);
    const batch = await createBatch(
      db,
      {
        cats: [
          {
            label: "One",
            catData: {},
            profileId: profile.id,
            editToken: profile.editToken,
          },
        ],
        settings: { source: "adoption-generator" },
      },
      ANON,
    );
    expect((await getBatch(db, batch.slug))?.cats[0]).toMatchObject({
      label: "One",
      profileId: profile.id,
    });
  });

  it("covers adoption list pagination, ownership denial, malformed input, and limits", async () => {
    const convex = convexTest(schema, modules);
    await expect(
      convex.mutation(api.adoptionV2.createBatch, { cats: [] }),
    ).rejects.toThrow("At least one cat");
    await expect(createBatch(db, { cats: [] }, ANON)).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(
      createBatch(
        db,
        { cats: [{ label: "bad", catData: { blob: "x".repeat(901 * 1024) } }] },
        ANON,
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    const profile = await createProfile(db, { catData: {} }, ANON);
    const batch = await createBatch(
      db,
      {
        cats: [
          {
            label: "one",
            catData: {},
            profileId: profile.id,
            editToken: profile.editToken,
          },
        ],
      },
      ANON,
    );
    const { listBatchesPage, updateBatchMeta } = await import("./adoption");
    expect((await listBatchesPage(db, { limit: 1 })).results).toHaveLength(1);
    await expect(
      updateBatchMeta(
        db,
        { id: batch.id, title: "blocked", editToken: "wrong" },
        ANON,
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      updateBatchMeta(
        db,
        { id: batch.id, title: "updated", editToken: batch.editToken },
        ANON,
      ),
    ).resolves.toMatchObject({ title: "updated" });
  });

  it("keeps share authorization and ancestry password behavior", async () => {
    const share = await createCatShare(
      db,
      { data: { v: 2, document: { schemaVersion: 1, traits: {} } } },
      ANON,
    );
    expect(await getCatShare(db, share.slug)).toMatchObject({
      slug: share.slug,
    });
    await expect(
      createCatShare(
        db,
        {
          data: { v: 2, document: { schemaVersion: 1, traits: {} } },
          slug: share.slug,
        },
        ANON,
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
    const tree = await saveTree(
      db,
      {
        slug: `parity-${Date.now()}`,
        name: "Parity",
        foundingMotherId: "mother",
        foundingFatherId: "father",
        cats: treeCats,
        config: treeConfig,
        password: "secret",
      },
      ANON,
    );
    expect(tree.success).toBe(true);
    if (!tree.success) return;
    expect(await checkSlug(db, tree.slug)).toEqual({
      exists: true,
      hasPassword: true,
    });
    expect(await getBySlug(db, tree.slug)).toMatchObject({
      name: "Parity",
      hasPassword: true,
    });
    expect(
      await removeTree(db, { slug: tree.slug, password: "wrong" }, ANON),
    ).toMatchObject({ success: false, error: "invalid_password" });
    expect(
      await removeTree(db, { slug: tree.slug, password: "secret" }, ANON),
    ).toEqual({ success: true });
  });

  it("covers share malformed input, size limits, and explicit Convex errors", async () => {
    const convex = convexTest(schema, modules);
    await expect(
      convex.mutation(api.catShares.create, {
        data: { v: 2, document: { schemaVersion: 1, traits: {} } },
        slug: "bad slug",
      }),
    ).rejects.toThrow("Invalid slug format");
    await expect(
      createCatShare(
        db,
        {
          data: { v: 2, document: { schemaVersion: 1, traits: {} } },
          slug: "bad slug",
        },
        ANON,
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      createCatShare(
        db,
        {
          data: {
            v: 2,
            document: {
              schemaVersion: 1,
              traits: { blob: "x".repeat(256 * 1024) },
            },
          },
        },
        ANON,
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("covers ancestry list boundaries, wrong passwords, and malformed trees", async () => {
    const convex = convexTest(schema, modules);
    const slug = `parity-${Date.now()}-extra`;
    await expect(
      convex.mutation(api.ancestryTree.save, {
        slug: "not/a-valid-slug",
        name: "Bad",
        foundingMotherId: "mother",
        foundingFatherId: "father",
        cats: [],
        config: treeConfig,
      }),
    ).rejects.toThrow("Invalid tree slug");
    await expect(
      saveTree(
        db,
        {
          slug,
          name: "Parity",
          foundingMotherId: "mother",
          foundingFatherId: "father",
          cats: treeCats,
          config: treeConfig,
          password: "secret",
        },
        ANON,
      ),
    ).resolves.toMatchObject({ success: true });
    const { listTreesPage, updateTree } = await import("./ancestry");
    expect((await listTreesPage(db, { limit: 1 })).results).toHaveLength(1);
    await expect(
      updateTree(db, { slug, name: "blocked", password: "wrong" }, ANON),
    ).resolves.toEqual({ success: false, error: "invalid_password" });
    await expect(
      updateTree(db, { slug, name: "updated", password: "secret" }, ANON),
    ).resolves.toMatchObject({ success: true });
    await expect(
      saveTree(
        db,
        {
          slug: "invalid/tree",
          name: "bad",
          foundingMotherId: "m",
          foundingFatherId: "f",
          cats: [],
          config: treeConfig,
        },
        ANON,
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    const copied = await saveTree(
      db,
      {
        slug: `copy-${Date.now()}`,
        name: "Copy",
        foundingMotherId: "m",
        foundingFatherId: "f",
        cats: [],
        config: treeConfig,
      },
      ANON,
      true,
    );
    expect(copied).toMatchObject({ success: true, isNew: true });
    if (!copied.success) throw new Error("copy fixture was not created");
    await expect(
      saveTree(
        db,
        {
          slug: copied.slug,
          name: "Collision",
          foundingMotherId: "m",
          foundingFatherId: "f",
          cats: [],
          config: treeConfig,
        },
        ANON,
        true,
      ),
    ).resolves.toEqual({ success: false, error: "slug_taken" });
  });

  it("denies preview refreshes without the exact admin token and palette writes without Discord auth", async () => {
    const profile = await createProfile(db, { catData: {} }, ANON);
    await expect(
      upsertMapperPreviews(db, {
        id: profile.id,
        adminToken: "wrong",
        tiny: { dataUrl: "bad" },
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      upsertMapperPreviews(db, {
        id: profile.id,
        tiny: { dataUrl: "bad" },
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    vi.stubEnv("PREVIEW_REFRESH_TOKEN", "preview-fixture-token");
    await expect(
      upsertMapperPreviews(db, {
        id: profile.id,
        adminToken: "preview-fixture-token",
        tiny: { dataUrl: "bad" },
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    const preview = await upsertMapperPreviews(db, {
      id: profile.id,
      adminToken: "preview-fixture-token",
      tiny: {
        dataUrl: "data:image/png;base64,aGVsbG8=",
        filename: "tiny.png",
      },
    });
    expect(preview).toMatchObject({
      id: profile.id,
      previews: { tiny: { name: "tiny.png" } },
    });
    await expect(
      storeDiscordImage(db, {
        dataUrl: "bad",
        colors: [],
        serviceToken: "wrong",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      storeDiscordImage(db, { dataUrl: "bad", colors: [], serviceToken: "" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    vi.stubEnv(
      "DISCORD_API_TOKEN",
      "discord-fixture-token-012345678901234567890",
    );
    const palette = await storeDiscordImage(db, {
      dataUrl: "data:image/png;base64,aGVsbG8=",
      colors: [{ hex: "#ffffff", rgb: [255, 255, 255], prevalence: 1 }],
      serviceToken: "discord-fixture-token-012345678901234567890",
    });
    expect(palette).toMatchObject({
      slug: expect.any(String),
      storageId: expect.any(String),
    });
    vi.unstubAllEnvs();
  });
});
