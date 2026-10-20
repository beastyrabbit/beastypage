import { describe, expect, it } from "vitest";

import { SCENE_ELEMENTS } from "../catalog";
import { MATERIALS } from "../tiles";
import {
  COMBOS,
  EDGE_ORDER,
  edgePairs,
  masksFor,
  TILE_SPECS,
  tileJobs,
  tileShape,
  tileVariant,
} from "../tileset";

describe("tile list", () => {
  it("covers every element with known elements in combos", () => {
    const ids = SCENE_ELEMENTS.map((e) => e.id).sort();
    expect(Object.keys(TILE_SPECS).sort()).toEqual(ids);
    for (const combo of COMBOS)
      for (const id of [...combo.from, ...combo.onto])
        expect(id.startsWith("empty-") || ids.includes(id)).toBe(true);
  });

  it("gives every job a unique key within its sheet", () => {
    const jobs = tileJobs();
    const keys = jobs.map((j) => `${j.sheet}/${j.key}`);
    expect(new Set(keys).size).toBe(keys.length);
    // Shape × mask × variant × alt for a forest: 4 shapes × 16 + 1 single, 2 alts.
    expect(jobs.filter((j) => j.sheet === "forest")).toHaveLength(130);
  });

  it("only lets a material spill onto one below it", () => {
    for (const { from, onto } of edgePairs())
      expect(EDGE_ORDER.indexOf(from)).toBeGreaterThan(
        EDGE_ORDER.indexOf(onto),
      );
    expect(edgePairs()).toHaveLength(15);
    for (const id of Object.keys(TILE_SPECS))
      expect(MATERIALS[id]).toBeDefined();
  });

  it("falls back to the nearest shape an element has", () => {
    expect(tileShape(TILE_SPECS.forest, "row")).toBe("row");
    expect(tileShape(TILE_SPECS.lake, "column")).toBe("mass");
    expect(tileShape(TILE_SPECS.bench, "row")).toBe("single");
    expect(masksFor("single")).toEqual([0]);
    // All 16 neighbour masks plus the fill of a wide stretch.
    expect(masksFor("path")).toHaveLength(17);
  });

  it("picks night variants after dusk", () => {
    expect(tileVariant("house", "midday")).toBe("base");
    expect(tileVariant("house", "dusk")).toBe("night");
    expect(tileVariant("celestial", "night")).toBe("moon");
    expect(tileVariant("rainbow", "dusk")).toBe("base");
    expect(tileVariant("rainbow", "night")).toBe("aurora");
  });
});
