/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { closeDatabase, getDb } from "../db/client";
import type { Database } from "../db/pool";
import {
  attachBatchSlug,
  attachCatStreamViewSlug,
  autoReleaseEvolution,
  cancelBatchCull,
  clearOverlay,
  cullBatchCat,
  ensureCatStreamSession,
  finalizeBatchCull,
  getCatStreamSession,
  getCatStreamSessionByApiKey,
  getCatStreamSnapshot,
  holdEvolution,
  markBatchCat,
  mergeCatStreamSettings,
  releaseEvolution,
  reportBatchStage,
  revealEvolutionAt,
  setBatchHighlight,
  showBrb,
  showLobby,
  skipEvolutionToBoard,
  toggleTestMode,
  triggerCatStreamBatch,
  triggerCatStreamEvolution,
  triggerCatStreamSpin,
  triggerCatStreamWheel,
  updateCatStreamSettings,
} from "./catStream";
import { getOrCreateUser } from "./users";

const modules = import.meta.glob("../../convex/**/*.ts");
let db: Database;

beforeAll(() => {
  process.env.DATABASE_URL = inject("databaseUrl");
  db = getDb();
});
afterAll(() => closeDatabase());

function identity(name: string) {
  return { tokenIdentifier: `https://cat-stream.parity.test|${name}` };
}

function present<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined)
    throw new Error(`${label} missing`);
  return value;
}

function numberResult(value: unknown, label: string): number {
  if (typeof value !== "number") throw new Error(`${label} missing`);
  return value;
}

function stateShape(value: Record<string, unknown> | null) {
  if (!value) return null;
  const command = value.currentCommand as Record<string, unknown> | null;
  return {
    status: value.status,
    settings: value.settings,
    testMode: value.testMode,
    currentCommand: command
      ? {
          type: command.type,
          seq: command.seq,
          params: command.params,
          slots: command.slots,
          countdownSeconds: command.countdownSeconds,
          viewSlug: command.viewSlug,
          evolution: command.evolution,
          batch: command.batch,
        }
      : null,
    batchState: value.batchState ?? null,
    evolutionState: value.evolutionState ?? null,
    lastWheelSpinForSeq: value.lastWheelSpinForSeq,
  };
}

const evolution = {
  slug: "evolution-slug",
  totalCount: 1,
  chargeDurationMs: 400,
  cats: [
    {
      key: "cat-1",
      label: "Cat One",
      level: 1,
      branchLabel: null,
      archetype: null,
      additions: [{ traitId: "fur", label: "Fur" }],
      catData: { params: { colour: "BLACK" } },
    },
  ],
};

const batch = {
  finalCount: 1,
  config: { accessoryCount: 1, scarCount: 1, tortieCount: 1 },
  cats: [
    { id: "cat-1", label: "Cat One", catData: { params: { colour: "BLACK" } } },
    { id: "cat-2", label: "Cat Two", catData: { params: { colour: "WHITE" } } },
  ],
};

describe("cat stream Convex/PostgreSQL parity", () => {
  it("matches the complete overlay command lifecycle and seq rules", async () => {
    const owner = identity(`owner-${crypto.randomUUID()}`);
    const other = identity(`other-${crypto.randomUUID()}`);
    const convex = convexTest(schema, modules);
    const convexOwner = convex.withIdentity(owner);
    const convexOther = convex.withIdentity(other);
    const convexUser = present(
      await convexOwner.mutation(api.users.getOrCreateUser, {}),
      "Convex user",
    );
    const postgresUser = await getOrCreateUser(db, owner);
    if (!postgresUser.apiKey) throw new Error("PostgreSQL API key missing");

    const initialSettings = { overlayTheme: "dark", lobbyCatCount: 4 };
    const convexId = await convexOwner.mutation(api.catStream.ensureSession, {
      settings: initialSettings,
    });
    const postgresId = await ensureCatStreamSession(db, owner, initialSettings);
    expect(convexId).toBeTruthy();
    expect(postgresId).toBeTruthy();
    expect(
      stateShape(
        (await convexOwner.query(api.catStream.getSession, {})) as Record<
          string,
          unknown
        >,
      ),
    ).toEqual(stateShape(await getCatStreamSession(db, owner)));
    expect(
      stateShape(
        (await convex.query(api.catStream.getSessionByApiKey, {
          apiKey: convexUser.apiKey as string,
        })) as Record<string, unknown>,
      ),
    ).toEqual(
      stateShape(await getCatStreamSessionByApiKey(db, postgresUser.apiKey)),
    );
    expect(await convexOther.query(api.catStream.getSession, {})).toBeNull();
    expect(await getCatStreamSession(db, other)).toBeNull();
    expect(
      await convex.query(api.catStream.getSessionByApiKey, { apiKey: "wrong" }),
    ).toBeNull();
    expect(await getCatStreamSessionByApiKey(db, "wrong")).toBeNull();

    await convexOwner.mutation(api.catStream.updateSettings, {
      settings: { overlayTheme: "light" },
    });
    await updateCatStreamSettings(db, owner, { overlayTheme: "light" });
    await convexOwner.mutation(api.catStream.mergeSettings, {
      settings: { resultAutoClearSeconds: 8 },
    });
    await mergeCatStreamSettings(db, owner, { resultAutoClearSeconds: 8 });
    expect(
      stateShape(
        (await convexOwner.query(api.catStream.getSession, {})) as Record<
          string,
          unknown
        >,
      ),
    ).toEqual(stateShape(await getCatStreamSession(db, owner)));

    const spinArgs = {
      params: { colour: "BLACK", schemaVersion: 1 },
      slots: { accessories: ["flower"], scars: [null], tortie: [] },
      countdownSeconds: 3,
    };
    const convexSpinSeq = await convexOwner.mutation(
      api.catStream.triggerSpin,
      spinArgs,
    );
    const postgresSpinSeq = await triggerCatStreamSpin(db, owner, spinArgs);
    expect(convexSpinSeq).toBe(1);
    expect(postgresSpinSeq).toBe(1);
    const beforeSlug = await getCatStreamSnapshot(db, postgresId);
    await convexOwner.mutation(api.catStream.attachViewSlug, {
      seq: 1,
      slug: "SpinSlug1",
    });
    await attachCatStreamViewSlug(db, owner, { seq: 1, slug: "SpinSlug1" });
    const afterSlug = await getCatStreamSnapshot(db, postgresId);
    if (!beforeSlug || !afterSlug) throw new Error("stream snapshot missing");
    expect(afterSlug?.data.currentCommand).toMatchObject({
      seq: beforeSlug?.data.currentCommand
        ? (beforeSlug.data.currentCommand as Record<string, unknown>).seq
        : 1,
      viewSlug: "SpinSlug1",
    });
    expect(afterSlug.revision).toBeGreaterThan(beforeSlug.revision);
    expect((afterSlug.data.currentCommand as Record<string, unknown>).seq).toBe(
      1,
    );
    await expect(
      convexOther.mutation(api.catStream.triggerSpin, spinArgs),
    ).rejects.toThrow("User not found");
    await expect(
      triggerCatStreamSpin(db, other, spinArgs),
    ).rejects.toMatchObject({ code: "not_found" });

    const convexWheel = await convexOwner.mutation(
      api.catStream.triggerWheel,
      {},
    );
    const postgresWheel = await triggerCatStreamWheel(db, owner);
    expect(convexWheel).toMatchObject({ forced: false });
    expect(postgresWheel).toMatchObject({ forced: false });
    expect(
      (await getCatStreamSession(db, owner))?.currentCommand,
    ).toMatchObject({ type: "wheel", seq: 2 });

    const convexEvolutionSeq = await convexOwner.mutation(
      api.catStream.triggerEvolution,
      { evolution },
    );
    const postgresEvolutionSeq = await triggerCatStreamEvolution(
      db,
      owner,
      evolution,
    );
    expect(convexEvolutionSeq).toBe(3);
    expect(postgresEvolutionSeq).toBe(3);
    await convexOwner.mutation(api.catStream.holdEvolution, {
      seq: 3,
      parkAtElapsedMs: 200,
    });
    await holdEvolution(db, owner, { seq: 3, parkAtElapsedMs: 200 });
    expect(
      (await getCatStreamSession(db, owner))?.evolutionState,
    ).toMatchObject({
      seq: 3,
    });
    await convexOwner.mutation(api.catStream.releaseEvolution, { seq: 3 });
    await releaseEvolution(db, owner, { seq: 3 });
    expect(
      (await getCatStreamSession(db, owner))?.evolutionState,
    ).not.toHaveProperty("holdStartedAt");
    await convexOwner.mutation(api.catStream.revealEvolutionAt, {
      seq: 3,
      targetElapsedMs: 300,
    });
    await revealEvolutionAt(db, owner, { seq: 3, targetElapsedMs: 300 });
    await convexOwner.mutation(api.catStream.skipEvolutionToBoard, { seq: 3 });
    await skipEvolutionToBoard(db, owner, { seq: 3 });
    expect(
      (await getCatStreamSession(db, owner))?.evolutionState,
    ).toMatchObject({
      seq: 3,
      skipToBoard: true,
    });

    const convexBatchSeq = await convexOwner.mutation(
      api.catStream.triggerBatch,
      {
        batch,
      },
    );
    const postgresBatchSeq = await triggerCatStreamBatch(db, owner, batch);
    expect(convexBatchSeq).toBe(4);
    expect(postgresBatchSeq).toBe(4);
    const convexApiKey = convexUser.apiKey as string;
    await convex.mutation(api.catStream.reportBatchStage, {
      apiKey: convexApiKey,
      seq: 4,
      stageIndex: 1,
      awaitingCull: true,
    });
    await reportBatchStage(db, postgresUser.apiKey, {
      seq: 4,
      stageIndex: 1,
      awaitingCull: true,
    });
    await convexOwner.mutation(api.catStream.markBatchCat, {
      seq: 4,
      catId: "cat-1",
    });
    await markBatchCat(db, owner, { seq: 4, catId: "cat-1" });
    for (const kind of ["potential", "favorite", "spotlight"] as const) {
      await convexOwner.mutation(api.catStream.setBatchHighlight, {
        seq: 4,
        catId: "cat-1",
        kind,
      });
      await setBatchHighlight(db, owner, { seq: 4, catId: "cat-1", kind });
    }
    await convexOwner.mutation(api.catStream.attachBatchSlug, {
      seq: 4,
      slug: "BatchSlug1",
    });
    await attachBatchSlug(db, owner, { seq: 4, slug: "BatchSlug1" });
    const convexCull = present(
      await convexOwner.mutation(api.catStream.cullBatchCat, {
        seq: 4,
        catId: "cat-1",
      }),
      "Convex cull",
    );
    const postgresCull = present(
      await cullBatchCat(db, owner, { seq: 4, catId: "cat-1" }),
      "PostgreSQL cull",
    );
    expect(convexCull.verdictAt).toBeGreaterThan(Date.now());
    expect(postgresCull.verdictAt).toBeGreaterThan(Date.now());
    await convex.mutation(internal.catStream.finalizeBatchCull, {
      sessionId: convexId as never,
      seq: 4,
      catId: "cat-1",
      verdictAt: convexCull.verdictAt,
    });
    await finalizeBatchCull(db, {
      sessionId: postgresId,
      seq: 4,
      catId: "cat-1",
      verdictAt: postgresCull.verdictAt,
    });
    expect((await getCatStreamSession(db, owner))?.batchState).toMatchObject({
      eliminatedIds: ["cat-1"],
      awaitingCull: false,
    });
    await convexOwner.mutation(api.catStream.cancelBatchCull, { seq: 4 });
    await cancelBatchCull(db, owner, { seq: 4 });

    const convexEvolutionAgain = numberResult(
      await convexOwner.mutation(api.catStream.triggerEvolution, { evolution }),
      "Convex evolution seq",
    );
    const postgresEvolutionAgain = numberResult(
      await triggerCatStreamEvolution(db, owner, evolution),
      "PostgreSQL evolution seq",
    );
    await convexOwner.mutation(api.catStream.holdEvolution, {
      seq: convexEvolutionAgain,
    });
    await holdEvolution(db, owner, { seq: postgresEvolutionAgain });
    const postgresHeld = await getCatStreamSession(db, owner);
    const startedAt = postgresHeld?.evolutionState?.holdStartedAt;
    if (startedAt === undefined)
      throw new Error("evolution hold was not stored");
    await convex.mutation(internal.catStream.autoReleaseEvolution, {
      sessionId: convexId as never,
      seq: convexEvolutionAgain,
      holdStartedAt: (await convexOwner.query(api.catStream.getSession, {}))
        ?.evolutionState?.holdStartedAt as number,
    });
    await autoReleaseEvolution(db, {
      sessionId: postgresId,
      seq: postgresEvolutionAgain,
      holdStartedAt: startedAt,
    });
    expect(
      (await getCatStreamSession(db, owner))?.evolutionState,
    ).not.toHaveProperty("holdStartedAt");
    await convexOwner.mutation(api.catStream.showLobby, {});
    await showLobby(db, owner);
    await convexOwner.mutation(api.catStream.showBrb, {});
    await showBrb(db, owner);
    await convexOwner.mutation(api.catStream.clearOverlay, {});
    await clearOverlay(db, owner);
    await convexOwner.mutation(api.catStream.toggleTestMode, {});
    await toggleTestMode(db, owner);
    expect((await getCatStreamSession(db, owner))?.testMode).toBe(true);
    expect(await getCatStreamSnapshot(db, postgresId)).toMatchObject({
      data: { status: "idle", testMode: true },
    });
  });

  it("asserts malformed payload, API-key, host and params-only size denials on both backends", async () => {
    const owner = identity(`denial-owner-${crypto.randomUUID()}`);
    const other = identity(`denial-other-${crypto.randomUUID()}`);
    const convex = convexTest(schema, modules);
    const convexOwner = convex.withIdentity(owner);
    const convexOther = convex.withIdentity(other);
    await convexOwner.mutation(api.users.getOrCreateUser, {});
    const postgresUser = await getOrCreateUser(db, owner);
    if (!postgresUser.apiKey) throw new Error("PostgreSQL API key missing");
    await convexOwner.mutation(api.catStream.ensureSession, {});
    await ensureCatStreamSession(db, owner);
    await expect(
      convexOther.mutation(api.catStream.updateSettings, { settings: {} }),
    ).rejects.toThrow("User not found");
    await expect(updateCatStreamSettings(db, other, {})).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      convex.mutation(api.catStream.reportBatchStage, {
        apiKey: "wrong",
        seq: 1,
        stageIndex: 0,
        awaitingCull: false,
      }),
    ).rejects.toThrow("Unknown API key");
    await expect(
      reportBatchStage(db, "wrong", {
        seq: 1,
        stageIndex: 0,
        awaitingCull: false,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const malformedEvolution = {
      slug: 42,
      totalCount: 1,
      cats: [],
    };
    await expect(
      convexOwner.mutation(api.catStream.triggerEvolution, {
        evolution: malformedEvolution as never,
      }),
    ).rejects.toThrow();
    await expect(
      triggerCatStreamEvolution(db, owner, malformedEvolution),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      convexOwner.mutation(api.catStream.triggerWheel, {}),
    ).rejects.toThrow("Spin a cat before spinning the wheel");
    await expect(triggerCatStreamWheel(db, owner)).rejects.toThrow(
      "Spin a cat before spinning the wheel",
    );
    await expect(
      convexOwner.mutation(api.catStream.triggerSpin, {
        params: "x".repeat(1_100_000),
      }),
    ).resolves.toBe(1);
    await expect(
      triggerCatStreamSpin(db, owner, { params: "x".repeat(1_100_000) }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      convexOwner.mutation(api.catStream.attachViewSlug, {
        seq: 99,
        slug: "stale",
      }),
    ).resolves.toBeNull();
    await expect(
      attachCatStreamViewSlug(db, owner, { seq: 99, slug: "stale" }),
    ).resolves.toBeUndefined();
  });
});
