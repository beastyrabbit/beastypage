import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatParams } from "@/lib/cat-v3/types";
import {
  createGeneticsFromParams,
  generateTortieLayers,
  geneticsToParams,
  inheritGenetics,
} from "../genetics";

function makeParams(overrides: Partial<CatParams> = {}): CatParams {
  return {
    spriteNumber: 0,
    peltName: "SingleColour",
    colour: "BLACK",
    isTortie: false,
    eyeColour: "GREEN",
    skinColour: "PINK",
    shading: true,
    reverse: false,
    ...overrides,
  };
}

const mutationPool = {
  pelts: ["SingleColour", "Tabby", "bengal-rosettes"],
  colours: ["BLACK"],
  eyeColours: ["GREEN"],
  skinColours: ["PINK"],
  whitePatches: [],
  tortieMasks: ["ONE"],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("coat-pattern genetics", () => {
  it("round-trips a derived coat through the existing pelt trait", () => {
    const params = makeParams({ coatPattern: "bengal-rosettes" });

    const genetics = createGeneticsFromParams(params, "F");
    const roundTripped = geneticsToParams(genetics, params);

    expect(genetics.pelt).toEqual({
      allele1: "bengal-rosettes",
      allele2: "bengal-rosettes",
      expressed: "bengal-rosettes",
    });
    expect(roundTripped.peltName).toBe("SingleColour");
    expect(roundTripped.coatPattern).toBe("bengal-rosettes");
  });

  it("inherits and expresses a derived coat as a patterned pelt", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const mother = createGeneticsFromParams(
      makeParams({ coatPattern: "bengal-rosettes" }),
      "F",
    );
    const father = createGeneticsFromParams(makeParams(), "M");

    const childGenetics = inheritGenetics(mother, father, "F", mutationPool);
    const childParams = geneticsToParams(childGenetics, {});

    expect(childGenetics.pelt.allele1).toBe("bengal-rosettes");
    expect(childGenetics.pelt.allele2).toBe("SingleColour");
    expect(childGenetics.pelt.expressed).toBe("bengal-rosettes");
    expect(childParams.peltName).toBe("SingleColour");
    expect(childParams.coatPattern).toBe("bengal-rosettes");
  });

  it("does not use whole-coat pattern IDs for tortie layers", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const layers = generateTortieLayers(
      {
        hasTortieGene: true,
        patterns: [],
        masks: [],
        colours: [],
      },
      {
        pelts: ["bengal-rosettes"],
        colours: ["BLACK"],
        tortieMasks: ["ONE"],
      },
    );

    expect(layers).not.toHaveLength(0);
    expect(layers.every((layer) => layer.pattern === "Tabby")).toBe(true);
  });
});
