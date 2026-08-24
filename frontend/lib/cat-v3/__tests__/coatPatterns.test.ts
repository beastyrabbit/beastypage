import { describe, expect, it } from "vitest";
import {
  applyCoatChoice,
  COAT_PATTERN_IDS,
  getCoatChoiceValue,
  getCoatChoiceValues,
  getCoatPatternName,
  resolveCoatChoice,
} from "../coatPatterns";

describe("coat choices", () => {
  it("combines base pelts with all derived patterns", () => {
    const values = getCoatChoiceValues([
      "SingleColour",
      "Tabby",
      "Tortie",
      "Calico",
    ]);

    expect(values).toEqual(
      expect.arrayContaining(["SingleColour", "Tabby", ...COAT_PATTERN_IDS]),
    );
    expect(values).not.toContain("Tortie");
    expect(values).not.toContain("Calico");
    expect(new Set(values).size).toBe(values.length);
  });

  it("maps a derived choice onto the flat renderer pelt", () => {
    expect(resolveCoatChoice("bengal-rosettes")).toEqual({
      peltName: "SingleColour",
      coatPattern: "bengal-rosettes",
    });
    expect(getCoatPatternName("bengal-rosettes")).toBe("Fine Bengal");
  });

  it("clears a derived pattern when a base pelt is selected", () => {
    const params = {
      peltName: "SingleColour",
      coatPattern: "bengal-rosettes",
    };

    applyCoatChoice(params, "Tabby");

    expect(params).toEqual({ peltName: "Tabby" });
    expect(getCoatChoiceValue(params)).toBe("Tabby");
  });
});
