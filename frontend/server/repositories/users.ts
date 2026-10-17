import "server-only";

import { asc, eq, sql } from "drizzle-orm";
import { users } from "../db/schema";
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
    .where(eq(users.username, username))
    .limit(1);
  return row ?? null;
}

export async function createUser(
  tx: Transaction,
  values: { tokenIdentifier: string; apiKey: string; username?: string },
) {
  const [created] = await tx
    .insert(users)
    .values({ ...values, showProfilePic: true })
    .onConflictDoNothing({ target: users.tokenIdentifier })
    .returning();
  return created ?? null;
}

export async function setUserApiKey(
  tx: Transaction,
  userId: string,
  apiKey: string,
) {
  const [updated] = await tx
    .update(users)
    .set({ apiKey, updatedAt: sql`now()` })
    .where(eq(users.id, userId))
    .returning();
  return updated ?? null;
}

export async function setUsername(
  tx: Transaction,
  userId: string,
  username: string,
) {
  const [updated] = await tx
    .update(users)
    .set({ username, updatedAt: sql`now()` })
    .where(eq(users.id, userId))
    .returning();
  return updated ?? null;
}

export async function searchUsersByUsernamePrefix(
  tx: Transaction,
  prefix: string,
) {
  const escapedPrefix = `${prefix}%`;
  return tx
    .select()
    .from(users)
    .where(sql`${users.usernameSearch} like ${escapedPrefix} escape '\\'`)
    .orderBy(asc(users.usernameSearch), asc(users.id))
    .limit(10);
}

export async function touchUser(tx: Transaction, userId: string) {
  const [updated] = await tx
    .update(users)
    .set({ updatedAt: sql`now()` })
    .where(eq(users.id, userId))
    .returning();
  return updated ?? null;
}

export async function getUsersByTokenIdentifiers(
  tx: Transaction,
  tokenIdentifiers: string[],
) {
  return Promise.all(
    tokenIdentifiers.map((tokenIdentifier) =>
      getUserByTokenIdentifier(tx, tokenIdentifier),
    ),
  );
}

export type UserRow = typeof users.$inferSelect;
