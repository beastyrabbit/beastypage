import { describe, expect, it, vi } from "vitest";
import {
  catDocumentToLegacyParams,
  decodeCatDocumentLegacy,
} from "@/lib/cat-system";
import catGenerator from "@/lib/single-cat/catGeneratorV3";
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
    traitId: "pelt",
    label: "Pelt",
    type: "simple",
    strategy: "single",
    param: "peltName",
    timingKey: "pelt",
    defaultSteps: 10,
  };

  it("builds every reveal stage from registry trait metadata", () => {
    const generator = makeGenerator();
    const stages = generator.buildStagePlan(
      {
        spriteNumber: 8,
        poseName: "adult_short2",
        peltName: "SingleColour",
        colour: "GINGER",
        eyeColour: "BLUE",
        skinColour: "PINK",
        shading: false,
        reverse: false,
        isTortie: false,
      },
      { accessoryCount: 2, scarCount: 1, tortieCount: 1 },
    );

    expect(stages.every((stage) => typeof stage.traitId === "string")).toBe(
      true,
    );
    expect(stages.filter((stage) => stage.traitId === "tortie")).toHaveLength(
      3,
    );
    expect(
      stages.filter((stage) => stage.traitId === "accessories"),
    ).toHaveLength(2);
    expect(stages.filter((stage) => stage.traitId === "scars")).toHaveLength(1);
  });

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
      traits: {
        pelt: "SingleColour",
        coatPattern: "tiger-stripes",
      },
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

  it("copies the selected pose when canonical params carry an older pose", async () => {
    const generator = makeGenerator();
    const catDocument = decodeCatDocumentLegacy({
      spriteNumber: 8,
      poseName: "adult_short2",
      peltName: "SingleColour",
      colour: "WHITE",
      eyeColour: "BLUE",
      skinColour: "PINK",
      shading: false,
      reverse: false,
    });
    Object.assign(generator, {
      currentDetailParams: {
        ...catDocumentToLegacyParams(catDocument),
        schemaVersion: catDocument.schemaVersion,
        traits: catDocument.traits,
        unknownTraits: catDocument.unknownTraits,
      },
      copyCanvasToClipboard: vi.fn().mockResolvedValue(undefined),
      flashButton: vi.fn(),
    });
    const canvas = document.createElement("canvas");
    const generateSpy = vi
      .spyOn(catGenerator, "generateCat")
      .mockResolvedValue({ canvas } as never);

    await generator.copySpriteVariation(
      "senior0",
      120,
      document.createElement("button"),
    );

    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        poseName: "senior0",
        spriteNumber: 12,
        traits: expect.objectContaining({ pose: "senior0" }),
      }),
    );
    generateSpy.mockRestore();
  });
});
