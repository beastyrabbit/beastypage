import { describe, expect, it } from "vitest";
import type { CatParams } from "@/lib/cat-v3/types";
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
      stages: [
        { id: "s1", label: "Pelt", type: "simple", param: "colour" },
        { id: "s2", label: "Eyes", type: "simple", param: "eyeColour" },
        { id: "s3", label: "White", type: "simple", param: "whitePatches" },
      ],
      stageIndex: 1,
      stageNumber: 2,
      stageLabel: "Eyes",
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
      statusLabel: "Choosing who leaves…",
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
  });

  it("drops a spotlight without a sprite and marks saved from the QR", () => {
    const a = cat("a", { spotlight: true, previewUrl: null });
    const view: BatchShowView = {
      title: "Litter",
      phase: "done",
      stages: [],
      stageIndex: 0,
      stageNumber: 0,
      stageLabel: "",
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
    };
    const model = batchBoardFromView(view);
    expect(model.spotlight).toBeNull();
    expect(model.saved).toBe(true);
    expect(model.qrUrl).toBe("https://x/adoption/s");
  });
});
