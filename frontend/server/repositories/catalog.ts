import "server-only";

import { and, asc, desc, eq, lt, or, sql } from "drizzle-orm";
import type { Database } from "../db/pool";
import {
  cardSeason,
  catdex,
  catdexUploads,
  collection,
  rarity,
} from "../db/schema";
import type { Transaction } from "../db/transaction";
import type { PageCursor } from "../pagination";

export { selectCatdexByOwner } from "./catalog-owner";

type Db = Database | Transaction;

export async function selectSeasons(db: Db) {
  return db
    .select()
    .from(cardSeason)
    .orderBy(desc(cardSeason.createdAt), desc(cardSeason.id))
    .limit(200);
}

export async function countSeasons(db: Db) {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(cardSeason);
  return Number(row?.count ?? 0);
}

export async function selectRarities(db: Db) {
  return db
    .select()
    .from(rarity)
    .orderBy(asc(rarity.stars), asc(rarity.id))
    .limit(200);
}

export async function countRarities(db: Db) {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(rarity);
  return Number(row?.count ?? 0);
}

export async function selectCatdexPage(
  db: Db,
  options: { cursor?: PageCursor | null; pageSize: number; approved: boolean },
) {
  const cursorWhere = options.cursor
    ? or(
        lt(catdex.createdAt, new Date(options.cursor.createdAt)),
        and(
          eq(catdex.createdAt, new Date(options.cursor.createdAt)),
          lt(catdex.id, options.cursor.id),
        ),
      )
    : undefined;
  const where = cursorWhere
    ? and(eq(catdex.approved, options.approved), cursorWhere)
    : eq(catdex.approved, options.approved);
  return db
    .select({
      cat: catdex,
      season: cardSeason,
      rarity,
    })
    .from(catdex)
    .leftJoin(cardSeason, eq(catdex.seasonId, cardSeason.id))
    .leftJoin(rarity, eq(catdex.rarityId, rarity.id))
    .where(where)
    .orderBy(desc(catdex.createdAt), desc(catdex.id))
    .limit(options.pageSize + 1);
}

export async function selectCatdexById(db: Db, id: string) {
  const [row] = await db
    .select({ cat: catdex, season: cardSeason, rarity })
    .from(catdex)
    .leftJoin(cardSeason, eq(catdex.seasonId, cardSeason.id))
    .leftJoin(rarity, eq(catdex.rarityId, rarity.id))
    .where(eq(catdex.id, id))
    .limit(1);
  return row ?? null;
}

export async function selectCatdexByLegacyId(db: Db, id: string) {
  const [row] = await db
    .select({ cat: catdex, season: cardSeason, rarity })
    .from(catdex)
    .leftJoin(cardSeason, eq(catdex.seasonId, cardSeason.id))
    .leftJoin(rarity, eq(catdex.rarityId, rarity.id))
    .where(eq(catdex.legacyId, id))
    .limit(1);
  return row ?? null;
}

export async function countPendingCatdex(db: Db) {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(catdex)
    .where(eq(catdex.approved, false));
  return Number(row?.count ?? 0);
}

export async function insertCatdex(
  tx: Transaction,
  values: typeof catdex.$inferInsert,
) {
  const [row] = await tx.insert(catdex).values(values).returning();
  return row;
}

export async function updateCatdex(
  tx: Transaction,
  id: string,
  values: Partial<typeof catdex.$inferInsert>,
) {
  const [row] = await tx
    .update(catdex)
    .set(values)
    .where(eq(catdex.id, id))
    .returning();
  return row ?? null;
}

export async function lockUploadByToken(tx: Transaction, token: string) {
  const [row] = await tx
    .select()
    .from(catdexUploads)
    .where(eq(catdexUploads.token, token))
    .for("update")
    .limit(1);
  return row ?? null;
}

export async function lockUploadByFileId(tx: Transaction, fileId: string) {
  const [row] = await tx
    .select()
    .from(catdexUploads)
    .where(eq(catdexUploads.fileId, fileId))
    .for("update")
    .limit(1);
  return row ?? null;
}

export async function countRecentUploads(
  db: Db,
  rateKey: string | null,
  since: Date,
) {
  const where = rateKey
    ? and(
        eq(catdexUploads.rateKey, rateKey),
        sql`${catdexUploads.createdAt} > ${since}`,
      )
    : and(
        sql`${catdexUploads.rateKey} is null`,
        sql`${catdexUploads.createdAt} > ${since}`,
      );
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(catdexUploads)
    .where(where);
  return Number(row?.count ?? 0);
}

export async function countAllRecentUploads(db: Db, since: Date) {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(catdexUploads)
    .where(sql`${catdexUploads.createdAt} > ${since}`);
  return Number(row?.count ?? 0);
}

export async function insertUploadReservation(
  tx: Transaction,
  values: typeof catdexUploads.$inferInsert,
) {
  const [row] = await tx.insert(catdexUploads).values(values).returning();
  return row;
}

export async function attachUploadRow(
  tx: Transaction,
  id: string,
  fileId: string,
) {
  const [row] = await tx
    .update(catdexUploads)
    .set({ fileId, status: "attached", updatedAt: new Date() })
    .where(eq(catdexUploads.id, id))
    .returning();
  return row ?? null;
}

export async function consumeUploadRow(tx: Transaction, id: string) {
  const [row] = await tx
    .update(catdexUploads)
    .set({ status: "consumed", updatedAt: new Date() })
    .where(eq(catdexUploads.id, id))
    .returning();
  return row ?? null;
}

export async function selectExpiredUploads(db: Db, limit: number) {
  return db
    .select()
    .from(catdexUploads)
    .where(lt(catdexUploads.expiresAt, new Date()))
    .orderBy(asc(catdexUploads.expiresAt), asc(catdexUploads.id))
    .limit(limit);
}

export async function deleteUpload(tx: Transaction, id: string) {
  await tx.delete(catdexUploads).where(eq(catdexUploads.id, id));
}

export async function selectCollectionPage(
  db: Db,
  options: { cursor?: PageCursor | null; pageSize: number },
) {
  const cursorWhere = options.cursor
    ? or(
        lt(collection.createdAt, new Date(options.cursor.createdAt)),
        and(
          eq(collection.createdAt, new Date(options.cursor.createdAt)),
          lt(collection.id, options.cursor.id),
        ),
      )
    : undefined;
  return db
    .select()
    .from(collection)
    .where(cursorWhere)
    .orderBy(desc(collection.createdAt), desc(collection.id))
    .limit(options.pageSize + 1);
}

export async function selectCollectionById(db: Db, id: string) {
  const [row] = await db
    .select()
    .from(collection)
    .where(eq(collection.id, id))
    .limit(1);
  return row ?? null;
}

export async function updateCollectionFocus(
  tx: Transaction,
  id: string,
  focusX: number,
  focusY: number,
) {
  const [row] = await tx
    .update(collection)
    .set({ focusX, focusY, updatedAt: new Date() })
    .where(eq(collection.id, id))
    .returning({ focusX: collection.focusX, focusY: collection.focusY });
  return row ?? null;
}
