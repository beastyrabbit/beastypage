/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("legacy settings ownership", () => {
  it("keeps rows without a capability read-only instead of allowing a slug claim", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ctx.db.insert("cat_shares", {
        slug: "legacyshare",
        data: { value: 1 },
        createdAt: 1,
      });
      await ctx.db.insert("dash_settings", {
        slug: "legacydash",
        config: { value: 1 },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("palette_generator_settings", {
        slug: "legacypalette",
        config: { value: 1 },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("pixelator_settings", {
        slug: "legacypixelator",
        config: { value: 1 },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("single_cat_settings", {
        slug: "legacysinglecat",
        config: { value: 1 },
        createdAt: 1,
        updatedAt: 1,
      });
    });

    await expect(
      t.mutation(api.catShares.create, {
        slug: "legacyshare",
        data: { value: 2 },
      }),
    ).rejects.toThrow("Not authorized");
    await expect(
      t.mutation(api.dashSettings.save, {
        slug: "legacydash",
        config: { value: 2 },
      }),
    ).rejects.toThrow("Not authorized");
    await expect(
      t.mutation(api.paletteGeneratorSettings.save, {
        slug: "legacypalette",
        config: { value: 2 },
      }),
    ).rejects.toThrow("Not authorized");
    await expect(
      t.mutation(api.pixelatorSettings.save, {
        slug: "legacypixelator",
        config: { value: 2 },
      }),
    ).rejects.toThrow("Not authorized");
    await expect(
      t.mutation(api.singleCatSettings.save, {
        slug: "legacysinglecat",
        config: { value: 2 },
      }),
    ).rejects.toThrow("Not authorized");
  });
});
