import { describe, expect, it } from "vitest";
import { getColorNamesForPalette } from "@/lib/palettes";
import { generateRandomParamsServer } from "../random-cat-server";

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

const DEFAULT_VALID_POSES = VALID_POSES.filter(
  (poseName) => !poseName.startsWith("adolescent_long"),
);

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
      expect(DEFAULT_VALID_POSES).toContain(params.poseName);
      expect(params.poseName).not.toMatch(/^(newborn|kitten)/);
      expect(params.poseName).not.toMatch(/^adolescent_long/);
    }
  });

  it("allows adolescent_long pose names only when new sprites are enabled", async () => {
    const defaultParams = await generateRandomParamsServer({
      poseName: "adolescent_long2",
    });
    expect(defaultParams.poseName).not.toBe("adolescent_long2");

    const newSpriteParams = await generateRandomParamsServer(
      { poseName: "adolescent_long2" },
      { includeNewSprites: true },
    );
    expect(newSpriteParams.poseName).toBe("adolescent_long2");
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

  it("applies colour override", async () => {
    const params = await generateRandomParamsServer({ colour: "GINGER" });
    expect(params.colour).toBe("GINGER");
  });

  it("applies shading override", async () => {
    const params = await generateRandomParamsServer({ shading: true });
    expect(params.shading).toBe(true);
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
    expect(DEFAULT_VALID_POSES).toContain(params.poseName);
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
