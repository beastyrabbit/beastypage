import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type { Database } from "../db/pool";
import { shouldClaimJobs, startJobWorker } from "./worker";

class FakeListener extends EventEmitter {
  readonly queries: string[] = [];
  releaseArgument: boolean | undefined;

  async query(query: string): Promise<{ rows: never[] }> {
    this.queries.push(query);
    return { rows: [] };
  }

  release(destroy?: boolean): void {
    this.releaseArgument = destroy;
  }
}

function fakeDb(execute: () => Promise<{ rows: unknown[] }>): Database {
  const tx = {
    execute: async () => ({ rows: [] }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: async () => [],
        }),
      }),
    }),
  };
  return {
    execute,
    transaction: async (callback: (value: typeof tx) => unknown) =>
      callback(tx),
  } as unknown as Database;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for worker");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

describe("job claim maintenance gate", () => {
  it("stops claiming while maintenance is enabled", () => {
    expect(shouldClaimJobs({ MAINTENANCE_MODE: "1" })).toBe(false);
  });

  it("allows claims when maintenance is disabled", () => {
    expect(shouldClaimJobs({})).toBe(true);
  });
});

describe("job worker wake and LISTEN lifecycle", () => {
  it("rechecks after a notification arrives during due-wake scheduling", async () => {
    const listener = new FakeListener();
    let releaseSchedule: (() => void) | undefined;
    let scheduleStarted: (() => void) | undefined;
    let scheduleCalls = 0;
    const db = fakeDb(async () => {
      scheduleCalls += 1;
      if (scheduleCalls === 1) {
        scheduleStarted?.();
        await new Promise<void>((resolve) => {
          releaseSchedule = resolve;
        });
      }
      return { rows: [] };
    });
    const started = new Promise<void>((resolve) => {
      scheduleStarted = resolve;
    });
    const pool = {
      connect: async () => listener,
    };

    const worker = await startJobWorker({
      db,
      pool: pool as never,
      recoveryIntervalMs: 60_000,
    });
    await started;
    listener.emit("notification");
    releaseSchedule?.();

    await waitFor(() => scheduleCalls >= 2);
    await worker.stop();
  });

  it("reconnects the LISTEN client with backoff and wakes the loop", async () => {
    const first = new FakeListener();
    const second = new FakeListener();
    const clients = [first, second];
    let connectCalls = 0;
    const db = fakeDb(async () => ({ rows: [] }));
    const pool = {
      connect: async () => clients[connectCalls++],
    };

    const worker = await startJobWorker({
      db,
      pool: pool as never,
      recoveryIntervalMs: 60_000,
      reconnectBaseMs: 1,
      reconnectMaxMs: 2,
    });
    first.emit("error", new Error("connection dropped"));

    await waitFor(() => connectCalls === 2);
    expect(first.releaseArgument).toBe(true);
    expect(second.queries).toContain("LISTEN beastypage_jobs");
    await worker.stop();
    expect(second.releaseArgument).toBeUndefined();
  });
});
