import "server-only";

import { randomUUID, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Identity } from "../auth/identity";
import type { Database } from "../db/pool";
import { users, userVariants } from "../db/schema";
import { type Transaction, withTransaction } from "../db/transaction";
import { ServiceError } from "../errors";
import {
  getUserByApiKey,
  getUserByTokenIdentifier,
  getUserByUsername,
  listUserVariants,
} from "../repositories/users";

const MAX_RESOLVE_IDS = 100;
const MAX_ID_LENGTH = 128;

export type UserRecord = ReturnType<typeof toUserRecord>;

function toUserRecord(row: typeof users.$inferSelect) {
  return {
    _id: row.id,
    _creationTime: row.createdAt.getTime(),
    tokenIdentifier: row.tokenIdentifier,
    username: row.username ?? undefined,
    usernameSearch: row.usernameSearch ?? undefined,
    showProfilePic: row.showProfilePic,
    apiKey: row.apiKey ?? undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

function validateUsername(raw: string): string {
  const value = raw.trim();
  if (!value)
    throw new ServiceError("invalid_input", "Username cannot be empty");
  if (value.length > 30)
    throw new ServiceError(
      "invalid_input",
      "Username must be 30 characters or fewer",
    );
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new ServiceError(
      "invalid_input",
      "Username can only contain letters, numbers, hyphens, and underscores",
    );
  }
  return value;
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function ensureUser(tx: Transaction, identity: Identity) {
  if (!identity.tokenIdentifier)
    throw new ServiceError("forbidden", "Not authenticated");
  const existing = await getUserByTokenIdentifier(tx, identity.tokenIdentifier);
  if (existing) {
    if (!existing.apiKey) {
      const [updated] = await tx
        .update(users)
        .set({ apiKey: randomUUID(), updatedAt: sql`now()` })
        .where(eq(users.id, existing.id))
        .returning();
      return updated ?? existing;
    }
    return existing;
  }
  const [created] = await tx
    .insert(users)
    .values({
      tokenIdentifier: identity.tokenIdentifier,
      showProfilePic: true,
      apiKey: randomUUID(),
    })
    .onConflictDoNothing({ target: users.tokenIdentifier })
    .returning();
  if (created) return created;
  const raced = await getUserByTokenIdentifier(tx, identity.tokenIdentifier);
  if (!raced) throw new ServiceError("unavailable", "Failed to create user");
  return raced;
}

async function requireExistingUser(tx: Transaction, identity: Identity) {
  if (!identity.tokenIdentifier)
    throw new ServiceError("forbidden", "Not authenticated");
  const user = await getUserByTokenIdentifier(tx, identity.tokenIdentifier);
  if (!user)
    throw new ServiceError(
      "not_found",
      "User not found. Please sign in again.",
    );
  return user;
}

export async function viewer(db: Database, identity: Identity) {
  if (!identity.tokenIdentifier) return null;
  return withTransaction(db, async (tx) => {
    const row = await getUserByTokenIdentifier(
      tx,
      identity.tokenIdentifier as string,
    );
    return row ? toUserRecord(row) : null;
  });
}

export async function getOrCreateUser(db: Database, identity: Identity) {
  return withTransaction(db, async (tx) =>
    toUserRecord(await ensureUser(tx, identity)),
  );
}

export async function updateProfile(
  db: Database,
  identity: Identity,
  username?: string,
) {
  return withTransaction(db, async (tx) => {
    const user = await requireExistingUser(tx, identity);
    if (username === undefined) return toUserRecord(user);
    const validated = validateUsername(username);
    const existing = await getUserByUsername(tx, validated);
    if (existing && existing.id !== user.id)
      throw new ServiceError("conflict", "Username is already taken");
    const [updated] = await tx
      .update(users)
      .set({ username: validated, updatedAt: sql`now()` })
      .where(eq(users.id, user.id))
      .returning();
    return toUserRecord(updated ?? user);
  });
}

export async function regenerateApiKey(db: Database, identity: Identity) {
  return withTransaction(db, async (tx) => {
    const user = await requireExistingUser(tx, identity);
    const apiKey = randomUUID();
    await tx
      .update(users)
      .set({ apiKey, updatedAt: sql`now()` })
      .where(eq(users.id, user.id));
    return apiKey;
  });
}

export async function resetSavedVariants(db: Database, identity: Identity) {
  return withTransaction(db, async (tx) => {
    const user = await requireExistingUser(tx, identity);
    const rows = await tx
      .select({ id: userVariants.id })
      .from(userVariants)
      .where(eq(userVariants.userId, user.id))
      .limit(100);
    if (rows.length) {
      await tx.delete(userVariants).where(
        sql`${userVariants.id} in (${sql.join(
          rows.map((row) => sql`${row.id}`),
          sql`, `,
        )})`,
      );
    }
    return { remaining: rows.length === 100 };
  });
}

export async function resolveUsernames(
  db: Database,
  identity: Identity,
  userIds: string[],
) {
  if (!identity.tokenIdentifier) return [];
  if (userIds.length > MAX_RESOLVE_IDS)
    throw new ServiceError(
      "invalid_input",
      `Resolve at most ${MAX_RESOLVE_IDS} users at a time`,
    );
  for (const id of userIds) {
    if (!id || id.length > MAX_ID_LENGTH || id.includes("|"))
      throw new ServiceError("invalid_input", "Invalid Clerk user ID");
  }
  const separator = identity.tokenIdentifier.lastIndexOf("|");
  const issuer =
    separator > 0
      ? identity.tokenIdentifier.slice(0, separator)
      : identity.tokenIdentifier;
  return withTransaction(db, async (tx) => {
    const rows = await Promise.all(
      userIds.map((id) => getUserByTokenIdentifier(tx, `${issuer}|${id}`)),
    );
    return userIds.map((id, index) => ({
      userId: id,
      username: rows[index]?.username ?? id,
    }));
  });
}

export async function searchByUsername(
  db: Database,
  identity: Identity,
  prefix: string,
) {
  if (!identity.tokenIdentifier) return [];
  const value = prefix.trim().toLowerCase();
  if (!value) return [];
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
  return withTransaction(db, async (tx) => {
    const rows = await tx
      .select()
      .from(users)
      .where(sql`${users.usernameSearch} like ${`${escaped}%`} escape '\\'`)
      .limit(10);
    return rows.map((row) => ({
      userId: row.tokenIdentifier.slice(
        row.tokenIdentifier.lastIndexOf("|") + 1,
      ),
      username: row.username ?? "unknown",
    }));
  });
}

export async function findUserByApiKey(db: Database, apiKey: string) {
  return withTransaction(db, async (tx) => {
    const row = await getUserByApiKey(tx, apiKey);
    if (!row?.apiKey || !constantTimeEqual(apiKey, row.apiKey)) return null;
    return row;
  });
}

export { listUserVariants, toUserRecord };
