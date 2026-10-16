import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../db/pool";
import { streamParticipants, streamSessions, streamVotes } from "../db/schema";
import type { Transaction } from "../db/transaction";

type Db = Database | Transaction;

export async function selectStreamSession(db: Db, id: string) {
  const [row] = await db
    .select()
    .from(streamSessions)
    .where(eq(streamSessions.id, id))
    .limit(1);
  return row ?? null;
}

export async function selectStreamSessionForUpdate(
  tx: Transaction,
  id: string,
) {
  const [row] = await tx
    .select()
    .from(streamSessions)
    .where(eq(streamSessions.id, id))
    .for("update")
    .limit(1);
  return row ?? null;
}

export async function selectStreamSessionByLegacy(db: Db, id: string) {
  const [row] = await db
    .select()
    .from(streamSessions)
    .where(eq(streamSessions.legacyId, id))
    .limit(1);
  return row ?? null;
}

export async function selectStreamSessionByViewerKey(
  db: Db,
  viewerKey: string,
) {
  const [row] = await db
    .select()
    .from(streamSessions)
    .where(eq(streamSessions.viewerKey, viewerKey))
    .limit(1);
  return row ?? null;
}

export async function selectStreamSessionByViewerKeyForUpdate(
  tx: Transaction,
  viewerKey: string,
) {
  const [row] = await tx
    .select()
    .from(streamSessions)
    .where(eq(streamSessions.viewerKey, viewerKey))
    .for("update")
    .limit(1);
  return row ?? null;
}

export async function selectOwnedStreamSessions(
  db: Db,
  ownerTokenIdentifier: string,
  status?: string,
) {
  const where = status
    ? and(
        eq(streamSessions.ownerTokenIdentifier, ownerTokenIdentifier),
        eq(streamSessions.status, status),
      )
    : eq(streamSessions.ownerTokenIdentifier, ownerTokenIdentifier);
  return db
    .select()
    .from(streamSessions)
    .where(where)
    .orderBy(desc(streamSessions.updatedAt), desc(streamSessions.id))
    .limit(500);
}

export async function insertStreamSession(
  tx: Transaction,
  values: typeof streamSessions.$inferInsert,
) {
  const [row] = await tx
    .insert(streamSessions)
    .values(values)
    .onConflictDoNothing({ target: streamSessions.viewerKey })
    .returning();
  return row;
}

export async function updateStreamSession(
  tx: Transaction,
  id: string,
  values: Partial<typeof streamSessions.$inferInsert>,
) {
  const [row] = await tx
    .update(streamSessions)
    .set({ ...values, updatedAt: sql`now()` })
    .where(eq(streamSessions.id, id))
    .returning();
  return row ?? null;
}

export async function bumpStreamRevision(tx: Transaction, id: string) {
  const [row] = await tx
    .update(streamSessions)
    .set({
      revision: sql`${streamSessions.revision} + 1`,
      updatedAt: sql`now()`,
    })
    .where(eq(streamSessions.id, id))
    .returning({ revision: streamSessions.revision });
  return row?.revision ?? 0;
}

export async function selectParticipants(
  db: Db,
  sessionId: string,
  viewerSession?: string,
  limit = 500,
) {
  const where = viewerSession
    ? and(
        eq(streamParticipants.sessionId, sessionId),
        eq(streamParticipants.viewerSession, viewerSession),
      )
    : eq(streamParticipants.sessionId, sessionId);
  return db
    .select()
    .from(streamParticipants)
    .where(where)
    .orderBy(asc(streamParticipants.createdAt), asc(streamParticipants.id))
    .limit(Math.max(1, Math.min(500, Math.floor(limit))));
}

export async function selectParticipantByViewerSession(
  db: Db,
  sessionId: string,
  viewerSession: string,
) {
  const [row] = await db
    .select()
    .from(streamParticipants)
    .where(
      and(
        eq(streamParticipants.sessionId, sessionId),
        eq(streamParticipants.viewerSession, viewerSession),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function selectParticipant(db: Db, id: string) {
  const [row] = await db
    .select()
    .from(streamParticipants)
    .where(eq(streamParticipants.id, id))
    .limit(1);
  return row ?? null;
}

export async function countParticipants(db: Db, sessionId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(streamParticipants)
    .where(eq(streamParticipants.sessionId, sessionId));
  return Number(row?.count ?? 0);
}

export async function selectParticipantByFingerprint(
  db: Db,
  sessionId: string,
  fingerprint: string,
) {
  const [row] = await db
    .select()
    .from(streamParticipants)
    .where(
      and(
        eq(streamParticipants.sessionId, sessionId),
        eq(streamParticipants.fingerprint, fingerprint),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function insertParticipant(
  tx: Transaction,
  values: typeof streamParticipants.$inferInsert,
) {
  const [row] = await tx.insert(streamParticipants).values(values).returning();
  return row;
}

export async function updateParticipant(
  tx: Transaction,
  id: string,
  values: Partial<typeof streamParticipants.$inferInsert>,
) {
  const [row] = await tx
    .update(streamParticipants)
    .set({ ...values, updatedAt: sql`now()` })
    .where(eq(streamParticipants.id, id))
    .returning();
  return row ?? null;
}

export async function selectVotes(
  db: Db,
  sessionId: string,
  round: number,
  stepId?: string,
  limit = 500,
) {
  const where = stepId
    ? and(
        eq(streamVotes.sessionId, sessionId),
        eq(streamVotes.voteRound, round),
        eq(streamVotes.stepId, stepId),
      )
    : and(
        eq(streamVotes.sessionId, sessionId),
        eq(streamVotes.voteRound, round),
      );
  return db
    .select()
    .from(streamVotes)
    .where(where)
    .orderBy(asc(streamVotes.createdAt), asc(streamVotes.id))
    .limit(Math.max(1, Math.min(500, Math.floor(limit))));
}

export async function selectVoteByParticipant(
  db: Db,
  sessionId: string,
  round: number,
  participantId: string,
) {
  const [row] = await db
    .select()
    .from(streamVotes)
    .where(
      and(
        eq(streamVotes.sessionId, sessionId),
        eq(streamVotes.voteRound, round),
        eq(streamVotes.votedBy, participantId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function insertVote(
  tx: Transaction,
  values: typeof streamVotes.$inferInsert,
) {
  const [row] = await tx.insert(streamVotes).values(values).returning();
  return row;
}
