import { describe, expect, it } from "vitest";
import { getColorNamesForPalette } from "@/lib/palettes";
import { COAT_PATTERN_IDS } from "../coatPatterns";
import {
  generateRandomParamsServer,
  parseDiscordTraitOverride,
} from "../random-cat-server";

const VALID_POSES = [
  "adolescent_short0",
  "adolescent_short1",
  "adolescent_short2",
  "adolescent_long0",
  "adolescent_long1",
  "adolescent_long2",
  "adult_short0",
  "adult_short1",
  "adult_short2",
  "adult_long0",
  "adult_long1",
  "adult_long2",
  "senior0",
  "senior1",
  "senior2",
  "para_adult_short0",
  "para_adult_long0",
  "para_young0",
  "sick_adult0",
  "sick_young0",
];

const VALID_PELTS = [
  "SingleColour",
  "TwoColour",
  "Tabby",
  "Marbled",
  "Rosette",
  "Smoke",
  "Ticked",
  "Speckled",
  "Bengal",
  "Mackerel",
  "Classic",
  "Sokoke",
  "Agouti",
  "Singlestripe",
  "Masked",
];

const VALID_COLOURS = [
  "WHITE",
  "PALEGREY",
  "SILVER",
  "GREY",
  "DARKGREY",
  "GHOST",
  "BLACK",
  "CREAM",
  "PALEGINGER",
  "GOLDEN",
  "GINGER",
  "DARKGINGER",
  "SIENNA",
  "LIGHTBROWN",
  "LILAC",
  "BROWN",
  "GOLDEN-BROWN",
  "DARKBROWN",
  "CHOCOLATE",
];

describe("generateRandomParamsServer", () => {
  it("returns a valid CatParams shape", async () => {
    const params = await generateRandomParamsServer();
    expect(params).toHaveProperty("spriteNumber");
    expect(params).toHaveProperty("poseName");
    expect(params).toHaveProperty("peltName");
    expect(params).toHaveProperty("colour");
    expect(params).toHaveProperty("eyeColour");
    expect(params).toHaveProperty("skinColour");
    expect(typeof params.shading).toBe("boolean");
    expect(typeof params.reverse).toBe("boolean");
    expect(typeof params.isTortie).toBe("boolean");
  });

  it("generates a selectable pose name from the valid pool", async () => {
    for (let i = 0; i < 10; i++) {
      const params = await generateRandomParamsServer();
      expect(VALID_POSES).toContain(params.poseName);
      expect(params.poseName).not.toMatch(/^(newborn|kitten)/);
    }
  });

  it("allows adolescent_long pose names without a feature flag", async () => {
    const defaultParams = await generateRandomParamsServer({
      poseName: "adolescent_long2",
    });
    expect(defaultParams.poseName).toBe("adolescent_long2");

    const retiredFlagParams = await generateRandomParamsServer(
      { poseName: "adolescent_long2" },
      { includeNewSprites: false },
    );
    expect(retiredFlagParams.poseName).toBe("adolescent_long2");
  });

  it("does not pick Tortie or Calico as pelt name", async () => {
    for (let i = 0; i < 20; i++) {
      const params = await generateRandomParamsServer();
      expect(params.peltName).not.toBe("Tortie");
      expect(params.peltName).not.toBe("Calico");
      expect(VALID_PELTS).toContain(params.peltName);
    }
  });

  it("maps sprite override to the matching legacy pose", async () => {
    const params = await generateRandomParamsServer({ sprite: 7 });
    expect(params.spriteNumber).toBe(7);
    expect(params.poseName).toBe("adult_short1");
  });

  it("applies pose name override", async () => {
    const params = await generateRandomParamsServer({
      poseName: "adult_long2",
    });
    expect(params.poseName).toBe("adult_long2");
  });

  it("applies pelt override", async () => {
    const params = await generateRandomParamsServer({ pelt: "Tabby" });
    expect(params.peltName).toBe("Tabby");
  });

  it("applies a derived coat-pattern override", async () => {
    const params = await generateRandomParamsServer({
      pelt: "bengal-rosettes",
    });

    expect(params.peltName).toBe("SingleColour");
    expect(params.coatPattern).toBe("bengal-rosettes");
  });

  it("only generates registered derived coat patterns", async () => {
    for (let i = 0; i < 50; i++) {
      const params = await generateRandomParamsServer();
      if (params.coatPattern) {
        expect(COAT_PATTERN_IDS).toContain(params.coatPattern);
        expect(params.peltName).toBe("SingleColour");
      }
    }
  });

  it("applies colour override", async () => {
    const params = await generateRandomParamsServer({ colour: "GINGER" });
    expect(params.colour).toBe("GINGER");
  });

  it("keeps a canonical colour override when a runtime palette narrows rolls", async () => {
    const results = await Promise.all(
      Array.from({ length: 16 }, (_, seed) =>
        generateRandomParamsServer(
          { colour: "GINGER", palettes: ["chevron-patterns"] },
          { seed },
        ),
      ),
    );

    expect(results.every((params) => params.colour === "GINGER")).toBe(true);
  });

  it("applies shading override", async () => {
    const params = await generateRandomParamsServer({ shading: true });
    expect(params.shading).toBe(true);
  });

  it("parses registry-backed Discord overrides without a trait switch", () => {
    const tortieLayer = {
      mask: "ONE",
      pattern: "SingleColour",
      colour: "WHITE",
    };
    expect(parseDiscordTraitOverride("accessory", "MAPLE LEAF")).toEqual({
      traitId: "accessories",
      value: ["MAPLE LEAF"],
    });
    expect(parseDiscordTraitOverride("reverse", "true")).toEqual({
      traitId: "reverse",
      value: true,
    });
    expect(
      parseDiscordTraitOverride("accessories", "NOT-A-CATALOG-VALUE"),
    ).toBeNull();
    expect(parseDiscordTraitOverride("tortie", "ONE")).toBeNull();
    expect(
      parseDiscordTraitOverride("tortie", JSON.stringify(tortieLayer)),
    ).toEqual({
      traitId: "tortie",
      value: [tortieLayer],
    });
  });

  it("rejects malformed or non-canonical compound Discord overrides", () => {
    expect(parseDiscordTraitOverride("tortie", "not-json")).toBeNull();
    expect(
      parseDiscordTraitOverride(
        "tortie",
        JSON.stringify([
          { mask: "ONE", pattern: "SingleColour", colour: "WHITE" },
        ]),
      ),
    ).toBeNull();
    expect(
      parseDiscordTraitOverride(
        "tortie",
        JSON.stringify({
          mask: "NOT-A-MASK",
          pattern: "SingleColour",
          colour: "WHITE",
        }),
      ),
    ).toBeNull();
    expect(
      parseDiscordTraitOverride(
        "tortie",
        JSON.stringify({
          mask: "ONE",
          pattern: "SingleColour",
          colour: "WHITE",
          extra: "not-part-of-the-contract",
        }),
      ),
    ).toBeNull();
    expect(parseDiscordTraitOverride("tortie", "x".repeat(101))).toBeNull();
  });

  it("carries generic registry overrides into the canonical document", async () => {
    const params = await generateRandomParamsServer({
      traitOverrides: {
        accessories: ["MAPLE LEAF"],
        reverse: true,
      },
    });

    expect(params.traits?.accessories).toEqual(["MAPLE LEAF"]);
    expect(params.traits?.reverse).toBe(true);
    expect(params.accessories).toEqual(["MAPLE LEAF"]);
    expect(params.reverse).toBe(true);
  });

  it("carries a parsed compound override into the canonical document", async () => {
    const layer = {
      mask: "ONE",
      pattern: "SingleColour",
      colour: "WHITE",
    };
    const override = parseDiscordTraitOverride("tortie", JSON.stringify(layer));
    expect(override).not.toBeNull();

    const params = await generateRandomParamsServer({
      traitOverrides: override
        ? { [override.traitId]: override.value }
        : undefined,
    });

    expect(params.traits?.tortie).toEqual([layer]);
    expect(params.tortie).toEqual([layer]);
    expect(params.isTortie).toBe(true);
  });

  it("applies torties override > 0 forces tortie", async () => {
    const params = await generateRandomParamsServer({ torties: 2 });
    expect(params.isTortie).toBe(true);
    expect(params.tortie).toBeDefined();
    expect(Array.isArray(params.tortie)).toBe(true);
  });

  it("applies torties override 0 forces no tortie", async () => {
    const params = await generateRandomParamsServer({ torties: 0 });
    expect(params.isTortie).toBe(false);
  });

  it("fills exact accessory slot counts when exactLayerCounts is true", async () => {
    const params = await generateRandomParamsServer(
      { accessories: 4, scars: 0, torties: 0 },
      { exactLayerCounts: true },
    );
    expect(params.accessories).toHaveLength(4);
  });

  it("fills exact scar slot counts when exactLayerCounts is true", async () => {
    const params = await generateRandomParamsServer(
      { accessories: 0, scars: 4, torties: 0 },
      { exactLayerCounts: true },
    );
    expect(params.scars).toHaveLength(4);
  });

  it("fills exact tortie slot counts when exactLayerCounts is true", async () => {
    const params = await generateRandomParamsServer(
      { accessories: 0, scars: 0, torties: 4 },
      { exactLayerCounts: true },
    );
    expect(params.isTortie).toBe(true);
    expect(params.tortie).toHaveLength(4);
  });

  it("forces no tortie when exactLayerCounts is true and torties is 0", async () => {
    const params = await generateRandomParamsServer(
      { accessories: 0, scars: 0, torties: 0 },
      { exactLayerCounts: true },
    );
    expect(params.isTortie).toBe(false);
    expect(params.tortie).toBeUndefined();
  });

  it("keeps placeholder-capable sparse legacy behavior when exactLayerCounts is false", async () => {
    const seenSparse = new Set<string>();

    for (let i = 0; i < 25; i += 1) {
      const params = await generateRandomParamsServer(
        { accessories: 4, scars: 4, torties: 4 },
        { exactLayerCounts: false },
      );
      seenSparse.add(
        [
          params.accessories?.length ?? 0,
          params.scars?.length ?? 0,
          params.tortie?.length ?? 0,
        ].join(":"),
      );
    }

    expect(Array.from(seenSparse).some((entry) => entry !== "4:4:4")).toBe(
      true,
    );
  });

  it("ignores invalid sprite override", async () => {
    const params = await generateRandomParamsServer({ sprite: 999 });
    expect(params.spriteNumber).not.toBe(999);
    expect(VALID_POSES).toContain(params.poseName);
  });

  it("ignores invalid pelt override", async () => {
    const params = await generateRandomParamsServer({ pelt: "NotARealPelt" });
    expect(VALID_PELTS).toContain(params.peltName);
  });

  it("ignores invalid colour override", async () => {
    const params = await generateRandomParamsServer({ colour: "NOPE" });
    expect(VALID_COLOURS).toContain(params.colour);
  });

  it("generates tortie patterns when torties > 0", async () => {
    const params = await generateRandomParamsServer({ torties: 2 });
    expect(params.tortie).toBeDefined();
    expect(params.tortie?.length).toBeGreaterThanOrEqual(1);
    expect(params.tortieMask).toBeDefined();
    expect(params.tortiePattern).toBeDefined();
    expect(params.tortieColour).toBeDefined();
  });

  it("uses new pattern palette colours when palette overrides are provided", async () => {
    const allowed = new Set(getColorNamesForPalette("chevron-patterns"));
    expect(allowed.size).toBeGreaterThan(0);

    for (let i = 0; i < 10; i += 1) {
      const params = await generateRandomParamsServer({
        palettes: ["chevron-patterns"],
        torties: 2,
      });

      expect(allowed.has(params.colour)).toBe(true);
      for (const layer of params.tortie ?? []) {
        if (layer?.colour) {
          expect(allowed.has(layer.colour)).toBe(true);
        }
      }
    }
  });

  it("does not fall back to classic colours when multiple pattern palettes are selected", async () => {
    const allowed = new Set([
      ...getColorNamesForPalette("chevron-patterns"),
      ...getColorNamesForPalette("houndstooth-patterns"),
    ]);
    expect(allowed.size).toBeGreaterThan(0);

    for (let i = 0; i < 10; i += 1) {
      const params = await generateRandomParamsServer({
        palettes: ["chevron-patterns", "houndstooth-patterns"],
      });
      expect(allowed.has(params.colour)).toBe(true);
      expect(VALID_COLOURS).not.toContain(params.colour);
    }
  });
});
