import { describe, expect, it } from "vitest";

import { ELEMENTS_BY_ID, THEMES } from "../catalog";
import { cellCoverage } from "../coverage";
import {
  columnName,
  generatePlan,
  type PlanOptions,
  zoneOfRow,
  zoneStarts,
} from "../generate";

function options(overrides: Partial<PlanOptions> = {}): PlanOptions {
  const cols = overrides.cols ?? 12;
  const rows = overrides.rows ?? 12;
  return {
    cols,
    rows,
    seed: "test",
    themes: THEMES.map((t) => t.id),
    density: 0.5,
    skyShare: 0.3,
    ignored: new Array(cols * rows).fill(false),
    locked: [],
    ...overrides,
  };
}

describe("generatePlan", () => {
  it("is deterministic for a seed", () => {
    expect(generatePlan(options())).toEqual(generatePlan(options()));
    expect(generatePlan(options())).not.toEqual(
      generatePlan(options({ seed: "other" })),
    );
  });

  it.each([
    [5, 5],
    [20, 20],
    [16, 9],
    [4, 24],
  ])("keeps placements on a %ix%i grid without overlaps", (cols, rows) => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      const { placements } = generatePlan(options({ cols, rows, seed }));
      // Riders share cells with their host; each layer must not overlap.
      const host = new Map<number, string>();
      const ridden = new Set<number>();
      const riders = placements.filter(
        (p) => ELEMENTS_BY_ID.get(p.elementId)?.on,
      );
      for (const p of placements) {
        if (riders.includes(p)) continue;
        for (const cell of p.cells) {
          expect(cell).toBeGreaterThanOrEqual(0);
          expect(cell).toBeLessThan(cols * rows);
          expect(host.has(cell)).toBe(false);
          host.set(cell, p.elementId);
        }
      }
      for (const p of riders) {
        for (const cell of p.cells) {
          expect(ridden.has(cell)).toBe(false);
          expect(ELEMENTS_BY_ID.get(p.elementId)?.on).toContain(host.get(cell));
          ridden.add(cell);
        }
      }
    }
  });

  it("puts riders such as ducks on their hosts", () => {
    let riders = 0;
    for (const seed of "abcdefghijklmnop") {
      const plan = generatePlan(
        options({ cols: 16, rows: 16, seed, themes: ["water", "wildlife"] }),
      );
      const host = new Map<number, string>();
      for (const p of plan.placements)
        if (!ELEMENTS_BY_ID.get(p.elementId)?.on)
          for (const cell of p.cells) host.set(cell, p.elementId);
      for (const p of plan.placements) {
        const on = ELEMENTS_BY_ID.get(p.elementId)?.on;
        if (!on) continue;
        riders++;
        for (const cell of p.cells) expect(on).toContain(host.get(cell));
      }
    }
    expect(riders).toBeGreaterThan(0);
  });

  it("drops a locked rider whose host is gone", () => {
    const ducks = {
      key: "ducks",
      elementId: "ducks",
      cells: [60],
      locked: true,
    };
    const plan = generatePlan(
      options({ cols: 16, rows: 16, themes: ["urban"], locked: [ducks] }),
    );
    expect(plan.placements.some((p) => p.key === "ducks")).toBe(false);
  });

  it("puts each block's bottom row in an allowed zone", () => {
    const opts = options({ cols: 20, rows: 20 });
    const starts = zoneStarts(opts.rows, opts.skyShare);
    for (const seed of ["a", "b", "c", "d", "e"]) {
      for (const p of generatePlan({ ...opts, seed }).placements) {
        if (!p.rect) continue;
        const element = ELEMENTS_BY_ID.get(p.elementId);
        const zone = zoneOfRow(p.rect.row + p.rect.h - 1, starts);
        expect(element?.zones).toContain(zone);
      }
    }
  });

  it("never rolls blocks into ignored cells", () => {
    const cols = 10;
    const rows = 10;
    // Mask the middle columns, like a portrait subject.
    const ignored = Array.from(
      { length: cols * rows },
      (_, i) => i % cols >= 3 && i % cols <= 6,
    );
    for (const seed of ["a", "b", "c", "d", "e"]) {
      for (const p of generatePlan(options({ cols, rows, seed, ignored }))
        .placements) {
        if (!p.rect) continue;
        for (const cell of p.cells) expect(ignored[cell]).toBe(false);
      }
    }
  });

  it("keeps locked placements", () => {
    const first = generatePlan(options());
    const locked = first.placements.slice(0, 1);
    const second = generatePlan(options({ seed: "next", locked }));
    expect(second.placements[0]).toMatchObject({
      ...locked[0],
      locked: true,
    });
  });

  it("only uses selected themes", () => {
    const { placements } = generatePlan(options({ themes: ["urban"] }));
    expect(placements.length).toBeGreaterThan(0);
    for (const p of placements) {
      expect(ELEMENTS_BY_ID.get(p.elementId)?.theme).toBe("urban");
    }
  });
});

describe("square elements", () => {
  it("keeps the sun round on wide and tall grids", () => {
    for (const [cols, rows] of [
      [20, 9],
      [9, 20],
      [20, 20],
    ])
      for (const seed of ["a", "b", "c", "d", "e", "f"]) {
        const plan = generatePlan(
          options({ cols, rows, seed, themes: ["sky"] }),
        );
        for (const p of plan.placements)
          if (p.elementId === "celestial" && p.rect)
            expect(p.rect.w).toBe(p.rect.h);
      }
  });
});

describe("zoneStarts", () => {
  it.each([4, 5, 12, 24])("gives every zone a row on %i rows", (rows) => {
    for (const sky of [0.15, 0.3, 0.5]) {
      const starts = zoneStarts(rows, sky);
      const zones = new Set(
        Array.from({ length: rows }, (_, r) => zoneOfRow(r, starts)),
      );
      expect(zones.size).toBe(4);
    }
  });
});

describe("helpers", () => {
  it("names columns like a spreadsheet", () => {
    expect([0, 25, 26].map(columnName)).toEqual(["A", "Z", "AA"]);
  });

  it("measures cell coverage from alpha", () => {
    // 2×2 image: left column opaque, right column transparent.
    const data = new Uint8ClampedArray([
      0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0,
    ]);
    expect(cellCoverage(data, 2, 2, 2, 1)).toEqual([1, 0]);
  });
});
