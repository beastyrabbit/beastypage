import { describe, expect, it } from "vitest";
import {
  DEFAULT_SINGLE_CAT_SETTINGS,
  parseSingleCatPayload,
  singleCatSettingsEqual,
} from "./singleCatVariants";

describe("single-cat saved settings", () => {
  it.each([null, undefined, 2, "v2", [], {}, { v: 1 }, { v: 2, mode: "calm" }])(
    "uses defaults for an invalid envelope: %j",
    (payload) => {
      const parsed = parseSingleCatPayload(payload);
      expect(parsed).toEqual(DEFAULT_SINGLE_CAT_SETTINGS);
      expect(parsed).not.toBe(DEFAULT_SINGLE_CAT_SETTINGS);
    },
  );

  it("preserves v2 sanitization, palette order and metadata limits", () => {
    const parsed = parseSingleCatPayload({
      v: 2,
      mode: "calm",
      timing: {
        allowFastFlips: 1,
        pauseDelays: { flashyMs: "1234.6", calmMs: 20000 },
      },
      speedMultiplier: 50,
      accessoryRange: { min: 1, max: 3 },
      scarRange: { min: 2, max: 1 },
      tortieRange: { min: 0, max: Number.POSITIVE_INFINITY },
      exactLayerCounts: false,
      afterlifeMode: "starForce",
      extendedModes: ["mood", "base", "bold", "mood", "unknown", null],
      includeBaseColours: false,
      includeNewSprites: false,
      catName: "c".repeat(101),
      creatorName: "b".repeat(101),
    });

    expect(parsed).toEqual({
      ...DEFAULT_SINGLE_CAT_SETTINGS,
      mode: "calm",
      timing: {
        ...DEFAULT_SINGLE_CAT_SETTINGS.timing,
        allowFastFlips: true,
        pauseDelays: { flashyMs: 1235, calmMs: 10000 },
      },
      speedMultiplier: 10,
      accessoryRange: { min: 1, max: 3 },
      exactLayerCounts: false,
      afterlifeMode: "starForce",
      extendedModes: ["base", "bold", "mood"],
      includeBaseColours: false,
      catName: "c".repeat(100),
      creatorName: "b".repeat(100),
    });
    expect(
      singleCatSettingsEqual(parsed, {
        ...parsed,
        catName: "another cat",
        creatorName: "another creator",
      }),
    ).toBe(true);
  });

  it("retains defaults for malformed v2 options", () => {
    expect(
      parseSingleCatPayload({
        v: 2,
        mode: "other",
        timing: null,
        speedMultiplier: Number.NaN,
        exactLayerCounts: 0,
        afterlifeMode: "unknown",
        extendedModes: "mood",
        includeBaseColours: null,
        catName: 1,
        creatorName: false,
      }),
    ).toEqual(DEFAULT_SINGLE_CAT_SETTINGS);
  });
});
