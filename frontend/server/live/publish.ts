import "server-only";

import { lt, sql } from "drizzle-orm";
import { liveEvents } from "@/server/db/schema/system";
import type { Database } from "@/server/db/pool";
import type { Transaction } from "@/server/db/transaction";

export const LIVE_CHANNEL = "beastypage_live";
export const LIVE_EVENT_RETENTION_MS = 60 * 60 * 1000;

function validateTopic(topic: string): void {
  if (typeof topic !== "string" || topic.length === 0 || topic.length > 512) {
    throw new Error(
      "Live topic must be a non-empty string of at most 512 characters",
    );
  }
}

function validateRevision(revision: number): void {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error("Live revision must be a non-negative safe integer");
  }
}

/**
 * Appends a durable live event and wakes listeners in the same transaction.
 * PostgreSQL delivers the NOTIFY only after the surrounding transaction commits.
 */
export async function publishLive(
  tx: Transaction,
  topic: string,
  revision: number,
): Promise<number> {
  validateTopic(topic);
  validateRevision(revision);

  const [event] = await tx
    .insert(liveEvents)
    .values({ topic, revision })
    .returning({ id: liveEvents.id });
  await tx.execute(sql`select pg_notify(${LIVE_CHANNEL}, ${topic})`);
  return event.id;
}

/** Deletes events older than the caller's retention cutoff. */
export async function pruneLiveEvents(
  db: Database | Transaction,
  olderThan: Date,
): Promise<number> {
  const result = await db
    .delete(liveEvents)
    .where(lt(liveEvents.createdAt, olderThan));
  return result.rowCount ?? 0;
}

/** The default cutoff used by the recurring jobs layer. */
export function liveEventRetentionCutoff(now = new Date()): Date {
  return new Date(now.getTime() - LIVE_EVENT_RETENTION_MS);
}
