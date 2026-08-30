import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  getCatalogElements,
  getTraitCatalogElements,
} from "@/lib/cat-system/catalog";
import { COAT_PATTERN_IDS } from "@/lib/cat-v3/coatPatterns";
import { legacySpriteNumberForPoseName } from "@/lib/cat-v3/poseOptions";
import { generateRandomParamsServerDetailed } from "@/lib/cat-v3/random-cat-server";
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
    const params = await generateRandomParamsV3({ seed: 1 });
    expect(params.peltName).toBe("SingleColour");
    expect(params.coatPattern).toBe("lynx-fleck");
  });

  it("keeps extended-palette rolls inside the white-tint contract", async () => {
    const allowedWhiteTints = new Set(
      getTraitCatalogElements("whitePatchesTint").map((element) => element.id),
    );

    const results = await Promise.all(
      Array.from({ length: 32 }, (_, seed) =>
        generateRandomParamsV3Detailed({
          seed,
          experimentalColourMode: ["mood", "blackout", "fma", "scottish-clans"],
          whitePatchColourMode: "default",
        }),
      ),
    );

    for (const { document } of results) {
      const value = document.traits.whitePatchesTint;
      if (value !== undefined) {
        expect(allowedWhiteTints).toContain(value);
      }
    }
  });

  it("adds selected palette colours to default white tints only for Torties", async () => {
    const fixedWhiteTints = new Set(
      getCatalogElements("whiteTints").map((element) => element.id),
    );
    const paletteColours = new Set(
      getCatalogElements("paletteColours").map((element) => element.id),
    );
    const tortieTints = new Set<string>();

    for (let seed = 0; seed < 128; seed += 1) {
      const tortie = await generateRandomParamsV3Detailed({
        seed,
        exactLayerCounts: true,
        slotOverrides: { tortie: 1, accessories: 0, scars: 0 },
        experimentalColourMode: "mood",
        whitePatchColourMode: "default",
      });
      const tint = tortie.document.traits.whitePatchesTint;
      if (tint !== undefined) tortieTints.add(tint);

      const nonTortie = await generateRandomParamsV3Detailed({
        seed,
        exactLayerCounts: true,
        slotOverrides: { tortie: 0, accessories: 0, scars: 0 },
        experimentalColourMode: "mood",
        whitePatchColourMode: "default",
      });
      const nonTortieTint = nonTortie.document.traits.whitePatchesTint;
      if (nonTortieTint !== undefined) {
        expect(fixedWhiteTints).toContain(nonTortieTint);
      }
    }

    expect([...tortieTints].some((tint) => paletteColours.has(tint))).toBe(
      true,
    );
  });

  it("keeps base white-patch colour mode inside the base-colour contract", async () => {
    const baseColours = new Set(
      getCatalogElements("baseColours").map((element) => element.id),
    );
    const observed = new Set<string>();

    for (let seed = 0; seed < 96; seed += 1) {
      const result = await generateRandomParamsV3Detailed({
        seed,
        exactLayerCounts: true,
        slotOverrides: { tortie: 0, accessories: 0, scars: 0 },
        experimentalColourMode: "mood",
        whitePatchColourMode: "base",
      });
      const tint = result.document.traits.whitePatchesTint;
      if (tint !== undefined) observed.add(tint);
    }

    expect(observed.size).toBeGreaterThan(0);
    expect([...observed].every((tint) => baseColours.has(tint))).toBe(true);
  });

  it("keeps inactive optional flags out of browser legacy params", async () => {
    const result = await generateRandomParamsV3Detailed({
      seed: "browser-legacy-param-shape",
      exactLayerCounts: true,
      slotOverrides: { tortie: 0, accessories: 0, scars: 0 },
    });

    expect(result.document.traits).toMatchObject({
      lighting: false,
      darkForest: false,
      dead: false,
    });
    expect(result.params).not.toHaveProperty("lighting");
    expect(result.params).not.toHaveProperty("darkForest");
    expect(result.params).not.toHaveProperty("darkMode");
    expect(result.params).not.toHaveProperty("dead");
    expect(result.params).toHaveProperty("shading");
    expect(result.params).toHaveProperty("reverse");
  });

  it("keeps Discord palette rolls on fixed white tints and legacy flag shape", async () => {
    const fixedWhiteTints = new Set(
      getCatalogElements("whiteTints").map((element) => element.id),
    );

    for (let seed = 0; seed < 96; seed += 1) {
      const result = await generateRandomParamsServerDetailed(
        {
          palettes: ["mood"],
          torties: 1,
          accessories: 0,
          scars: 0,
          darkForest: false,
          starclan: false,
        },
        { seed, exactLayerCounts: true },
      );
      const tint = result.document.traits.whitePatchesTint;
      if (tint !== undefined) expect(fixedWhiteTints).toContain(tint);
      expect(result.params.darkForest).toBe(false);
      expect(result.params.darkMode).toBe(false);
      expect(result.params).not.toHaveProperty("lighting");
      expect(result.params).not.toHaveProperty("dead");
    }
  });

  it("keeps generated pose names and sprite numbers coherent", async () => {
    const defaultResult = await generateRandomParamsV3Detailed({ seed: 42 });
    expect(defaultResult.params.spriteNumber).toBe(
      legacySpriteNumberForPoseName(defaultResult.params.poseName) ?? 0,
    );

    const retiredFlagResult = await generateRandomParamsV3Detailed({
      seed: 42,
      includeNewSprites: false,
    });
    expect(retiredFlagResult.params.poseName).toBe(
      defaultResult.params.poseName,
    );
    expect(retiredFlagResult.params.spriteNumber).toBe(
      legacySpriteNumberForPoseName(retiredFlagResult.params.poseName) ?? 0,
    );
  });

  it("replays a detailed roll from the returned seed", async () => {
    const first = await generateRandomParamsV3Detailed({
      seed: "replay-contract",
      exactLayerCounts: true,
      slotOverrides: { accessories: 2, scars: 2, tortie: 2 },
    });
    const second = await generateRandomParamsV3Detailed({
      seed: first.seed,
      exactLayerCounts: true,
      slotOverrides: { accessories: 2, scars: 2, tortie: 2 },
    });

    expect(second.document).toEqual(first.document);
    expect(second.slotSelections).toEqual(first.slotSelections);
    expect(first.rngVersion).toBe("xoshiro128**-v1");
    expect(first.params.traits).toEqual(first.document.traits);
  });

  it("uses the same canonical roll in browser and Node adapters", async () => {
    const options = {
      seed: "browser-node-parity",
      exactLayerCounts: true,
      slotOverrides: { accessories: 2, scars: 2, tortie: 2 },
    } as const;
    const browser = await generateRandomParamsV3Detailed(options);
    const server = await generateRandomParamsServerDetailed(
      {
        darkForest: false,
        starclan: false,
        accessories: 2,
        scars: 2,
        torties: 2,
      },
      options,
    );

    expect(server.document).toEqual(browser.document);
    expect(server.slotSelections).toEqual(browser.slotSelections);
  });

  it("does not consult Math.random for seeded generation", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("seeded generation used Math.random");
    });
    try {
      await expect(
        generateRandomParamsV3Detailed({ seed: "no-global-random" }),
      ).resolves.toHaveProperty("document");
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
