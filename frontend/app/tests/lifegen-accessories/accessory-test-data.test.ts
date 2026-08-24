import { describe, expect, it } from "vitest";
import peltInfo from "@/public/sprite-data/peltInfo.json";
import spritesIndex from "@/public/sprite-data/spritesIndex.json";
import {
  ACCESSORY_EXCEPTIONS,
  LIFEGEN_ACCESSORY_EXAMPLES,
  NEW_ACCESSORY_POSES,
} from "./accessory-test-data";

const aliases = peltInfo.accessory_sprite_aliases as Record<string, string>;
const spriteEntries = spritesIndex as Record<
  string,
  { poseLayout?: string; spritesheet: string }
>;

describe("LifeGen accessory test data", () => {
  it("shows the 20 adapted and 2 renamed exceptions", () => {
    expect(ACCESSORY_EXCEPTIONS).toHaveLength(22);
    expect(
      ACCESSORY_EXCEPTIONS.filter((entry) => entry.kind === "adapted"),
    ).toHaveLength(20);
    expect(
      ACCESSORY_EXCEPTIONS.filter((entry) => entry.kind === "renamed"),
    ).toHaveLength(2);
    expect(new Set(ACCESSORY_EXCEPTIONS.map((entry) => entry.name)).size).toBe(
      22,
    );
  });

  it("shows ten separate current LifeGen examples", () => {
    expect(LIFEGEN_ACCESSORY_EXAMPLES).toHaveLength(10);
    expect(new Set(LIFEGEN_ACCESSORY_EXAMPLES).size).toBe(10);

    const exceptionNames = new Set(
      ACCESSORY_EXCEPTIONS.map((entry) => entry.name),
    );
    expect(
      LIFEGEN_ACCESSORY_EXAMPLES.every((name) => !exceptionNames.has(name)),
    ).toBe(true);
  });

  it("keeps every displayed accessory on a named-pose sprite sheet", () => {
    const names = [
      ...ACCESSORY_EXCEPTIONS.map((entry) => entry.name),
      ...LIFEGEN_ACCESSORY_EXAMPLES,
    ];

    for (const name of names) {
      const spriteKey = aliases[name];
      expect(spriteKey, `${name} needs an accessory alias`).toBeTruthy();
      expect(spriteEntries[spriteKey]?.poseLayout, name).toBe("named");
    }
  });

  it("uses the three new adolescent long poses", () => {
    expect(NEW_ACCESSORY_POSES.map((pose) => pose.id)).toEqual([
      "adolescent_long0",
      "adolescent_long1",
      "adolescent_long2",
    ]);
  });
});
