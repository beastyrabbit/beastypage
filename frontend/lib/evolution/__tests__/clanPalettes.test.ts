import { describe, expect, it } from "vitest";
import { getPaletteById, getPaletteIds } from "@/lib/palettes";
import { buildClanColourSets, CLAN_PALETTES } from "../clanPalettes";
import { CONTROLLED_ARCHETYPES, WILD_ARCHETYPES } from "../evolutionGenerator";

describe("clan palette assignment", () => {
  it("assigns every supported palette to exactly one clan", () => {
    const assigned = Object.values(CLAN_PALETTES).flat();
    const assignedSet = new Set(assigned);

    expect(assigned).toHaveLength(assignedSet.size);
    expect(new Set(getPaletteIds())).toEqual(assignedSet);
  });

  it("splits the ten clans into six controlled and four wild", () => {
    expect(CONTROLLED_ARCHETYPES).toHaveLength(6);
    expect(WILD_ARCHETYPES).toHaveLength(4);
    expect(new Set([...CONTROLLED_ARCHETYPES, ...WILD_ARCHETYPES]).size).toBe(
      10,
    );
    expect(Object.keys(CLAN_PALETTES).sort()).toEqual(
      [...CONTROLLED_ARCHETYPES, ...WILD_ARCHETYPES].sort(),
    );
  });

  it("resolves a non-empty colour set for every clan", () => {
    const colourSets = buildClanColourSets();
    for (const [clan, colours] of Object.entries(colourSets)) {
      expect(colours.length, `clan ${clan} has no colours`).toBeGreaterThan(10);
    }
  });

  it("marks all clan palettes with the clan group", () => {
    const clanPaletteIds = [
      "flareclan",
      "aquaclan",
      "leafclan",
      "sunclan",
      "roseclan",
      "moonclan",
      "voltclan",
      "crystalclan",
      "voidclan",
      "steelclan",
    ] as const;

    for (const id of clanPaletteIds) {
      expect(getPaletteById(id)?.group, `${id} group`).toBe("clans");
    }
  });
});
