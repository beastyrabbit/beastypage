import { describe, expect, it } from "vitest";
import type { EvolutionAddition } from "@/lib/evolution/evolutionGenerator";
import { additionTags } from "./lineageModel";

const accessory = (value: string): EvolutionAddition => ({
  kind: "accessory",
  traitId: "accessories",
  label: "Accessory",
  value,
  traitValue: value,
});

const ADDITIONS: EvolutionAddition[] = [
  accessory("VIOLET_CROWN_BUTTERFLIES"),
  {
    kind: "tortie",
    traitId: "tortie",
    label: "Tortie",
    value: { mask: "ONE", pattern: "TABBY", colour: "GINGER" },
    traitValue: { mask: "ONE", pattern: "TABBY", colour: "GINGER" },
    parts: [],
  },
  {
    kind: "replacement",
    traitId: "accessories",
    slot: "accessory",
    label: "Accessory",
    previous: "LAVENDER",
    value: "RED_COLLAR",
    previousValue: "LAVENDER",
    traitValue: "RED_COLLAR",
  },
  accessory("MONARCH"),
];

describe("additionTags", () => {
  it("writes the full word by default, tortie collapsed, replacements arrowed", () => {
    expect(additionTags(ADDITIONS, 4)).toEqual([
      "+Violet Crown Butterflies",
      "+Tortie",
      "↻ Red Collar",
      "+Monarch",
    ]);
  });

  it("stops at max", () => {
    expect(additionTags(ADDITIONS)).toHaveLength(3);
    expect(additionTags(ADDITIONS, 1)).toEqual(["+Violet Crown Butterflies"]);
  });

  it("only truncates when a maxLength is given", () => {
    expect(additionTags(ADDITIONS, 1, 10)).toEqual(["+Violet C…"]);
    expect(additionTags([], 3)).toEqual([]);
  });
});
