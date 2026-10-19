import { describe, expect, it } from "vitest";
import { readCatDocument } from "@/lib/cat-system";
import { getSelectableCatalogElements } from "@/lib/cat-system/catalog";
import type { CatParams, TortieLayer } from "@/lib/cat-v3/types";
import { decodeCatShare, encodeCatShare } from "@/lib/catShare";
import {
  hydrateBuilderParams,
  synchronizeBuilderParams,
} from "./genericTraitEditor";
import { createTortieLayer } from "./tortieLayers";

const base: CatParams = {
  spriteNumber: 8,
  peltName: "SingleColour",
  colour: "WHITE",
  eyeColour: "YELLOW",
  skinColour: "PINK",
  isTortie: false,
  shading: false,
  reverse: false,
};
const options = {
  pelts: ["SingleColour", "Tabby"],
  colours: ["WHITE", "GINGER"],
  masks: getSelectableCatalogElements("tortieMasks").map(({ id }) => id),
};

describe("builder tortie layers", () => {
  it("adds and validates all six layers, including the fifth and sixth", () => {
    const layers: TortieLayer[] = [];
    for (let count = 1; count <= 6; count += 1) {
      const layer = createTortieLayer(layers, base, options);
      expect(layer).not.toBeNull();
      if (!layer) throw new Error("Expected a free tortie layer");
      layers.push(layer);
      expect(() =>
        synchronizeBuilderParams({
          ...base,
          isTortie: true,
          tortie: layers,
        }),
      ).not.toThrow();
    }
    expect(new Set(layers.map((layer) => JSON.stringify(layer))).size).toBe(6);
    expect(createTortieLayer(layers, base, options)).toBeNull();
  });

  it("avoids a duplicate after an earlier layer was removed or edited", () => {
    const layers = [{ pattern: "SingleColour", colour: "GINGER", mask: "TWO" }];
    const before = structuredClone(layers);
    const added = createTortieLayer(layers, base, options);
    expect(added).toEqual({
      pattern: "SingleColour",
      colour: "GINGER",
      mask: "ONE",
    });
    expect(layers).toEqual(before);
  });

  it("uses the selected palette and varies colour and pattern if masks are occupied", () => {
    const choices = {
      pelts: ["Tabby", "SingleColour"],
      colours: ["BLACK", "WHITE"],
      masks: ["ONE"],
    };
    const layers: TortieLayer[] = [];
    for (let i = 0; i < 4; i += 1) {
      const layer = createTortieLayer(layers, base, choices);
      expect(layer).not.toBeNull();
      if (layer) layers.push(layer);
    }
    expect(layers[0]).toEqual({
      pattern: "SingleColour",
      colour: "BLACK",
      mask: "ONE",
    });
    expect(new Set(layers.map((layer) => JSON.stringify(layer))).size).toBe(4);
    expect(createTortieLayer(layers, base, choices)).toBeNull();
    expect(createTortieLayer([], base, { ...choices, masks: [] })).toBeNull();
  });

  it("preserves existing legacy params, stored documents and inline shares", async () => {
    const tortie = [
      { pattern: "Tabby", colour: "BLACK", mask: "THREE" },
      { pattern: "SingleColour", colour: "GINGER", mask: "ONE" },
    ];
    const params = synchronizeBuilderParams({
      ...base,
      isTortie: true,
      tortie,
    });
    expect(params.tortie).toEqual(tortie);
    expect(hydrateBuilderParams(params).tortie).toEqual(tortie);
    const document = readCatDocument({
      schemaVersion: params.schemaVersion,
      traits: params.traits,
    });
    expect(readCatDocument(JSON.parse(JSON.stringify(document)))).toEqual(
      document,
    );
    const share = await decodeCatShare(
      encodeCatShare({ params: { ...params } }),
    );
    expect(share?.params.tortie).toEqual(tortie);
  });
});
