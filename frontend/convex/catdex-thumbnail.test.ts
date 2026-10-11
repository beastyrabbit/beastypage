/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function insertBaseRows(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const seasonId = await ctx.db.insert("card_season", {
      seasonName: "Fixture",
      createdAt: 1,
      updatedAt: 1,
    });
    const rarityId = await ctx.db.insert("rarity", {
      rarityName: "Common",
      createdAt: 1,
      updatedAt: 1,
    });
    return { seasonId, rarityId };
  });
}

describe("Catdex thumbnail backfill", () => {
  it("finds legacy rows without being blocked by completed rows", async () => {
    const t = convexTest(schema, modules);
    const { seasonId, rarityId } = await insertBaseRows(t);
    const legacyId = await t.run(async (ctx) => {
      for (let i = 0; i < 3; i += 1) {
        await ctx.db.insert("catdex", {
          catName: `Complete ${i}`,
          twitchUserName: "fixture",
          seasonId,
          rarityId,
          approved: true,
          thumbnailStatus: "complete",
          createdAt: i,
          updatedAt: i,
        });
      }
      return ctx.db.insert("catdex", {
        catName: "Legacy",
        twitchUserName: "fixture",
        seasonId,
        rarityId,
        approved: true,
        createdAt: 4,
        updatedAt: 4,
      });
    });

    await expect(
      t.mutation(internal.catdex.enqueueMissingThumbnails, { limit: 1 }),
    ).resolves.toEqual({ enqueued: 0 });
    await expect(t.run((ctx) => ctx.db.get(legacyId))).resolves.toMatchObject({
      thumbnailStatus: "complete",
    });
  });

  it("marks pending rows processing and schedules one bounded job", async () => {
    const t = convexTest(schema, modules);
    const { seasonId, rarityId } = await insertBaseRows(t);
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["fixture"], { type: "image/png" })),
    );
    const pendingId = await t.run((ctx) =>
      ctx.db.insert("catdex", {
        catName: "Pending",
        twitchUserName: "fixture",
        seasonId,
        rarityId,
        approved: true,
        defaultCardStorageId: storageId,
        defaultCardName: "pending.png",
        thumbnailStatus: "pending",
        createdAt: 1,
        updatedAt: 1,
      }),
    );

    await expect(
      t.mutation(internal.catdex.enqueueMissingThumbnails, { limit: 1 }),
    ).resolves.toEqual({ enqueued: 1 });
    await expect(t.run((ctx) => ctx.db.get(pendingId))).resolves.toMatchObject({
      thumbnailStatus: "processing",
    });
    const scheduled = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].name).toMatch(/:generateForCat$/);
  });

  it("does not requeue failed rows but recovers stale processing rows", async () => {
    const t = convexTest(schema, modules);
    const { seasonId, rarityId } = await insertBaseRows(t);
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["fixture"], { type: "image/png" })),
    );
    await t.run(async (ctx) => {
      const now = Date.now();
      for (const [catName, thumbnailStatus, thumbnailAttemptedAt] of [
        ["Failed", "failed", now] as const,
        ["Stale", "processing", now - 31 * 60 * 1000] as const,
      ]) {
        await ctx.db.insert("catdex", {
          catName,
          twitchUserName: "fixture",
          seasonId,
          rarityId,
          approved: true,
          defaultCardStorageId: storageId,
          defaultCardName: `${catName}.png`,
          thumbnailStatus,
          thumbnailAttemptedAt,
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    await expect(
      t.mutation(internal.catdex.enqueueMissingThumbnails, { limit: 2 }),
    ).resolves.toEqual({ enqueued: 1 });
    await expect(
      t.run(async (ctx) => {
        const rows = await ctx.db.query("catdex").collect();
        return rows.map((row) => ({
          catName: row.catName,
          status: row.thumbnailStatus,
        }));
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        { catName: "Failed", status: "failed" },
        { catName: "Stale", status: "processing" },
      ]),
    );
  });
});
