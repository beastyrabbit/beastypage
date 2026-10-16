import "server-only";

import { eq } from "drizzle-orm";
import type { Database } from "../db/pool";
import { catShares } from "../db/schema";

export type CatSharesTx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type CatSharesDb = Database | CatSharesTx;

export async function findShare(db: CatSharesDb, slug: string) {
  const [row] = await db
    .select()
    .from(catShares)
    .where(eq(catShares.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function findUniqueSlug(tx: CatSharesTx, slug: string) {
  const [row] = await tx
    .select({ id: catShares.id })
    .from(catShares)
    .where(eq(catShares.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function insertShare(
  tx: CatSharesTx,
  values: typeof catShares.$inferInsert,
) {
  const [row] = await tx.insert(catShares).values(values).returning();
  return row ?? null;
}

export async function updateShare(
  tx: CatSharesTx,
  id: string,
  values: Partial<typeof catShares.$inferInsert>,
) {
  await tx.update(catShares).set(values).where(eq(catShares.id, id));
  const [row] = await tx
    .select()
    .from(catShares)
    .where(eq(catShares.id, id))
    .limit(1);
  return row ?? null;
}
