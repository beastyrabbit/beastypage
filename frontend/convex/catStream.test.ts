/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const T0 = 1_800_000_000_000;
const API_KEY = "stream-key-host";
const VERDICT_MS = 3000;
const HOLD_MAX_MS = 90_000;

const BATCH = {
  title: "Litter",
  finalCount: 1,
  config: { accessoryCount: 0, scarCount: 0, tortieCount: 0 },
  cats: [
    { id: "cat-a", label: "Cat 1", catData: {} },
    { id: "cat-b", label: "Cat 2", catData: {} },
    { id: "cat-c", label: "Cat 3", catData: {} },
  ],
};

const EVOLUTION = {
  slug: "lineage",
  totalCount: 2,
  chargeDurationMs: 10_000,
  cats: [
    {
      key: "starter",
      label: "Starter",
      level: 0,
      branchLabel: null,
      archetype: null,
      additions: [],
      catData: {},
    },
    {
      key: "kit",
      label: "Kit",
      level: 1,
      branchLabel: "Moss",
      archetype: null,
      additions: [],
      catData: {},
    },
  ],
};

/** A signed-in host with an API key and an idle stream session, on fake timers at T0. */
async function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  const t = convexTest(schema, modules);
  const host = t.withIdentity({
    subject: "host",
    issuer: "https://identity.example",
  });
  await host.mutation(api.users.getOrCreateUser, {});
  const viewer = await host.query(api.users.viewer, {});
  if (!viewer) throw new Error("viewer missing");
  await t.run(async (ctx) => {
    await ctx.db.patch(viewer._id, { apiKey: API_KEY });
  });
  await host.mutation(api.catStream.ensureSession, {});
  const session = async () => {
    const doc = await host.query(api.catStream.getSession, {});
    if (!doc) throw new Error("session missing");
    return doc;
  };
  const report = (seq: number, stageIndex: number, awaitingCull: boolean) =>
    t.mutation(api.catStream.reportBatchStage, {
      apiKey: API_KEY,
      seq,
      stageIndex,
      awaitingCull,
    });
  /** Start a batch and bring the overlay to "awaiting a cull" on stage 0. */
  const startBatchAwaiting = async () => {
    const seq = await host.mutation(api.catStream.triggerBatch, {
      batch: BATCH,
    });
    await report(seq, 0, false);
    await report(seq, 0, true);
    return seq;
  };
  return { t, host, session, report, startBatchAwaiting };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("reportBatchStage", () => {
  it("stamps stageStartedAt on the first report and on every stage increase", async () => {
    const { host, session, report } = await setup();
    const seq = await host.mutation(api.catStream.triggerBatch, {
      batch: BATCH,
    });
    expect((await session()).batchState?.stageStartedAt).toBeUndefined();

    await report(seq, 0, false);
    expect((await session()).batchState).toMatchObject({
      stageIndex: 0,
      awaitingCull: false,
      stageStartedAt: T0,
    });

    // A 2 s re-send of the same report keeps the stamp.
    vi.setSystemTime(T0 + 2000);
    await report(seq, 0, false);
    expect((await session()).batchState?.stageStartedAt).toBe(T0);

    // Flipping to awaiting on the same stage keeps it too.
    await report(seq, 0, true);
    expect((await session()).batchState).toMatchObject({
      awaitingCull: true,
      stageStartedAt: T0,
    });

    // The next stage gets its own stamp.
    vi.setSystemTime(T0 + 9000);
    await report(seq, 1, false);
    expect((await session()).batchState).toMatchObject({
      stageIndex: 1,
      awaitingCull: false,
      stageStartedAt: T0 + 9000,
    });
  });
});

describe("cullBatchCat / finalizeBatchCull / cancelBatchCull", () => {
  it("arms the verdict, then the scheduled finalize applies the cull", async () => {
    const { t, host, session, startBatchAwaiting } = await setup();
    const seq = await startBatchAwaiting();
    await host.mutation(api.catStream.setBatchHighlight, {
      seq,
      catId: "cat-a",
      kind: "potential",
    });
    await host.mutation(api.catStream.setBatchHighlight, {
      seq,
      catId: "cat-b",
      kind: "favorite",
    });

    const armed = await host.mutation(api.catStream.cullBatchCat, {
      seq,
      catId: "cat-a",
    });
    expect(armed).toEqual({ verdictAt: T0 + VERDICT_MS });
    expect((await session()).batchState).toMatchObject({
      awaitingCull: true,
      eliminatedIds: [],
      markedId: "cat-a",
      pendingCullId: "cat-a",
      verdictAt: T0 + VERDICT_MS,
      potentialIds: ["cat-a"],
      favoriteIds: ["cat-b"],
    });
    await expect(
      host.mutation(api.catStream.cullBatchCat, { seq, catId: "cat-b" }),
    ).rejects.toThrow("A verdict is already running.");

    vi.advanceTimersByTime(VERDICT_MS);
    await t.finishInProgressScheduledFunctions();
    const state = (await session()).batchState;
    expect(state).toMatchObject({
      awaitingCull: false,
      eliminatedIds: ["cat-a"],
      lastCullAt: T0 + VERDICT_MS,
      favoriteIds: ["cat-b"],
    });
    expect(state?.pendingCullId).toBeUndefined();
    expect(state?.verdictAt).toBeUndefined();
    expect(state?.markedId).toBeUndefined();
    expect(state?.potentialIds).toBeUndefined();
  });

  it("cancel inside the window drops the arm, keeps the mark, and the finalize no-ops", async () => {
    const { t, host, session, startBatchAwaiting } = await setup();
    const seq = await startBatchAwaiting();
    await host.mutation(api.catStream.cullBatchCat, { seq, catId: "cat-a" });
    vi.advanceTimersByTime(1000);
    await host.mutation(api.catStream.cancelBatchCull, { seq });
    const cancelled = (await session()).batchState;
    expect(cancelled).toMatchObject({
      awaitingCull: true,
      eliminatedIds: [],
      markedId: "cat-a",
    });
    expect(cancelled?.pendingCullId).toBeUndefined();
    expect(cancelled?.verdictAt).toBeUndefined();

    vi.advanceTimersByTime(VERDICT_MS);
    await t.finishInProgressScheduledFunctions();
    expect((await session()).batchState?.eliminatedIds).toEqual([]);
  });

  it("is too late to cancel between verdictAt and the grace end", async () => {
    const { host, startBatchAwaiting } = await setup();
    const seq = await startBatchAwaiting();
    await host.mutation(api.catStream.cullBatchCat, { seq, catId: "cat-a" });
    vi.setSystemTime(T0 + VERDICT_MS + 500);
    await expect(
      host.mutation(api.catStream.cancelBatchCull, { seq }),
    ).rejects.toThrow("Too late to cancel.");
  });

  it("an expired verdict: same cat applies inline, cancel clears, another cat re-arms", async () => {
    const { t, host, session, startBatchAwaiting } = await setup();
    const seq = await startBatchAwaiting();
    await host.mutation(api.catStream.cullBatchCat, { seq, catId: "cat-a" });
    // The finalize never ran (lost job): 20 s pass without the scheduler.
    vi.setSystemTime(T0 + 20_000);

    // Cancel is allowed again once expired.
    await host.mutation(api.catStream.cancelBatchCull, { seq });
    expect((await session()).batchState?.pendingCullId).toBeUndefined();

    // Re-arm, let it expire again, then re-arm the SAME cat: applied inline.
    await host.mutation(api.catStream.cullBatchCat, { seq, catId: "cat-a" });
    vi.setSystemTime(T0 + 40_000);
    const inline = await host.mutation(api.catStream.cullBatchCat, {
      seq,
      catId: "cat-a",
    });
    expect(inline).toEqual({ verdictAt: T0 + 40_000 });
    expect((await session()).batchState).toMatchObject({
      awaitingCull: false,
      eliminatedIds: ["cat-a"],
      lastCullAt: T0 + 40_000,
    });

    // Next stage: arm cat-b, let it expire, arm cat-c instead → cat-c armed.
    await t.mutation(api.catStream.reportBatchStage, {
      apiKey: API_KEY,
      seq,
      stageIndex: 1,
      awaitingCull: true,
    });
    // finalCount 1 of 3 cats → two culls are allowed.
    await host.mutation(api.catStream.cullBatchCat, { seq, catId: "cat-b" });
    vi.setSystemTime(T0 + 60_000);
    const rearmed = await host.mutation(api.catStream.cullBatchCat, {
      seq,
      catId: "cat-c",
    });
    expect(rearmed).toEqual({ verdictAt: T0 + 60_000 + VERDICT_MS });
    expect((await session()).batchState).toMatchObject({
      pendingCullId: "cat-c",
      markedId: "cat-c",
      eliminatedIds: ["cat-a"],
    });
    // Every pending finalize fires: the stale cat-b one no-ops, cat-c lands.
    vi.advanceTimersByTime(VERDICT_MS);
    await t.finishInProgressScheduledFunctions();
    expect((await session()).batchState?.eliminatedIds).toEqual([
      "cat-a",
      "cat-c",
    ]);
  });
});

describe("evolution ceremony clock", () => {
  it("triggerEvolution seeds a fresh clock", async () => {
    const { host, session } = await setup();
    const seq = await host.mutation(api.catStream.triggerEvolution, {
      evolution: EVOLUTION,
    });
    const doc = await session();
    expect(doc.evolutionState).toEqual({ seq, offsetMs: 0 });
    expect(doc.currentCommand).toMatchObject({ type: "evolution", seq });
  });

  it("hold parks at the near miss, release folds the hold, reveal sets the offset absolutely", async () => {
    const { host, session } = await setup();
    const seq = await host.mutation(api.catStream.triggerEvolution, {
      evolution: EVOLUTION,
    });
    // Hold in cruise, parking the clock at the roll's near miss (8800).
    vi.setSystemTime(T0 + 6000);
    await host.mutation(api.catStream.holdEvolution, {
      seq,
      parkAtElapsedMs: 8800,
    });
    expect((await session()).evolutionState).toEqual({
      seq,
      offsetMs: 6000 - 8800,
      holdStartedAt: T0 + 6000,
    });
    // A second hold is a no-op while held.
    vi.setSystemTime(T0 + 7000);
    await host.mutation(api.catStream.holdEvolution, { seq });
    expect((await session()).evolutionState?.holdStartedAt).toBe(T0 + 6000);

    // Release after 5 s: the hold folds into the offset.
    vi.setSystemTime(T0 + 11_000);
    await host.mutation(api.catStream.releaseEvolution, { seq });
    expect((await session()).evolutionState).toEqual({
      seq,
      offsetMs: 6000 - 8800 + 5000,
    });

    // Hold in place (no park) keeps the offset.
    vi.setSystemTime(T0 + 12_000);
    await host.mutation(api.catStream.holdEvolution, { seq });
    expect((await session()).evolutionState).toEqual({
      seq,
      offsetMs: 2200,
      holdStartedAt: T0 + 12_000,
    });

    // Reveal now: absolute offset, hold dropped without folding.
    vi.setSystemTime(T0 + 13_000);
    await host.mutation(api.catStream.revealEvolutionAt, {
      seq,
      targetElapsedMs: 9300,
    });
    expect((await session()).evolutionState).toEqual({
      seq,
      offsetMs: 13_000 - 9300,
    });

    // Skip folds nothing here and flags the board; reveal keeps the flag.
    vi.setSystemTime(T0 + 14_000);
    await host.mutation(api.catStream.skipEvolutionToBoard, { seq });
    expect((await session()).evolutionState).toEqual({
      seq,
      offsetMs: 3700,
      skipToBoard: true,
    });
    await host.mutation(api.catStream.revealEvolutionAt, {
      seq,
      targetElapsedMs: 0,
    });
    expect((await session()).evolutionState).toEqual({
      seq,
      offsetMs: 14_000,
      skipToBoard: true,
    });

    // Another seq never touches the clock.
    await host.mutation(api.catStream.holdEvolution, { seq: seq + 1 });
    expect((await session()).evolutionState?.holdStartedAt).toBeUndefined();
  });

  it("a hold auto-releases after HOLD_MAX_MS, folding exactly that much", async () => {
    const { t, host, session } = await setup();
    const seq = await host.mutation(api.catStream.triggerEvolution, {
      evolution: EVOLUTION,
    });
    await host.mutation(api.catStream.holdEvolution, { seq });
    expect((await session()).evolutionState?.holdStartedAt).toBe(T0);
    vi.advanceTimersByTime(HOLD_MAX_MS);
    await t.finishInProgressScheduledFunctions();
    expect((await session()).evolutionState).toEqual({
      seq,
      offsetMs: HOLD_MAX_MS,
    });
  });
});
