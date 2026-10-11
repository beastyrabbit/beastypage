/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("season listing", () => {
  it("returns the newest seasons when the table exceeds the display cap", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let index = 0; index < 201; index += 1) {
        await ctx.db.insert("card_season", {
          seasonName: `Season ${index}`,
          createdAt: index,
          updatedAt: index,
        });
      }
    });

    const seasons = await t.query(api.seasons.list, {});

    expect(seasons).toHaveLength(200);
    expect(seasons[0]?.season_name).toBe("Season 200");
    expect(seasons.at(-1)?.season_name).toBe("Season 1");
    expect(seasons.some((season) => season.season_name === "Season 0")).toBe(
      false,
    );
  });
});
