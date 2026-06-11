import { describe, expect, it } from "vitest";
import { buildEvolutionPools, readMapperArray } from "../evolutionPools";

class BoundMethodMapper {
  values = {
    masks: ["ONE", "TWO"],
    pelts: ["SingleColour", "Tortie", "Tabby"],
    colours: ["WHITE", "BLACK"],
    plant: ["FLOWER"],
    wild: ["FEATHER"],
    collars: ["RED"],
    scars: ["CATBITE"],
    experimental: ["FLC_OBSIDIAN", "NOT_RENDERABLE"],
  };

  getTortieMasks() {
    return this.values.masks;
  }

  getPeltNames() {
    return this.values.pelts;
  }

  getColours() {
    return this.values.colours;
  }

  getPlantAccessories() {
    return this.values.plant;
  }

  getWildAccessories() {
    return this.values.wild;
  }

  getCollars() {
    return this.values.collars;
  }

  getScars() {
    return this.values.scars;
  }

  getExperimentalColours() {
    return this.values.experimental;
  }
}

describe("evolution pool builder", () => {
  it("calls sprite mapper methods with the mapper as this", () => {
    const mapper = new BoundMethodMapper();

    expect(readMapperArray(mapper, "getTortieMasks")).toEqual(["ONE", "TWO"]);

    const pools = buildEvolutionPools(mapper);

    expect(pools.tortieMasks).toEqual(["ONE", "TWO"]);
    expect(pools.tortiePatterns).toEqual(["SingleColour", "Tabby"]);
    expect(pools.baseColours).toEqual(["WHITE", "BLACK"]);
    expect(pools.accessories).toEqual(["FLOWER", "FEATHER", "RED"]);
    expect(pools.scars).toEqual(["CATBITE"]);
    expect(pools.experimentalColours).toEqual([
      "FLC_OBSIDIAN",
      "NOT_RENDERABLE",
    ]);
    expect(pools.clanColours?.flare).toEqual(["FLC_OBSIDIAN"]);
  });
});
