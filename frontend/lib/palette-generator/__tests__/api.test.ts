import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hexToRgb, rgbToHsl } from "../../color-extraction/color-utils";
import {
  fetchPaletteFromAPI,
  generateColorScheme,
  randomHexSeed,
} from "../api";
import { MODE_OPTIONS } from "../types";

const naming = vi.hoisted(() => ({
  imported: vi.fn(),
  fetchColorName: vi.fn(() => {
    throw new Error("Scheme generation must not resolve unused color names");
  }),
}));
vi.mock("../../color-extraction/color-names", () => {
  naming.imported();
  return { fetchColorName: naming.fetchColorName };
});

describe("local color schemes", () => {
  const fetchSpy = vi.fn(() => {
    throw new Error("Scheme generation must not use the network");
  });
  beforeEach(() => vi.stubGlobal("fetch", fetchSpy));
  afterEach(() => {
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(naming.imported).not.toHaveBeenCalled();
    expect(naming.fetchColorName).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(MODE_OPTIONS)(
    "generates valid, deterministic $key palettes at every size",
    ({ key }) => {
      for (let count = 1; count <= 12; count++) {
        const scheme = generateColorScheme("#D65353", key, count);
        expect(scheme).toHaveLength(count);
        expect(scheme).toEqual(generateColorScheme("d65353", key, count));
        for (const hex of scheme) {
          expect(hex).toMatch(/^#[\dA-F]{6}$/);
        }
        if (count > 1) expect(new Set(scheme).size).toBe(count);
      }
    },
  );

  it.each(["F5F0F0", "0A0505", "FFFFFF", "000000", "808080"])(
    "produces 12 distinct swatches for seed %s in every mode",
    (seed) => {
      for (const { key } of MODE_OPTIONS) {
        const scheme = generateColorScheme(seed, key, 12);
        expect(scheme).toHaveLength(12);
        expect(new Set(scheme).size, key).toBe(12);
        for (const hex of scheme) expect(hex).toMatch(/^#[\dA-F]{6}$/);
      }
    },
  );

  it.each(["FFFFFF", "000000", "808080"])(
    "keeps neutral seed %s achromatic in every mode and size",
    (seed) => {
      for (const { key } of MODE_OPTIONS) {
        for (let count = 1; count <= 12; count++) {
          const scheme = generateColorScheme(seed, key, count);
          expect(new Set(scheme).size, `${key}/${count}`).toBe(count);
          for (const hex of scheme) {
            const { r, g, b } = hexToRgb(hex);
            expect(r).toBe(g);
            expect(g).toBe(b);
          }
        }
      }
    },
  );

  it.each([
    ["complement", [0, 180]],
    ["triad", [0, 120, 240]],
    ["quad", [0, 90, 180, 270]],
    ["analogic", [330, 0, 30]],
    ["analogic-complement", [330, 0, 30, 150, 180, 210]],
  ] as const)("rotates %s hues by the expected angles", (mode, hues) => {
    const scheme = generateColorScheme("FF0000", mode, hues.length);
    expect(scheme.map((hex) => rgbToHsl(hexToRgb(hex)).h)).toEqual(hues);
  });

  it("produces darker and lighter monochrome ramps", () => {
    for (const [mode, side] of [
      ["monochrome-dark", "dark"],
      ["monochrome-light", "light"],
    ] as const) {
      const scheme = generateColorScheme("FF0000", mode, 6);
      const lightness = scheme.map((hex) => rgbToHsl(hexToRgb(hex)).l);
      expect(lightness).toEqual([...lightness].sort((a, b) => a - b));
      for (const l of lightness) {
        if (side === "dark") expect(l).toBeLessThan(50);
        else expect(l).toBeGreaterThan(50);
      }
    }
  });

  it.each(["square", "tetrad"])("retains the %s alias", (mode) => {
    expect(generateColorScheme("336699", mode, 8)).toEqual(
      generateColorScheme("336699", "quad", 8),
    );
  });

  it.each([0, -1, 13, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid count %s",
    (count) => {
      expect(() => generateColorScheme("336699", "triad", count)).toThrow(
        RangeError,
      );
    },
  );

  it("rejects invalid seeds and unsupported modes", () => {
    expect(() => generateColorScheme("invalid", "triad", 5)).toThrow(
      "Invalid hex",
    );
    expect(() => generateColorScheme("336699", "toString", 5)).toThrow(
      "Unknown harmony",
    );
  });

  it("retains the UI palette shape with a local source", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const palette = await fetchPaletteFromAPI("triad", 6);
    expect(palette).toMatchObject({
      mode: "triad",
      seed: "800000",
      source: "local",
    });
    expect(palette.colors).toEqual(
      generateColorScheme(palette.seed, "triad", 6),
    );
    expect(palette.id).toEqual(expect.any(String));
    expect(palette.timestamp).toEqual(expect.any(Number));
    expect(palette.ms).toBeGreaterThanOrEqual(0);
  });

  it("generates palettes without importing or calling the naming module", async () => {
    await fetchPaletteFromAPI("analogic", 12);
    expect(naming.imported).not.toHaveBeenCalled();
    expect(naming.fetchColorName).not.toHaveBeenCalled();
  });

  it("can generate seeds across the full RGB range", () => {
    const random = vi.spyOn(Math, "random");
    random.mockReturnValue(0);
    expect(randomHexSeed()).toBe("000000");
    random.mockReturnValue(1 - Number.EPSILON);
    expect(randomHexSeed()).toBe("ffffff");
  });
});
