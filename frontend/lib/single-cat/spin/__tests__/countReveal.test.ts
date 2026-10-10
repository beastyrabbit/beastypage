import { describe, expect, it } from "vitest";
import type { CatGeneratorApi } from "@/components/cat-builder/types";
import type { CatParams } from "@/lib/cat-v3/types";
import { prepareCountReveal } from "../countReveal";

const generator = {
  generateCat: async () => {
    throw new Error("not used");
  },
  generateRandomCat: async () => ({
    params: {
      spriteNumber: 8,
      peltName: "SingleColour",
      colour: "GINGER",
      accessories: ["HOLLY", "CATTAIL", "MAPLE LEAF"],
    } as CatParams,
    canvas: {} as HTMLCanvasElement,
    slotSelections: { accessories: ["HOLLY", "CATTAIL", "MAPLE LEAF"] },
  }),
} as unknown as CatGeneratorApi;

const options = {
  experimentalColourMode: "off",
  includeBaseColours: true,
  includeNewSprites: true,
};

describe("prepareCountReveal", () => {
  it("widens the range to include the count it lands on", async () => {
    const [group] = await prepareCountReveal(
      generator,
      [
        {
          label: "Accessories",
          key: "accessory",
          range: { min: 0, max: 2 },
          count: 3,
        },
      ],
      options,
    );

    expect(group.minCount).toBe(0);
    expect(group.maxCount).toBe(3);
    expect(group.descriptors.map((d) => d.option.raw)).toEqual([0, 1, 2, 3]);
    expect(group.descriptors[3].params.accessories).toEqual([
      "HOLLY",
      "CATTAIL",
      "MAPLE LEAF",
    ]);
    expect(group.baseParams).toBe(group.descriptors[0].params);
  });

  it("skips groups with a single possible count", async () => {
    const groups = await prepareCountReveal(
      generator,
      [
        {
          label: "Scars",
          key: "scar",
          range: { min: 1, max: 1 },
          count: 1,
        },
      ],
      options,
    );
    expect(groups).toEqual([]);
  });
});
