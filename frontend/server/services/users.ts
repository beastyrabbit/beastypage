import "server-only";

import { randomUUID, timingSafeEqual } from "node:crypto";
import { currentUser } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import type { Identity } from "../auth/identity";
import type { Database } from "../db/pool";
import { type Transaction, withTransaction } from "../db/transaction";
import { ServiceError } from "../errors";
import type { UserRow } from "../repositories/users";
import {
  createUser,
  getUserByApiKey,
  getUserByTokenIdentifier,
  getUserByUsername,
  getUsersByTokenIdentifiers,
  searchUsersByUsernamePrefix,
  setUserApiKey,
  setUsername,
  touchUser,
} from "../repositories/users";
import {
  deleteFirstByUser,
  listByUser as listUserVariants,
} from "../repositories/userVariants";

const MAX_RESOLVE_IDS = 100;
const MAX_ID_LENGTH = 128;

/** The profile fields exposed by Clerk's Convex JWT template. */
export interface ClerkProfile {
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  primaryEmail?: string | null;
}

export type UserProfileLoader = (
  identity: Identity,
) => Promise<ClerkProfile | null | undefined>;

export type UserRecord = ReturnType<typeof toUserRecord>;

function toUserRecord(row: UserRow) {
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

function sanitizeUsername(raw: string): string {
  const filtered = raw.replace(/[^a-zA-Z0-9_-]/g, "");
  let start = 0;
  let end = filtered.length;
  while (start < end && (filtered[start] === "-" || filtered[start] === "_"))
    start++;
  while (
    end > start &&
    (filtered[end - 1] === "-" || filtered[end - 1] === "_")
  )
    end--;
  return filtered.slice(start, end).slice(0, 30);
}

async function deriveUsername(
  tx: Transaction,
  profile: ClerkProfile | null | undefined,
) {
  const fullName = [profile?.firstName, profile?.lastName]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ");
  const raw =
    profile?.username ??
    (fullName || undefined) ??
    (profile?.primaryEmail ? profile.primaryEmail.split("@", 1)[0] : undefined);
  if (!raw) return undefined;
  const sanitized = sanitizeUsername(raw);
  if (!sanitized) return undefined;
  if (!(await getUserByUsername(tx, sanitized))) return sanitized;
  for (let index = 0; index < 5; index++) {
    const candidate = `${sanitized.slice(0, 25)}-${randomUUID().slice(0, 4)}`;
    if (!(await getUserByUsername(tx, candidate))) return candidate;
  }
  return undefined;
}

async function ensureUser(
  tx: Transaction,
  identity: Identity,
  profile: ClerkProfile | null | undefined,
) {
  if (!identity.tokenIdentifier)
    throw new ServiceError("forbidden", "Not authenticated");
  const existing = await getUserByTokenIdentifier(tx, identity.tokenIdentifier);
  if (existing) {
    if (!existing.apiKey) {
      const updated = await setUserApiKey(tx, existing.id, randomUUID());
      return updated ?? existing;
    }
    return existing;
  }
  const tokenLockKey = `beastypage:users:ensure:${identity.tokenIdentifier}`;
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${tokenLockKey}, 0))`,
  );
  const raced = await getUserByTokenIdentifier(tx, identity.tokenIdentifier);
  if (raced) return raced;
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended('beastypage:users:username', 0))`,
  );
  const username = await deriveUsername(tx, profile);
  const created = await createUser(tx, {
    tokenIdentifier: identity.tokenIdentifier,
    apiKey: randomUUID(),
    username,
  });
  if (created) return created;
  const inserted = await getUserByTokenIdentifier(tx, identity.tokenIdentifier);
  if (!inserted) throw new ServiceError("unavailable", "Failed to create user");
  return inserted;
}

async function loadClerkProfile(
  _identity: Identity,
): Promise<ClerkProfile | null> {
  const user = await currentUser();
  if (!user) return null;
  return {
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    primaryEmail: user.primaryEmailAddress?.emailAddress ?? null,
  };
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

export async function getOrCreateUser(
  db: Database,
  identity: Identity,
  profileLoader: UserProfileLoader = loadClerkProfile,
) {
  if (!identity.tokenIdentifier)
    throw new ServiceError("forbidden", "Not authenticated");
  const existing = await withTransaction(db, (tx) =>
    getUserByTokenIdentifier(tx, identity.tokenIdentifier as string),
  );
  if (existing) {
    if (!existing.apiKey) {
      const updated = await withTransaction(db, (tx) =>
        setUserApiKey(tx, existing.id, randomUUID()),
      );
      return toUserRecord(updated ?? existing);
    }
    return toUserRecord(existing);
  }
  let profile: ClerkProfile | null | undefined;
  try {
    profile = await profileLoader(identity);
  } catch (error) {
    console.warn(
      "[users] Clerk profile lookup failed; creating user without username",
      error instanceof Error ? error.message : error,
    );
  }
  return withTransaction(db, async (tx) =>
    toUserRecord(await ensureUser(tx, identity, profile)),
  );
}

export async function updateProfile(
  db: Database,
  identity: Identity,
  username?: string,
) {
  return withTransaction(db, async (tx) => {
    const user = await requireExistingUser(tx, identity);
    if (username === undefined) {
      const touched = await touchUser(tx, user.id);
      return toUserRecord(touched ?? user);
    }
    const validated = validateUsername(username);
    const existing = await getUserByUsername(tx, validated);
    if (existing && existing.id !== user.id)
      throw new ServiceError("conflict", "Username is already taken");
    const updated = await setUsername(tx, user.id, validated);
    return toUserRecord(updated ?? user);
  });
}

export async function regenerateApiKey(db: Database, identity: Identity) {
  return withTransaction(db, async (tx) => {
    const user = await requireExistingUser(tx, identity);
    const apiKey = randomUUID();
    await setUserApiKey(tx, user.id, apiKey);
    return apiKey;
  });
}

export async function resetSavedVariants(db: Database, identity: Identity) {
  return withTransaction(db, async (tx) => {
    const user = await requireExistingUser(tx, identity);
    const deleted = await deleteFirstByUser(tx, user.id, 100);
    return { remaining: deleted === 100 };
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
    const rows = await getUsersByTokenIdentifiers(
      tx,
      userIds.map((id) => `${issuer}|${id}`),
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
    const rows = await searchUsersByUsernamePrefix(tx, escaped);
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
