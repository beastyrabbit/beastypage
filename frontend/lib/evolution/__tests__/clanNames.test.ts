import { describe, expect, it } from "vitest";
import { generateLineageNames, type LineageNameInput } from "../clanNames";
import { CONTROLLED_ARCHETYPES, WILD_ARCHETYPES } from "../evolutionGenerator";

function fullBatch(): LineageNameInput[] {
  const clans = [...CONTROLLED_ARCHETYPES, ...WILD_ARCHETYPES];
  const cats: LineageNameInput[] = [
    { key: "starter", level: 0, branchLabel: null, archetype: null },
  ];
  clans.forEach((archetype, index) => {
    const branchLabel = String.fromCharCode(65 + index);
    for (let level = 1; level <= 3; level += 1) {
      cats.push({
        key: `branch-${index}-level-${level}`,
        level,
        branchLabel,
        archetype,
      });
    }
  });
  return cats;
}

describe("lineage auto-naming", () => {
  it("names every cat with rank-appropriate endings", () => {
    const cats = fullBatch();
    const names = generateLineageNames(cats);

    expect(names.size).toBe(cats.length);
    expect(names.get("starter")).toMatch(/kit$/);
    for (const cat of cats) {
      const name = names.get(cat.key) ?? "";
      if (cat.level === 1) expect(name).toMatch(/paw$/);
      if (cat.level === 3) expect(name).toMatch(/star$/);
      expect(name.length).toBeGreaterThan(3);
    }
  });

  it("keeps one prefix per line across its ranks", () => {
    const names = generateLineageNames(fullBatch());
    const apprentice = names.get("branch-0-level-1") ?? "";
    const leader = names.get("branch-0-level-3") ?? "";
    const prefix = apprentice.replace(/paw$/, "");

    expect(leader).toBe(`${prefix}star`);
  });

  it("never produces duplicate names in a full ten-clan batch", () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const names = [...generateLineageNames(fullBatch()).values()];
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("never doubles the prefix into the warrior suffix", () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const names = generateLineageNames(fullBatch());
      for (const name of names.values()) {
        const half = Math.floor(name.length / 2);
        if (name.length % 2 === 0) {
          expect(name.slice(0, half).toLowerCase()).not.toBe(
            name.slice(half).toLowerCase(),
          );
        }
      }
    }
  });
});
