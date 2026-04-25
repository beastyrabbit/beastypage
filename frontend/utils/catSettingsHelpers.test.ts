import { afterEach, describe, expect, it, vi } from "vitest";
import { withResolvedAfterlifeParams } from "./catSettingsHelpers";

describe("withResolvedAfterlifeParams", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("turns afterlife off even when source params were tinted", () => {
    const source = {
      colour: "GINGER",
      darkForest: true,
      darkMode: true,
      dead: true,
    };

    const params = withResolvedAfterlifeParams(source, "off");

    expect(params).toMatchObject({
      colour: "GINGER",
      darkForest: false,
      darkMode: false,
      dead: false,
    });
    expect(source.darkForest).toBe(true);
  });

  it("forces Dark Forest and mirrors darkMode", () => {
    expect(
      withResolvedAfterlifeParams({ colour: "BLACK" }, "darkForce"),
    ).toMatchObject({
      colour: "BLACK",
      darkForest: true,
      darkMode: true,
      dead: false,
    });
  });

  it("forces StarClan without Dark Forest tint", () => {
    expect(
      withResolvedAfterlifeParams({ colour: "WHITE" }, "starForce"),
    ).toMatchObject({
      colour: "WHITE",
      darkForest: false,
      darkMode: false,
      dead: true,
    });
  });

  it.each([
    [0.05, { darkForest: true, darkMode: true, dead: false }],
    [0.1, { darkForest: false, darkMode: false, dead: true }],
    [0.15, { darkForest: false, darkMode: false, dead: true }],
    [0.2, { darkForest: false, darkMode: false, dead: false }],
    [0.25, { darkForest: false, darkMode: false, dead: false }],
  ])("resolves both10 roll %s into one afterlife outcome", (roll, expected) => {
    const random = vi.spyOn(Math, "random").mockReturnValueOnce(roll);

    expect(withResolvedAfterlifeParams({}, "both10")).toMatchObject(expected);
    expect(random).toHaveBeenCalledTimes(1);
  });
});
