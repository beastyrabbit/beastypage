import type pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { readDatabaseConfig } from "../db/config";
import { createDatabase, createPool, type Database } from "../db/pool";
import { adoptionBatch, catProfile, streamSessions } from "../db/schema";
import {
  findAdoptionBatchByLink,
  findCatProfileByLink,
  findStreamSessionByLink,
} from "./legacyLinks";

let pool: pg.Pool;
let db: Database;

// Real Convex ids are 32 lower-case base32 characters.
const LEGACY_PROFILE_ID = "j57a1b2c3d4e5f6g7h8j9k0m1n2p3q4r";
const LEGACY_BATCH_ID = "k97a1b2c3d4e5f6g7h8j9k0m1n2p3q4s";
const LEGACY_SESSION_ID = "m17a1b2c3d4e5f6g7h8j9k0m1n2p3q4t";

beforeAll(async () => {
  pool = createPool(
    readDatabaseConfig("app", { DATABASE_URL: inject("databaseUrl") }),
  );
  db = createDatabase(pool);
  await db.insert(catProfile).values([
    { slug: "fireheart", catData: {}, legacyId: LEGACY_PROFILE_ID },
    // A slug that looks like someone else's legacy id must still win by slug.
    { slug: LEGACY_BATCH_ID, catData: { mode: "slug-wins" } },
  ]);
  await db
    .insert(adoptionBatch)
    .values({ slug: "litter-1", legacyId: LEGACY_BATCH_ID });
  await db.insert(streamSessions).values({
    viewerKey: "viewer-1",
    status: "lobby",
    legacyId: LEGACY_SESSION_ID,
  });
});

afterAll(async () => {
  await pool.end();
});

describe("legacy public links", () => {
  it("resolves /view and /api/preview by slug, Convex id and UUID", async () => {
    const bySlug = await findCatProfileByLink(db, "fireheart");
    expect(bySlug?.legacyId).toBe(LEGACY_PROFILE_ID);
    expect((await findCatProfileByLink(db, LEGACY_PROFILE_ID))?.id).toBe(
      bySlug?.id,
    );
    expect((await findCatProfileByLink(db, bySlug?.id as string))?.slug).toBe(
      "fireheart",
    );
    expect(await findCatProfileByLink(db, "missing")).toBeNull();
  });

  it("prefers a slug over a legacy id, like Convex", async () => {
    const profile = await findCatProfileByLink(db, LEGACY_BATCH_ID);
    expect(profile?.catData).toEqual({ mode: "slug-wins" });
  });

  it("resolves /adoption by slug and Convex id", async () => {
    const batch = await findAdoptionBatchByLink(db, LEGACY_BATCH_ID);
    expect(batch?.slug).toBe("litter-1");
    expect((await findAdoptionBatchByLink(db, "litter-1"))?.id).toBe(batch?.id);
  });

  it("resolves stream host links by Convex id and UUID only", async () => {
    const session = await findStreamSessionByLink(db, LEGACY_SESSION_ID);
    expect(session?.viewerKey).toBe("viewer-1");
    expect(
      (await findStreamSessionByLink(db, session?.id as string))?.viewerKey,
    ).toBe("viewer-1");
    expect(await findStreamSessionByLink(db, "viewer-1")).toBeNull();
  });
});
