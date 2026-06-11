import { describe, expect, it } from "vitest";
import { SpriteMapper } from "../spriteMapper.js";

describe("SpriteMapper pose data", () => {
  it("keeps poseData names when extracting peltInfo fields", () => {
    const mapper = new SpriteMapper();
    mapper.poseData = {
      poses: ["adult_short0", "para_young0", "sick_young0"],
      renderablePoseNames: ["adult_short0", "para_young0", "sick_young0"],
    };
    mapper.peltInfo = {
      patterns: ["SingleColour"],
      colors: ["WHITE"],
      eyes: ["BLUE"],
      skin: ["PINK"],
      white: ["ANY"],
      point_markings: ["COLOURPOINT"],
      vitiligo: ["VITILIGO"],
      tortie_masks: ["ONE"],
      plant_accessories: ["MAPLE LEAF"],
      wild_accessories: [],
      collars: [],
      extra_accessories: [],
      scars1: ["ONE"],
      scars2: [],
      scars3: [],
    };

    mapper.extractPoseData();
    mapper.extractNamesFromPeltInfo();

    expect(mapper.getPoseNames()).toEqual([
      "adult_short0",
      "para_young0",
      "sick_young0",
    ]);
    expect(mapper.getRenderablePoseNames()).toEqual([
      "adult_short0",
      "para_young0",
      "sick_young0",
    ]);
  });
});
