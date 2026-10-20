import { describe, expect, it } from "vitest";

import { type Placement, rectCells, zoneStarts } from "../generate";
import {
  atlasEntries,
  cellMask,
  E,
  FILL,
  groupTiles,
  N,
  S,
  tileMask,
  transitions,
  W,
} from "../tiles";

const COLS = 10;
const ROWS = 10;

function block(
  key: string,
  elementId: string,
  col: number,
  row: number,
  w: number,
  h: number,
): Placement {
  const rect = { col, row, w, h };
  return { key, elementId, rect, cells: rectCells(rect, COLS) };
}

describe("groupTiles", () => {
  it("merges touching elements of the same kind", () => {
    const groups = groupTiles(
      [
        block("a", "waterfall", 2, 3, 1, 4),
        block("b", "waterfall", 3, 3, 1, 4),
      ],
      COLS,
      ROWS,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].rect).toEqual({ col: 2, row: 3, w: 2, h: 4 });
    expect(groups[0].keys.sort()).toEqual(["a", "b"]);
  });

  it("keeps different elements apart", () => {
    const groups = groupTiles(
      [block("a", "waterfall", 2, 3, 1, 4), block("b", "forest", 3, 3, 2, 2)],
      COLS,
      ROWS,
    );
    expect(groups).toHaveLength(2);
  });

  it("tells a square forest from a strip", () => {
    const [square] = groupTiles([block("a", "forest", 0, 0, 3, 3)], COLS, ROWS);
    const [strip] = groupTiles([block("b", "forest", 0, 0, 5, 1)], COLS, ROWS);
    expect(square.shape).toBe("square");
    expect(strip.shape).toBe("row");
  });
});

describe("tiles", () => {
  it("masks the sides a cell shares with its group", () => {
    const [group] = groupTiles([block("a", "lake", 1, 1, 3, 3)], COLS, ROWS);
    expect(cellMask(group.set, 2 * COLS + 2, COLS, ROWS)).toBe(N | E | S | W);
    expect(cellMask(group.set, 1 * COLS + 1, COLS, ROWS)).toBe(E | S);
  });

  it("lists each tile variant once with its count", () => {
    const groups = groupTiles([block("a", "lake", 1, 1, 3, 3)], COLS, ROWS);
    const entries = atlasEntries(groups, COLS, ROWS);
    expect(entries).toHaveLength(9);
    expect(entries.reduce((sum, e) => sum + e.count, 0)).toBe(9);
  });

  it("finds the materials that meet", () => {
    const starts = zoneStarts(ROWS, 0.3);
    const groups = groupTiles([block("a", "lake", 2, 6, 2, 2)], COLS, ROWS);
    const keys = transitions(groups, COLS, ROWS, starts).map((t) => t.key);
    expect(keys).toEqual(["ground|water"]);
  });
});

describe("tileMask", () => {
  it("fills path cells inside a two-wide strip", () => {
    const strip: Placement = {
      key: "r",
      elementId: "river",
      cells: [2, 3, 12, 13, 22, 23, 32],
    };
    const [river] = groupTiles([strip], COLS, ROWS);
    expect(tileMask(river, 12, COLS, ROWS)).toBe(FILL);
    // The single-width tail keeps its real mask.
    expect(tileMask(river, 32, COLS, ROWS)).toBe(N);
  });
});
