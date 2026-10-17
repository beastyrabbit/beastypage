import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { closeDatabase, getDb } from "../../db/client";
import type { Database } from "../../db/pool";
import { withTransaction } from "../../db/transaction";
import {
  selectCatStreamSession,
  updateCatStreamSession,
} from "../../repositories/catStream";
import { ensureCatStreamSession } from "../../services/catStream";
import { getOrCreateUser } from "../../services/users";
import autoReleaseEvolution from "./cat-stream-auto-release-evolution";
import finalizeBatchCull from "./cat-stream-finalize-batch-cull";

let db: Database;
beforeAll(() => {
  process.env.DATABASE_URL = inject("databaseUrl");
  db = getDb();
});
afterAll(async () => closeDatabase());

describe("stream delayed jobs", () => {
  it("marks stale cull and evolution payloads as no-ops", async () => {
    const sessionId = crypto.randomUUID();
    const context = {
      db,
      jobId: crypto.randomUUID(),
      kind: "test",
      attempt: 1,
      signal: new AbortController().signal,
    };
    await expect(
      finalizeBatchCull.handler(
        { sessionId, seq: 1, catId: "cat", verdictAt: 1 },
        context,
      ),
    ).resolves.toEqual({ applied: 0 });
    await expect(
      autoReleaseEvolution.handler(
        { sessionId, seq: 1, holdStartedAt: 1 },
        context,
      ),
    ).resolves.toEqual({ applied: 0 });
  });

  it("finalizes a current cull and releases a current evolution hold", async () => {
    const identity = {
      tokenIdentifier: `https://cat-stream-jobs.test|${crypto.randomUUID()}`,
    };
    await getOrCreateUser(db, identity);
    const sessionId = await ensureCatStreamSession(db, identity);
    const verdictAt = Date.now() - 1_000;
    await withTransaction(db, async (tx) => {
      await updateCatStreamSession(tx, sessionId, {
        currentCommand: {
          type: "batch",
          seq: 1,
          batch: {
            finalCount: 1,
            config: { accessoryCount: 0, scarCount: 0, tortieCount: 0 },
            cats: [{ id: "cat", label: "Cat", catData: {} }],
          },
          timestamp: Date.now(),
        } as never,
        batchState: {
          seq: 1,
          stageIndex: 0,
          awaitingCull: true,
          eliminatedIds: [],
          pendingCullId: "cat",
          verdictAt,
        },
      });
    });
    const context = {
      db,
      jobId: crypto.randomUUID(),
      kind: "test",
      attempt: 1,
      signal: new AbortController().signal,
    };
    await expect(
      finalizeBatchCull.handler(
        { sessionId, seq: 1, catId: "cat", verdictAt },
        context,
      ),
    ).resolves.toEqual({ applied: 1 });
    expect(
      (await selectCatStreamSession(db, sessionId))?.batchState,
    ).toMatchObject({ awaitingCull: false, eliminatedIds: ["cat"] });

    const holdStartedAt = Date.now() - 1_000;
    await withTransaction(db, async (tx) => {
      await updateCatStreamSession(tx, sessionId, {
        currentCommand: {
          type: "evolution",
          seq: 2,
          evolution: { slug: "evolution", totalCount: 0, cats: [] },
          timestamp: Date.now(),
        } as never,
        evolutionState: { seq: 2, offsetMs: 0, holdStartedAt },
      });
    });
    await expect(
      autoReleaseEvolution.handler(
        { sessionId, seq: 2, holdStartedAt },
        context,
      ),
    ).resolves.toEqual({ applied: 1 });
    expect(
      (await selectCatStreamSession(db, sessionId))?.evolutionState,
    ).toMatchObject({ seq: 2, offsetMs: expect.any(Number) });
    expect(
      (await selectCatStreamSession(db, sessionId))?.evolutionState
        ?.holdStartedAt,
    ).toBeUndefined();
  });
});
