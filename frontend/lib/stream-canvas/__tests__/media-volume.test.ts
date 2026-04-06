import { describe, expect, it } from "vitest";
import {
  clampMediaVolume,
  DEFAULT_MEDIA_VOLUME,
  getEffectiveMediaVolume,
} from "@/lib/stream-canvas/media-volume";

describe("media volume helpers", () => {
  it("clamps volume into the supported range", () => {
    expect(clampMediaVolume(-1)).toBe(0);
    expect(clampMediaVolume(0.25)).toBe(0.25);
    expect(clampMediaVolume(2)).toBe(1);
  });

  it("uses a curved volume response for finer low-end control", () => {
    expect(getEffectiveMediaVolume(0)).toBe(0);
    expect(getEffectiveMediaVolume(1)).toBe(1);
    expect(getEffectiveMediaVolume(0.05)).toBeCloseTo(0.0025, 6);
    expect(getEffectiveMediaVolume(0.2)).toBeCloseTo(0.04, 6);
  });

  it("exports the shared default media volume at 50 percent", () => {
    expect(DEFAULT_MEDIA_VOLUME).toBe(0.5);
  });
});
