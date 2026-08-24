import { describe, expect, it } from "vitest";
import {
  getAvailablePoseNames,
  getRandomSelectablePoseNames,
  getUserSelectablePoseNames,
  legacySpriteNumberForPoseName,
  poseNameForLegacySpriteNumber,
} from "../poseOptions";

describe("pose options", () => {
  it("keeps builder pose availability separate from random roll filters", () => {
    const mapper = {
      getPoseNames: () => [
        "newborn0",
        "kitten0",
        "adolescent_long0",
        "adult_short0",
      ],
      getRenderablePoseNames: () => ["adolescent_long0", "adult_short0"],
    };

    expect(getAvailablePoseNames(mapper)).toEqual([
      "newborn0",
      "kitten0",
      "adolescent_long0",
      "adult_short0",
    ]);
    expect(getRandomSelectablePoseNames(mapper)).toEqual([
      "adolescent_long0",
      "adult_short0",
    ]);
    expect(
      getRandomSelectablePoseNames(mapper, { includeNewSprites: true }),
    ).toEqual(["adolescent_long0", "adult_short0"]);
    expect(getUserSelectablePoseNames(mapper)).toEqual([
      "newborn0",
      "kitten0",
      "adolescent_long0",
      "adult_short0",
    ]);
  });

  it("always includes adolescent_long poses", () => {
    const mapper = {
      getRenderablePoseNames: () => [
        "newborn0",
        "kitten0",
        "adolescent_long0",
        "adolescent_long2",
        "adult_long0",
      ],
    };

    expect(getRandomSelectablePoseNames(mapper)).toEqual([
      "adolescent_long0",
      "adolescent_long2",
      "adult_long0",
    ]);
    expect(
      getRandomSelectablePoseNames(mapper, { includeNewSprites: true }),
    ).toEqual(["adolescent_long0", "adolescent_long2", "adult_long0"]);
  });

  it("maps legacy sprite numbers to named poses", () => {
    const legacyPoseNames = [
      "kitten0",
      "kitten1",
      "kitten2",
      "adolescent_short0",
      "adolescent_short1",
      "adolescent_short2",
      "adult_short0",
      "adult_short1",
      "adult_short2",
      "adult_long0",
      "adult_long1",
      "adult_long2",
      "senior0",
      "senior1",
      "senior2",
      "para_adult_short0",
      "para_adult_long0",
      "para_young0",
      "sick_adult0",
      "sick_young0",
      "newborn2",
    ];

    for (const [spriteNumber, poseName] of legacyPoseNames.entries()) {
      expect(poseNameForLegacySpriteNumber(spriteNumber)).toBe(poseName);
      expect(legacySpriteNumberForPoseName(poseName)).toBe(spriteNumber);
    }

    for (const invalid of [
      999,
      -1,
      7.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(poseNameForLegacySpriteNumber(invalid)).toBeNull();
    }
    expect(poseNameForLegacySpriteNumber("7")).toBeNull();
    expect(legacySpriteNumberForPoseName("adolescent_long0")).toBeNull();
  });
});
