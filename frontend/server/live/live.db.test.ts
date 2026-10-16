import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from "vitest";
import { closeDatabase, getDb, getPool } from "@/server/db/client";
import { withTransaction } from "@/server/db/transaction";
import { liveEvents } from "@/server/db/schema/system";
import { publishLive, pruneLiveEvents } from "@/server/live/publish";
import {
  createLiveListenerForTests,
  stopLiveListener,
} from "@/server/live/listener";
import { TEST_LIVE_KEY } from "@/server/live/topics/test";

const originalEnv = { ...process.env };
const TOPIC = "test/live-db";

let route: typeof import("@/app/api/live/[...topic]/route");

async function publish(topic: string, revision: number): Promise<void> {
  await withTransaction(getDb(), (tx) => publishLive(tx, topic, revision));
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline)
      throw new Error("Timed out waiting for live event");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs = 2_000,
): Promise<string> {
  const read = reader.read();
  const result = await Promise.race([
    read,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Timed out waiting for SSE")),
        timeoutMs,
      ),
    ),
  ]);
  if (result.done) return "";
  return new TextDecoder().decode(result.value);
}

beforeAll(async () => {
  process.env.DATA_BACKEND = "postgres";
  process.env.DATABASE_URL = inject("databaseUrl");
  route = await import("@/app/api/live/[...topic]/route");
});

beforeEach(async () => {
  await getDb().delete(liveEvents);
});

afterAll(async () => {
  await stopLiveListener();
  await closeDatabase();
  process.env = originalEnv;
});

describe("live PostgreSQL infrastructure", () => {
  it("delivers NOTIFY after commit and never after rollback", async () => {
    const client = new pg.Client({ connectionString: inject("databaseUrl") });
    await client.connect();
    const notifications: string[] = [];
    client.on("notification", (message) => {
      if (message.channel === "beastypage_live")
        notifications.push(message.payload ?? "");
    });
    await client.query("LISTEN beastypage_live");

    await publish(TOPIC, 1);
    await waitFor(() => notifications.includes(TOPIC));
    notifications.length = 0;

    await expect(
      getDb().transaction(async (tx) => {
        await publishLive(tx, TOPIC, 2);
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(notifications).toEqual([]);
    const rows = await getDb()
      .select({ revision: liveEvents.revision })
      .from(liveEvents)
      .where(and(eq(liveEvents.topic, TOPIC), eq(liveEvents.revision, 2)));
    expect(rows).toEqual([]);
    await client.end();
  });

  it("replays a gap after a forced reconnect", async () => {
    const listener = createLiveListenerForTests();
    const revisions: number[] = [];
    const unsubscribe = listener.subscribe(TOPIC, (event) => {
      revisions.push(event.revision);
    });
    await listener.waitUntilReady();

    await listener.disconnectForTests();
    await publish(TOPIC, 7);
    await waitFor(() => revisions.includes(7));
    expect(listener.processedEventId).toBeGreaterThan(0);
    unsubscribe();
    await listener.stop();
  });

  it("streams the snapshot, suppresses stale revisions, and rejects unauthorized topics", async () => {
    const controller = new AbortController();
    const request = new NextRequest(
      `http://localhost/api/live/test/live-sse?key=${TEST_LIVE_KEY}`,
      { signal: controller.signal },
    );
    const response = await route.GET(request, {
      params: Promise.resolve({ topic: ["test", "live-sse"] }),
    });
    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("SSE response has no body");
    const initial = await readChunk(reader);
    expect(initial).toContain('"revision":0');

    await publish("test/live-sse", 1);
    expect(await readChunk(reader)).toContain('"revision":1');

    await publish("test/live-sse", 1);
    await expect(readChunk(reader, 150)).rejects.toThrow("Timed out");
    await publish("test/live-sse", 0);
    await expect(readChunk(reader, 150)).rejects.toThrow("Timed out");

    const unauthorized = await route.GET(
      new NextRequest("http://localhost/api/live/test/live-sse"),
      { params: Promise.resolve({ topic: ["test", "live-sse"] }) },
    );
    expect(unauthorized.status).toBe(403);
    expect(await unauthorized.json()).toMatchObject({ code: "forbidden" });
    controller.abort();
    await reader.cancel();
  });

  it("prunes events older than the requested cutoff", async () => {
    await publish(TOPIC, 1);
    await getPool().query(
      "update live_events set created_at = now() - interval '2 hours' where topic = $1",
      [TOPIC],
    );
    expect(
      await pruneLiveEvents(getDb(), new Date(Date.now() - 60 * 60 * 1000)),
    ).toBe(1);
  });

  it("fans out to three independent listener processes", async () => {
    const topic = "test/replica";
    const targetRevision = 20;
    const workers: ChildProcessWithoutNullStreams[] = [];
    const messages = new Map<number, { at: number; revision: number }>();
    const ready = new Set<number>();
    const buffers = new Map<number, string>();
    const databaseUrl = inject("databaseUrl");
    const serverOnlyShim = join(
      tmpdir(),
      `beastypage-server-only-${process.pid}.cjs`,
    );
    writeFileSync(
      serverOnlyShim,
      "const M=require('node:module');const load=M._load;M._load=(r,p,m)=>r==='server-only'?{}:load(r,p,m);",
    );

    for (let index = 0; index < 3; index += 1) {
      const worker = spawn(
        "pnpm",
        ["exec", "tsx", "server/live/replica-worker.ts"],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DATABASE_URL: databaseUrl,
            DATA_BACKEND: "postgres",
            NODE_ENV: "test",
            NODE_OPTIONS:
              `${process.env.NODE_OPTIONS ?? ""} --require=${serverOnlyShim}`.trim(),
            LIVE_REPLICA_TOPIC: topic,
            LIVE_REPLICA_TARGET: String(targetRevision),
          },
        },
      );
      workers.push(worker);
      buffers.set(index, "");
      worker.stdout.on("data", (chunk: Buffer) => {
        const buffer = `${buffers.get(index) ?? ""}${chunk.toString()}`;
        const lines = buffer.split("\n");
        buffers.set(index, lines.pop() ?? "");
        for (const line of lines) {
          try {
            const message = JSON.parse(line) as {
              type: string;
              at?: number;
              revision?: number;
            };
            if (message.type === "ready") ready.add(index);
            if (message.type === "received" && message.at && message.revision) {
              messages.set(index, {
                at: message.at,
                revision: message.revision,
              });
            }
          } catch {
            // pnpm/tsx may print a startup warning; protocol lines remain JSON.
          }
        }
      });
    }

    try {
      await waitFor(() => ready.size === 3, 8_000);
      const publishedAt: number[] = [];
      for (let revision = 1; revision <= targetRevision; revision += 1) {
        publishedAt.push(Date.now());
        await publish(topic, revision);
      }
      await waitFor(() => messages.size === 3, 8_000);
      for (const message of messages.values()) {
        expect(message.revision).toBe(targetRevision);
      }
      const latencies = [...messages.values()]
        .map((message) => message.at - publishedAt[targetRevision - 1])
        .sort((a, b) => a - b);
      const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
      const p95 =
        latencies[
          Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)
        ] ?? 0;
      console.info(`[live] three-replica latency p50=${p50}ms p95=${p95}ms`);
      expect(p95).toBeLessThan(1_000);
    } finally {
      for (const worker of workers) worker.kill();
      unlinkSync(serverOnlyShim);
    }
  }, 20_000);
});
