import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { COAT_PATTERN_IDS } from "@/lib/cat-v3/coatPatterns";
import { legacySpriteNumberForPoseName } from "@/lib/cat-v3/poseOptions";
import {
  generateRandomParamsV3,
  generateRandomParamsV3Detailed,
} from "@/lib/cat-v3/randomGenerator";

const spriteDataDir = path.resolve(__dirname, "../../public/sprite-data");
const originalFetch = globalThis.fetch;

async function loadJsonAsset(relPath: string): Promise<Response> {
  const fullPath = path.join(spriteDataDir, relPath);
  const body = await readFile(fullPath, "utf-8");
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" && input.startsWith("/sprite-data/")) {
      const rel = input.replace("/sprite-data/", "");
      return loadJsonAsset(rel);
    }
    if (input instanceof URL && input.pathname.startsWith("/sprite-data/")) {
      const rel = input.pathname.replace("/sprite-data/", "");
      return loadJsonAsset(rel);
    }
    return originalFetch(input, init);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe("random generator", () => {
  it("exposes toast accessories via sprite mapper", async () => {
    const spriteMapperMod = await import("@/lib/single-cat/spriteMapper");
    const spriteMapper = spriteMapperMod.default;
    if (!spriteMapper.loaded) {
      await spriteMapper.init();
    }
    const accessories = spriteMapper
      .getAccessories()
      .map((name: string) => name.toUpperCase());
    expect(accessories).toContain("TOAST");
    expect(accessories).toContain("TOASTBERRY");
    expect(accessories).toContain("TOASTGRAPE");
    expect(accessories).toContain("TOASTNUTELLA");
    expect(accessories).toContain("TOASTPB");
  });

  it("exposes imported ClanGen pose and sprite metadata", async () => {
    const spriteMapperMod = await import("@/lib/single-cat/spriteMapper");
    const spriteMapper = spriteMapperMod.default;
    if (!spriteMapper.loaded) {
      await spriteMapper.init();
    }

    expect(spriteMapper.getPoseNames()).toContain("newborn0");
    expect(spriteMapper.getRenderablePoseNames()).toContain("adolescent_long2");
    expect(spriteMapper.getPoseNames()).toContain("para_adult_short0");

    const index = JSON.parse(
      await readFile(path.join(spriteDataDir, "spritesIndex.json"), "utf-8"),
    ) as Record<string, { spritesheet: string }>;
    expect(index.singleWHITE?.spritesheet).toBe("colours_single");
    expect(index.whiteANY?.spritesheet).toBe("patches_white_high");
    expect(index.heterochromiamask?.spritesheet).toBe("heterochromiamask");
    expect(index.acc_plantsWISTERIA?.spritesheet).toBe("acc_plants");
    expect(index["acc_wildsROAD RUNNER FEATHER"]?.spritesheet).toBe(
      "acc_wilds",
    );
  });

  it("generates V3 params from bundled sprite data", async () => {
    const params = await generateRandomParamsV3({
      ignoreForbiddenSprites: true,
    });

    expect(params.spriteNumber).toEqual(expect.any(Number));
    expect(params.poseName).toEqual(expect.any(String));
    expect(params.poseName).not.toMatch(/^(newborn|kitten)/);
    expect(params.peltName).toEqual(expect.any(String));
    expect(params.colour).toEqual(expect.any(String));
    expect(params.eyeColour).toEqual(expect.any(String));
    expect(params.skinColour).toEqual(expect.any(String));
    if (params.coatPattern) {
      expect(COAT_PATTERN_IDS).toContain(params.coatPattern);
      expect(params.peltName).toBe("SingleColour");
    }
  });

  it("includes derived coat patterns in random generation", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      const params = await generateRandomParamsV3();
      expect(params.peltName).toBe("SingleColour");
      expect(params.coatPattern).toBe("split-marble");
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("keeps generated pose names and sprite numbers coherent", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.15);
    try {
      const defaultResult = await generateRandomParamsV3Detailed();
      expect(defaultResult.params.poseName).toMatch(/^adolescent_long/);
      expect(defaultResult.params.spriteNumber).toBe(
        legacySpriteNumberForPoseName(defaultResult.params.poseName) ?? 0,
      );

      const retiredFlagResult = await generateRandomParamsV3Detailed({
        includeNewSprites: false,
      });
      expect(retiredFlagResult.params.poseName).toMatch(/^adolescent_long/);
      expect(retiredFlagResult.params.spriteNumber).toBe(
        legacySpriteNumberForPoseName(retiredFlagResult.params.poseName) ?? 0,
      );
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("honors exact V3 slot overrides", async () => {
    const result = await generateRandomParamsV3Detailed({
      exactLayerCounts: true,
      slotOverrides: {
        accessories: 2,
        scars: 2,
        tortie: 2,
      },
    });

    expect(result.slotSelections.accessories).toHaveLength(2);
    expect(result.slotSelections.scars).toHaveLength(2);
    expect(result.slotSelections.tortie).toHaveLength(2);
    expect(result.params.accessories).toHaveLength(2);
    expect(result.params.scars).toHaveLength(2);
    expect(result.params.tortie).toHaveLength(2);
  });
});
