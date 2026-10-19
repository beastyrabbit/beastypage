import { describe, expect, it } from "vitest";
import { SpriteMapper } from "../spriteMapper.js";

describe("SpriteMapper pose data", () => {
  it("preserves overlapping prefix order and filters reserved index entries", () => {
    const mapper = new SpriteMapper();
    mapper.spritesIndex = Object.fromEntries([
      "singlestripeBLACK", "tabbyGINGER", "skin", "skinparalyzed",
      "skinPINK", "skinBLACK", "tortiemask", "tortiepatchesmasks",
      "tortiemaskTWO", "tortiemaskONE", "white", "whitepatches",
      "whiteANY", "whiteCOLOURPOINT", "whiteMOON", "whiteBLAZE",
    ].map((key) => [key, {}]));

    mapper.extractNamesFromIndex();

    expect(mapper.peltNames).toEqual(["SingleColour", "TwoColour", "Singlestripe", "Tabby"]);
    expect(mapper.skinColours).toEqual(["PINK", "BLACK"]);
    expect(mapper.tortieMasks).toEqual(["TWO", "ONE"]);
    expect(mapper.whitePatches).toEqual(["ANY", "BLAZE"]);
  });

  it("keeps existing lists for empty peltInfo arrays and concatenates slots in order", () => {
    const mapper = new SpriteMapper();
    mapper.loadFallbackData();
    const colours = mapper.colours;
    mapper.whitePatches = ["ANY"];
    mapper.peltInfo = {
      patterns: ["Tabby", "SingleColour"],
      colors: [], eyes: [], skin: [],
      white: ["BLAZE", "MOON", "COLOURPOINT", "BLAZE"],
      plant_accessories: ["HOLLY", "HOLLY"],
      wild_accessories: ["RED FEATHERS"],
      collars: ["BLUE"], extra_accessories: ["CRIMSON"] ,
      scars1: ["ONE"], scars2: ["TWO"], scars3: ["THREE"],
    };

    mapper.extractNamesFromPeltInfo();

    expect(mapper.peltNames).toEqual(["Tabby", "SingleColour", "TwoColour"]);
    expect(mapper.peltNames).not.toBe(mapper.peltInfo.patterns);
    expect(mapper.colours).toBe(colours);
    expect(mapper.whitePatches).toEqual(["BLAZE", "BLAZE"]);
    expect(mapper.accessories).toEqual(["HOLLY", "HOLLY", "RED FEATHERS", "BLUE", "CRIMSON"]);
    expect(mapper.scars).toEqual(["ONE", "TWO", "THREE"]);
  });

  it.each([
    ["SingleColour", "single"], ["TwoColour", "single"],
    ["Tabby", "tabby"], ["Marbled", "marbled"], ["Rosette", "rosette"],
    ["Smoke", "smoke"], ["Ticked", "ticked"], ["Speckled", "speckled"],
    ["Bengal", "bengal"], ["Mackerel", "mackerel"], ["Classic", "classic"],
    ["Sokoke", "sokoke"], ["Agouti", "agouti"], ["Singlestripe", "singlestripe"],
    ["Masked", "masked"], ["Tortie", "tortie"], ["CustomPelt", "custompelt"],
  ])("maps %s to its existing sprite prefix", (pelt, prefix) => {
    expect(new SpriteMapper().buildSpriteName("pelt", pelt, "GINGER")).toBe(`${prefix}GINGER`);
  });

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
