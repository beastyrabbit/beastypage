import { describe, expect, it } from "vitest";
import {
  buildCandidateOrder,
  buildCeremonySchedule,
  CEREMONY_MS,
  chargeTotalMs,
  rollBudgetMs,
  rollFrameTimes,
  rollLandMs,
  rollNearMissMs,
  rollPhaseAt,
  rollSeed,
  type ScheduleCat,
  seededRandom,
  stepAt,
} from "../rollSchedule";

/** 2 branches × 2 levels, additions [2, 1, 0, 3]. */
const cats: ScheduleCat[] = [
  { key: "starter", branchLabel: null, additionCount: 0 },
  { key: "a1", branchLabel: "A", additionCount: 2 },
  { key: "a2", branchLabel: "A", additionCount: 1 },
  { key: "b1", branchLabel: "B", additionCount: 0 },
  { key: "b2", branchLabel: "B", additionCount: 3 },
];

describe("rollBudgetMs", () => {
  it("clamps the per-addition budget", () => {
    expect(rollBudgetMs(15000, 6)).toBe(2500);
    expect(rollBudgetMs(60000, 1)).toBe(8000);
    expect(rollBudgetMs(15000, 2)).toBe(7500);
    expect(rollBudgetMs(15000, 0)).toBe(8000);
  });

  it("chargeTotalMs is max(1, n) rolls", () => {
    expect(chargeTotalMs(15000, 2)).toBe(15000);
    expect(chargeTotalMs(15000, 6)).toBe(15000);
    expect(chargeTotalMs(15000, 0)).toBe(8000);
  });
});

describe("buildCeremonySchedule", () => {
  const schedule = buildCeremonySchedule(cats, 5, 15000);

  it("walks summon, banner per branch, rolls per addition, reveal, finale", () => {
    expect(schedule.steps.map((s) => s.step)).toEqual([
      { kind: "summon" },
      { kind: "banner", index: 1 },
      { kind: "roll", index: 1, addition: 0, count: 2 },
      { kind: "roll", index: 1, addition: 1, count: 2 },
      { kind: "reveal", index: 1 },
      { kind: "roll", index: 2, addition: 0, count: 1 },
      { kind: "reveal", index: 2 },
      { kind: "banner", index: 3 },
      { kind: "reveal", index: 3 },
      { kind: "roll", index: 4, addition: 0, count: 3 },
      { kind: "roll", index: 4, addition: 1, count: 3 },
      { kind: "roll", index: 4, addition: 2, count: 3 },
      { kind: "reveal", index: 4 },
      { kind: "finale" },
    ]);
  });

  it("totals 3000 + 2·2000 + (2·7500 + 2360) + (8000 + 2180) + 2000 + (3·5000 + 2540) + 3500", () => {
    expect(schedule.totalMs).toBe(57580);
    expect(schedule.steps[schedule.steps.length - 1].endMs).toBe(57580);
  });

  it("is contiguous", () => {
    for (let i = 1; i < schedule.steps.length; i += 1) {
      expect(schedule.steps[i].startMs).toBe(schedule.steps[i - 1].endMs);
    }
  });

  it("stepAt: start inclusive, end exclusive, done past the total", () => {
    expect(stepAt(schedule, 0).step).toEqual({ kind: "summon" });
    expect(stepAt(schedule, 2999).step).toEqual({ kind: "summon" });
    expect(stepAt(schedule, 3000).step).toEqual({ kind: "banner", index: 1 });
    expect(stepAt(schedule, 5000).step).toEqual({
      kind: "roll",
      index: 1,
      addition: 0,
      count: 2,
    });
    expect(stepAt(schedule, 57579).step).toEqual({ kind: "finale" });
    const done = stepAt(schedule, 57580);
    expect(done.step).toEqual({ kind: "done" });
    expect(done.startMs).toBe(57580);
    expect(done.endMs).toBe(Number.POSITIVE_INFINITY);
    expect(stepAt(schedule, -10).step).toEqual({ kind: "summon" });
  });

  it("rollNearMissMs / rollLandMs for roll 0 of cat 1 (start 5000, budget 7500, A = 6300)", () => {
    expect(rollNearMissMs(schedule, 1, 0)).toBe(11300);
    expect(rollLandMs(schedule, 1, 0)).toBe(11800);
    expect(rollNearMissMs(schedule, 3, 0)).toBeNull();
    expect(rollLandMs(schedule, 9, 0)).toBeNull();
  });

  it("bounds the walk by totalCount", () => {
    const short = buildCeremonySchedule(cats, 2, 15000);
    expect(short.steps.map((s) => s.step.kind)).toEqual([
      "summon",
      "banner",
      "roll",
      "roll",
      "reveal",
      "finale",
    ]);
  });
});

describe("rollPhaseAt", () => {
  it("phases a 2500 ms roll (A = 1300)", () => {
    expect(rollPhaseAt(0, 2500).phase).toBe("spinup");
    expect(rollPhaseAt(194, 2500).phase).toBe("spinup");
    expect(rollPhaseAt(195, 2500).phase).toBe("cruise");
    expect(rollPhaseAt(779, 2500).phase).toBe("cruise");
    expect(rollPhaseAt(780, 2500).phase).toBe("slowdown");
    expect(rollPhaseAt(1299, 2500).phase).toBe("slowdown");
    expect(rollPhaseAt(1300, 2500).phase).toBe("nearmiss");
    expect(rollPhaseAt(1799, 2500).phase).toBe("nearmiss");
    expect(rollPhaseAt(1800, 2500).phase).toBe("land");
    expect(rollPhaseAt(2499, 2500).phase).toBe("land");
  });

  it("frame indices: strobe frames, the near-miss frame, −1 at land", () => {
    const start = rollPhaseAt(0, 2500);
    expect(start.frameIndex).toBe(0);
    expect(start.frameCount).toBe(rollFrameTimes(1300).length + 1);
    const nearMiss = rollPhaseAt(1300, 2500);
    expect(nearMiss.frameIndex).toBe(nearMiss.frameCount - 1);
    expect(rollPhaseAt(1800, 2500).frameIndex).toBe(-1);
    // Frame index follows the frame starts and never reaches the near-miss slot early.
    const late = rollPhaseAt(1299, 2500);
    expect(late.frameIndex).toBe(late.frameCount - 2);
  });

  it("progress spans the whole budget", () => {
    expect(rollPhaseAt(0, 2500).progress).toBe(0);
    expect(rollPhaseAt(1250, 2500).progress).toBe(0.5);
    expect(rollPhaseAt(2500, 2500).progress).toBe(1);
  });

  it("reduced motion: still cruise until the land, no near miss", () => {
    expect(rollPhaseAt(0, 2500, true)).toMatchObject({
      phase: "cruise",
      frameIndex: -1,
    });
    expect(rollPhaseAt(1500, 2500, true)).toMatchObject({
      phase: "cruise",
      frameIndex: -1,
    });
    expect(rollPhaseAt(1800, 2500, true)).toMatchObject({
      phase: "land",
      frameIndex: -1,
    });
  });
});

describe("rollFrameTimes", () => {
  const A = 6300;
  const times = rollFrameTimes(A);
  const deltas = times.slice(1).map((t, i) => t - times[i]);

  it("is monotone with the last start before A", () => {
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
    expect(times[0]).toBe(0);
    expect(times[times.length - 1]).toBeLessThan(A);
  });

  it("deltas decrease in spinup, hold 90 in cruise, increase in slowdown", () => {
    const spinup = deltas.filter((_, i) => times[i] < A * 0.15);
    const cruise = deltas.filter(
      (_, i) => times[i] >= A * 0.15 && times[i] < A * 0.6,
    );
    const slowdown = deltas.filter((_, i) => times[i] >= A * 0.6);
    expect(spinup.length).toBeGreaterThan(1);
    for (let i = 1; i < spinup.length; i += 1) {
      expect(spinup[i]).toBeLessThan(spinup[i - 1]);
    }
    expect(spinup[0]).toBe(CEREMONY_MS.frameSlowStart);
    expect(cruise.length).toBeGreaterThan(0);
    for (const delta of cruise) expect(delta).toBe(CEREMONY_MS.frameFast);
    expect(slowdown.length).toBeGreaterThan(1);
    for (let i = 1; i < slowdown.length; i += 1) {
      expect(slowdown[i]).toBeGreaterThan(slowdown[i - 1]);
    }
    expect(slowdown[slowdown.length - 1]).toBeLessThanOrEqual(
      CEREMONY_MS.frameSlowEnd,
    );
  });

  it("is empty for a non-positive span", () => {
    expect(rollFrameTimes(0)).toEqual([]);
  });
});

describe("buildCandidateOrder", () => {
  it("is pure in the seed and differs across seeds", () => {
    const a = buildCandidateOrder(7, 40, 12);
    expect(buildCandidateOrder(7, 40, 12)).toEqual(a);
    expect(buildCandidateOrder(8, 40, 12)).not.toEqual(a);
    expect(a).toHaveLength(40);
  });

  it("covers every candidate twice in order first, then never repeats a neighbour", () => {
    const order = buildCandidateOrder(3, 60, 12);
    expect(order.slice(0, 24)).toEqual([
      ...Array.from({ length: 12 }, (_, i) => i),
      ...Array.from({ length: 12 }, (_, i) => i),
    ]);
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i]).not.toBe(order[i - 1]);
      expect(order[i]).toBeGreaterThanOrEqual(0);
      expect(order[i]).toBeLessThan(12);
    }
  });

  it("handles one or zero candidates", () => {
    expect(buildCandidateOrder(1, 5, 1)).toEqual([0, 0, 0, 0, 0]);
    expect(buildCandidateOrder(1, 5, 0)).toEqual([]);
    expect(buildCandidateOrder(1, 0, 12)).toEqual([]);
  });

  it("truncates the cycles when frameCount < 2C", () => {
    expect(buildCandidateOrder(1, 5, 12)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("seeds", () => {
  it("seededRandom is deterministic and in [0, 1)", () => {
    const a = seededRandom(123);
    const b = seededRandom(123);
    for (let i = 0; i < 20; i += 1) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("rollSeed differs per addition, cat and seq", () => {
    expect(rollSeed(1, "a1", 0)).toBe(rollSeed(1, "a1", 0));
    expect(rollSeed(1, "a1", 0)).not.toBe(rollSeed(1, "a1", 1));
    expect(rollSeed(1, "a1", 0)).not.toBe(rollSeed(1, "a2", 0));
    expect(rollSeed(1, "a1", 0)).not.toBe(rollSeed(2, "a1", 0));
  });
});
