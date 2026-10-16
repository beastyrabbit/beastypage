import "server-only";

import { sql } from "drizzle-orm";
import type { Database } from "../db/pool";

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export interface JobStatusReport {
  counts: Array<{ kind: string; status: string; count: number }>;
  deadJobs: Array<{
    id: string;
    kind: string;
    attempts: number;
    maxAttempts: number;
    lastError: string | null;
    updatedAt: Date;
  }>;
  recentRuns: Array<{
    id: number;
    jobId: string;
    kind: string;
    outcome: string;
    durationMs: number;
    detail: Record<string, unknown> | null;
    createdAt: Date;
  }>;
}

export async function getJobStatus(
  db: Database,
  options: { recentLimit?: number; deadLimit?: number } = {},
): Promise<JobStatusReport> {
  const recentLimit = Math.min(Math.max(options.recentLimit ?? 50, 1), 200);
  const deadLimit = Math.min(Math.max(options.deadLimit ?? 100, 1), 500);
  const [counts, deadJobs, recentRuns] = await Promise.all([
    db.execute<{
      kind: string;
      status: string;
      count: string;
    }>(sql`select kind, status, count(*)::text as count
            from jobs group by kind, status order by kind, status`),
    db.execute<{
      id: string;
      kind: string;
      attempts: number;
      max_attempts: number;
      last_error: string | null;
      updated_at: Date;
    }>(sql`select id, kind, attempts, max_attempts, last_error, updated_at
            from jobs where status = 'dead'
            order by updated_at desc limit ${deadLimit}`),
    db.execute<{
      id: string;
      job_id: string;
      kind: string;
      outcome: string;
      duration_ms: number;
      detail: Record<string, unknown> | null;
      created_at: Date;
    }>(sql`select id, job_id, kind, outcome, duration_ms, detail, created_at
            from job_runs order by created_at desc limit ${recentLimit}`),
  ]);

  return {
    counts: counts.rows.map((row) => ({
      kind: row.kind,
      status: row.status,
      count: Number(row.count),
    })),
    deadJobs: deadJobs.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      lastError: row.last_error,
      updatedAt: asDate(row.updated_at),
    })),
    recentRuns: recentRuns.rows.map((row) => ({
      id: Number(row.id),
      jobId: row.job_id,
      kind: row.kind,
      outcome: row.outcome,
      durationMs: row.duration_ms,
      detail: row.detail,
      createdAt: asDate(row.created_at),
    })),
  };
}
