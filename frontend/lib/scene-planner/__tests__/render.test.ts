import { describe, expect, it } from "vitest";

import { generatePlan } from "../generate";
import { atPathEnd } from "../render";
import { groupTiles } from "../tiles";

describe("atPathEnd", () => {
  const cols = 8;
  const rows = 6;
  const ends = (path: { key: string; cells: number[]; ends?: number[] }) => {
    const placement = { elementId: "river", ...path };
    const [group] = groupTiles([placement], cols, rows);
    return placement.cells.filter((cell) =>
      atPathEnd(group, cell, [placement], cols, rows),
    );
  };

  it("uses a river's recorded cross-sections, two cells wide", () => {
    const river = {
      key: "river",
      cells: [2, 3, 10, 11, 18, 19, 26, 27],
      ends: [2, 3, 26, 27],
    };
    expect(ends(river)).toEqual([2, 3, 26, 27]);
  });

  it("marks only the tip of a river that stops moving sideways", () => {
    // Down column 2, then along row 3 to column 5; it stops at 29.
    const river = {
      key: "river",
      cells: [2, 10, 18, 26, 27, 28, 29],
      ends: [2, 29],
    };
    expect(ends(river)).toEqual([2, 29]);
  });

  it("falls back to cells with one neighbour without recorded ends", () => {
    expect(ends({ key: "river", cells: [2, 10, 18, 26] })).toEqual([2, 26]);
  });

  it("records ends on generated paths, at their start and stop", () => {
    for (const seed of "abcdefghijklmnop") {
      const { placements } = generatePlan({
        cols: 16,
        rows: 16,
        seed,
        themes: ["water", "urban", "nature"],
        density: 0.6,
        skyShare: 0.3,
        ignored: new Array(256).fill(false),
        locked: [],
      });
      for (const path of placements.filter((p) => p.ends)) {
        const cells = new Set(path.cells);
        expect(path.ends?.every((cell) => cells.has(cell))).toBe(true);
        expect(path.ends).toContain(path.cells[0]);
        expect(path.ends).toContain(path.cells.at(-1));
      }
    }
  });
});
