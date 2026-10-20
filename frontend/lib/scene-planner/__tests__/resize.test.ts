import { describe, expect, it } from "vitest";

import { ELEMENTS_BY_ID } from "../catalog";
import { cellName, describeCells, generatePlan } from "../generate";
import { remapPlacements } from "../resize";

function expectConnected(cells: number[], cols: number) {
  const reached = new Set([cells[0]]);
  const queue = [cells[0]];
  for (const cell of queue) {
    for (const next of cells) {
      const dx = Math.abs((cell % cols) - (next % cols));
      const dy = Math.abs(Math.floor(cell / cols) - Math.floor(next / cols));
      if (dx + dy !== 1 || reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  expect(reached.size).toBe(cells.length);
}

describe("remapPlacements", () => {
  it("keeps a manual point in one cell near its scaled centre", () => {
    const fox = {
      key: "fox-hand",
      elementId: "fox",
      cells: [17],
      rect: { col: 2, row: 3, w: 1, h: 1 },
      manual: true,
      locked: true,
    };
    const [moved] = remapPlacements(
      [fox],
      { cols: 5, rows: 5 },
      { cols: 20, rows: 20 },
    );
    expect(moved).toMatchObject({
      key: fox.key,
      elementId: fox.elementId,
      manual: true,
      locked: true,
      rect: { w: 1, h: 1 },
    });
    expect(moved.cells).toHaveLength(1);
    const [cell] = moved.cells;
    expect(Math.abs((cell % 20) - 9.5)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(Math.floor(cell / 20) - 13.5)).toBeLessThanOrEqual(0.5);
    expect(moved.rect).toMatchObject({
      col: cell % 20,
      row: Math.floor(cell / 20),
    });
  });

  it("keeps generated birds single-celled when only columns grow", () => {
    const { placements } = generatePlan({
      cols: 5,
      rows: 5,
      seed: "deep-0",
      themes: ["sky"],
      density: 0.3,
      skyShare: 0.15,
      ignored: new Array(25).fill(false),
      locked: [],
    });
    const birds = placements.filter((p) => p.elementId === "birds");
    expect(birds.length).toBeGreaterThan(0);
    const moved = remapPlacements(
      placements,
      { cols: 5, rows: 5 },
      { cols: 20, rows: 5 },
    );
    for (const bird of birds)
      expect(moved.find((p) => p.key === bird.key)?.cells).toHaveLength(1);
  });

  it("moves colliding points to distinct free cells beside sampled blocks", () => {
    const placements = [
      { key: "fox", elementId: "fox", cells: [0] },
      { key: "deer", elementId: "deer", cells: [1] },
      {
        key: "rock",
        elementId: "rocks",
        cells: [2, 3],
        rect: { col: 2, row: 0, w: 2, h: 1 },
      },
    ];
    const moved = remapPlacements(
      placements,
      { cols: 10, rows: 5 },
      { cols: 5, rows: 5 },
    );
    expect(moved.map((p) => p.key)).toEqual(["fox", "deer", "rock"]);
    expect(moved.every((p) => p.cells.length === 1)).toBe(true);
    expect(new Set(moved.flatMap((p) => p.cells)).size).toBe(3);
    expect(moved[2].cells).toEqual([1]);
    expect(moved[2].rect).toEqual({ col: 1, row: 0, w: 1, h: 1 });
  });

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
    // Each original end maps near its scaled centre, on rows 1 and 7.
    expect([...rowsOf].sort((a, b) => a - b)).toEqual([1, 7]);
    expect(moved.ends?.every((cell) => moved.cells.includes(cell))).toBe(true);
    expect(moved.ends).toHaveLength(4);
    expectConnected(moved.cells, 12);
  });

  it("keeps a shrinking trail connected across previously unsampled steps", () => {
    const { placements } = generatePlan({
      cols: 20,
      rows: 20,
      seed: "deep-1",
      themes: ["nature"],
      density: 0.3,
      skyShare: 0.15,
      ignored: Array.from(
        { length: 400 },
        (_, cell) => cell % 20 >= 6 && cell % 20 < 12,
      ),
      locked: [],
    });
    const moved = remapPlacements(
      placements,
      { cols: 20, rows: 20 },
      { cols: 12, rows: 12 },
    );
    const paths = moved.filter(
      (p) => ELEMENTS_BY_ID.get(p.elementId)?.shape === "path",
    );
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expectConnected(path.cells, 12);
      expect(path.ends?.every((cell) => path.cells.includes(cell))).toBe(true);
    }
  });

  it("routes a remapped walk around another element without overlapping it", () => {
    const path = {
      key: "trail",
      elementId: "trail",
      cells: [10, 11, 16, 17, 18, 13, 14],
      ends: [10, 14],
    };
    const rock = { key: "rock", elementId: "rocks", cells: [12] };
    const [movedPath, movedRock] = remapPlacements(
      [path, rock],
      { cols: 5, rows: 5 },
      { cols: 3, rows: 5 },
    );
    expect(movedRock.cells).toEqual([7]);
    expect(movedPath.cells).not.toContain(7);
    expect(movedPath.cells).toEqual(expect.arrayContaining([6, 8]));
    expectConnected(movedPath.cells, 3);
    expect(movedPath.ends).toEqual([6, 8]);
  });

  it("maps both river ends when only the first end would be sampled", () => {
    const river = {
      key: "river-hand",
      elementId: "river",
      cells: Array.from({ length: 10 }, (_, i) => 62 + i),
      ends: [62, 71],
      manual: true,
      locked: true,
      fedBy: "waterfall",
    };
    const lake = {
      key: "lake-hand",
      elementId: "lake",
      cells: [72, 73, 74, 75],
      rect: { col: 12, row: 3, w: 4, h: 1 },
      manual: true,
    };
    const [movedRiver, movedLake] = remapPlacements(
      [river, lake],
      { cols: 20, rows: 5 },
      { cols: 5, rows: 5 },
    );
    expect(movedRiver).toMatchObject({
      key: river.key,
      cells: [15, 16, 17],
      ends: [15, 17],
      manual: true,
      locked: true,
      fedBy: "waterfall",
    });
    expect(movedLake).toMatchObject({
      cells: [18],
      rect: { col: 3, row: 3, w: 1, h: 1 },
    });
  });

  it("keeps a grown path's cells in walking order", () => {
    // A two-cell trail down column 2 of a 5×5 grid, stretched to 5×10.
    const trail = {
      key: "trail",
      elementId: "trail",
      cells: [7, 12],
      ends: [7, 12],
    };
    const [moved] = remapPlacements(
      [trail],
      { cols: 5, rows: 5 },
      { cols: 5, rows: 10 },
    );
    const rows = moved.cells.map((cell) => Math.floor(cell / 5));
    expect(rows).toEqual([...rows].sort((a, b) => a - b));
    expect(moved.cells.length).toBeGreaterThan(2);
    expectConnected(moved.cells, 5);
    expect(describeCells(moved, 5)).toBe(
      `${cellName(moved.ends?.[0] ?? -1, 5)} → ${cellName(moved.ends?.at(-1) ?? -1, 5)}`,
    );
  });

  const rocks = {
    key: "rocks",
    elementId: "rocks",
    cells: [0],
    rect: { col: 0, row: 0, w: 1, h: 1 },
    locked: true,
  };
  const meadowB1 = {
    key: "meadow",
    elementId: "meadow",
    cells: [1],
    rect: { col: 1, row: 0, w: 1, h: 1 },
  };

  it("moves a locked block the shrink did not sample to a free cell", () => {
    // Shrinking 10 columns to 5, new A1 samples old B1: the locked meadow
    // there wins it, and the locked rocks on old A1 move to the nearest free
    // cell: A2, whose centre is closer to theirs than B1's.
    const next = remapPlacements(
      [rocks, { ...meadowB1, locked: true }],
      { cols: 10, rows: 5 },
      { cols: 5, rows: 5 },
    );
    expect(next.map((p) => p.key)).toEqual(["rocks", "meadow"]);
    const [movedRocks, movedMeadow] = next;
    expect(movedMeadow.cells).toEqual([0]);
    expect(movedRocks).toMatchObject({ cells: [5], locked: true });
    expect(movedRocks.rect).toEqual({ col: 0, row: 1, w: 1, h: 1 });
  });

  it("keeps a locked block's cell over an unlocked block's sample", () => {
    const next = remapPlacements(
      [rocks, meadowB1],
      { cols: 10, rows: 5 },
      { cols: 5, rows: 5 },
    );
    // The unlocked meadow has no cell left, as any shrink can leave a block.
    expect(next.map((p) => p.key)).toEqual(["rocks"]);
    expect(next[0].cells).toEqual([0]);
  });

  it("fits a large unlocked block around locked elements on shrink", () => {
    // A 20×20 meadow over rows 1–19, a locked fox at T20 and a locked house
    // at A20; shrunk to 5×5, every sample but the last row hits the meadow.
    const meadow = {
      key: "meadow",
      elementId: "meadow",
      cells: Array.from({ length: 380 }, (_, cell) => cell),
      rect: { col: 0, row: 0, w: 20, h: 19 },
    };
    const fox = { key: "fox", elementId: "fox", cells: [399], locked: true };
    const house = {
      key: "house",
      elementId: "house",
      cells: [380],
      rect: { col: 0, row: 19, w: 1, h: 1 },
      locked: true,
    };
    const next = remapPlacements(
      [meadow, fox, house],
      { cols: 20, rows: 20 },
      { cols: 5, rows: 5 },
    );
    expect(next.map((p) => p.key)).toEqual(["meadow", "fox", "house"]);
    const [movedMeadow, movedFox, movedHouse] = next;
    expect(movedFox.cells).toEqual([24]);
    expect(movedHouse.cells).toEqual([20]);
    expect(movedMeadow.cells).not.toContain(24);
    expect(movedMeadow.cells).not.toContain(20);
  });

  it("seats locked riders before unlocked ones on a shrunken host", () => {
    // A two-cell pond under an unlocked duck and a locked one; the pond
    // keeps one cell on 5×5, which the locked duck gets.
    const pond = {
      key: "pond",
      elementId: "pond",
      cells: [0, 1],
      rect: { col: 0, row: 0, w: 2, h: 1 },
    };
    const loose = { key: "loose", elementId: "ducks", cells: [0] };
    const kept = { key: "kept", elementId: "ducks", cells: [1], locked: true };
    const next = remapPlacements(
      [pond, loose, kept],
      { cols: 20, rows: 20 },
      { cols: 5, rows: 5 },
    );
    expect(next.map((p) => p.key)).toEqual(["pond", "kept"]);
  });

  it("describes a resized hairpin path by its ends", () => {
    // C2 → C3 → D3 → D2 on 5×5: the walk touches its own start on the way.
    const trail = {
      key: "trail",
      elementId: "trail",
      cells: [7, 12, 13, 8],
      ends: [7, 8],
    };
    const [moved] = remapPlacements(
      [trail],
      { cols: 5, rows: 5 },
      { cols: 5, rows: 10 },
    );
    const [start, end] = moved.ends ?? [];
    expect(Math.abs(start - end)).toBe(1);
    expect(describeCells(moved, 5)).toBe(
      `${cellName(start, 5)} → ${cellName(end, 5)}`,
    );
  });

  it("places a locked point before an unlocked path takes every cell", () => {
    // A serpentine trail fills a 10×5 grid except J5, where a locked fox is.
    const cells = Array.from({ length: 5 }, (_, row) => {
      const line = Array.from({ length: 10 }, (_, col) => row * 10 + col);
      return row % 2 ? line.reverse() : line;
    })
      .flat()
      .filter((cell) => cell !== 49);
    const trail = { key: "trail", elementId: "trail", cells, ends: [0, 48] };
    const fox = { key: "fox", elementId: "fox", cells: [49], locked: true };
    const next = remapPlacements(
      [trail, fox],
      { cols: 10, rows: 5 },
      { cols: 5, rows: 5 },
    );
    const movedFox = next.find((p) => p.key === "fox");
    expect(movedFox).toMatchObject({ cells: [24], locked: true });
    expect(next.find((p) => p.key === "trail")?.cells).not.toContain(24);
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
