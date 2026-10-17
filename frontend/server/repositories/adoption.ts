import "server-only";

import { desc, eq } from "drizzle-orm";
import type { Database } from "../db/pool";
import { adoptionBatch, adoptionBatchCats, catProfile } from "../db/schema";
import {
  createdAtOrderBefore,
  creationTimestamp,
  decodeCursor,
  encodeCursor,
  rowCreationTimestamp,
} from "../pagination";
import { isUuid } from "./legacyLinks";

export type AdoptionTx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type AdoptionDb = Database;

export async function findBatch(db: AdoptionDb, slugOrId: string) {
  const [bySlug] = await db
    .select()
    .from(adoptionBatch)
    .where(eq(adoptionBatch.slug, slugOrId))
    .limit(1);
  if (bySlug) return bySlug;
  const [byLegacy] = await db
    .select()
    .from(adoptionBatch)
    .where(eq(adoptionBatch.legacyId, slugOrId))
    .limit(1);
  if (byLegacy) return byLegacy;
  if (!isUuid(slugOrId)) return null;
  const [byId] = await db
    .select()
    .from(adoptionBatch)
    .where(eq(adoptionBatch.id, slugOrId))
    .limit(1);
  return byId ?? null;
}

export async function findUniqueSlug(tx: AdoptionTx, slug: string) {
  const [row] = await tx
    .select({ id: adoptionBatch.id })
    .from(adoptionBatch)
    .where(eq(adoptionBatch.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function listBatches(db: AdoptionDb, limit: number) {
  return db
    .select()
    .from(adoptionBatch)
    .orderBy(
      desc(adoptionBatch.createdAt),
      desc(creationTimestamp(adoptionBatch)),
      desc(adoptionBatch.id),
    )
    .limit(limit);
}

export async function listBatchPageRows(
  db: AdoptionDb,
  args: { limit: number; cursor?: string | null },
) {
  const cursor = decodeCursor(args.cursor);
  const where = cursor
    ? createdAtOrderBefore(adoptionBatch, cursor)
    : undefined;
  const rows = await db
    .select()
    .from(adoptionBatch)
    .where(where)
    .orderBy(
      desc(adoptionBatch.createdAt),
      desc(creationTimestamp(adoptionBatch)),
      desc(adoptionBatch.id),
    )
    .limit(args.limit + 1);
  return {
    rows,
    nextCursor:
      rows.length > args.limit
        ? encodeCursor({
            createdAt: rows[args.limit - 1].createdAt,
            creationAt: rowCreationTimestamp(rows[args.limit - 1]),
            id: rows[args.limit - 1].id,
          })
        : null,
  };
}

export async function listBatchCats(db: AdoptionDb, batchId: string) {
  return db
    .select()
    .from(adoptionBatchCats)
    .where(eq(adoptionBatchCats.batchId, batchId))
    .orderBy(adoptionBatchCats.position);
}

export async function findProfileForCat(db: AdoptionDb, id: string) {
  const [row] = await db
    .select()
    .from(catProfile)
    .where(eq(catProfile.id, id))
    .limit(1);
  return row ?? null;
}

export async function lockBatch(tx: AdoptionTx, id: string) {
  const [row] = await tx
    .select()
    .from(adoptionBatch)
    .where(eq(adoptionBatch.id, id))
    .for("update")
    .limit(1);
  return row ?? null;
}

export async function insertBatch(
  tx: AdoptionTx,
  values: typeof adoptionBatch.$inferInsert,
) {
  const [row] = await tx.insert(adoptionBatch).values(values).returning();
  return row ?? null;
}

export async function insertBatchCats(
  tx: AdoptionTx,
  values: (typeof adoptionBatchCats.$inferInsert)[],
) {
  if (values.length) await tx.insert(adoptionBatchCats).values(values);
}

export async function updateProfileBatch(
  tx: AdoptionTx,
  profileId: string,
  batchId: string,
  updatedAt: Date,
) {
  await tx
    .update(catProfile)
    .set({ adoptionBatchId: batchId, updatedAt })
    .where(eq(catProfile.id, profileId));
}

export async function updateBatch(
  tx: AdoptionTx,
  id: string,
  values: Partial<typeof adoptionBatch.$inferInsert>,
) {
  await tx.update(adoptionBatch).set(values).where(eq(adoptionBatch.id, id));
  const [row] = await tx
    .select()
    .from(adoptionBatch)
    .where(eq(adoptionBatch.id, id))
    .limit(1);
  return row ?? null;
}
