import { describe, expect, it } from "vitest";
import type { BatchStreamCat } from "@/lib/adoption/streamBatch";
import {
  type BatchBoardInput,
  type BatchBoardStage,
  buildBatchBoardModel,
  stageStripWindow,
} from "./batchModel";

function cat(id: string): BatchStreamCat {
  return {
    id,
    label: id.toUpperCase(),
    catData: {
      params: {
        spriteNumber: 0,
        peltName: "Tabby",
        colour: "SILVER",
        isTortie: false,
        eyeColour: "GREEN",
        skinColour: "PINK",
        shading: false,
        reverse: false,
      },
      accessorySlots: [],
      scarSlots: [],
      tortieSlots: [],
      counts: { accessories: 0, scars: 0, tortie: 0 },
    },
  };
}

const base: BatchBoardInput = {
  title: undefined,
  cats: ["a", "b", "c", "d"].map(cat),
  finalCount: 2,
  saved: false,
  stages: [
    { id: "s1", label: "Pelt" },
    { id: "s2", label: "Eyes" },
    { id: "s3", label: "White" },
  ],
  phase: "awaitingCull",
  stageIndex: 1,
  previews: { a: { url: "data:a" }, c: { url: "data:c" } },
  eliminatedIds: ["b"],
  fadingId: null,
  markedId: "c",
  potentialIds: ["c", "d"],
  favoriteIds: ["a"],
  spotlightId: "a",
  qrUrl: null,
};

describe("buildBatchBoardModel", () => {
  it("maps eliminations to the stage they happened on", () => {
    const model = buildBatchBoardModel({
      ...base,
      eliminatedIds: ["b", "d"],
      stageIndex: 2,
    });
    expect(model.eliminated.map((c) => [c.id, c.eliminatedAtStage])).toEqual([
      ["b", 1],
      ["d", 2],
    ]);
    expect(model.survivors.map((c) => c.id)).toEqual(["a", "c"]);
    expect(model.remaining).toBe(2);
  });

  it("keeps a fading cat on the board and marks only while awaiting a cull", () => {
    const model = buildBatchBoardModel({ ...base, fadingId: "b" });
    expect(model.survivors.map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
    expect(model.cats.find((c) => c.id === "b")?.fading).toBe(true);
    const c = model.cats.find((x) => x.id === "c");
    expect(c?.marked).toBe(true);
    expect(c?.potential).toBe(false);
    expect(model.cats.find((x) => x.id === "d")?.potential).toBe(true);

    const revealing = buildBatchBoardModel({ ...base, phase: "revealing" });
    expect(revealing.cats.find((x) => x.id === "c")?.marked).toBe(false);
    expect(revealing.cats.find((x) => x.id === "c")?.potential).toBe(true);
  });

  it("flags stage progress and the status line", () => {
    const model = buildBatchBoardModel(base);
    expect(model.stages.map((s) => s.revealed)).toEqual([true, true, false]);
    expect(model.stages.map((s) => s.current)).toEqual([false, true, false]);
    expect(model.statusLabel).toBe("Eyes rolled. Who leaves? Say a number");
    expect(model.title).toBe("Adoption Elimination");
    expect(model.spotlight?.id).toBe("a");
    expect(model.cats.find((c) => c.id === "a")?.favorite).toBe(true);

    const done = buildBatchBoardModel({
      ...base,
      phase: "done",
      stageIndex: 3,
      saved: true,
      qrUrl: "https://x/adoption/s",
    });
    expect(done.stages.every((s) => s.revealed && !s.current)).toBe(true);
    expect(done.statusLabel).toBe("✨ Complete ✨");
  });

  it("drops a spotlight without a rendered preview", () => {
    const model = buildBatchBoardModel({ ...base, spotlightId: "d" });
    expect(model.spotlight).toBeNull();
  });

  it("derives the beat from the phase when none is given", () => {
    expect(buildBatchBoardModel({ ...base, phase: "loading" }).beat).toBe(
      "loading",
    );
    expect(buildBatchBoardModel({ ...base, phase: "revealing" }).beat).toBe(
      "deal",
    );
    expect(buildBatchBoardModel(base).beat).toBe("awaiting");
    expect(buildBatchBoardModel({ ...base, phase: "done" }).beat).toBe("done");
    const model = buildBatchBoardModel(base);
    expect(model.traitLabel).toBe("Eyes");
    expect(model.verdictNumber).toBeNull();
    expect(model.verdictEndsAt).toBeNull();
    expect(model.reducedMotion).toBe(false);
    expect(model.cats.every((c) => !c.changed && !c.landed)).toBe(true);
    expect(model.cats.every((c) => c.valueLabel === null)).toBe(true);
  });

  it("carries the verdict, landing and value facts when given", () => {
    const model = buildBatchBoardModel({
      ...base,
      beat: "verdict",
      pendingCullId: "c",
      verdictAt: 1_700_000_000_000,
      changedIds: ["a", "c"],
      landedIds: ["a"],
      valueLabels: { a: "Little", c: "Tuxedo" },
      reducedMotion: true,
    });
    expect(model.beat).toBe("verdict");
    expect(model.verdictNumber).toBe("03");
    expect(model.verdictEndsAt).toBe(1_700_000_000_000);
    expect(model.statusLabel).toBe("#03 leaves in…");
    expect(model.reducedMotion).toBe(true);
    const a = model.cats.find((c) => c.id === "a");
    expect(a?.changed).toBe(true);
    expect(a?.landed).toBe(true);
    expect(a?.valueLabel).toBe("Little");
    const c = model.cats.find((x) => x.id === "c");
    expect(c?.marked).toBe(true);
    expect(c?.landed).toBe(false);
    // Verdict and awaiting both count as "awaiting a cull" for marking.
    const departing = buildBatchBoardModel({
      ...base,
      beat: "depart",
      fadingId: "d",
    });
    expect(departing.statusLabel).toBe("#04 leaves");
    expect(departing.verdictNumber).toBeNull();
    expect(departing.cats.find((x) => x.id === "d")?.departing).toBe(true);
    expect(departing.cats.find((x) => x.id === "c")?.marked).toBe(false);
  });
});

describe("stageStripWindow", () => {
  const plan = (count: number, current: number): BatchBoardStage[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `s${i.toString()}`,
      label: `S${i.toString()}`,
      revealed: i <= current,
      current: i === current,
    }));

  it("returns short plans untouched", () => {
    expect(stageStripWindow(plan(6, 2)).map((s) => s.label)).toEqual([
      "S0",
      "S1",
      "S2",
      "S3",
      "S4",
      "S5",
    ]);
  });

  it("windows long plans around the current stage with ellipses", () => {
    const labels = stageStripWindow(plan(23, 12), 8).map((s) => s.label);
    expect(labels).toHaveLength(10);
    expect(labels[0]).toBe("…");
    expect(labels.at(-1)).toBe("…");
    expect(labels).toContain("S12");
    expect(labels.indexOf("S12")).toBeGreaterThan(labels.indexOf("S9"));
  });

  it("anchors on the final stages once the show is done", () => {
    const done = plan(23, 22).map((s) => ({ ...s, current: false }));
    const labels = stageStripWindow(done, 8).map((s) => s.label);
    expect(labels[0]).toBe("…");
    expect(labels.at(-1)).toBe("S22");
  });

  it("pins the window to the ends of the plan", () => {
    const start = stageStripWindow(plan(23, 0), 8).map((s) => s.label);
    expect(start[0]).toBe("S0");
    expect(start.at(-1)).toBe("…");
    const end = stageStripWindow(plan(23, 22), 8).map((s) => s.label);
    expect(end[0]).toBe("…");
    expect(end.at(-1)).toBe("S22");
  });
});
