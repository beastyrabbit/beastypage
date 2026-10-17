import "server-only";

import { eq, lte, sql } from "drizzle-orm";
import { discordChallenge, discordUserConfigs } from "../db/schema";
import type { Transaction } from "../db/transaction";

export type DiscordChallengeRow = typeof discordChallenge.$inferSelect;
export type DiscordUserConfigRow = typeof discordUserConfigs.$inferSelect;

export async function pruneExpiredChallenges(tx: Transaction, now: Date) {
  await tx.delete(discordChallenge).where(lte(discordChallenge.expiresAt, now));
}

export async function insertChallenge(
  tx: Transaction,
  values: typeof discordChallenge.$inferInsert,
) {
  const [created] = await tx
    .insert(discordChallenge)
    .values(values)
    .returning();
  return created;
}

export async function getChallenge(tx: Transaction, token: string) {
  const [row] = await tx
    .select()
    .from(discordChallenge)
    .where(eq(discordChallenge.token, token))
    .limit(1);
  return row ?? null;
}

export async function deleteChallenge(tx: Transaction, id: string) {
  await tx.delete(discordChallenge).where(eq(discordChallenge.id, id));
}

export async function getUserConfig(tx: Transaction, discordUserId: string) {
  const [row] = await tx
    .select()
    .from(discordUserConfigs)
    .where(eq(discordUserConfigs.discordUserId, discordUserId))
    .limit(1);
  return row ?? null;
}

export async function deleteUserConfig(tx: Transaction, id: string) {
  await tx.delete(discordUserConfigs).where(eq(discordUserConfigs.id, id));
}

export async function updateUserConfig(
  tx: Transaction,
  id: string,
  fields: Partial<typeof discordUserConfigs.$inferInsert>,
) {
  const [updated] = await tx
    .update(discordUserConfigs)
    .set({ ...fields, updatedAt: sql`now()` })
    .where(eq(discordUserConfigs.id, id))
    .returning();
  return updated ?? null;
}

export async function insertUserConfig(
  tx: Transaction,
  values: typeof discordUserConfigs.$inferInsert,
) {
  const [created] = await tx
    .insert(discordUserConfigs)
    .values(values)
    .returning();
  return created ?? null;
}
