import { describe, expect, it } from "vitest";

import { remapPlacements } from "../resize";

describe("remapPlacements", () => {
  it("keeps a rider on its host when the grid grows a row", () => {
    // 5×5: a one-cell pond on row 3 with ducks on it.
    const pond = { key: "pond", elementId: "pond", cells: [3 * 5 + 2] };
    const ducks = { key: "ducks", elementId: "ducks", cells: [3 * 5 + 2] };
    const [movedPond, movedDucks] = remapPlacements(
      [pond, ducks],
      { cols: 5, rows: 5 },
      { cols: 5, rows: 6 },
    );
    expect(movedPond.cells).toHaveLength(1);
    expect(movedDucks?.cells).toEqual(movedPond.cells);
  });

  it("gives riders on one host their own cells", () => {
    const lake = {
      key: "lake",
      elementId: "lake",
      cells: [0, 1, 4, 5],
      rect: { col: 0, row: 0, w: 2, h: 2 },
    };
    const ducks = { key: "ducks", elementId: "ducks", cells: [0] };
    const swans = { key: "swans", elementId: "swans", cells: [5] };
    const next = remapPlacements(
      [lake, ducks, swans],
      { cols: 4, rows: 4 },
      { cols: 8, rows: 8 },
    );
    const [moved, d, s] = next;
    expect(next).toHaveLength(3);
    expect(moved.cells).toContain(d.cells[0]);
    expect(moved.cells).toContain(s.cells[0]);
    expect(d.cells[0]).not.toBe(s.cells[0]);
  });

  it("carries a path's ends to its new cells", () => {
    // A two-wide river down columns 2–3 of a 6×4 grid, doubled to 12×8.
    const river = {
      key: "river",
      elementId: "river",
      cells: [2, 3, 8, 9, 14, 15, 20, 21],
      ends: [2, 3, 20, 21],
    };
    const [moved] = remapPlacements(
      [river],
      { cols: 6, rows: 4 },
      { cols: 12, rows: 8 },
    );
    const rowsOf = new Set(moved.ends?.map((cell) => Math.floor(cell / 12)));
    // The first row's two cells and the last row's become ends: rows 0–1
    // and 6–7 of the doubled grid.
    expect([...rowsOf].sort((a, b) => a - b)).toEqual([0, 1, 6, 7]);
    expect(moved.ends?.every((cell) => moved.cells.includes(cell))).toBe(true);
  });

  it("drops a rider whose host has no cell left", () => {
    // Shrinking 10 columns to 5, new column 0 samples old column 1: the
    // meadow there wins the cell, and the pond on column 0 has none left.
    const meadow = {
      key: "meadow",
      elementId: "meadow",
      cells: [1],
      rect: { col: 1, row: 0, w: 1, h: 1 },
    };
    const pond = { key: "pond", elementId: "pond", cells: [0] };
    const ducks = { key: "ducks", elementId: "ducks", cells: [0] };
    const next = remapPlacements(
      [meadow, pond, ducks],
      { cols: 10, rows: 5 },
      { cols: 5, rows: 5 },
    );
    expect(next.map((p) => p.key)).toEqual(["meadow"]);
  });
});
