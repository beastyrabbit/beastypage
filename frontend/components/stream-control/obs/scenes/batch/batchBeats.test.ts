import { describe, expect, it } from "vitest";
import type { BatchStage } from "@/lib/adoption/streamBatch";
import {
  BATCH_BEAT_MS,
  batchPhaseForBeat,
  buildStageBeats,
  landedAt,
  type StageCatInput,
  stageAnchorParam,
  summarizeStage,
  timelineBeatAt,
} from "./batchBeats";

const STAGE: BatchStage = {
  id: "whitePatches",
  label: "White Patches",
  type: "simple",
  param: "whitePatches",
};

function input(
  id: string,
  label: string | null,
  value = label?.toUpperCase() ?? null,
): StageCatInput {
  return label === null || value === null
    ? { id, value: null, changed: false }
    : { id, value: { value, label }, changed: true };
}

/** 20 survivors: 9 unchanged, then 6 Little, 3 Tuxedo, 1 Mask, 1 Van (pool order interleaved). */
function bigStage(): StageCatInput[] {
  const plan: (string | null)[] = [
    null,
    "Little",
    "Tuxedo",
    null,
    "Little",
    "Mask",
    null,
    "Little",
    "Tuxedo",
    null,
    "Little",
    null,
    "Van",
    "Little",
    null,
    "Tuxedo",
    null,
    "Little",
    null,
    null,
  ];
  return plan.map((label, i) => input(`c${i.toString()}`, label));
}

describe("buildStageBeats", () => {
  it("(a) deals unchanged first, then groups largest first, with the documented timing", () => {
    const tl = buildStageBeats(bigStage(), STAGE);
    expect(tl.unchangedIds).toHaveLength(9);
    expect(tl.changedIds).toHaveLength(11);
    expect(tl.order.slice(0, 9)).toEqual(tl.unchangedIds);
    expect(tl.groups.map((g) => [g.label, g.catIds.length])).toEqual([
      ["Little", 6],
      ["Tuxedo", 3],
      ["Mask", 1],
      ["Van", 1],
    ]);
    expect(tl.rareIds.sort()).toEqual(["c12", "c5"]);
    expect(tl.quick).toBe(false);
    expect(tl.windupMs).toBe(700);
    for (const id of tl.unchangedIds) expect(tl.landAt.get(id)).toBe(700);
    const little = tl.groups[0].catIds.map((id) => tl.landAt.get(id));
    expect(little).toEqual([700, 840, 980, 1120, 1260, 1400]);
    const tuxedo = tl.groups[1].catIds.map((id) => tl.landAt.get(id));
    expect(tuxedo).toEqual([1750, 1890, 2030]);
    expect(tl.landAt.get(tl.groups[2].catIds[0])).toBe(2380);
    // Pre-last hold before the last small group: 2380 + 350 + 600.
    expect(tl.landAt.get(tl.groups[3].catIds[0])).toBe(3330);
    expect(tl.holdFromMs).toBe(3330);
    expect(tl.totalMs).toBe(4530);
  });

  it("(b) rolls quickly when only a couple of cats change", () => {
    const tl = buildStageBeats(
      [
        input("a", null),
        input("b", "Little"),
        input("c", "Tuxedo"),
        input("d", null),
      ],
      STAGE,
    );
    expect(tl.quick).toBe(true);
    expect(tl.windupMs).toBe(400);
    expect(tl.rareIds).toEqual([]);
    expect(tl.landAt.get("b")).toBe(400);
    expect(tl.landAt.get("c")).toBe(650);
    expect(tl.totalMs - tl.holdFromMs).toBe(900);
  });

  it("(c) lands everything at the short windup when nothing changes", () => {
    const tl = buildStageBeats([input("a", null), input("b", null)], STAGE);
    expect(tl.windupMs).toBe(300);
    expect([...tl.landAt.values()]).toEqual([300, 300]);
    expect(tl.holdFromMs).toBe(300);
    expect(tl.totalMs).toBe(1100);
  });

  it("(d) collapses under reduced motion", () => {
    const tl = buildStageBeats(bigStage(), STAGE, { reducedMotion: true });
    expect(tl.windupMs).toBe(0);
    expect([...tl.landAt.values()].every((t) => t === 0)).toBe(true);
    expect(tl.holdFromMs).toBe(0);
    expect(tl.totalMs).toBe(500);
  });

  it("(e) landedAt is monotone and complete at holdFromMs", () => {
    const tl = buildStageBeats(bigStage(), STAGE);
    let previous = 0;
    for (let t = 0; t <= tl.totalMs; t += 50) {
      const count = landedAt(tl, t).length;
      expect(count).toBeGreaterThanOrEqual(previous);
      previous = count;
    }
    expect(landedAt(tl, tl.windupMs - 1)).toEqual([]);
    expect(landedAt(tl, tl.holdFromMs)).toEqual(tl.order);
    expect(landedAt(tl, tl.windupMs)).toHaveLength(10);
  });

  it("(f) timelineBeatAt switches at the windup and hold boundaries", () => {
    const tl = buildStageBeats(bigStage(), STAGE);
    expect(timelineBeatAt(tl, 0)).toBe("windup");
    expect(timelineBeatAt(tl, 699)).toBe("windup");
    expect(timelineBeatAt(tl, 700)).toBe("deal");
    expect(timelineBeatAt(tl, 3329)).toBe("deal");
    expect(timelineBeatAt(tl, 3330)).toBe("hold");
    expect(timelineBeatAt(tl, 99999)).toBe("hold");
  });

  it("(j) orders tied groups by label", () => {
    const tl = buildStageBeats(
      [
        input("a", "Van"),
        input("b", "Little"),
        input("c", "Tuxedo"),
        input("d", "Mask"),
        input("e", "Van"),
        input("f", "Little"),
      ],
      STAGE,
    );
    expect(tl.groups.map((g) => g.label)).toEqual([
      "Little",
      "Van",
      "Mask",
      "Tuxedo",
    ]);
    expect(tl.rareIds).toEqual(["d", "c"]);
  });

  it("clamps the step to the budget", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      input(`c${i.toString()}`, i % 2 ? "Little" : "Tuxedo"),
    );
    const tl = buildStageBeats(many, STAGE);
    const first = tl.groups[0].catIds.map((id) => tl.landAt.get(id) ?? 0);
    expect(first[1] - first[0]).toBe(BATCH_BEAT_MS.stepBudget / 50);
  });
});

describe("summarizeStage", () => {
  it("(g) counts changed and unchanged cats and lists the rare ones", () => {
    const summary = summarizeStage(bigStage(), STAGE);
    expect(summary.label).toBe("White Patches");
    expect(summary.changedCount).toBe(11);
    expect(summary.unchangedCount).toBe(9);
    expect(summary.groups.map((g) => g.label)).toEqual([
      "Little",
      "Tuxedo",
      "Mask",
      "Van",
    ]);
    expect(summary.rareIds.sort()).toEqual(["c12", "c5"]);
  });
});

describe("stageAnchorParam", () => {
  it("(h) maps every stage type to its anchor param", () => {
    const simple = (param: string): BatchStage => ({
      id: param,
      label: param,
      type: "simple",
      param,
    });
    expect(stageAnchorParam(simple("colour"))).toBe("colour");
    expect(stageAnchorParam(simple("peltName"))).toBe("pelt");
    expect(stageAnchorParam(simple("shading"))).toBe("pelt");
    expect(stageAnchorParam(simple("reverse"))).toBe("back");
    expect(stageAnchorParam(simple("poseName"))).toBe("sprite");
    expect(
      stageAnchorParam({
        id: "a",
        label: "A",
        type: "accessory",
        slotIndex: 0,
      }),
    ).toBe("accessory");
    expect(
      stageAnchorParam({ id: "s", label: "S", type: "scar", slotIndex: 0 }),
    ).toBe("scar");
    expect(
      stageAnchorParam({
        id: "t",
        label: "T",
        type: "tortie-sub",
        layerIndex: 0,
        subElement: "mask",
      }),
    ).toBe("tortie");
    expect(
      stageAnchorParam({
        id: "r",
        label: "R",
        type: "registry",
        traitId: "x",
        strategy: "single",
      }),
    ).toBe("pelt");
  });
});

describe("batchPhaseForBeat", () => {
  it("(i) folds the nine beats into the four legacy phases", () => {
    expect(batchPhaseForBeat("loading")).toBe("loading");
    for (const kind of ["windup", "deal", "hold", "depart", "repack"] as const)
      expect(batchPhaseForBeat(kind)).toBe("revealing");
    expect(batchPhaseForBeat("awaiting")).toBe("awaitingCull");
    expect(batchPhaseForBeat("verdict")).toBe("awaitingCull");
    expect(batchPhaseForBeat("done")).toBe("done");
  });
});
