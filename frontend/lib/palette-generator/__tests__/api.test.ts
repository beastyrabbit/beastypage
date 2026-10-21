import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hexToRgb, rgbToHsl } from "../../color-extraction/color-utils";
import {
  fetchPaletteFromAPI,
  generateColorScheme,
  randomHexSeed,
} from "../api";
import { MODE_OPTIONS } from "../types";

describe("local color schemes", () => {
  const fetchSpy = vi.fn(() => {
    throw new Error("Scheme generation must not use the network");
  });
  beforeEach(() => vi.stubGlobal("fetch", fetchSpy));
  afterEach(() => {
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(MODE_OPTIONS)(
    "generates valid, named, deterministic $key palettes at every size",
    async ({ key }) => {
      for (let count = 1; count <= 12; count++) {
        const scheme = await generateColorScheme("#D65353", key, count);
        expect(scheme).toHaveLength(count);
        expect(scheme).toEqual(await generateColorScheme("d65353", key, count));
        for (const { hex, name } of scheme) {
          expect(hex).toMatch(/^#[\dA-F]{6}$/);
          expect(name).not.toBe("Unknown");
          expect(name.length).toBeGreaterThan(0);
        }
        if (count > 1)
          expect(new Set(scheme.map((c) => c.hex)).size).toBe(count);
      }
    },
  );

  it.each(["000000", "FFFFFF", "808080"])(
    "handles achromatic seed %s in every mode",
    async (seed) => {
      for (const { key } of MODE_OPTIONS) {
        const scheme = await generateColorScheme(seed, key, 12);
        expect(scheme).toHaveLength(12);
        for (const color of scheme) expect(color.hex).toMatch(/^#[\dA-F]{6}$/);
      }
    },
  );

  it.each([
    ["complement", [0, 180]],
    ["triad", [0, 120, 240]],
    ["quad", [0, 90, 180, 270]],
    ["analogic", [330, 0, 30]],
    ["analogic-complement", [330, 0, 30, 150, 180, 210]],
  ] as const)("rotates %s hues by the expected angles", async (mode, hues) => {
    const scheme = await generateColorScheme("FF0000", mode, hues.length);
    expect(scheme.map((c) => rgbToHsl(hexToRgb(c.hex)).h)).toEqual(hues);
  });

  it("produces darker and lighter monochrome ramps", async () => {
    for (const [mode, side] of [
      ["monochrome-dark", "dark"],
      ["monochrome-light", "light"],
    ] as const) {
      const scheme = await generateColorScheme("FF0000", mode, 6);
      const lightness = scheme.map((c) => rgbToHsl(hexToRgb(c.hex)).l);
      expect(lightness).toEqual([...lightness].sort((a, b) => a - b));
      for (const l of lightness) {
        if (side === "dark") expect(l).toBeLessThan(50);
        else expect(l).toBeGreaterThan(50);
      }
    }
  });

  it.each(["square", "tetrad"])("retains the %s alias", async (mode) => {
    expect(await generateColorScheme("336699", mode, 8)).toEqual(
      await generateColorScheme("336699", "quad", 8),
    );
  });

  it.each([0, -1, 13, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid count %s",
    async (count) => {
      await expect(
        generateColorScheme("336699", "triad", count),
      ).rejects.toThrow(RangeError);
    },
  );

  it("rejects invalid seeds and unsupported modes", async () => {
    await expect(generateColorScheme("invalid", "triad", 5)).rejects.toThrow(
      "Invalid hex",
    );
    await expect(generateColorScheme("336699", "toString", 5)).rejects.toThrow(
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
      (await generateColorScheme(palette.seed, "triad", 6)).map((c) => c.hex),
    );
    expect(palette.id).toEqual(expect.any(String));
    expect(palette.timestamp).toEqual(expect.any(Number));
    expect(palette.ms).toBeGreaterThanOrEqual(0);
  });

  it("can generate seeds across the full RGB range", () => {
    const random = vi.spyOn(Math, "random");
    random.mockReturnValue(0);
    expect(randomHexSeed()).toBe("000000");
    random.mockReturnValue(1 - Number.EPSILON);
    expect(randomHexSeed()).toBe("ffffff");
  });
});
