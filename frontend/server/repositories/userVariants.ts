import "server-only";

import { and, eq, sql } from "drizzle-orm";
import type { UserVariantSettings } from "../db/contracts";
import { userVariants } from "../db/schema";
import type { Transaction } from "../db/transaction";

export type UserVariantRow = typeof userVariants.$inferSelect;

export async function listByUser(
  tx: Transaction,
  userId: string,
  toolKey?: string,
) {
  const conditions = [eq(userVariants.userId, userId)];
  if (toolKey) conditions.push(eq(userVariants.toolKey, toolKey));
  return tx
    .select()
    .from(userVariants)
    .where(and(...conditions));
}

export async function findByVariantId(
  tx: Transaction,
  userId: string,
  toolKey: string,
  variantId: string,
) {
  const [row] = await tx
    .select()
    .from(userVariants)
    .where(
      and(
        eq(userVariants.userId, userId),
        eq(userVariants.toolKey, toolKey),
        eq(userVariants.variantId, variantId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function countByTool(
  tx: Transaction,
  userId: string,
  toolKey: string,
) {
  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(userVariants)
    .where(
      and(eq(userVariants.userId, userId), eq(userVariants.toolKey, toolKey)),
    );
  return count;
}

export async function deactivateByTool(
  tx: Transaction,
  userId: string,
  toolKey: string,
) {
  await tx
    .update(userVariants)
    .set({ isActive: false })
    .where(
      and(eq(userVariants.userId, userId), eq(userVariants.toolKey, toolKey)),
    );
}

export async function updateVariant(
  tx: Transaction,
  id: string,
  values: {
    name?: string;
    settings?: UserVariantSettings;
    isActive?: boolean;
    slug?: string;
  },
) {
  const [updated] = await tx
    .update(userVariants)
    .set({ ...values, updatedAt: sql`now()` })
    .where(eq(userVariants.id, id))
    .returning();
  return updated ?? null;
}

export async function insertVariant(
  tx: Transaction,
  values: typeof userVariants.$inferInsert,
) {
  const [created] = await tx.insert(userVariants).values(values).returning();
  return created ?? null;
}

export async function deleteVariant(tx: Transaction, id: string) {
  await tx.delete(userVariants).where(eq(userVariants.id, id));
}

export async function deleteFirstByUser(
  tx: Transaction,
  userId: string,
  limit: number,
) {
  const rows = await tx
    .select({ id: userVariants.id })
    .from(userVariants)
    .where(eq(userVariants.userId, userId))
    .limit(limit);
  if (rows.length > 0) {
    await tx.delete(userVariants).where(
      sql`${userVariants.id} in (${sql.join(
        rows.map((row) => sql`${row.id}`),
        sql`, `,
      )})`,
    );
  }
  return rows.length;
}

export async function deleteByUserToolVariant(
  tx: Transaction,
  userId: string,
  toolKey: string,
  variantId: string,
) {
  const row = await findByVariantId(tx, userId, toolKey, variantId);
  if (row) await deleteVariant(tx, row.id);
  return row;
}
