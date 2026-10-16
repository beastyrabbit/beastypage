import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { closeDatabase } from "@/server/db/client";
import { readDatabaseConfig } from "@/server/db/config";
import { createDatabase, createPool, type Database } from "@/server/db/pool";
import { createBatch } from "@/server/services/adoption";
import { saveTree } from "@/server/services/ancestry";
import { createCatShare } from "@/server/services/cat-shares";
import { createProfile } from "@/server/services/cats";

let pool: ReturnType<typeof createPool>;
let db: Database;
const environment = { ...process.env };
let profileRoute: typeof import("@/app/api/cats/profile/route");
let adoptionRoute: typeof import("@/app/api/adoption/batch/route");
let shareRoute: typeof import("@/app/api/cat-share/route");
let adoptionListRoute: typeof import("@/app/api/adoption/batches/route");
let ancestryCheckRoute: typeof import("@/app/api/ancestry/check-slug/route");
let ancestryTreeRoute: typeof import("@/app/api/ancestry/tree/route");
let ancestryListRoute: typeof import("@/app/api/ancestry/trees/route");
let catsHistoryRoute: typeof import("@/app/api/cats/history/route");
let catsPreviewListRoute: typeof import("@/app/api/cats/preview-list/route");
let catsPreviewsRoute: typeof import("@/app/api/cats/previews/route");
let previewRoute: typeof import("@/app/api/preview/[id]/route");
let paletteImageRoute: typeof import("@/app/api/palette-generator-settings/image/route");
let discordPaletteRoute: typeof import("@/app/api/discord/palette/route");
let discordRandomCatRoute: typeof import("@/app/api/discord/random-cat/route");
let ancestryPage: typeof import("@/app/projects/warrior-cats/ancestry-tree/[slug]/page");

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
  adoptionListRoute = await import("@/app/api/adoption/batches/route");
  ancestryCheckRoute = await import("@/app/api/ancestry/check-slug/route");
  ancestryTreeRoute = await import("@/app/api/ancestry/tree/route");
  ancestryListRoute = await import("@/app/api/ancestry/trees/route");
  catsHistoryRoute = await import("@/app/api/cats/history/route");
  catsPreviewListRoute = await import("@/app/api/cats/preview-list/route");
  catsPreviewsRoute = await import("@/app/api/cats/previews/route");
  previewRoute = await import("@/app/api/preview/[id]/route");
  paletteImageRoute = await import(
    "@/app/api/palette-generator-settings/image/route"
  );
  discordPaletteRoute = await import("@/app/api/discord/palette/route");
  discordRandomCatRoute = await import("@/app/api/discord/random-cat/route");
  ancestryPage = await import(
    "@/app/projects/warrior-cats/ancestry-tree/[slug]/page"
  );
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

  it("validates adoption routes and checks edit authorization", async () => {
    const invalid = await adoptionRoute.POST(
      new NextRequest("http://localhost/api/adoption/batch", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(invalid.status).toBe(400);
    const profile = await createProfile(
      db,
      { catData: {} },
      { tokenIdentifier: null },
    );
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
      { tokenIdentifier: null },
    );
    const denied = await adoptionRoute.PATCH(
      new NextRequest("http://localhost/api/adoption/batch", {
        method: "PATCH",
        body: JSON.stringify({
          id: batch.id,
          title: "blocked",
          editToken: "wrong",
        }),
      }),
    );
    expect(denied.status).toBe(403);
    expect(
      (
        await adoptionListRoute.GET(
          new NextRequest("http://localhost/api/adoption/batches?pageSize=1"),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await adoptionListRoute.GET(
          new NextRequest(
            "http://localhost/api/adoption/batches?pageSize=nope",
          ),
        )
      ).status,
    ).toBe(400);
  });

  it("covers ancestry routes and PostgreSQL server rendering", async () => {
    const slug = `route-${Date.now()}`;
    const saved = await saveTree(
      db,
      {
        slug,
        name: "Route tree",
        foundingMotherId: "mother",
        foundingFatherId: "father",
        cats: [],
        config: { minChildren: 1, maxChildren: 2, depth: 1, genderRatio: 0.5 },
        password: "secret",
      },
      { tokenIdentifier: null },
    );
    expect(saved.success).toBe(true);
    expect(
      (
        await ancestryCheckRoute.GET(
          new NextRequest(
            `http://localhost/api/ancestry/check-slug?slug=${slug}`,
          ),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await ancestryCheckRoute.GET(
          new NextRequest("http://localhost/api/ancestry/check-slug"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await ancestryTreeRoute.GET(
          new NextRequest(`http://localhost/api/ancestry/tree?slug=${slug}`),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await ancestryTreeRoute.GET(
          new NextRequest("http://localhost/api/ancestry/tree"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await ancestryListRoute.GET(
          new NextRequest("http://localhost/api/ancestry/trees?pageSize=1"),
        )
      ).status,
    ).toBe(200);
    const denied = await ancestryTreeRoute.POST(
      new NextRequest("http://localhost/api/ancestry/tree", {
        method: "POST",
        body: JSON.stringify({ operation: "remove", slug, password: "wrong" }),
      }),
    );
    expect(denied.status).toBe(200);
    expect(await denied.json()).toEqual({
      success: false,
      error: "invalid_password",
    });
    const rendered = await ancestryPage.default({
      params: Promise.resolve({ slug }),
    });
    expect(rendered).toBeTruthy();
  });

  it("covers history, preview queues, preview auth, and invalid preview input", async () => {
    const profile = await createProfile(
      db,
      { catData: {} },
      { tokenIdentifier: null },
    );
    expect(
      (
        await catsHistoryRoute.GET(
          new NextRequest("http://localhost/api/cats/history?limit=1"),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await catsPreviewListRoute.GET(
          new NextRequest("http://localhost/api/cats/preview-list?limit=1"),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await catsHistoryRoute.GET(
          new NextRequest("http://localhost/api/cats/history?limit=nope"),
        )
      ).status,
    ).toBe(400);
    const denied = await catsPreviewsRoute.POST(
      new NextRequest("http://localhost/api/cats/previews", {
        method: "POST",
        body: JSON.stringify({ id: profile.id, adminToken: "wrong" }),
      }),
    );
    expect(denied.status).toBe(403);
    const invalidPreview = await previewRoute.GET(
      new NextRequest("http://localhost/api/preview/x?cat=%%%"),
      { params: Promise.resolve({ id: "x" }) },
    );
    expect(invalidPreview.status).toBe(400);
    const missingProfilePreview = await previewRoute.GET(
      new NextRequest("http://localhost/api/preview/missing"),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(missingProfilePreview.status).toBe(404);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ sheet: "data:image/png;base64,aGVsbG8=" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    const renderedPreview = await previewRoute.GET(
      new NextRequest(`http://localhost/api/preview/${profile.slug}`),
      { params: Promise.resolve({ id: profile.slug }) },
    );
    expect(renderedPreview.status).toBe(200);
    fetchMock.mockRestore();
  });

  it("covers palette image and Discord service route denials/validation", async () => {
    expect(
      (
        await paletteImageRoute.GET(
          new NextRequest(
            "http://localhost/api/palette-generator-settings/image",
          ),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await paletteImageRoute.GET(
          new NextRequest(
            "http://localhost/api/palette-generator-settings/image?slug=missing",
          ),
        )
      ).status,
    ).toBe(200);
    process.env.DISCORD_API_TOKEN =
      "route-test-discord-token-012345678901234567890";
    const noAuthPalette = await discordPaletteRoute.POST(
      new NextRequest("http://localhost/api/discord/palette", {
        method: "POST",
        body: JSON.stringify({ imageUrl: "https://example.com/cat.png" }),
      }),
    );
    expect(noAuthPalette.status).toBe(401);
    const noAuthCat = await discordRandomCatRoute.POST(
      new NextRequest("http://localhost/api/discord/random-cat", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    expect(noAuthCat.status).toBe(401);
    const invalidPalette = await discordPaletteRoute.POST(
      new NextRequest("http://localhost/api/discord/palette", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.DISCORD_API_TOKEN}` },
        body: JSON.stringify({ imageUrl: "bad" }),
      }),
    );
    expect(invalidPalette.status).toBe(400);
  });
});
