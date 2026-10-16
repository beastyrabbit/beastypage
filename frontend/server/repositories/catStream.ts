import "server-only";

import { eq, sql } from "drizzle-orm";
import type { Database } from "../db/pool";
import { catStreamSessions, wheelSpins } from "../db/schema";
import type { Transaction } from "../db/transaction";

type Db = Database | Transaction;

export async function selectCatStreamSession(db: Db, id: string) {
  const [row] = await db
    .select()
    .from(catStreamSessions)
    .where(eq(catStreamSessions.id, id))
    .limit(1);
  return row ?? null;
}

export async function selectCatStreamSessionByUser(db: Db, userId: string) {
  const [row] = await db
    .select()
    .from(catStreamSessions)
    .where(eq(catStreamSessions.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function selectCatStreamSessionByUserForUpdate(
  tx: Transaction,
  userId: string,
) {
  const [row] = await tx
    .select()
    .from(catStreamSessions)
    .where(eq(catStreamSessions.userId, userId))
    .for("update")
    .limit(1);
  return row ?? null;
}

export async function selectCatStreamSessionForUpdate(
  tx: Transaction,
  id: string,
) {
  const [row] = await tx
    .select()
    .from(catStreamSessions)
    .where(eq(catStreamSessions.id, id))
    .for("update")
    .limit(1);
  return row ?? null;
}

export async function insertCatStreamSession(
  tx: Transaction,
  values: typeof catStreamSessions.$inferInsert,
) {
  const [row] = await tx
    .insert(catStreamSessions)
    .values(values)
    .onConflictDoNothing({ target: catStreamSessions.userId })
    .returning();
  return row;
}

export async function updateCatStreamSession(
  tx: Transaction,
  id: string,
  values: Partial<typeof catStreamSessions.$inferInsert>,
) {
  const [row] = await tx
    .update(catStreamSessions)
    .set({ ...values, updatedAt: sql`now()` })
    .where(eq(catStreamSessions.id, id))
    .returning();
  return row ?? null;
}

export async function bumpCatStreamRevision(tx: Transaction, id: string) {
  const [row] = await tx
    .update(catStreamSessions)
    .set({
      revision: sql`${catStreamSessions.revision} + 1`,
      updatedAt: sql`now()`,
    })
    .where(eq(catStreamSessions.id, id))
    .returning({ revision: catStreamSessions.revision });
  return row?.revision ?? 0;
}

export async function insertWheelSpin(
  tx: Transaction,
  values: typeof wheelSpins.$inferInsert,
) {
  const [row] = await tx.insert(wheelSpins).values(values).returning();
  return row;
}
