import { describe, expect, it } from "vitest";
import { centredRows, fixedGridColumns, packSquares } from "./batchLayout";

describe("batchLayout", () => {
  it("packs squares to the largest cell that fits", () => {
    const g = packSquares(25, 1000, 800, 10);
    expect(g.columns * g.rows).toBeGreaterThanOrEqual(25);
    expect(g.cell * g.columns + (g.columns - 1) * 10).toBeLessThanOrEqual(1000);
    expect(g.cell * g.rows + (g.rows - 1) * 10).toBeLessThanOrEqual(800);
    expect(packSquares(1, 1000, 800).cell).toBe(320);
  });

  it("grows fixed grid columns with the pool", () => {
    expect(fixedGridColumns(21)).toBe(5);
    expect(fixedGridColumns(30)).toBe(6);
    expect(fixedGridColumns(33)).toBe(7);
  });

  it("centres a short last row", () => {
    const rows = centredRows(7, 5, 1000, 100);
    expect(rows).toHaveLength(7);
    expect(rows[0].x).toBe(0);
    expect(rows[4].x).toBe(900);
    expect(rows[5].row).toBe(1);
    // last row of two is centred: x0 = (1000 - (100 + 225)) / 2
    expect(rows[5].x).toBe(338);
    expect(rows[6].x).toBe(563);
  });
});
