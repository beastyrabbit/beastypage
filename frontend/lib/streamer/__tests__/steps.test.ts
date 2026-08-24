import { describe, expect, it, vi } from "vitest";
import {
  COAT_PATTERN_IDS,
  getCoatPatternName,
} from "@/lib/cat-v3/coatPatterns";
import {
  createStreamSteps,
  getDefaultStreamParams,
  getStepById,
  type StreamerParams,
} from "../steps";

vi.mock("@/lib/single-cat/spriteMapper", () => ({
  default: {
    getPeltNames: () => ["SingleColour", "Tabby", "Tortie", "Calico"],
  },
}));

describe("streamer voting coat choices", () => {
  it("offers every derived coat and applies or clears it atomically", () => {
    const params = getDefaultStreamParams();
    const state: { params: StreamerParams; history: unknown[] } = {
      params,
      history: [],
    };
    const patternStep = getStepById(createStreamSteps(state), "pattern");
    expect(patternStep).not.toBeNull();

    const options = patternStep?.getOptions(state) ?? [];
    expect(options.map((option) => option.key)).toEqual(
      expect.arrayContaining(COAT_PATTERN_IDS),
    );

    const derived = options.find((option) => option.key === "bengal-rosettes");
    expect(derived).toBeDefined();
    if (!derived) throw new Error("Missing derived coat option");
    expect(derived.label).toBe(getCoatPatternName("bengal-rosettes"));
    patternStep?.apply(derived, state);
    expect(params.peltName).toBe("SingleColour");
    expect(params.coatPattern).toBe("bengal-rosettes");

    const base = options.find((option) => option.key === "Tabby");
    expect(base).toBeDefined();
    if (!base) throw new Error("Missing base pelt option");
    patternStep?.apply(base, state);
    expect(params.peltName).toBe("Tabby");
    expect(params.coatPattern).toBeUndefined();
  });
});
