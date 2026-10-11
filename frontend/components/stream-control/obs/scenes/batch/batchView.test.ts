import { describe, expect, it } from "vitest";
import { BATCH_THEME_IDS } from "../../themes/batchThemeMeta";
import { BATCH_LOOK_CHROME, batchStatusLabel } from "./batchView";

describe("batchStatusLabel", () => {
  it("has a line for every beat", () => {
    expect(batchStatusLabel("loading", false, "Eyes", null)).toBe("Summoning…");
    expect(batchStatusLabel("windup", false, "Eyes", null)).toBe(
      "Rolling Eyes…",
    );
    expect(batchStatusLabel("deal", false, "Eyes", null)).toBe("Rolling Eyes…");
    expect(batchStatusLabel("hold", false, "Eyes", null)).toBe("Eyes rolled");
    expect(batchStatusLabel("awaiting", false, "Eyes", null)).toBe(
      "Eyes rolled. Who leaves? Say a number",
    );
    expect(batchStatusLabel("verdict", false, "Eyes", "16")).toBe(
      "#16 leaves in…",
    );
    expect(batchStatusLabel("depart", false, "Eyes", "16")).toBe("#16 leaves");
    expect(batchStatusLabel("repack", false, "Eyes", null)).toBe(
      "Making room…",
    );
    expect(batchStatusLabel("done", false, "Eyes", null)).toBe("Saving…");
    expect(batchStatusLabel("done", true, "Eyes", null)).toBe("Complete");
  });
});

describe("BATCH_LOOK_CHROME", () => {
  it("covers every batch look and keeps the handheld bare", () => {
    for (const id of BATCH_THEME_IDS)
      expect(BATCH_LOOK_CHROME[id]).toBeDefined();
    expect(BATCH_LOOK_CHROME.handheld).toEqual({
      plaque: "none",
      lines: false,
      glints: false,
    });
    expect(BATCH_LOOK_CHROME.contact.glints).toBe(false);
    expect(BATCH_LOOK_CHROME.simple.plaque).toBe("slot");
  });
});
