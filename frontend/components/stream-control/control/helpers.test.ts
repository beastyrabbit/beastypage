import { describe, expect, it } from "vitest";
import {
  type BatchLiveState,
  type BatchStage,
  buildBatchStagePlan,
} from "@/lib/adoption/streamBatch";
import type { EvolutionAddition } from "@/lib/evolution/evolutionGenerator";
import type { EvolutionStreamCat } from "@/lib/evolution/streamEvolution";
import type { StageSummary } from "../obs/scenes/batch/batchBeats";
import {
  describeBatchBeat,
  evolutionLedger,
  isShowLive,
  pacingAvailable,
  verdictSecondsLeft,
} from "./helpers";

const NOW = 1_700_000_000_000;

describe("verdictSecondsLeft", () => {
  it("counts 3 → 0 and clamps", () => {
    expect(verdictSecondsLeft(NOW + 3000, NOW)).toBe(3);
    expect(verdictSecondsLeft(NOW + 1500, NOW)).toBe(2);
    expect(verdictSecondsLeft(NOW + 200, NOW)).toBe(1);
    expect(verdictSecondsLeft(NOW - 5, NOW)).toBe(0);
    expect(verdictSecondsLeft(NOW + 9000, NOW)).toBe(3);
  });
  it("is null without a verdict", () => {
    expect(verdictSecondsLeft(null, NOW)).toBeNull();
    expect(verdictSecondsLeft(undefined, NOW)).toBeNull();
  });
});

const STAGES: BatchStage[] = [
  { id: "peltName", label: "Pelt", type: "simple", param: "peltName" },
  {
    id: "whitePatches",
    label: "White Patches",
    type: "simple",
    param: "whitePatches",
  },
  { id: "poseName", label: "Pose", type: "simple", param: "poseName" },
];
const numberOf = (id: string) => id.slice(-2);
const baseState: BatchLiveState = {
  seq: 4,
  stageIndex: 1,
  awaitingCull: false,
  eliminatedIds: [],
};

describe("describeBatchBeat", () => {
  it("is null without live state", () => {
    expect(describeBatchBeat(null, STAGES, null, numberOf, NOW)).toBeNull();
  });
  it("reads the stage, the trait and the beat word", () => {
    const readout = describeBatchBeat(baseState, STAGES, null, numberOf, NOW);
    expect(readout).toEqual({
      stage: "Stage 2/3",
      trait: "WHITE PATCHES",
      beat: "dealing",
      changed: null,
      rare: null,
    });
  });
  it("says awaiting, verdict N, verdict stuck and done", () => {
    const beat = (state: Partial<BatchLiveState>) =>
      describeBatchBeat({ ...baseState, ...state }, STAGES, null, numberOf, NOW)
        ?.beat;
    expect(beat({ awaitingCull: true })).toBe("awaiting");
    expect(
      beat({
        awaitingCull: true,
        pendingCullId: "cat-16",
        verdictAt: NOW + 2500,
      }),
    ).toBe("verdict 3");
    expect(
      beat({
        awaitingCull: true,
        pendingCullId: "cat-16",
        verdictAt: NOW + 10,
      }),
    ).toBe("verdict 1");
    expect(
      beat({
        awaitingCull: true,
        pendingCullId: "cat-16",
        verdictAt: NOW - 11_000,
      }),
    ).toBe("verdict stuck");
    // Between verdictAt and the grace end the finalize is landing: awaiting.
    expect(
      beat({
        awaitingCull: true,
        pendingCullId: "cat-16",
        verdictAt: NOW - 500,
      }),
    ).toBe("awaiting");
    expect(beat({ stageIndex: 3 })).toBe("done");
  });
  it("carries the summary counts and the rare numbers", () => {
    const summary: StageSummary = {
      label: "White Patches",
      changedCount: 11,
      unchangedCount: 3,
      groups: [],
      rareIds: ["cat-16", "cat-21"],
    };
    const readout = describeBatchBeat(
      baseState,
      STAGES,
      summary,
      numberOf,
      NOW,
    );
    expect(readout?.changed).toBe(11);
    expect(readout?.rare).toBe("#16 #21");
  });
});

const ACCESSORY: EvolutionAddition = {
  kind: "accessory",
  traitId: "accessories",
  label: "Accessory",
  value: "RED_COLLAR",
  traitValue: "RED_COLLAR",
};
const SCAR: EvolutionAddition = {
  kind: "scar",
  traitId: "scars",
  label: "Scar",
  value: "ONE",
  traitValue: "ONE",
};
const catData = {} as unknown as EvolutionStreamCat["catData"];
const T0 = NOW;
/**
 * Schedule (chargeMs 10 000): summon [0, 3000) · banner Moss [3000, 5000) ·
 * roll(1,0) [5000, 10000) · roll(1,1) [10000, 15000) · reveal(1) [15000, 17360) ·
 * roll(2,0) [17360, 25360) · reveal(2) [25360, 27540) · finale [27540, 31040).
 * roll(1,0): A = 3800 → near miss at 8800, land at 9300.
 */
const COMMAND = {
  slug: "lineage",
  totalCount: 3,
  chargeDurationMs: 10_000,
  seq: 7,
  timestamp: T0,
  cats: [
    {
      key: "starter",
      label: "Starter",
      level: 0,
      branchLabel: null,
      archetype: null,
      additions: [],
      catData,
    },
    {
      key: "moss-1",
      label: "Mosspaw",
      level: 1,
      branchLabel: "Moss",
      archetype: null,
      additions: [ACCESSORY, SCAR],
      catData,
    },
    {
      key: "moss-2",
      label: "Mossclaw",
      level: 2,
      branchLabel: "Moss",
      archetype: null,
      additions: [ACCESSORY],
      catData,
    },
  ] satisfies EvolutionStreamCat[],
};
const TOTAL_MS = 31_040;

describe("evolutionLedger", () => {
  it("summon: no roll, no park or reveal targets", () => {
    const ledger = evolutionLedger(COMMAND, null, T0 + 1000);
    expect(ledger.stepLabel).toBe("Summon");
    expect(ledger.roll).toBeNull();
    expect(ledger.branch).toBeNull();
    expect(ledger.holdParkAtMs).toBeNull();
    expect(ledger.revealNowAtMs).toBeNull();
    expect(ledger.done).toBe(false);
    expect(ledger.held).toBe(false);
    expect(ledger.etaMs).toBe(TOTAL_MS - 1000);
    expect(ledger.progress).toBeCloseTo(1000 / TOTAL_MS, 6);
  });
  it("banner names the branch", () => {
    expect(evolutionLedger(COMMAND, null, T0 + 4000).stepLabel).toBe(
      "Banner · Moss",
    );
  });
  it("inside roll 1/2 before the near miss: park and reveal targets are set", () => {
    const ledger = evolutionLedger(COMMAND, null, T0 + 6000);
    expect(ledger.stepLabel).toBe("Roll · ACCESSORY · 1/2");
    expect(ledger.roll).toEqual({
      index: 0,
      count: 2,
      traitLabel: "ACCESSORY",
      phase: "cruise",
    });
    expect(ledger.branch).toBe("Moss");
    expect(ledger.rank).toBe("Apprentice");
    expect(ledger.catLabel).toBe("Mosspaw");
    expect(ledger.holdParkAtMs).toBe(8800);
    expect(ledger.revealNowAtMs).toBe(9300);
  });
  it("inside the land phase both targets are null", () => {
    const ledger = evolutionLedger(COMMAND, null, T0 + 9400);
    expect(ledger.roll?.phase).toBe("land");
    expect(ledger.holdParkAtMs).toBeNull();
    expect(ledger.revealNowAtMs).toBeNull();
  });
  it("past the schedule: Board, done, eta 0", () => {
    const ledger = evolutionLedger(COMMAND, null, T0 + 40_000);
    expect(ledger.stepLabel).toBe("Board");
    expect(ledger.done).toBe(true);
    expect(ledger.etaMs).toBe(0);
    expect(ledger.progress).toBe(1);
  });
  it("a hold freezes the clock and reads held", () => {
    const state = { seq: 7, offsetMs: 0, holdStartedAt: T0 + 6000 };
    const ledger = evolutionLedger(COMMAND, state, T0 + 6500);
    expect(ledger.held).toBe(true);
    expect(ledger.stepLabel).toBe("Roll · ACCESSORY · 1/2");
    expect(ledger.etaMs).toBe(TOTAL_MS - 6000);
  });
  it("skipToBoard reads done; another seq's state is ignored", () => {
    expect(
      evolutionLedger(COMMAND, { seq: 7, offsetMs: 0, skipToBoard: true }, T0)
        .done,
    ).toBe(true);
    expect(
      evolutionLedger(COMMAND, { seq: 6, offsetMs: 0, skipToBoard: true }, T0)
        .stepLabel,
    ).toBe("Summon");
  });
});

describe("pacingAvailable", () => {
  it("is false only for the classic chamber", () => {
    expect(pacingAvailable("classic")).toBe(false);
    expect(pacingAvailable("strata")).toBe(true);
  });
});

describe("isShowLive", () => {
  const config = { accessoryCount: 0, scarCount: 0, tortieCount: 0 };
  const stageCount = buildBatchStagePlan(config, []).length;
  const batchSession = (stageIndex: number, seq = 3) => ({
    currentCommand: {
      type: "batch",
      seq: 3,
      timestamp: T0,
      batch: { finalCount: 1, config, cats: [] },
    },
    batchState: { seq, stageIndex, awaitingCull: false, eliminatedIds: [] },
  });
  it("batch: live until the overlay reports past the last stage", () => {
    expect(isShowLive(batchSession(0), NOW)).toBe(true);
    expect(isShowLive(batchSession(stageCount - 1), NOW)).toBe(true);
    expect(isShowLive(batchSession(stageCount), NOW)).toBe(false);
    // A stale state from another seq never ends the show.
    expect(isShowLive(batchSession(stageCount, 2), NOW)).toBe(true);
  });
  const evolutionSession = (
    evolutionState: {
      seq: number;
      offsetMs: number;
      holdStartedAt?: number;
      skipToBoard?: boolean;
    } | null,
  ) => ({
    currentCommand: {
      type: "evolution",
      seq: 7,
      timestamp: T0,
      evolution: COMMAND,
    },
    evolutionState,
  });
  it("evolution: live inside the schedule, off after total or skip", () => {
    expect(isShowLive(evolutionSession(null), T0 + 1000)).toBe(true);
    expect(isShowLive(evolutionSession(null), T0 + TOTAL_MS)).toBe(false);
    expect(
      isShowLive(
        evolutionSession({ seq: 7, offsetMs: 0, skipToBoard: true }),
        T0 + 1000,
      ),
    ).toBe(false);
    // A hold keeps the show live past the unheld total.
    expect(
      isShowLive(
        evolutionSession({ seq: 7, offsetMs: 0, holdStartedAt: T0 + 1000 }),
        T0 + TOTAL_MS + 1000,
      ),
    ).toBe(true);
  });
  it("other commands and no session are not live", () => {
    expect(isShowLive(null, NOW)).toBe(false);
    expect(isShowLive({ currentCommand: { type: "lobby", seq: 9 } }, NOW)).toBe(
      false,
    );
  });
});
