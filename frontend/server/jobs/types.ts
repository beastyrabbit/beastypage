import "server-only";

import type { z } from "zod";
import type { Database } from "../db/pool";

export type JobCounts = Record<string, number>;

export interface JobHandlerContext {
  db: Database;
  jobId: string;
  kind: string;
  attempt: number;
  signal: AbortSignal;
}

export interface JobKindDefinition<TPayload = unknown> {
  kind: string;
  payloadSchema: z.ZodType<TPayload>;
  handler: (
    payload: TPayload,
    context: JobHandlerContext,
  ) => Promise<JobCounts>;
  maxAttempts: number;
  leaseMs: number;
  recurringIntervalMs?: number;
  recurringDedupeKey?: string;
  recurringPayload?: TPayload;
}

/** Type-erased view used by the worker after the payload schema has run. */
export type AnyJobKind = JobKindDefinition<unknown>;
