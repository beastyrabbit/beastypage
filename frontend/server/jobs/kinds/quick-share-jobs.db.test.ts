import { createServer } from "node:http";
import { eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { readDatabaseConfig } from "../../db/config";
import { createDatabase, createPool, type Database } from "../../db/pool";
import { jobs, quickShareJobs, quickShareUploads } from "../../db/schema";
import { withTransaction } from "../../db/transaction";
import { enqueueJob } from "../enqueue";
import { getJobKind } from ".";

let pool: pg.Pool;
let db: Database;

beforeAll(() => {
  pool = createPool(
    readDatabaseConfig("app", { DATABASE_URL: inject("databaseUrl") }),
  );
  db = createDatabase(pool);
});

afterAll(() => pool.end());

describe("Quick Share jobs", () => {
  it("dispatches to a fake media endpoint with the worker contract", async () => {
    const calls: { url: string; token: string | undefined }[] = [];
    const server = createServer((request, response) => {
      calls.push({
        url: request.url ?? "",
        token: request.headers["x-quick-share-internal-token"] as
          | string
          | undefined,
      });
      response.writeHead(202).end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("server did not start");
    const previousUrl = process.env.QUICK_SHARE_WORKER_URL;
    const previousToken = process.env.QUICK_SHARE_INTERNAL_TOKEN;
    process.env.QUICK_SHARE_WORKER_URL = `http://127.0.0.1:${address.port}`;
    process.env.QUICK_SHARE_INTERNAL_TOKEN = "test-worker-token";
    try {
      const definition = getJobKind("quick-share.dispatch");
      if (!definition) throw new Error("job kind is not registered");
      const result = await definition.handler(
        { jobId: "00000000-0000-4000-8000-000000000001", attempt: 0 },
        {
          db,
          jobId: "job",
          kind: definition.kind,
          attempt: 1,
          signal: new AbortController().signal,
        },
      );
      expect(result).toEqual({ dispatched: 1 });
      expect(calls).toEqual([
        {
          url: "/i/api/internal/jobs/00000000-0000-4000-8000-000000000001",
          token: "test-worker-token",
        },
      ]);
    } finally {
      if (previousUrl === undefined) delete process.env.QUICK_SHARE_WORKER_URL;
      else process.env.QUICK_SHARE_WORKER_URL = previousUrl;
      if (previousToken === undefined)
        delete process.env.QUICK_SHARE_INTERNAL_TOKEN;
      else process.env.QUICK_SHARE_INTERNAL_TOKEN = previousToken;
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("uses the PostgreSQL retry schedule and stops after the final attempt", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(503).end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("server did not start");
    const previousUrl = process.env.QUICK_SHARE_WORKER_URL;
    const previousToken = process.env.QUICK_SHARE_INTERNAL_TOKEN;
    process.env.QUICK_SHARE_WORKER_URL = `http://127.0.0.1:${address.port}`;
    process.env.QUICK_SHARE_INTERNAL_TOKEN = "test-worker-token";
    vi.useFakeTimers({ now: 1_900_000_000_000 });
    const jobId = "00000000-0000-4000-8000-000000000002";
    try {
      const definition = getJobKind("quick-share.dispatch");
      if (!definition) throw new Error("job kind is not registered");
      for (const [attempt, delay] of [
        [0, 1_000],
        [1, 5_000],
        [2, 15_000],
        [3, 60_000],
        [4, 5 * 60_000],
        [5, 15 * 60_000],
        [6, 30 * 60_000],
      ] as const) {
        await definition.handler(
          { jobId, attempt },
          {
            db,
            jobId: `dispatch-${attempt}`,
            kind: definition.kind,
            attempt: attempt + 1,
            signal: new AbortController().signal,
          },
        );
        const [retry] = await db
          .select()
          .from(jobs)
          .where(eq(jobs.dedupeKey, `${jobId}:${attempt + 1}`));
        expect(retry?.runAfter.getTime()).toBe(1_900_000_000_000 + delay);
      }
      await expect(
        definition.handler(
          { jobId, attempt: 7 },
          {
            db,
            jobId: "dispatch-final",
            kind: definition.kind,
            attempt: 7,
            signal: new AbortController().signal,
          },
        ),
      ).rejects.toThrow("Quick Share worker returned 503");
      const retries = await db
        .select()
        .from(jobs)
        .where(eq(jobs.kind, "quick-share.dispatch"));
      expect(
        retries.filter((row) => row.dedupeKey?.startsWith(`${jobId}:`)),
      ).toHaveLength(7);
    } finally {
      vi.useRealTimers();
      if (previousUrl === undefined) delete process.env.QUICK_SHARE_WORKER_URL;
      else process.env.QUICK_SHARE_WORKER_URL = previousUrl;
      if (previousToken === undefined)
        delete process.env.QUICK_SHARE_INTERNAL_TOKEN;
      else process.env.QUICK_SHARE_INTERNAL_TOKEN = previousToken;
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("runs recovery, moderation, retention and redispatch jobs idempotently", async () => {
    const now = Date.now();
    const [leased] = await db
      .insert(quickShareUploads)
      .values({
        slug: `J${String(now).slice(-7)}`,
        source: "file",
        originalName: "leased.png",
        originalSize: 1,
        originalKey: `originals/leased-${now}`,
        state: "processing",
        receiptHash: `leased-${now}`,
        rateIdentity: `jobs-${now}`,
        ipHash: `jobs-ip-${now}`,
        rawIp: "192.0.2.10",
        publicExpiresAt: new Date(now + 60_000),
        retainedUntil: new Date(now + 60_000),
        active: true,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })
      .returning();
    const [leasedJob] = await db
      .insert(quickShareJobs)
      .values({
        uploadId: leased.id,
        kind: "process",
        status: "leased",
        attempts: 1,
        leaseId: `expired-${now}`,
        leaseExpiresAt: new Date(now - 1),
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })
      .returning();

    const recover = getJobKind("quick-share.recover-lease");
    if (!recover) throw new Error("recovery job is not registered");
    await recover.handler(
      { jobId: leasedJob.id, leaseId: `expired-${now}` },
      {
        db,
        jobId: "recovery",
        kind: recover.kind,
        attempt: 1,
        signal: new AbortController().signal,
      },
    );
    const recoveredRow = (await db.select().from(quickShareJobs)).find(
      (row) => row.id === leasedJob.id,
    );
    expect(recoveredRow?.status).toBe("pending");

    const [activeLease] = await db
      .insert(quickShareJobs)
      .values({
        uploadId: leased.id,
        kind: "delete",
        status: "leased",
        attempts: 1,
        leaseId: `active-${now}`,
        leaseExpiresAt: new Date(now + 60_000),
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })
      .returning();
    await recover.handler(
      { jobId: activeLease.id, leaseId: `active-${now}` },
      {
        db,
        jobId: "active-recovery",
        kind: recover.kind,
        attempt: 1,
        signal: new AbortController().signal,
      },
    );
    const activeAfter = (await db.select().from(quickShareJobs)).find(
      (row) => row.id === activeLease.id,
    );
    expect(activeAfter?.status).toBe("leased");

    const [moderated] = await db
      .insert(quickShareUploads)
      .values({
        slug: `M${String(now).slice(-7)}`,
        source: "file",
        originalName: "moderated.png",
        originalSize: 1,
        originalKey: `originals/moderated-${now}`,
        state: "ready",
        receiptHash: `moderated-${now}`,
        rateIdentity: `moderated-${now}`,
        ipHash: `moderated-ip-${now}`,
        rawIp: "192.0.2.11",
        publicExpiresAt: new Date(now + 60_000),
        retainedUntil: new Date(now + 60_000),
        active: true,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })
      .returning();
    const revoke = getJobKind("quick-share.revoke-ip");
    if (!revoke) throw new Error("revoke job is not registered");
    await revoke.handler(
      { ipHash: `moderated-ip-${now}`, now },
      {
        db,
        jobId: "revoke",
        kind: revoke.kind,
        attempt: 1,
        signal: new AbortController().signal,
      },
    );
    const [moderatedAfter] = (await db.select().from(quickShareUploads)).filter(
      (row) => row.id === moderated.id,
    );
    expect(moderatedAfter?.state).toBe("removed");

    const [expired] = await db
      .insert(quickShareUploads)
      .values({
        slug: `E${String(now).slice(-7)}`,
        source: "file",
        originalName: "expired.png",
        originalSize: 1,
        originalKey: `originals/expired-${now}`,
        state: "ready",
        receiptHash: `expired-${now}`,
        rateIdentity: `expired-${now}`,
        ipHash: `expired-ip-${now}`,
        rawIp: "192.0.2.12",
        publicExpiresAt: new Date(now - 60_000),
        retainedUntil: new Date(now - 60_000),
        active: false,
        createdAt: new Date(now - 120_000),
        updatedAt: new Date(now - 120_000),
      })
      .returning();
    const queue = getJobKind("quick-share.queue-retention");
    if (!queue) throw new Error("retention queue job is not registered");
    await queue.handler(
      { now },
      {
        db,
        jobId: "queue",
        kind: queue.kind,
        attempt: 1,
        signal: new AbortController().signal,
      },
    );
    expect(
      (await db.select().from(quickShareJobs)).some(
        (row) => row.uploadId === expired.id && row.kind === "delete",
      ),
    ).toBe(true);

    const redispatch = getJobKind("quick-share.redispatch");
    if (!redispatch) throw new Error("redispatch job is not registered");
    const redispatched = await redispatch.handler(
      {},
      {
        db,
        jobId: "redispatch",
        kind: redispatch.kind,
        attempt: 1,
        signal: new AbortController().signal,
      },
    );
    expect(redispatched.dispatched).toBeGreaterThan(0);

    const retention = getJobKind("quick-share.retention");
    expect(retention?.recurringIntervalMs).toBe(60 * 60_000);
    expect(retention?.recurringDedupeKey).toBe("singleton");

    const first = await withTransaction(db, (tx) =>
      enqueueJob(tx, {
        kind: "quick-share.redispatch",
        dedupeKey: `idempotent-${now}`,
        payload: {},
      }),
    );
    const second = await withTransaction(db, (tx) =>
      enqueueJob(tx, {
        kind: "quick-share.redispatch",
        dedupeKey: `idempotent-${now}`,
        payload: {},
      }),
    );
    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
  });
});
