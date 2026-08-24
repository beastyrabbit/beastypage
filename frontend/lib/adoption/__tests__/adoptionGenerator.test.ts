import { describe, expect, it } from "vitest";
import { AdoptionGenerator } from "../adoptionGenerator.js";

function makeGenerator(): AdoptionGenerator {
  const generator = Object.create(
    AdoptionGenerator.prototype,
  ) as AdoptionGenerator;
  Object.assign(generator, {
    defaults: {
      colour: "GINGER",
      skinColour: "PINK",
      eyeColour: "BLUE",
    },
  });
  return generator;
}

describe("AdoptionGenerator coat reveal", () => {
  const peltStage = {
    id: "peltName",
    label: "Pelt",
    type: "simple",
    param: "peltName",
  };

  it("reveals a derived coat pattern atomically at the pelt stage", () => {
    const generator = makeGenerator();
    const finalParams = {
      peltName: "SingleColour",
      coatPattern: "tiger-stripes",
      dead: false,
      darkForest: false,
    };
    const state = generator.buildInitialState(finalParams, 0, 0, 0);

    const target = generator.getStageValue({ params: finalParams }, peltStage);
    generator.applyStageValue(state, peltStage, target);

    expect(target).toBe("tiger-stripes");
    expect(state.peltName).toBe("SingleColour");
    expect(state.coatPattern).toBe("tiger-stripes");
    expect(generator.buildRenderParams(state)).toMatchObject({
      peltName: "SingleColour",
      coatPattern: "tiger-stripes",
    });
    expect(generator.describeStageValue(peltStage, target)).toBe(
      "Pelt: Tiger bars",
    );
  });

  it("clears a derived pattern when a base pelt variation is applied", () => {
    const generator = makeGenerator();
    const state = generator.buildInitialState(
      { dead: false, darkForest: false },
      0,
      0,
      0,
    );
    generator.applyStageValue(state, peltStage, "tiger-stripes");

    generator.applyStageValue(state, peltStage, "Tabby");

    expect(state.peltName).toBe("Tabby");
    expect(state.coatPattern).toBeUndefined();
  });

  it("shows the derived pattern name in the detail table", () => {
    const generator = makeGenerator();
    generator.overlayTable = document.createElement("div");
    const params = {
      peltName: "SingleColour",
      coatPattern: "bengal-rosettes",
      colour: "BLACK",
      eyeColour: "BLUE",
      shading: false,
      reverse: false,
      darkForest: false,
      dead: false,
      poseName: "adult-short-1",
    };

    generator.populateDetailTable(
      {
        state: { tortieLayers: [], accessorySlots: [], scarSlots: [] },
        tortieSlots: [],
        accessorySlots: [],
        scarSlots: [],
      },
      params,
    );

    const peltRow = Array.from(
      generator.overlayTable.querySelectorAll(".parameter-row"),
    ).find((row) => row.querySelector(".param-name")?.textContent === "Pelt");
    expect(peltRow?.querySelector(".param-value")?.textContent).toBe(
      "Fine Bengal",
    );
  });
});
