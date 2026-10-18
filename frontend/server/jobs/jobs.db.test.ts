import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { z } from "zod";
import { closeDatabase, getDb, getPool } from "../db/client";
import { readDatabaseConfig } from "../db/config";
import { createPool } from "../db/pool";
import { withTransaction } from "../db/transaction";
import { enqueueJob } from "./enqueue";
import { jobKindRegistry } from "./kinds";
import type { AnyJobKind } from "./types";
import { backoffDelayMs, startJobWorker } from "./worker";

const databaseUrl = inject("databaseUrl");
const env = { ...process.env };
const testKind = "test.jobs.run";
const payloadSchema = z.object({ value: z.string() });
let listenerPool: ReturnType<typeof createPool>;

const testDefinition = {
  kind: testKind,
  payloadSchema,
  maxAttempts: 2,
  leaseMs: 2_000,
  handler: async () => ({ handled: 1 }),
} as unknown as AnyJobKind;

async function waitFor(
  check: () => Promise<boolean>,
  timeoutMs = 3_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("condition did not become true");
}

beforeAll(() => {
  process.env.DATABASE_URL = databaseUrl;
  listenerPool = createPool(
    readDatabaseConfig("app", { DATABASE_URL: databaseUrl }),
  );
  jobKindRegistry.set(testKind, testDefinition);
});

afterAll(async () => {
  jobKindRegistry.delete(testKind);
  await listenerPool.end();
  await closeDatabase();
  process.env = env;
});

async function clearJobs() {
  await getPool().query("delete from job_runs");
  await getPool().query("delete from jobs");
}

describe("jobs infrastructure", () => {
  it("deduplicates and notifies only after commit", async () => {
    await clearJobs();
    const client = await listenerPool.connect();
    const notification = new Promise<string>((resolve) => {
      client.once("notification", (message) => resolve(message.payload ?? ""));
    });
    await client.query("listen beastypage_jobs");

    const first = await withTransaction(getDb(), (tx) =>
      enqueueJob(tx, {
        kind: testKind,
        dedupeKey: "same",
        payload: { value: "one" },
      }),
    );
    const second = await withTransaction(getDb(), (tx) =>
      enqueueJob(tx, {
        kind: testKind,
        dedupeKey: "same",
        payload: { value: "two" },
      }),
    );

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    await expect(notification).resolves.toBe(testKind);
    client.release();
  });

  it("does not notify a rolled-back enqueue", async () => {
    await clearJobs();
    const client = await listenerPool.connect();
    await client.query("listen beastypage_jobs");
    await expect(
      withTransaction(getDb(), async (tx) => {
        await enqueueJob(tx, {
          kind: testKind,
          payload: { value: "rollback" },
        });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    await new Promise((resolve) => setTimeout(resolve, 75));
    client.release();
    expect(
      (await getPool().query("select count(*)::int as count from jobs")).rows[0]
        ?.count,
    ).toBe(0);
  });

  it("runs a claimed job once across two workers and writes job_runs", async () => {
    await clearJobs();
    let handled = 0;
    jobKindRegistry.set(testKind, {
      ...testDefinition,
      handler: async () => {
        handled += 1;
        await new Promise((resolve) => setTimeout(resolve, 80));
        return { handled: 1 };
      },
    });
    await withTransaction(getDb(), (tx) =>
      enqueueJob(tx, { kind: testKind, payload: { value: "run" } }),
    );
    const workers = await Promise.all([
      startJobWorker({ workerId: "test-worker-a", concurrency: 1 }),
      startJobWorker({ workerId: "test-worker-b", concurrency: 1 }),
    ]);
    await waitFor(async () => {
      const result = await getPool().query(
        "select status from jobs where kind = $1 limit 1",
        [testKind],
      );
      return result.rows[0]?.status === "done";
    });
    await Promise.all(workers.map((worker) => worker.stop()));

    expect(handled).toBe(1);
    const runs = await getPool().query(
      "select outcome, detail from job_runs where kind = $1",
      [testKind],
    );
    expect(runs.rows).toHaveLength(1);
    expect(runs.rows[0]?.outcome).toBe("done");
    expect(runs.rows[0]?.detail).toMatchObject({ counts: { handled: 1 } });
  });

  it("marks invalid payloads dead and recovers an expired lease", async () => {
    await clearJobs();
    const invalid = await getPool().query<{ id: string }>(
      `insert into jobs (kind, payload) values ($1, $2) returning id`,
      [testKind, { value: 123 }],
    );
    const expired = await getPool().query<{ id: string }>(
      `insert into jobs (kind, payload, status, lease_owner, lease_expires_at)
       values ($1, $2, 'running', 'old-worker', now() - interval '1 minute')
       returning id`,
      [testKind, { value: "expired" }],
    );
    const worker = await startJobWorker({
      workerId: "test-recovery",
      concurrency: 1,
      recoveryIntervalMs: 1_000,
    });
    await waitFor(async () => {
      const result = await getPool().query(
        "select status from jobs where id = $1",
        [invalid.rows[0]?.id],
      );
      return result.rows[0]?.status === "dead";
    });
    await waitFor(async () => {
      const result = await getPool().query(
        "select status from jobs where id = $1",
        [expired.rows[0]?.id],
      );
      return result.rows[0]?.status === "done";
    });
    await worker.stop();
    const runs = await getPool().query(
      "select outcome from job_runs where kind = $1 order by id",
      [testKind],
    );
    expect(runs.rows.map((row) => row.outcome)).toEqual(["dead", "done"]);
  });

  it("retries with backoff and then transitions to dead", async () => {
    await clearJobs();
    jobKindRegistry.set(testKind, {
      ...testDefinition,
      maxAttempts: 2,
      handler: async () => {
        throw new Error("transient failure");
      },
    });
    await withTransaction(getDb(), (tx) =>
      enqueueJob(tx, { kind: testKind, payload: { value: "retry" } }),
    );
    const worker = await startJobWorker({
      workerId: "test-retry",
      random: () => 0,
    });
    await waitFor(async () => {
      const result = await getPool().query(
        "select status, attempts from jobs where kind = $1 limit 1",
        [testKind],
      );
      return (
        result.rows[0]?.status === "pending" && result.rows[0]?.attempts === 1
      );
    });
    await getPool().query("update jobs set run_after = now() where kind = $1", [
      testKind,
    ]);
    await getPool().query("select pg_notify('beastypage_jobs', $1)", [
      testKind,
    ]);
    await waitFor(async () => {
      const result = await getPool().query(
        "select status from jobs where kind = $1 limit 1",
        [testKind],
      );
      return result.rows[0]?.status === "dead";
    });
    await worker.stop();
    const runs = await getPool().query(
      "select outcome from job_runs where kind = $1 order by id",
      [testKind],
    );
    expect(runs.rows.map((row) => row.outcome)).toEqual(["retry", "dead"]);
  });

  it("wakes at run_after and starts recurring singletons once", async () => {
    await clearJobs();
    jobKindRegistry.set(testKind, testDefinition);
    const worker = await startJobWorker({ workerId: "test-delayed" });
    await withTransaction(getDb(), (tx) =>
      enqueueJob(tx, {
        kind: testKind,
        dedupeKey: "delayed",
        payload: { value: "delayed" },
        runAfter: new Date(Date.now() + 100),
      }),
    );
    await waitFor(async () => {
      const result = await getPool().query(
        "select status from jobs where kind = $1 and dedupe_key = 'delayed'",
        [testKind],
      );
      return result.rows[0]?.status === "done";
    });
    await worker.stop();

    const recurring = await getPool().query(
      "select kind, count(*)::int as count from jobs where dedupe_key = 'singleton' and status in ('pending', 'running') group by kind",
    );
    expect(recurring.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "live.prune", count: 1 }),
        expect.objectContaining({ kind: "jobs.prune", count: 1 }),
      ]),
    );
  });

  it("keeps the retry backoff bounded", () => {
    expect(backoffDelayMs(1, () => 0)).toBe(5_000);
    expect(backoffDelayMs(2, () => 0)).toBe(10_000);
    expect(backoffDelayMs(99, () => 1)).toBe(60 * 60_000);
  });
});
