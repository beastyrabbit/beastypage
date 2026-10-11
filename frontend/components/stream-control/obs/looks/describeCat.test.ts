import { describe, expect, it } from "vitest";
import {
  type BatchStreamCat,
  buildBatchStagePlan,
  buildPartialBatchParams,
} from "@/lib/adoption/streamBatch";
import type { CatParams } from "@/lib/cat-v3/types";
import { describeCat } from "./describeCat";

const BATCH_CAT: BatchStreamCat = {
  id: "kit",
  label: "Kit",
  catData: {
    params: {
      spriteNumber: 0,
      peltName: "Tabby",
      colour: "BLACK",
      isTortie: false,
      eyeColour: "EMERALD",
      skinColour: "PINK",
      whitePatches: "FULLWHITE",
      shading: false,
      reverse: false,
    } as unknown as CatParams,
    accessorySlots: ["BROWNBEAR"],
    scarSlots: [],
    tortieSlots: [],
    counts: { accessories: 1, scars: 0, tortie: 0 },
  },
};

describe("describeCat", () => {
  it("reads colour, pelt and eyes", () => {
    expect(
      describeCat({
        colour: "SILVER",
        peltName: "Tabby",
        eyeColour: "GREEN",
        isTortie: false,
      }),
    ).toBe("silver tabby with green eyes");
  });

  it("collapses single-colour pelts and marks torties, odd eyes and white", () => {
    expect(
      describeCat({
        colour: "GINGER",
        peltName: "single",
        eyeColour: "BLUE",
        eyeColour2: "YELLOW",
        isTortie: true,
        whitePatches: "LITTLE",
        accessory: "RED_COLLAR",
      }),
    ).toBe(
      "ginger tortoiseshell with one blue and one yellow eye and white patches wearing red collar",
    );
  });

  it("ignores none-like values and empty params", () => {
    expect(describeCat(null)).toBe("a cat");
    expect(
      describeCat({
        colour: "BLACK",
        peltName: "Smoke",
        eyeColour: "AMBER",
        isTortie: false,
        whitePatches: "none",
        accessory: "",
      }),
    ).toBe("black smoke with amber eyes");
  });

  it("describes only the revealed stages of a batch cat", () => {
    const stages = buildBatchStagePlan({
      accessoryCount: 1,
      scarCount: 0,
      tortieCount: 0,
    });
    const bare = describeCat(buildPartialBatchParams(BATCH_CAT, stages, -1));
    expect(bare).not.toContain("black");
    expect(bare).not.toContain("emerald");
    expect(bare).not.toContain("white");
    expect(bare).not.toContain("brownbear");

    const final = describeCat(
      buildPartialBatchParams(BATCH_CAT, stages, stages.length - 1),
    );
    expect(final).toContain("black tabby");
    expect(final).toContain("emerald eyes");
    expect(final).toContain("white patches");
  });
});
