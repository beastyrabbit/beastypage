import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { closeDatabase } from "@/server/db/client";
import { readDatabaseConfig } from "@/server/db/config";
import { createDatabase, createPool, type Database } from "@/server/db/pool";
import { createBatch } from "@/server/services/adoption";
import { createCatShare } from "@/server/services/cat-shares";
import { createProfile } from "@/server/services/cats";

let pool: ReturnType<typeof createPool>;
let db: Database;
const environment = { ...process.env };
let profileRoute: typeof import("@/app/api/cats/profile/route");
let adoptionRoute: typeof import("@/app/api/adoption/batch/route");
let shareRoute: typeof import("@/app/api/cat-share/route");

beforeAll(async () => {
  process.env.DATA_BACKEND = "postgres";
  process.env.DATABASE_URL = inject("databaseUrl");
  pool = createPool(
    readDatabaseConfig("app", { DATABASE_URL: inject("databaseUrl") }),
  );
  db = createDatabase(pool);
  profileRoute = await import("@/app/api/cats/profile/route");
  adoptionRoute = await import("@/app/api/adoption/batch/route");
  shareRoute = await import("@/app/api/cat-share/route");
});

afterAll(async () => {
  await pool.end();
  await closeDatabase();
  process.env = environment;
});

describe("cat routes on PostgreSQL", () => {
  it("resolves profile, batch and share slugs", async () => {
    const identity = { tokenIdentifier: null };
    const profile = await createProfile(db, { catData: {} }, identity);
    const profileResponse = await profileRoute.GET(
      new NextRequest(
        `http://localhost/api/cats/profile?slugOrId=${profile.slug}`,
      ),
    );
    expect(profileResponse.status).toBe(200);
    expect(await profileResponse.json()).toMatchObject({
      slug: profile.slug,
      id: profile.id,
    });

    const batch = await createBatch(
      db,
      {
        cats: [
          {
            label: "cat",
            catData: {},
            profileId: profile.id,
            editToken: profile.editToken,
          },
        ],
      },
      identity,
    );
    const batchResponse = await adoptionRoute.GET(
      new NextRequest(
        `http://localhost/api/adoption/batch?slugOrId=${batch.slug}`,
      ),
    );
    expect(batchResponse.status).toBe(200);
    expect(await batchResponse.json()).toMatchObject({ slug: batch.slug });

    const share = await createCatShare(
      db,
      { data: { v: 2, document: { schemaVersion: 1, traits: {} } } },
      identity,
    );
    const shareResponse = await shareRoute.GET(
      new NextRequest(`http://localhost/api/cat-share?slug=${share.slug}`),
    );
    expect(shareResponse.status).toBe(200);
    expect(await shareResponse.json()).toMatchObject({ slug: share.slug });
  });

  it("returns the route error contract for missing records", async () => {
    const response = await profileRoute.GET(
      new NextRequest("http://localhost/api/cats/profile?slugOrId=missing"),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "not_found" });
  });

  it("accepts anonymous profile creation through the PostgreSQL route", async () => {
    const response = await profileRoute.POST(
      new NextRequest("http://localhost/api/cats/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ catData: {} }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      shareToken: expect.any(String),
    });
  });
});
