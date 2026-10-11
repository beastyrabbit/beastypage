import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHOW_LOOK,
  isShowLookId,
  resolveShowLook,
  SHOW_LOOK_IDS,
  SHOW_LOOK_META,
  SHOW_LOOK_SETTING_KEY,
} from "./lookMeta";

describe("resolveShowLook", () => {
  it("defaults to classic when unset or invalid", () => {
    expect(DEFAULT_SHOW_LOOK).toBe("classic");
    expect(resolveShowLook(undefined)).toBe("classic");
    expect(resolveShowLook(null)).toBe("classic");
    expect(resolveShowLook({})).toBe("classic");
    expect(resolveShowLook({ [SHOW_LOOK_SETTING_KEY]: "neon" })).toBe(
      "classic",
    );
    expect(resolveShowLook({ [SHOW_LOOK_SETTING_KEY]: 3 })).toBe("classic");
  });

  it("round-trips every look id", () => {
    for (const id of SHOW_LOOK_IDS) {
      expect(resolveShowLook({ [SHOW_LOOK_SETTING_KEY]: id })).toBe(id);
      expect(isShowLookId(id)).toBe(true);
    }
  });

  it("has complete metadata for every look", () => {
    for (const id of SHOW_LOOK_IDS) {
      const meta = SHOW_LOOK_META[id];
      expect(meta.id).toBe(id);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.blurb.length).toBeGreaterThan(0);
      expect(meta.palette).toHaveLength(5);
    }
  });
});
