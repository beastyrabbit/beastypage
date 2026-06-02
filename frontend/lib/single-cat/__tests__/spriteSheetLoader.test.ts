import { afterEach, describe, expect, it, vi } from "vitest";
import { SpriteSheetLoader } from "../spriteSheetLoader.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

  it("does not initialize sheet mode when pose data is missing", async () => {
    const loader = new SpriteSheetLoader();
    const fetchMock = vi.fn(async (path: string) => {
      if (path.endsWith("spritesIndex.json")) {
        return { ok: true, json: async () => ({ lineart: {} }) };
      }
      if (path.endsWith("spritesOffsetMap.json")) {
        return { ok: true, json: async () => [{ x: 0, y: 0 }] };
      }
      return { ok: false };
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.stubGlobal("fetch", fetchMock);

    await expect(loader.init()).resolves.toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      "Could not load sprite pose data; all sprite rendering may be degraded (pose names unresolvable)",
    );
    expect(loader.spritesIndex).toEqual({ lineart: {} });
    expect(loader.spritesOffsetMap).toEqual([{ x: 0, y: 0 }]);
    expect(loader.poseData).toBeNull();
  });

  it("returns no offset when a named pose is missing from pose data", () => {
    const loader = new SpriteSheetLoader();
    loader.poseData = {
      poseNameToOffset: {
        adult_short2: { x: 2, y: 2 },
      },
    };
    loader.spritesOffsetMap = [{ x: 0, y: 0 }];
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const resolvePoseOffset = loader.resolvePoseOffset.bind(loader) as (
      spriteNumber: number,
      poseName?: string | null,
      spriteInfo?: Record<string, unknown> | null,
    ) => unknown;

    expect(resolvePoseOffset(0, "missing_pose", {})).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      'Pose offset not found for pose "missing_pose"',
    );
  });
});
