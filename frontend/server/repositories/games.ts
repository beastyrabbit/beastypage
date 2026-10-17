import "server-only";

import { and, asc, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { Database } from "../db/pool";
import {
  coinflipperScores,
  perfectCats,
  perfectMatchups,
  perfectVotes,
  wheelSpins,
} from "../db/schema";
import type { Transaction } from "../db/transaction";
import { creationTimestamp } from "../pagination";

export type GamesDb = Database | Transaction;

export function selectCatByIdOrLegacy(db: GamesDb, id: string) {
  return db
    .select()
    .from(perfectCats)
    .where(
      /^[0-9a-f-]{36}$/i.test(id)
        ? eq(perfectCats.id, id)
        : eq(perfectCats.legacyId, id),
    )
    .limit(1);
}

export async function selectPerfectCat(db: GamesDb, id: string) {
  const [row] = await selectCatByIdOrLegacy(db, id);
  return row ?? null;
}

export async function selectPerfectCatByHash(db: GamesDb, hash: string) {
  const [row] = await db
    .select()
    .from(perfectCats)
    .where(eq(perfectCats.hash, hash))
    .limit(1);
  return row ?? null;
}

export async function insertPerfectCat(
  tx: Transaction,
  values: typeof perfectCats.$inferInsert,
) {
  const [row] = await tx
    .insert(perfectCats)
    .values(values)
    .onConflictDoNothing({ target: perfectCats.hash })
    .returning();
  return row;
}

export async function selectPerfectPool(db: GamesDb) {
  const all = await db
    .select()
    .from(perfectCats)
    .orderBy(asc(creationTimestamp(perfectCats)), asc(perfectCats.id))
    .limit(257);
  const top = await db
    .select()
    .from(perfectCats)
    .orderBy(
      desc(perfectCats.rating),
      desc(creationTimestamp(perfectCats)),
      desc(perfectCats.id),
    )
    .limit(24);
  const recent = await db
    .select()
    .from(perfectCats)
    .orderBy(
      desc(perfectCats.updatedAt),
      desc(creationTimestamp(perfectCats)),
      desc(perfectCats.id),
    )
    .limit(24);
  return { all, top, recent };
}

export async function selectRecentVotes(db: GamesDb, clientId: string) {
  return db
    .select()
    .from(perfectVotes)
    .where(eq(perfectVotes.clientId, clientId))
    .orderBy(desc(creationTimestamp(perfectVotes)), desc(perfectVotes.id))
    .limit(40);
}

export async function lockMatchupForClient(tx: Transaction, clientId: string) {
  const [row] = await tx
    .select()
    .from(perfectMatchups)
    .where(eq(perfectMatchups.clientId, clientId))
    .orderBy(asc(creationTimestamp(perfectMatchups)), asc(perfectMatchups.id))
    .for("update")
    .limit(1);
  return row ?? null;
}

export async function countActiveMatchups(tx: Transaction, now: Date) {
  const [row] = await tx
    .select({ count: sql<number>`count(*)` })
    .from(perfectMatchups)
    .where(
      and(
        eq(perfectMatchups.consumed, false),
        gt(perfectMatchups.expiresAt, now),
      ),
    );
  return Number(row?.count ?? 0);
}

export async function insertMatchup(
  tx: Transaction,
  values: typeof perfectMatchups.$inferInsert,
) {
  const [row] = await tx.insert(perfectMatchups).values(values).returning();
  return row;
}

export async function replaceMatchup(
  tx: Transaction,
  id: string,
  values: Partial<typeof perfectMatchups.$inferInsert>,
) {
  const [row] = await tx
    .update(perfectMatchups)
    .set(values)
    .where(eq(perfectMatchups.id, id))
    .returning();
  return row ?? null;
}

export async function lockMatchup(tx: Transaction, id: string) {
  const [row] = await tx
    .select()
    .from(perfectMatchups)
    .where(eq(perfectMatchups.id, id))
    .for("update")
    .limit(1);
  return row ?? null;
}

export async function lockPerfectCat(tx: Transaction, id: string) {
  const [row] = await tx
    .select()
    .from(perfectCats)
    .where(
      /^[0-9a-f-]{36}$/i.test(id)
        ? eq(perfectCats.id, id)
        : eq(perfectCats.legacyId, id),
    )
    .for("update")
    .limit(1);
  return row ?? null;
}

export async function deleteMatchup(tx: Transaction, id: string) {
  await tx.delete(perfectMatchups).where(eq(perfectMatchups.id, id));
}

export async function insertVote(
  tx: Transaction,
  values: typeof perfectVotes.$inferInsert,
) {
  const [row] = await tx.insert(perfectVotes).values(values).returning();
  return row;
}

export async function listPerfectLeaderboard(db: GamesDb, limit: number) {
  return db
    .select()
    .from(perfectCats)
    .orderBy(
      desc(perfectCats.rating),
      desc(perfectCats.createdAt),
      desc(perfectCats.id),
    )
    .limit(limit);
}

export async function selectExpiredMatchups(db: GamesDb, limit: number) {
  return db
    .select({ id: perfectMatchups.id })
    .from(perfectMatchups)
    .where(lte(perfectMatchups.expiresAt, new Date()))
    .orderBy(perfectMatchups.expiresAt, perfectMatchups.id)
    .limit(limit);
}

export async function deleteExpiredMatchups(tx: Transaction, ids: string[]) {
  if (ids.length)
    await tx.delete(perfectMatchups).where(inArray(perfectMatchups.id, ids));
}

export async function listScores(db: GamesDb, limit: number) {
  return db
    .select()
    .from(coinflipperScores)
    .orderBy(
      desc(coinflipperScores.score),
      desc(creationTimestamp(coinflipperScores)),
      desc(coinflipperScores.id),
    )
    .limit(limit);
}

export async function insertScore(
  tx: Transaction,
  values: typeof coinflipperScores.$inferInsert,
) {
  const [row] = await tx.insert(coinflipperScores).values(values).returning();
  return row;
}

export async function countRecentSpins(
  tx: Transaction,
  actorKey: string,
  since: Date,
) {
  const [row] = await tx
    .select({ count: sql<number>`count(*)` })
    .from(wheelSpins)
    .where(
      and(eq(wheelSpins.actorKey, actorKey), gt(wheelSpins.createdAt, since)),
    );
  return Number(row?.count ?? 0);
}

export async function lockSpinActor(tx: Transaction, actorKey: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${actorKey}))`);
}

export async function insertSpin(
  tx: Transaction,
  values: typeof wheelSpins.$inferInsert,
) {
  const [row] = await tx.insert(wheelSpins).values(values).returning();
  return row;
}

export async function listSpins(db: GamesDb, limit: number) {
  return db
    .select()
    .from(wheelSpins)
    .orderBy(desc(creationTimestamp(wheelSpins)), desc(wheelSpins.id))
    .limit(limit + 1);
}
