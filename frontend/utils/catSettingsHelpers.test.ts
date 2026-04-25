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

  it("resolves random afterlife modes into one concrete params object", () => {
    const random = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.05)
      .mockReturnValueOnce(0.95);

    expect(withResolvedAfterlifeParams({}, "both10")).toMatchObject({
      darkForest: true,
      darkMode: true,
      dead: false,
    });
    expect(random).toHaveBeenCalledTimes(2);
  });
});
