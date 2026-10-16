import "server-only";

import { sql } from "drizzle-orm";
import type { z } from "zod";
import { jobs } from "../db/schema";
import type { Transaction } from "../db/transaction";
import { getJobKind } from "./kinds";

export interface EnqueueJobInput {
  kind: string;
  dedupeKey?: string;
  payload: unknown;
  runAfter?: Date;
  maxAttempts?: number;
}

export interface EnqueueJobResult {
  inserted: boolean;
  id?: string;
}

export class InvalidJobPayloadError extends Error {
  constructor(
    readonly kind: string,
    readonly issues: z.ZodIssue[],
  ) {
    super(`Invalid payload for job kind ${kind}`);
    this.name = "InvalidJobPayloadError";
  }
}

export class UnknownJobKindError extends Error {
  constructor(readonly kind: string) {
    super(`Unknown job kind ${kind}`);
    this.name = "UnknownJobKindError";
  }
}

function asPayloadRecord(
  value: unknown,
  kind: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidJobPayloadError(kind, [
      {
        code: "custom",
        path: [],
        message: "Job payload must be a JSON object",
      },
    ]);
  }
  return value as Record<string, unknown>;
}

/** Enqueue from the caller's transaction. NOTIFY is committed atomically. */
export async function enqueueJob(
  tx: Transaction,
  input: EnqueueJobInput,
): Promise<EnqueueJobResult> {
  const definition = getJobKind(input.kind);
  if (!definition) throw new UnknownJobKindError(input.kind);

  const parsed = definition.payloadSchema.safeParse(input.payload);
  if (!parsed.success) {
    throw new InvalidJobPayloadError(input.kind, parsed.error.issues);
  }
  const payload = asPayloadRecord(parsed.data, input.kind);
  const maxAttempts = input.maxAttempts ?? definition.maxAttempts;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("maxAttempts must be a positive integer");
  }

  const [row] = await tx
    .insert(jobs)
    .values({
      kind: input.kind,
      dedupeKey: input.dedupeKey ?? null,
      payload,
      maxAttempts,
      runAfter: input.runAfter ?? new Date(),
    })
    .onConflictDoNothing({
      target: [jobs.kind, jobs.dedupeKey],
      where: sql`${jobs.status} in ('pending', 'running') and ${jobs.dedupeKey} is not null`,
    })
    .returning({ id: jobs.id });

  if (!row) return { inserted: false };

  await tx.execute(sql`select pg_notify('beastypage_jobs', ${input.kind})`);
  return { inserted: true, id: row.id };
}
