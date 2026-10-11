import { describe, expect, it } from "vitest";
import type { CatParams } from "@/lib/cat-v3/types";
import type { BatchBeat } from "../scenes/batch/batchBeats";
import type { BatchShowView, BatchViewCat } from "../scenes/batch/batchView";
import { batchBoardFromView } from "./batchFromView";

const params: CatParams = {
  spriteNumber: 0,
  peltName: "Tabby",
  colour: "SILVER",
  isTortie: false,
  eyeColour: "GREEN",
  skinColour: "PINK",
  shading: false,
  reverse: false,
};

function cat(id: string, extra: Partial<BatchViewCat> = {}): BatchViewCat {
  return {
    id,
    number: 1,
    numberLabel: "01",
    label: id.toUpperCase(),
    previewUrl: `data:${id}`,
    params,
    marked: false,
    potential: false,
    favorite: false,
    spotlight: false,
    eliminated: false,
    fading: false,
    departing: false,
    changed: false,
    landed: false,
    valueLabel: null,
    ...extra,
  };
}

function beat(extra: Partial<BatchBeat> = {}): BatchBeat {
  return {
    kind: "awaiting",
    stageId: "s2",
    startedAt: 0,
    durationMs: 0,
    anchor: "server",
    order: [],
    landedIds: [],
    changedIds: [],
    unchangedIds: [],
    rareIds: [],
    groups: [],
    ...extra,
  };
}

describe("batchBoardFromView", () => {
  it("derives elimination stages and stage flags from the view", () => {
    const a = cat("a", { spotlight: true });
    const b = cat("b", { eliminated: true });
    const c = cat("c", { marked: true });
    const d = cat("d", { eliminated: true, fading: true });
    const view: BatchShowView = {
      title: "Litter",
      phase: "awaitingCull",
      beat: beat(),
      stages: [
        { id: "s1", label: "Pelt", type: "simple", param: "colour" },
        { id: "s2", label: "Eyes", type: "simple", param: "eyeColour" },
        { id: "s3", label: "White", type: "simple", param: "whitePatches" },
      ],
      stageIndex: 1,
      stageNumber: 2,
      stageLabel: "Eyes",
      traitLabel: "Eyes",
      cats: [a, b, c, d],
      survivors: [a, c, d],
      eliminated: [b, d],
      poolSize: 4,
      remaining: 2,
      finalCount: 2,
      maxEliminations: 2,
      cullNumber: 3,
      spotlight: a,
      qrUrl: null,
      statusLabel: "Eyes rolled. Who leaves? Say a number",
      reducedMotion: false,
    };
    const model = batchBoardFromView(view);
    expect(model.cats.map((x) => [x.id, x.eliminatedAtStage])).toEqual([
      ["a", null],
      ["b", 1],
      ["c", null],
      ["d", 2],
    ]);
    expect(model.survivors.map((x) => x.id)).toEqual(["a", "c", "d"]);
    expect(model.eliminated.map((x) => x.id)).toEqual(["b", "d"]);
    expect(model.stages.map((s) => s.revealed)).toEqual([true, true, false]);
    expect(model.stages.map((s) => s.current)).toEqual([false, true, false]);
    expect(model.spotlight?.id).toBe("a");
    expect(model.poolCount).toBe(4);
    expect(model.saved).toBe(false);
    expect(model.cats[0].params).toBe(params);
    expect(model.beat).toBe("awaiting");
    expect(model.traitLabel).toBe("Eyes");
    expect(model.verdictNumber).toBeNull();
    expect(model.verdictEndsAt).toBeNull();
    expect(model.reducedMotion).toBe(false);
  });

  it("maps the beat facts and per-cat landing state", () => {
    const a = cat("a", { changed: true, landed: true, valueLabel: "Little" });
    const c = cat("c", { marked: true, numberLabel: "03", number: 3 });
    const d = cat("d", { eliminated: true, fading: true, departing: true });
    const view: BatchShowView = {
      title: "Litter",
      phase: "awaitingCull",
      beat: beat({
        kind: "verdict",
        pendingCullId: "c",
        verdictEndsAt: 1_700_000_000_000,
        landedIds: ["a"],
        changedIds: ["a"],
      }),
      stages: [{ id: "s1", label: "Pelt", type: "simple", param: "colour" }],
      stageIndex: 0,
      stageNumber: 1,
      stageLabel: "Pelt",
      traitLabel: "Pelt",
      cats: [a, c, d],
      survivors: [a, c, d],
      eliminated: [d],
      poolSize: 3,
      remaining: 2,
      finalCount: 2,
      maxEliminations: 1,
      cullNumber: 2,
      spotlight: null,
      qrUrl: null,
      statusLabel: "#03 leaves in…",
      reducedMotion: true,
    };
    const model = batchBoardFromView(view);
    expect(model.beat).toBe("verdict");
    expect(model.verdictNumber).toBe("03");
    expect(model.verdictEndsAt).toBe(1_700_000_000_000);
    expect(model.reducedMotion).toBe(true);
    expect(model.statusLabel).toBe("#03 leaves in…");
    const boardA = model.cats.find((x) => x.id === "a");
    expect(boardA?.changed).toBe(true);
    expect(boardA?.landed).toBe(true);
    expect(boardA?.valueLabel).toBe("Little");
    expect(model.cats.find((x) => x.id === "d")?.departing).toBe(true);
  });

  it("drops a spotlight without a sprite and marks saved from the QR", () => {
    const a = cat("a", { spotlight: true, previewUrl: null });
    const view: BatchShowView = {
      title: "Litter",
      phase: "done",
      beat: beat({ kind: "done", stageId: "done" }),
      stages: [],
      stageIndex: 0,
      stageNumber: 0,
      stageLabel: "",
      traitLabel: "",
      cats: [a],
      survivors: [a],
      eliminated: [],
      poolSize: 1,
      remaining: 1,
      finalCount: 1,
      maxEliminations: 0,
      cullNumber: 1,
      spotlight: a,
      qrUrl: "https://x/adoption/s",
      statusLabel: "Complete",
      reducedMotion: false,
    };
    const model = batchBoardFromView(view);
    expect(model.spotlight).toBeNull();
    expect(model.saved).toBe(true);
    expect(model.qrUrl).toBe("https://x/adoption/s");
  });
});
