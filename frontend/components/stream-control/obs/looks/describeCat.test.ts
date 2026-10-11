import { describe, expect, it } from "vitest";
import { describeCat } from "./describeCat";

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
});
