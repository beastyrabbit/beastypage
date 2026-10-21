import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchColorName, fetchColorNames } from "../color-names";
import type { ExtractedColor } from "../types";

describe("local color names", () => {
  const fetchSpy = vi.fn(() => {
    throw new Error("Color naming must not use the network");
  });

  beforeEach(() => vi.stubGlobal("fetch", fetchSpy));
  afterEach(() => {
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("returns a red name for pure red and a nearby shade", async () => {
    expect(await fetchColorName("#FF0000")).toBe("Red");
    expect(await fetchColorName("#ff0102")).toMatch(/red/i);
  });

  it("uses perceptual Lab distance rather than RGB distance", async () => {
    // RGB distance would select Fire Engine (#fe0002) for this input.
    expect(await fetchColorName("#ff0102")).toBe("Left on Red");
  });

  it("returns exact dataset names, ignoring case and the optional prefix", async () => {
    const { colornames } = await import("color-name-list/short");
    for (const entry of [
      colornames[0],
      colornames[100],
      colornames[colornames.length - 1],
    ]) {
      expect(await fetchColorName(entry.hex.toUpperCase())).toBe(entry.name);
      expect(await fetchColorName(entry.hex.slice(1))).toBe(entry.name);
    }
    expect(await fetchColorName("#f00")).toBe("Red");
  });

  it.each(["", "#", "red", "#gggggg", "#12345", "#12345678", "##ff0000"])(
    "returns Unknown for invalid hex %j",
    async (hex) => expect(await fetchColorName(hex)).toBe("Unknown"),
  );

  it("deduplicates batches and retains uppercase keys without prefixes", async () => {
    const color = (hex: string): ExtractedColor => ({
      hex,
      rgb: { r: 255, g: 0, b: 0 },
      hsl: { h: 0, s: 100, l: 50 },
      position: { x: 0, y: 0 },
      prevalence: 1,
    });
    expect(
      await fetchColorNames([
        color("#ff0000"),
        color("FF0000"),
        color("invalid"),
      ]),
    ).toEqual(
      new Map([
        ["FF0000", "Red"],
        ["INVALID", "Unknown"],
      ]),
    );
    expect(await fetchColorNames([])).toEqual(new Map());
  });

  it("loads the dataset only on demand and shares it across lookups", async () => {
    vi.resetModules();
    const loadDataset = vi.fn(async () =>
      vi.importActual("color-name-list/short"),
    );
    vi.doMock("color-name-list/short", loadDataset);
    try {
      const localNames = await import("../color-names");
      expect(loadDataset).not.toHaveBeenCalled();
      expect(await localNames.fetchColorName("invalid")).toBe("Unknown");
      expect(await localNames.fetchColorNames([])).toEqual(new Map());
      expect(loadDataset).not.toHaveBeenCalled();
      await Promise.all([
        localNames.fetchColorName("#ff0000"),
        localNames.fetchColorName("#0000ff"),
      ]);
      expect(loadDataset).toHaveBeenCalledTimes(1);
      expect(await localNames.fetchColorName("ff0000")).toBe("Red");
      expect(loadDataset).toHaveBeenCalledTimes(1);
    } finally {
      vi.doUnmock("color-name-list/short");
      vi.resetModules();
    }
  });
});
