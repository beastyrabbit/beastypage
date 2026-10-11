/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import type { FunctionReturnType } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("bounded archive queries", () => {
  it("makes artwork past the legacy collection cap reachable through pages", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let i = 0; i < 205; i += 1) {
        await ctx.db.insert("collection", {
          artistName: `Artist ${i}`,
          animal: "Cat",
          link: "https://example.com",
          createdAt: i,
          updatedAt: i,
        });
      }
    });

    const artists: string[] = [];
    let cursor: string | null = null;
    for (;;) {
      const result: FunctionReturnType<typeof api.collection.page> =
        await t.query(api.collection.page, {
          paginationOpts: { numItems: 200, cursor },
        });
      expect(result.page.length).toBeLessThanOrEqual(36);
      artists.push(...result.page.map((entry) => entry.artist_name));
      if (result.isDone) break;
      cursor = result.continueCursor;
    }

    expect(artists).toEqual(
      Array.from({ length: 205 }, (_, i) => `Artist ${204 - i}`),
    );
    await expect(t.query(api.collection.list, {})).resolves.toHaveLength(200);
  });

  it("marks wheel statistics as truncated only when older spins are omitted", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("wheel_spins", {
        prizeName: "Divinara",
        forced: false,
        createdAt: 1,
      });
      await ctx.db.insert("wheel_spins", {
        prizeName: "Holo Nova",
        forced: false,
        createdAt: 2,
      });
    });

    await expect(t.query(api.wheel.stats, { limit: 2 })).resolves.toMatchObject(
      {
        totalSpins: 2,
        sampleSize: 2,
        truncated: false,
      },
    );

    await t.run((ctx) =>
      ctx.db.insert("wheel_spins", {
        prizeName: "Singularity",
        forced: true,
        createdAt: 3,
      }),
    );
    await expect(t.query(api.wheel.stats, { limit: 2 })).resolves.toEqual({
      totalSpins: 1,
      totalForced: 1,
      lastSpinAt: 2,
      sampleSize: 2,
      truncated: true,
      prizes: [
        {
          prizeName: "Singularity",
          count: 0,
          forcedCount: 1,
          lastSpinAt: 3,
        },
        {
          prizeName: "Holo Nova",
          count: 1,
          forcedCount: 0,
          lastSpinAt: 2,
        },
      ],
    });
  });
});
