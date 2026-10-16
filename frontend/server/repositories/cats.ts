import "server-only";

import { and, desc, eq, lt, or } from "drizzle-orm";
import type { Database } from "../db/pool";
import { catImages, catProfile } from "../db/schema";
import { decodeCursor, encodeCursor } from "../pagination";
import { isUuid } from "./legacyLinks";

export type CatsTx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type CatsDb = Database | CatsTx;

export async function findProfile(db: CatsDb, slugOrId: string) {
  const [bySlug] = await db
    .select()
    .from(catProfile)
    .where(eq(catProfile.slug, slugOrId))
    .limit(1);
  if (bySlug) return bySlug;
  const [byLegacy] = await db
    .select()
    .from(catProfile)
    .where(eq(catProfile.legacyId, slugOrId))
    .limit(1);
  if (byLegacy) return byLegacy;
  if (!isUuid(slugOrId)) return null;
  return findProfileById(db, slugOrId);
}

export async function findProfileById(db: CatsDb, id: string) {
  const [row] = await db
    .select()
    .from(catProfile)
    .where(eq(catProfile.id, id))
    .limit(1);
  return row ?? null;
}

export async function findUniqueProfileSlug(tx: CatsTx, slug: string) {
  const [row] = await tx
    .select({ id: catProfile.id })
    .from(catProfile)
    .where(eq(catProfile.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function insertProfile(
  tx: CatsTx,
  values: typeof catProfile.$inferInsert,
) {
  const [row] = await tx.insert(catProfile).values(values).returning();
  return row ?? null;
}

export async function lockProfile(tx: CatsTx, id: string) {
  const [row] = await tx
    .select()
    .from(catProfile)
    .where(eq(catProfile.id, id))
    .for("update")
    .limit(1);
  return row ?? null;
}

export async function updateProfile(
  tx: CatsTx,
  id: string,
  values: Partial<typeof catProfile.$inferInsert>,
) {
  await tx.update(catProfile).set(values).where(eq(catProfile.id, id));
  const [row] = await tx
    .select()
    .from(catProfile)
    .where(eq(catProfile.id, id))
    .limit(1);
  return row ?? null;
}

export async function listProfileRows(db: CatsDb, limit: number) {
  return db
    .select()
    .from(catProfile)
    .orderBy(desc(catProfile.createdAt))
    .limit(limit);
}

export async function listProfilePageRows(
  db: CatsDb,
  args: { limit: number; cursor?: string | null },
) {
  const cursor = decodeCursor(args.cursor);
  const where = cursor
    ? or(
        lt(catProfile.createdAt, new Date(cursor.createdAt)),
        and(
          eq(catProfile.createdAt, new Date(cursor.createdAt)),
          lt(catProfile.id, cursor.id),
        ),
      )
    : undefined;
  const rows = await db
    .select()
    .from(catProfile)
    .where(where)
    .orderBy(desc(catProfile.createdAt), desc(catProfile.id))
    .limit(args.limit + 1);
  return {
    rows,
    nextCursor:
      rows.length > args.limit ? encodeCursor(rows[args.limit - 1]) : null,
  };
}

export async function listPreviewRows(db: CatsDb) {
  return db
    .select({
      id: catProfile.id,
      catData: catProfile.catData,
      previewsUpdatedAt: catProfile.previewsUpdatedAt,
      createdAt: catProfile.createdAt,
    })
    .from(catProfile)
    .orderBy(desc(catProfile.createdAt))
    .limit(1000);
}

export async function listImageRows(db: CatsDb, profileId: string) {
  return db
    .select({
      id: catImages.id,
      kind: catImages.kind,
      fileId: catImages.fileId,
      filename: catImages.filename,
      meta: catImages.meta,
    })
    .from(catImages)
    .where(eq(catImages.catProfileId, profileId));
}

export async function findImage(
  tx: CatsTx,
  profileId: string,
  kind: "tiny" | "preview" | "full" | "spriteSheet",
) {
  const [row] = await tx
    .select({ id: catImages.id })
    .from(catImages)
    .where(and(eq(catImages.catProfileId, profileId), eq(catImages.kind, kind)))
    .limit(1);
  return row ?? null;
}

export async function insertImage(
  tx: CatsTx,
  values: typeof catImages.$inferInsert,
) {
  await tx.insert(catImages).values(values);
}

export async function updateImage(
  tx: CatsTx,
  id: string,
  values: Partial<typeof catImages.$inferInsert>,
) {
  await tx.update(catImages).set(values).where(eq(catImages.id, id));
}

export async function updatePreviewTimestamp(
  tx: CatsTx,
  id: string,
  previewsUpdatedAt: Date,
) {
  await tx
    .update(catProfile)
    .set({ previewsUpdatedAt, updatedAt: new Date() })
    .where(eq(catProfile.id, id));
}
