import { describe, expect, it } from "vitest";
import {
  BATCH_THEME_IDS,
  BATCH_THEME_META,
  DEFAULT_BATCH_THEME,
  isBatchThemeId,
  resolveBatchTheme,
} from "./batchThemeMeta";

describe("batchThemeMeta", () => {
  it("has meta for every id and keeps the original grid as the default", () => {
    for (const id of BATCH_THEME_IDS) {
      expect(BATCH_THEME_META[id].id).toBe(id);
      expect(BATCH_THEME_META[id].palette).toHaveLength(5);
    }
    expect(DEFAULT_BATCH_THEME).toBe("simple");
  });

  it("resolves unknown or missing values to the default", () => {
    expect(resolveBatchTheme(null)).toBe("simple");
    expect(resolveBatchTheme({})).toBe("simple");
    expect(resolveBatchTheme({ batchTheme: "nope" })).toBe("simple");
    expect(resolveBatchTheme({ batchTheme: 3 })).toBe("simple");
    expect(resolveBatchTheme({ batchTheme: "claw" })).toBe("claw");
    expect(isBatchThemeId("nursery")).toBe(true);
    expect(isBatchThemeId("plate")).toBe(false);
  });
});
