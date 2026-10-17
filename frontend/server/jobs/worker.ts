import "server-only";

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type pg from "pg";
import { getDb, getPool } from "../db/client";
import type { Database } from "../db/pool";
import { jobRuns } from "../db/schema";
import { withTransaction } from "../db/transaction";
import { isMaintenanceMode } from "../maintenance";
import { enqueueJob } from "./enqueue";
import { getJobKind, jobKinds } from "./kinds";
import type { AnyJobKind, JobCounts } from "./types";

const RECOVERY_INTERVAL_MS = 10 * 60_000;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 30_000;
const MAX_BACKOFF_MS = 60 * 60_000;
const LISTEN_RECONNECT_BASE_MS = 100;
const LISTEN_RECONNECT_MAX_MS = 5_000;

export function shouldClaimJobs(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return !isMaintenanceMode(env);
}

export interface JobWorkerOptions {
  db?: Database;
  pool?: pg.Pool;
  workerId?: string;
  concurrency?: number;
  recoveryIntervalMs?: number;
  shutdownTimeoutMs?: number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  random?: () => number;
}

interface ClaimedJob {
  id: string;
  kind: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  runAfter: Date;
  leaseExpiresAt: Date;
}

export interface JobWorker {
  readonly workerId: string;
  stop(): Promise<void>;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown job error";
  }
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Exponential delay: 5s, 10s, 20s ... up to one hour, plus up to 20% jitter. */
export function backoffDelayMs(attempt: number, random = Math.random): number {
  const base = Math.min(5_000 * 2 ** Math.max(0, attempt - 1), MAX_BACKOFF_MS);
  return Math.min(MAX_BACKOFF_MS, Math.round(base * (1 + random() * 0.2)));
}

function recurringDedupeKey(definition: {
  recurringDedupeKey?: string;
}): string {
  return definition.recurringDedupeKey ?? "singleton";
}

function recurringPayload(definition: { recurringPayload?: unknown }): unknown {
  return definition.recurringPayload ?? {};
}

class Worker implements JobWorker {
  readonly workerId: string;
  private readonly db: Database;
  private readonly pool: pg.Pool;
  private readonly concurrency: number;
  private readonly recoveryIntervalMs: number;
  private readonly shutdownTimeoutMs: number;
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;
  private readonly random: () => number;
  private readonly active = new Set<Promise<void>>();
  private readonly wakeWaiters = new Set<() => void>();
  private wakeGeneration = 0;
  private listener: pg.PoolClient | undefined;
  private listenerReconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private listenerReconnectDelay = LISTEN_RECONNECT_BASE_MS;
  private loopPromise: Promise<void> | undefined;
  private recoveryTimer: ReturnType<typeof setInterval> | undefined;
  private dueTimer: ReturnType<typeof setTimeout> | undefined;
  private stopping = false;
  private stopped = false;

  constructor(options: JobWorkerOptions) {
    this.db = options.db ?? getDb();
    this.pool = options.pool ?? getPool();
    this.workerId = options.workerId ?? `jobs-${randomUUID()}`;
    this.concurrency = Math.max(
      1,
      Math.min(32, Math.floor(options.concurrency ?? DEFAULT_CONCURRENCY)),
    );
    this.recoveryIntervalMs = Math.max(
      1_000,
      options.recoveryIntervalMs ?? RECOVERY_INTERVAL_MS,
    );
    this.shutdownTimeoutMs = Math.max(
      1,
      options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS,
    );
    this.reconnectBaseMs = Math.max(
      1,
      options.reconnectBaseMs ?? LISTEN_RECONNECT_BASE_MS,
    );
    this.reconnectMaxMs = Math.max(
      this.reconnectBaseMs,
      options.reconnectMaxMs ?? LISTEN_RECONNECT_MAX_MS,
    );
    this.listenerReconnectDelay = this.reconnectBaseMs;
    this.random = options.random ?? Math.random;
  }

  async start(): Promise<void> {
    await this.ensureRecurringJobs();
    try {
      await this.connectListener();
    } catch (error) {
      console.error("[jobs] LISTEN connection failed", errorMessage(error));
      this.scheduleListenerReconnect();
    }

    this.recoveryTimer = setInterval(() => {
      void this.recoverExpiredLeases().finally(() => this.wake());
    }, this.recoveryIntervalMs);
    this.recoveryTimer.unref?.();
    this.wake();
    this.loopPromise = this.runLoop();
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopping = true;
    this.wake();
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
    if (this.dueTimer) clearTimeout(this.dueTimer);
    if (this.listenerReconnectTimer) clearTimeout(this.listenerReconnectTimer);
    this.listenerReconnectTimer = undefined;
    this.dueTimer = undefined;

    const deadline = Date.now() + this.shutdownTimeoutMs;
    while (this.active.size > 0 && Date.now() < deadline) {
      const remaining = deadline - Date.now();
      await Promise.race([
        Promise.allSettled(this.active),
        new Promise<void>((resolve) => setTimeout(resolve, remaining)),
      ]);
    }
    await this.loopPromise;
    const listener = this.listener;
    this.listener = undefined;
    listener?.removeAllListeners();
    listener?.release();
    this.listener = undefined;
    this.stopped = true;
  }

  private wake() {
    this.wakeGeneration += 1;
    for (const resolve of this.wakeWaiters) resolve();
    this.wakeWaiters.clear();
  }

  private async waitForWake(generation: number): Promise<void> {
    if (this.stopping) return;
    await new Promise<void>((resolve) => {
      if (this.stopping || this.wakeGeneration !== generation) {
        resolve();
        return;
      }
      this.wakeWaiters.add(resolve);
    });
  }

  private async connectListener(): Promise<void> {
    const listener = await this.pool.connect();
    if (this.stopping) {
      listener.release(true);
      return;
    }

    this.listener = listener;
    let failed = false;
    const fail = (error: unknown) => {
      if (failed || this.listener !== listener) return;
      failed = true;
      console.error("[jobs] LISTEN connection failed", errorMessage(error));
      this.listener = undefined;
      listener.removeAllListeners();
      listener.release(true);
      this.scheduleListenerReconnect();
    };

    listener.on("notification", () => this.wake());
    listener.on("error", fail);
    listener.on("end", () => fail(new Error("LISTEN connection ended")));

    try {
      await listener.query("LISTEN beastypage_jobs");
    } catch (error) {
      fail(error);
      throw error;
    }

    if (this.stopping || this.listener !== listener) return;
    this.listenerReconnectDelay = this.reconnectBaseMs;
    this.wake();
  }

  private scheduleListenerReconnect(): void {
    if (this.stopping || this.listenerReconnectTimer) return;
    const delay = this.listenerReconnectDelay;
    this.listenerReconnectDelay = Math.min(
      this.reconnectMaxMs,
      Math.max(this.reconnectBaseMs, this.listenerReconnectDelay * 2),
    );
    this.listenerReconnectTimer = setTimeout(() => {
      this.listenerReconnectTimer = undefined;
      void this.reconnectListener();
    }, delay);
    this.listenerReconnectTimer.unref?.();
  }

  private async reconnectListener(): Promise<void> {
    if (this.stopping || this.listener) return;
    try {
      await this.connectListener();
    } catch (error) {
      console.error("[jobs] LISTEN reconnect failed", errorMessage(error));
      this.scheduleListenerReconnect();
    }
  }

  private async runLoop(): Promise<void> {
    while (!this.stopping) {
      const generation = this.wakeGeneration;
      try {
        await this.pump();
      } catch (error) {
        console.error("[jobs] worker loop failed", errorMessage(error));
      }
      if (this.stopping) break;
      await this.waitForWake(generation);
    }
  }

  private async pump(): Promise<void> {
    while (!this.stopping && this.active.size < this.concurrency) {
      const job = await this.claim();
      if (!job) break;
      const run = this.process(job)
        .catch((error) => {
          console.error("[jobs] job finalization failed", errorMessage(error));
        })
        .finally(() => {
          this.active.delete(run);
          this.wake();
        });
      this.active.add(run);
    }
    await this.scheduleDueWake();
  }

  private async scheduleDueWake(): Promise<void> {
    if (this.dueTimer) clearTimeout(this.dueTimer);
    this.dueTimer = undefined;
    if (this.stopping || this.active.size >= this.concurrency) return;
    try {
      const result = await this.db.execute<{ run_after: Date }>(
        sql`select run_after from jobs
            where status = 'pending'
            order by run_after asc, id asc limit 1`,
      );
      const dueValue = result.rows[0]?.run_after;
      const due = dueValue ? asDate(dueValue) : undefined;
      if (!due) return;
      const delay = Math.max(0, due.getTime() - Date.now());
      this.dueTimer = setTimeout(() => this.wake(), delay);
      this.dueTimer.unref?.();
    } catch (error) {
      console.error("[jobs] could not schedule due wake", errorMessage(error));
    }
  }

  private async ensureRecurringJobs(): Promise<void> {
    if (!shouldClaimJobs()) return;
    await withTransaction(this.db, async (tx) => {
      for (const definition of jobKinds) {
        if (!definition.recurringIntervalMs) continue;
        await enqueueJob(tx, {
          kind: definition.kind,
          dedupeKey: recurringDedupeKey(definition),
          payload: recurringPayload(definition),
        });
      }
    });
  }

  private async claim(): Promise<ClaimedJob | null> {
    if (!shouldClaimJobs()) return null;
    return withTransaction(this.db, async (tx) => {
      const result = await tx.execute<{
        id: string;
        kind: string;
        payload: unknown;
        attempts: number;
        max_attempts: number;
        run_after: Date;
      }>(sql`
        select id, kind, payload, attempts, max_attempts, run_after
        from jobs
        where status = 'pending' and run_after <= now()
        order by run_after asc, id asc
        for update skip locked
        limit 1
      `);
      const row = result.rows[0];
      if (!row) return null;
      const leaseMs = getJobKind(row.kind)?.leaseMs ?? 5 * 60_000;
      const claimed = await tx.execute<{
        id: string;
        kind: string;
        payload: unknown;
        attempts: number;
        max_attempts: number;
        run_after: Date;
        lease_expires_at: Date;
      }>(sql`update jobs
        set status = 'running', attempts = attempts + 1,
            lease_owner = ${this.workerId},
            lease_expires_at = now() + (${leaseMs} * interval '1 millisecond'),
            updated_at = now()
        where id = ${row.id}
        returning id, kind, payload, attempts, max_attempts,
                  run_after, lease_expires_at`);
      const claimedRow = claimed.rows[0];
      if (!claimedRow) return null;
      return {
        id: claimedRow.id,
        kind: claimedRow.kind,
        payload: claimedRow.payload,
        attempts: claimedRow.attempts,
        maxAttempts: claimedRow.max_attempts,
        runAfter: asDate(claimedRow.run_after),
        leaseExpiresAt: asDate(claimedRow.lease_expires_at),
      };
    });
  }

  private async recoverExpiredLeases(): Promise<void> {
    await withTransaction(this.db, async (tx) => {
      const reclaimed = await tx.execute(
        sql`update jobs
            set status = 'pending', lease_owner = null,
                lease_expires_at = null, run_after = now(), updated_at = now()
            where status = 'running' and lease_expires_at <= now()
            returning id`,
      );
      if (reclaimed.rows.length > 0) {
        await tx.execute(sql`select pg_notify('beastypage_jobs', '*')`);
      }
    });
  }

  private async process(job: ClaimedJob): Promise<void> {
    const definition = getJobKind(job.kind);
    const startedAt = Date.now();
    let outcome: "done" | "retry" | "dead" = "done";
    let counts: JobCounts = {};
    let failure: string | undefined;

    if (!definition) {
      outcome = "dead";
      failure = `Unknown job kind ${job.kind}`;
    } else {
      const parsed = definition.payloadSchema.safeParse(job.payload);
      if (!parsed.success) {
        outcome = "dead";
        failure = `Invalid payload for ${job.kind}: ${parsed.error.message}`;
      } else {
        const controller = new AbortController();
        const heartbeat = this.startHeartbeat(job, definition, controller);
        try {
          counts = await definition.handler(parsed.data, {
            db: this.db,
            jobId: job.id,
            kind: job.kind,
            attempt: job.attempts,
            signal: controller.signal,
          });
        } catch (error) {
          failure = errorMessage(error);
          outcome = job.attempts >= job.maxAttempts ? "dead" : "retry";
        } finally {
          clearInterval(heartbeat);
        }
      }
    }

    const durationMs = Math.max(0, Date.now() - startedAt);
    await this.finish(job, definition, outcome, durationMs, counts, failure);
    if (outcome === "dead") {
      console.error(
        JSON.stringify({
          event: "job_dead",
          jobId: job.id,
          kind: job.kind,
          attempts: job.attempts,
          error: failure ?? "Job marked dead",
        }),
      );
    }
  }

  private startHeartbeat(
    job: ClaimedJob,
    definition: AnyJobKind,
    controller: AbortController,
  ): ReturnType<typeof setInterval> {
    const intervalMs = Math.max(50, Math.floor(definition.leaseMs / 3));
    const timer = setInterval(() => {
      void this.db
        .execute(
          sql`update jobs
              set lease_expires_at = now() + (${definition.leaseMs} * interval '1 millisecond'),
                  updated_at = now()
              where id = ${job.id} and status = 'running'
                and lease_owner = ${this.workerId}`,
        )
        .catch((error) => {
          controller.abort(error);
        });
    }, intervalMs);
    timer.unref?.();
    return timer;
  }

  private async finish(
    job: ClaimedJob,
    definition: AnyJobKind | undefined,
    outcome: "done" | "retry" | "dead",
    durationMs: number,
    counts: JobCounts,
    failure: string | undefined,
  ): Promise<void> {
    const retryAt =
      outcome === "retry"
        ? new Date(Date.now() + backoffDelayMs(job.attempts, this.random))
        : undefined;
    const nextRunAt = definition?.recurringIntervalMs
      ? new Date(
          Math.max(Date.now(), job.runAfter.getTime()) +
            definition.recurringIntervalMs,
        )
      : undefined;

    await withTransaction(this.db, async (tx) => {
      const updated = await tx.execute<{ id: string }>(
        outcome === "retry"
          ? sql`update jobs set status = 'pending', run_after = ${retryAt},
                  lease_owner = null, lease_expires_at = null,
                  last_error = ${failure ?? null}, updated_at = now()
              where id = ${job.id} and status = 'running'
                and lease_owner = ${this.workerId} returning id`
          : sql`update jobs set status = ${outcome}, run_after = run_after,
                  lease_owner = null, lease_expires_at = null,
                  last_error = ${failure ?? null}, updated_at = now()
              where id = ${job.id} and status = 'running'
                and lease_owner = ${this.workerId} returning id`,
      );

      await tx.insert(jobRuns).values({
        jobId: job.id,
        kind: job.kind,
        outcome,
        durationMs,
        detail: failure
          ? { counts, error: failure, attempt: job.attempts }
          : { counts, attempt: job.attempts },
      });

      if (outcome === "retry" && updated.rows.length > 0) {
        await tx.execute(sql`select pg_notify('beastypage_jobs', ${job.kind})`);
      }

      if (
        updated.rows.length > 0 &&
        outcome !== "retry" &&
        nextRunAt &&
        definition
      ) {
        await enqueueJob(tx, {
          kind: job.kind,
          dedupeKey: recurringDedupeKey(definition),
          payload: recurringPayload(definition),
          runAfter: nextRunAt,
        });
      }
    });
  }
}

export async function startJobWorker(
  options: JobWorkerOptions = {},
): Promise<JobWorker> {
  const worker = new Worker(options);
  await worker.start();
  return worker;
}
