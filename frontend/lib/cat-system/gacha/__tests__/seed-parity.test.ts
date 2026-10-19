// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { catSystem } from "../../registry";
import { createGachaCatalogs } from "../catalogs";
import { rollCatFromRegistry } from "../engine";
import type { GachaGenerationOptions } from "../types";

const nativeClone = structuredClone;
afterEach(() => vi.unstubAllGlobals());

it("uses plain JSON-compatible registry defaults without serialization hooks", () => {
  for (const trait of catSystem.traits) {
    const value = trait.value.default;
    if (value !== undefined) {
      expect(nativeClone(value)).toStrictEqual(
        JSON.parse(JSON.stringify(value)),
      );
    }
  }
});

it.each([true, false])(
  "preserves pre-refactor documents and slots with native cloning %s",
  (nativeCloning) => {
    vi.stubGlobal("structuredClone", nativeCloning ? nativeClone : undefined);
    const catalogs = createGachaCatalogs();
    const modes: GachaGenerationOptions[] = [
      {},
      { exactLayerCounts: true },
      { countsMode: "uniform" },
      { countsMode: "weighted", slotRanges: { tortie: { min: 0, max: 4 } } },
      {
        slotRanges: {
          tortie: { min: 0, max: 4 },
          accessories: { min: 0, max: 4 },
        },
      },
      { defaultSlotCounts: { tortie: 1, accessories: 2, scars: 3 } },
      { slotOverrides: { tortie: 0, accessories: 0, scars: 0 } },
      { slotOverrides: { tortie: 3, accessories: 4 }, exactLayerCounts: true },
      {
        traitProbabilities: { whitePatchesTint: 0, eyeColour2: 1, reverse: 1 },
      },
      {
        fixedTraits: {
          pelt: "Tabby",
          accessories: [],
          tortie: [{ mask: "ONE", pattern: "Tabby", colour: "BLACK" }],
        },
      },
    ];
    const observed = modes.flatMap((options) =>
      Array.from({ length: 32 }, (_, seed) =>
        rollCatFromRegistry(catalogs, { ...options, seed }),
      ),
    );
    expect(
      createHash("sha256").update(JSON.stringify(observed)).digest("hex"),
    ).toMatchInlineSnapshot(
      `"ae6af3ec5d38a24cd7834bf9a985ed7c759413183abc60abe2ab0779f5575125"`,
    );
  },
);

it.each([true, false])(
  "isolates fixed object lists and defaults with native cloning %s",
  (nativeCloning) => {
    vi.stubGlobal("structuredClone", nativeCloning ? nativeClone : undefined);
    const catalogs = createGachaCatalogs();
    const tortie = [{ mask: "ONE", pattern: "Tabby", colour: "BLACK" }];
    const options = { seed: 42, fixedTraits: { tortie } };
    const first = rollCatFromRegistry(catalogs, options);
    const expected = nativeClone(first);
    (first.document.traits.tortie as typeof tortie)[0].colour = "GINGER";
    expect(tortie[0].colour).toBe("BLACK");
    expect(rollCatFromRegistry(catalogs, options)).toStrictEqual(expected);
  },
);
