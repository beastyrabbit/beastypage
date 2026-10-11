/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  vi.stubEnv("CONVEX_SITE_URL", "https://fixture.convex.site");
  vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "");
});
afterEach(() => vi.unstubAllEnvs());

async function issueUpload(t: ReturnType<typeof convexTest>, content = "card") {
  const url = await t.mutation(api.catdex.generateUploadUrl, {});
  const token = new URL(url, "https://fixture.invalid").searchParams.get(
    "token",
  );
  if (!token) throw new Error("missing upload token");
  const storageId = await t.run((ctx) =>
    ctx.storage.store(new Blob([content], { type: "image/png" })),
  );
  await t.mutation(internal.catdex.attachUpload, { token, storageId });
  return { token, storageId };
}

function uploadPath(url: string) {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

describe("Catdex uploads", () => {
  it("fails closed when the Convex site origin is unavailable", async () => {
    vi.stubEnv("CONVEX_SITE_URL", "");
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.catdex.generateUploadUrl, {})).rejects.toThrow(
      "CONVEX_SITE_URL is not configured",
    );
  });

  it("serves a CORS preflight and rejects unsupported media", async () => {
    const t = convexTest(schema, modules);
    const url = await t.mutation(api.catdex.generateUploadUrl, {});
    const preflight = await t.fetch(uploadPath(url), {
      method: "OPTIONS",
      headers: { origin: "https://frontend.example" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
    expect(preflight.headers.get("access-control-allow-methods")).toContain(
      "POST",
    );

    const response = await t.fetch(uploadPath(url), {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "not-an-image",
    });
    expect(response.status).toBe(415);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("keeps the legacy upload flow bound to a managed reservation", async () => {
    const t = convexTest(schema, modules);
    const urlResponse = await t.fetch("/api/storage/getUploadUrl", {
      method: "POST",
    });
    expect(urlResponse.status).toBe(200);
    const { uploadUrl } = (await urlResponse.json()) as { uploadUrl: string };
    expect(uploadUrl).toContain("/catdex/upload?token=");

    const uploadResponse = await t.fetch(uploadPath(uploadUrl), {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: "png-fixture",
    });
    expect(uploadResponse.status).toBe(200);
    const { storageId } = (await uploadResponse.json()) as {
      storageId: Id<"_storage">;
    };
    const { seasonId, rarityId } = await t.run(async (ctx) => ({
      seasonId: await ctx.db.insert("card_season", {
        seasonName: "Fixture",
        createdAt: 1,
        updatedAt: 1,
      }),
      rarityId: await ctx.db.insert("rarity", {
        rarityName: "Common",
        createdAt: 1,
        updatedAt: 1,
      }),
    }));

    await expect(
      t.mutation(api.catdex.create, {
        twitchUserName: "fixture",
        catName: "legacy-cat",
        seasonId,
        rarityId,
        defaultCard: { storageId, fileName: "card.png" },
      }),
    ).resolves.toMatchObject({ cat_name: "legacy-cat" });
  });

  it("rejects bodies over the bounded upload size", async () => {
    const t = convexTest(schema, modules);
    const url = await t.mutation(api.catdex.generateUploadUrl, {});
    const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
    const response = await t.fetch(uploadPath(url), {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: oversized,
    });
    expect(response.status).toBe(413);
  });

  it("records a successful upload and rejects replay", async () => {
    const t = convexTest(schema, modules);
    const url = await t.mutation(api.catdex.generateUploadUrl, {});
    const response = await t.fetch(uploadPath(url), {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: "png-fixture",
    });
    expect(response.status).toBe(200);
    const { storageId } = (await response.json()) as { storageId: string };
    expect(storageId).toMatch(/_storage$/);
    expect(
      await t.run((ctx) =>
        ctx.db.system.get("_storage", storageId as Id<"_storage">),
      ),
    ).not.toBeNull();

    const replay = await t.fetch(uploadPath(url), {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: "png-fixture",
    });
    expect(replay.status).toBe(410);
  });

  it("binds storage objects to a one-time public upload capability", async () => {
    const t = convexTest(schema, modules);
    const first = await issueUpload(t);
    const second = await issueUpload(t, "custom");
    const { seasonId, rarityId } = await t.run(async (ctx) => ({
      seasonId: await ctx.db.insert("card_season", {
        seasonName: "Fixture",
        createdAt: 1,
        updatedAt: 1,
      }),
      rarityId: await ctx.db.insert("rarity", {
        rarityName: "Common",
        createdAt: 1,
        updatedAt: 1,
      }),
    }));

    await t.mutation(api.catdex.create, {
      twitchUserName: "fixture",
      catName: "cat",
      seasonId,
      rarityId,
      defaultCard: {
        storageId: first.storageId,
        fileName: "card.png",
        uploadToken: first.token,
      },
      customCard: {
        storageId: second.storageId,
        fileName: "custom.png",
        uploadToken: second.token,
      },
    });

    await expect(
      t.mutation(api.catdex.create, {
        twitchUserName: "fixture",
        catName: "cat-again",
        seasonId,
        rarityId,
        defaultCard: {
          storageId: first.storageId,
          fileName: "card.png",
          uploadToken: first.token,
        },
      }),
    ).rejects.toThrow("not issued");
  });

  it("rejects a known storage object when its upload token is omitted", async () => {
    const t = convexTest(schema, modules);
    const upload = await issueUpload(t);
    const { seasonId, rarityId } = await t.run(async (ctx) => ({
      seasonId: await ctx.db.insert("card_season", {
        seasonName: "Fixture",
        createdAt: 1,
        updatedAt: 1,
      }),
      rarityId: await ctx.db.insert("rarity", {
        rarityName: "Common",
        createdAt: 1,
        updatedAt: 1,
      }),
    }));

    await t.mutation(api.catdex.create, {
      twitchUserName: "fixture",
      catName: "cat",
      seasonId,
      rarityId,
      defaultCard: {
        storageId: upload.storageId,
        fileName: "card.png",
        uploadToken: upload.token,
      },
    });

    await expect(
      t.mutation(api.catdex.create, {
        twitchUserName: "fixture",
        catName: "cat-again",
        seasonId,
        rarityId,
        defaultCard: {
          storageId: upload.storageId,
          fileName: "card.png",
        },
      }),
    ).rejects.toThrow("not issued");
  });

  it("deletes attached blobs after upload capabilities expire", async () => {
    const t = convexTest(schema, modules);
    const url = await t.mutation(api.catdex.generateUploadUrl, {});
    const uploadResponse = await t.fetch(uploadPath(url), {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: "png-fixture",
    });
    const { storageId } = (await uploadResponse.json()) as {
      storageId: string;
    };
    const upload = {
      storageId: storageId as Id<"_storage">,
      token: new URL(url).searchParams.get("token") as string,
    };
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("catdex_uploads")
        .withIndex("byToken", (q) => q.eq("token", upload.token))
        .unique();
      if (!row) throw new Error("missing upload row");
      await ctx.db.patch(row._id, { expiresAt: 0 });
    });
    await t.mutation(internal.catdex.cleanupExpiredUploads, { limit: 10 });
    expect(
      await t.run((ctx) => ctx.db.system.get("_storage", upload.storageId)),
    ).toBeNull();
  });
});
