import { describe, expect, it } from "vitest";
import { SpriteSheetLoader } from "../spriteSheetLoader.js";

describe("SpriteSheetLoader pose offsets", () => {
  it("uses legacy offsets only for preserved old-layout sheets", () => {
    const loader = new SpriteSheetLoader();
    loader.poseData = {
      poseNameToOffset: {
        adolescent_long0: { x: 0, y: 3 },
      },
    };
    loader.spritesOffsetMap = [{ x: 0, y: 0 }];
    const resolvePoseOffset = loader.resolvePoseOffset.bind(loader) as (
      spriteNumber: number,
      poseName?: string | null,
      spriteInfo?: Record<string, unknown> | null,
    ) => unknown;

    expect(resolvePoseOffset(8, "adult_short2", { poseLayout: "legacy" })).toEqual({
      x: 2,
      y: 2,
    });
    expect(
      resolvePoseOffset(8, "adolescent_long0", {
        poseLayout: "legacy",
      }),
    ).toBeNull();
    expect(resolvePoseOffset(8, null, { poseLayout: "legacy" })).toEqual({
      x: 2,
      y: 2,
    });
    expect(resolvePoseOffset(8, "adolescent_long0", {})).toEqual({
      x: 0,
      y: 3,
    });
  });
});
