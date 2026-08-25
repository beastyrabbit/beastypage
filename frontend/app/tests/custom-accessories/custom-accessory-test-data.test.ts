import { describe, expect, it } from "vitest";
import peltInfo from "@/public/sprite-data/peltInfo.json";
import poseData from "@/public/sprite-data/poseData.json";
import spritesIndex from "@/public/sprite-data/spritesIndex.json";
import {
  CUSTOM_ACCESSORIES,
  CUSTOM_ACCESSORY_POSES,
} from "./custom-accessory-test-data";

const aliases = peltInfo.accessory_sprite_aliases as Record<string, string>;
const spriteEntries = spritesIndex as Record<
  string,
  { poseLayout?: string; spritesheet: string }
>;

describe("custom accessory test data", () => {
  it("shows the three retained BeastyPage accessories", () => {
    expect(CUSTOM_ACCESSORIES.map((accessory) => accessory.name)).toEqual([
      "COMPUTER MOUSE",
      "GAME CONTROLLER",
      "SCREWDRIVER",
    ]);
  });

  it("covers every named cat pose exactly once", () => {
    expect(CUSTOM_ACCESSORY_POSES).toHaveLength(26);
    expect(new Set(CUSTOM_ACCESSORY_POSES).size).toBe(26);
    expect(CUSTOM_ACCESSORY_POSES).toEqual(poseData.poses);
  });

  it("resolves every accessory to the custom named-pose sheet", () => {
    for (const accessory of CUSTOM_ACCESSORIES) {
      const spriteKey = aliases[accessory.name];
      expect(spriteKey).toBe(`acc_beastypage${accessory.name}`);
      expect(spriteEntries[spriteKey]).toEqual(
        expect.objectContaining({
          poseLayout: "named",
          spritesheet: "acc_beastypage_custom",
        }),
      );
    }
  });

  it("removes the rejected headphones and handbag", () => {
    for (const name of ["HEADPHONES", "HANDBAG"]) {
      expect(peltInfo.accessories).not.toContain(name);
      expect(peltInfo.extra_accessories).not.toContain(name);
      expect(aliases[name]).toBeUndefined();
      expect(spriteEntries[`acc_beastypage${name}`]).toBeUndefined();
    }
  });
});
