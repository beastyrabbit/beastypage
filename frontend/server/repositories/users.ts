import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { users, userVariants } from "../db/schema";
import type { Transaction } from "../db/transaction";

export async function getUserByTokenIdentifier(
  tx: Transaction,
  tokenIdentifier: string,
) {
  const [row] = await tx
    .select()
    .from(users)
    .where(eq(users.tokenIdentifier, tokenIdentifier))
    .limit(1);
  return row ?? null;
}

export async function getUserByApiKey(tx: Transaction, apiKey: string) {
  const [row] = await tx
    .select()
    .from(users)
    .where(eq(users.apiKey, apiKey))
    .limit(1);
  return row ?? null;
}

export async function getUserByUsername(tx: Transaction, username: string) {
  const [row] = await tx
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);
  return row ?? null;
}

export async function listUserVariants(
  tx: Transaction,
  userId: string,
  toolKey?: string,
) {
  const conditions = [eq(userVariants.userId, userId)];
  if (toolKey) conditions.push(eq(userVariants.toolKey, toolKey));
  return tx
    .select()
    .from(userVariants)
    .where(and(...conditions))
    .orderBy(userVariants.toolKey, userVariants.createdAt);
}
