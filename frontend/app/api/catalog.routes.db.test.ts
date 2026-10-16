import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { closeDatabase, getDb } from "@/server/db/client";
import { cardSeason, collection, rarity } from "@/server/db/schema";

const identity = { tokenIdentifier: null as string | null };
vi.mock("@/server/auth/identity", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/server/auth/identity")>();
  return {
    ...actual,
    getRequestIdentity: vi.fn(async () => identity),
  };
});

const originalEnv = { ...process.env };
let seasonsRoute: typeof import("./seasons/route");
let raritiesRoute: typeof import("./rarities/route");
let catdexRoute: typeof import("./catdex/route");
let catdexOwnerRoute: typeof import("./catdex/owner/route");
let catdexModerationRoute: typeof import("./catdex/moderation/route");
let catdexPendingRoute: typeof import("./catdex/pending/route");
let catdexItemRoute: typeof import("./catdex/[id]/route");
let catdexApproveRoute: typeof import("./catdex/[id]/approve/route");
let collectionRoute: typeof import("./collection/route");
let collectionFocusRoute: typeof import("./collection/[id]/focus/route");
let uploadUrlRoute: typeof import("./catdex/upload-url/route");
let uploadRoute: typeof import("./catdex/upload/route");

let seasonId: string;
let rarityId: string;
let collectionId: string;
let catdexId: string;
let uploadToken: string;
let uploadFileId: string;
const imageBytes = Buffer.from(
  "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDAT\x08\xd7c\xf8\xcf\xc0\xf0\x1f\x00\x05\x00\x01\xff\x89\x99=\x1d\x00\x00\x00\x00IEND\xaeB\x60\x82",
  "binary",
);

function jsonRequest(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function responseJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

beforeAll(async () => {
  process.env.DATA_BACKEND = "postgres";
  process.env.DATABASE_URL = inject("databaseUrl");
  process.env.QUICK_SHARE_ADMIN_TOKEN_IDENTIFIERS =
    "https://identity.example|catalog-admin";
  seasonsRoute = await import("./seasons/route");
  raritiesRoute = await import("./rarities/route");
  catdexRoute = await import("./catdex/route");
  catdexOwnerRoute = await import("./catdex/owner/route");
  catdexModerationRoute = await import("./catdex/moderation/route");
  catdexPendingRoute = await import("./catdex/pending/route");
  catdexItemRoute = await import("./catdex/[id]/route");
  catdexApproveRoute = await import("./catdex/[id]/approve/route");
  collectionRoute = await import("./collection/route");
  collectionFocusRoute = await import("./collection/[id]/focus/route");
  uploadUrlRoute = await import("./catdex/upload-url/route");
  uploadRoute = await import("./catdex/upload/route");

  const db = getDb();
  const now = new Date();
  const [season] = await db
    .insert(cardSeason)
    .values({
      seasonName: "Route fixture season",
      shortName: "RFS",
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const [rarityRow] = await db
    .insert(rarity)
    .values({
      rarityName: "Route fixture rarity",
      stars: 2,
      chancePercent: 25,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const [collectionEntry] = await db
    .insert(collection)
    .values({
      artistName: "Route artist",
      animal: "cat",
      link: "https://example.test/route",
    })
    .returning();
  seasonId = season.id;
  rarityId = rarityRow.id;
  collectionId = collectionEntry.id;

  const uploadUrlResponse = await uploadUrlRoute.POST(
    jsonRequest("http://localhost/api/catdex/upload-url", "POST", {
      clientKey: "route-client-123456",
    }),
  );
  const uploadUrlBody = await responseJson(uploadUrlResponse);
  uploadToken = new URL(
    uploadUrlBody.uploadUrl as string,
    "http://localhost",
  ).searchParams.get("token") as string;
  const uploadResponse = await uploadRoute.POST(
    new NextRequest(`http://localhost/api/catdex/upload?token=${uploadToken}`, {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: imageBytes,
    }),
  );
  expect(uploadResponse.status).toBe(200);
  uploadFileId = (await responseJson(uploadResponse)).fileId as string;

  const createdResponse = await catdexRoute.POST(
    jsonRequest("http://localhost/api/catdex", "POST", {
      twitchUserName: "route-owner",
      catName: "Route Cat",
      seasonId,
      rarityId,
      defaultCard: {
        storageId: uploadFileId,
        fileName: "route.png",
        uploadToken,
      },
    }),
  );
  expect(createdResponse.status).toBe(200);
  catdexId = (await responseJson(createdResponse)).id as string;
  identity.tokenIdentifier = "https://identity.example|catalog-admin";
  expect(
    await catdexApproveRoute.POST(
      jsonRequest("http://localhost/api/catdex/approve", "POST", {
        approved: true,
      }),
      { params: Promise.resolve({ id: catdexId }) },
    ),
  ).toHaveProperty("status", 200);
  identity.tokenIdentifier = null;
});

afterAll(async () => {
  await closeDatabase();
  process.env = originalEnv;
});

describe("catalog routes on PostgreSQL", () => {
  it("serves seasons and rarities and rejects the Convex fallback", async () => {
    expect((await seasonsRoute.GET()).status).toBe(200);
    expect((await raritiesRoute.GET()).status).toBe(200);
    expect((await seasonsRoute.POST()).status).toBe(200);
    expect((await raritiesRoute.POST()).status).toBe(200);

    process.env.DATA_BACKEND = "convex";
    expect((await seasonsRoute.GET()).status).toBe(404);
    expect((await raritiesRoute.GET()).status).toBe(404);
    process.env.DATA_BACKEND = "postgres";
  });

  it("covers public, owner, pending, moderation, and item Catdex routes", async () => {
    const publicResponse = await catdexRoute.GET(
      new NextRequest("http://localhost/api/catdex?pageSize=999"),
    );
    expect(publicResponse.status).toBe(200);
    expect(await responseJson(publicResponse)).toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({ id: catdexId, approved: true }),
      ]),
    });
    const invalidPublic = await catdexRoute.GET(
      new NextRequest("http://localhost/api/catdex?pageSize=not-a-number"),
    );
    expect(invalidPublic.status).toBe(400);
    const deniedPendingFilter = await catdexRoute.GET(
      new NextRequest("http://localhost/api/catdex?approved=false"),
    );
    expect(deniedPendingFilter.status).toBe(403);

    const ownerResponse = await catdexOwnerRoute.GET(
      new NextRequest("http://localhost/api/catdex/owner?owner=route-owner"),
    );
    expect(ownerResponse.status).toBe(200);
    expect(await responseJson(ownerResponse)).toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({ id: catdexId }),
      ]),
    });
    const ownerInvalid = await catdexOwnerRoute.GET(
      new NextRequest("http://localhost/api/catdex/owner"),
    );
    expect(ownerInvalid.status).toBe(400);

    expect((await catdexPendingRoute.GET()).status).toBe(200);
    process.env.DATA_BACKEND = "convex";
    expect((await catdexPendingRoute.GET()).status).toBe(404);
    process.env.DATA_BACKEND = "postgres";

    const moderationDenied = await catdexModerationRoute.GET(
      new NextRequest("http://localhost/api/catdex/moderation?approved=true"),
    );
    expect(moderationDenied.status).toBe(403);
    identity.tokenIdentifier = "https://identity.example|catalog-admin";
    const moderationResponse = await catdexModerationRoute.GET(
      new NextRequest("http://localhost/api/catdex/moderation?approved=true"),
    );
    expect(moderationResponse.status).toBe(200);
    expect(await responseJson(moderationResponse)).toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({ id: catdexId }),
      ]),
    });
    identity.tokenIdentifier = null;

    const itemResponse = await catdexItemRoute.GET(
      new NextRequest(`http://localhost/api/catdex/${catdexId}`),
      { params: Promise.resolve({ id: catdexId }) },
    );
    expect(itemResponse.status).toBe(200);
    expect((await responseJson(itemResponse)).id).toBe(catdexId);
    expect(
      (
        await catdexItemRoute.GET(
          new NextRequest(
            "http://localhost/api/catdex/00000000-0000-4000-8000-000000000000",
          ),
          {
            params: Promise.resolve({
              id: "00000000-0000-4000-8000-000000000000",
            }),
          },
        )
      ).status,
    ).toBe(404);
    const deniedEdit = await catdexItemRoute.PATCH(
      jsonRequest("http://localhost/api/catdex/item", "PATCH", {
        catName: "denied",
      }),
      { params: Promise.resolve({ id: catdexId }) },
    );
    expect(deniedEdit.status).toBe(403);
    const invalidEdit = await catdexItemRoute.PATCH(
      jsonRequest("http://localhost/api/catdex/item", "PATCH", { catName: "" }),
      { params: Promise.resolve({ id: catdexId }) },
    );
    expect(invalidEdit.status).toBe(400);
    identity.tokenIdentifier = "https://identity.example|catalog-admin";
    const edited = await catdexItemRoute.PATCH(
      jsonRequest("http://localhost/api/catdex/item", "PATCH", {
        catName: "Edited Route Cat",
      }),
      { params: Promise.resolve({ id: catdexId }) },
    );
    expect(edited.status).toBe(200);
    identity.tokenIdentifier = null;
  });

  it("covers approval and collection focus success and denials", async () => {
    const deniedApproval = await catdexApproveRoute.POST(
      jsonRequest("http://localhost/api/catdex/approve", "POST", {
        approved: false,
      }),
      { params: Promise.resolve({ id: catdexId }) },
    );
    expect(deniedApproval.status).toBe(403);
    const invalidApproval = await catdexApproveRoute.POST(
      jsonRequest("http://localhost/api/catdex/approve", "POST", {
        approved: "yes",
      }),
      { params: Promise.resolve({ id: catdexId }) },
    );
    expect(invalidApproval.status).toBe(400);
    identity.tokenIdentifier = "https://identity.example|catalog-admin";
    const approved = await catdexApproveRoute.POST(
      jsonRequest("http://localhost/api/catdex/approve", "POST", {
        approved: false,
      }),
      { params: Promise.resolve({ id: catdexId }) },
    );
    expect(approved.status).toBe(200);
    identity.tokenIdentifier = null;

    const collectionResponse = await collectionRoute.GET(
      new NextRequest("http://localhost/api/collection?pageSize=999"),
    );
    expect(collectionResponse.status).toBe(200);
    expect(await responseJson(collectionResponse)).toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({ id: collectionId }),
      ]),
    });
    const invalidCollection = await collectionRoute.GET(
      new NextRequest("http://localhost/api/collection?pageSize=bad"),
    );
    expect(invalidCollection.status).toBe(400);
    const deniedPatch = await collectionRoute.PATCH(
      jsonRequest("http://localhost/api/collection", "PATCH", {
        id: collectionId,
        focusX: 10,
        focusY: 90,
      }),
    );
    expect(deniedPatch.status).toBe(403);
    const deniedFocus = await collectionFocusRoute.POST(
      jsonRequest("http://localhost/api/collection/focus", "POST", {
        focusX: 10,
        focusY: 90,
      }),
      { params: Promise.resolve({ id: collectionId }) },
    );
    expect(deniedFocus.status).toBe(403);
    const invalidFocus = await collectionFocusRoute.POST(
      jsonRequest("http://localhost/api/collection/focus", "POST", {
        focusX: "bad",
        focusY: 90,
      }),
      { params: Promise.resolve({ id: collectionId }) },
    );
    expect(invalidFocus.status).toBe(400);
    identity.tokenIdentifier = "https://identity.example|catalog-admin";
    const patched = await collectionRoute.PATCH(
      jsonRequest("http://localhost/api/collection", "PATCH", {
        id: collectionId,
        focusX: -10,
        focusY: 120,
      }),
    );
    expect(patched.status).toBe(200);
    expect(await responseJson(patched)).toEqual({ focusX: 0, focusY: 100 });
    const focused = await collectionFocusRoute.PATCH(
      jsonRequest("http://localhost/api/collection/focus", "PATCH", {
        focusX: 25,
        focusY: 75,
      }),
      { params: Promise.resolve({ id: collectionId }) },
    );
    expect(focused.status).toBe(200);
    expect(await responseJson(focused)).toEqual({ focusX: 25, focusY: 75 });
    identity.tokenIdentifier = null;
  });
});
