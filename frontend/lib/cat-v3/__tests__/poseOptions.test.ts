import { describe, expect, it } from "vitest";
import {
  getAvailablePoseNames,
  getRandomSelectablePoseNames,
  getUserSelectablePoseNames,
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
    expect(getRandomSelectablePoseNames(mapper)).toEqual(["adult_short0"]);
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

  it("includes adolescent_long poses only when new sprites are enabled", () => {
    const mapper = {
      getRenderablePoseNames: () => [
        "newborn0",
        "kitten0",
        "adolescent_long0",
        "adolescent_long2",
        "adult_long0",
      ],
    };

    expect(getRandomSelectablePoseNames(mapper)).toEqual(["adult_long0"]);
    expect(
      getRandomSelectablePoseNames(mapper, { includeNewSprites: true }),
    ).toEqual(["adolescent_long0", "adolescent_long2", "adult_long0"]);
  });
});
