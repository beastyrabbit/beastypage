/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { readDatabaseConfig } from "../db/config";
import { createDatabase, createPool, type Database } from "../db/pool";
import { ServiceError } from "../errors";
import { createBatch, getBatch } from "./adoption";
import { checkSlug, getBySlug, removeTree, saveTree } from "./ancestry";
import { createCatShare, getCatShare } from "./cat-shares";
import { createProfile, getProfile, updateProfileMeta } from "./cats";

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
});
