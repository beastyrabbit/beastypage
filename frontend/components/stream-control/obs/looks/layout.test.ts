import { describe, expect, it } from "vitest";
import {
  chunkBySizes,
  packGrid,
  quadraticPoint,
  ringPositions,
  splitColumns,
} from "./layout";

describe("packGrid", () => {
  it("fits the count and grows cells as the count shrinks", () => {
    const big = packGrid(30, 800, 800, 8);
    expect(big.columns * big.rows).toBeGreaterThanOrEqual(30);
    const small = packGrid(10, 800, 800, 8);
    expect(small.cell).toBeGreaterThan(big.cell);
    expect(packGrid(1, 800, 800, 8, 300).cell).toBe(300);
    expect(packGrid(0, 800, 800).columns).toBe(1);
  });
});

describe("ringPositions", () => {
  it("starts at the top and spaces points evenly", () => {
    const ring = ringPositions(4, 100, 100, 50, 30);
    expect(ring[0].x).toBeCloseTo(100);
    expect(ring[0].y).toBeCloseTo(70);
    expect(ring[1].x).toBeCloseTo(150);
    expect(ring[2].y).toBeCloseTo(130);
    expect(ringPositions(0, 0, 0, 1, 1)).toEqual([]);
  });
});

describe("splitColumns / chunkBySizes", () => {
  it("balances columns", () => {
    expect(splitColumns(16, 8)).toEqual([8, 8]);
    expect(splitColumns(17, 8)).toEqual([6, 6, 5]);
    expect(splitColumns(5, 8)).toEqual([5]);
    expect(splitColumns(0, 8)).toEqual([]);
    expect(chunkBySizes([1, 2, 3, 4, 5], [3, 2])).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
  });
});

describe("quadraticPoint", () => {
  it("hits the endpoints", () => {
    expect(quadraticPoint([0, 0], [5, 10], [10, 0], 0)).toEqual([0, 0]);
    expect(quadraticPoint([0, 0], [5, 10], [10, 0], 1)).toEqual([10, 0]);
    expect(quadraticPoint([0, 0], [5, 10], [10, 0], 0.5)).toEqual([5, 5]);
  });
});
