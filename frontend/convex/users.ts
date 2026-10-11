import { v } from "convex/values";
import { internal } from "./_generated/api.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server.js";

const USERNAME_SEARCH_MIGRATION = "usernameSearch";
const MAX_RESOLVE_IDS = 100;
const MAX_ID_LENGTH = 128;
const MAX_BACKFILL_BATCH = 100;

function usernameSearchValue(username: string | undefined): string | undefined {
  return username?.trim().toLowerCase() || undefined;
}

/** Look up a user document by their auth token identifier. */
async function getUserByToken(
  ctx: QueryCtx | MutationCtx,
  tokenIdentifier: string,
) {
  return ctx.db
    .query("users")
    .withIndex("byTokenIdentifier", (q) =>
      q.eq("tokenIdentifier", tokenIdentifier),
    )
    .unique();
}

/** Validate and normalize a username. Throws on invalid input. */
function validateUsername(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("Username cannot be empty");
  }
  if (trimmed.length > 30) {
    throw new Error("Username must be 30 characters or fewer");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    throw new Error(
      "Username can only contain letters, numbers, hyphens, and underscores",
    );
  }
  return trimmed;
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

/** Derive a unique username from auth identity claims, or return undefined if none is available. */
async function deriveUniqueUsername(
  ctx: MutationCtx,
  identity: { nickname?: string; name?: string; email?: string },
): Promise<string | undefined> {
  const raw =
    identity.nickname ??
    identity.name ??
    (identity.email ? identity.email.split("@")[0] : undefined);
  if (!raw) return undefined;

  const sanitized = sanitizeUsername(raw);
  if (sanitized.length === 0) return undefined;

  // Try the sanitized name first, then fall back to suffixed variants
  const taken = await ctx.db
    .query("users")
    .withIndex("byUsername", (q) => q.eq("username", sanitized))
    .unique();
  if (!taken) return sanitized;

  for (let i = 0; i < 5; i++) {
    const suffix = crypto.randomUUID().slice(0, 4);
    const candidate = `${sanitized.slice(0, 25)}-${suffix}`;
    const exists = await ctx.db
      .query("users")
      .withIndex("byUsername", (q) => q.eq("username", candidate))
      .unique();
    if (!exists) return candidate;
  }
  return undefined;
}

/**
 * Get the currently authenticated user's record.
 * Returns null if not authenticated or no user doc exists yet.
 */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return getUserByToken(ctx, identity.tokenIdentifier);
  },
});

/**
 * Ensure a user document exists for the authenticated identity.
 * Called after each sign-in from the client; idempotent (returns existing doc if found).
 */
export const getOrCreateUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const existing = await getUserByToken(ctx, identity.tokenIdentifier);
    if (existing) {
      // Backfill apiKey for users created before the field existed
      const usernameSearch = usernameSearchValue(existing.username);
      if (!existing.apiKey || existing.usernameSearch !== usernameSearch) {
        await ctx.db.patch(existing._id, {
          ...(existing.apiKey ? {} : { apiKey: crypto.randomUUID() }),
          ...(usernameSearch ? { usernameSearch } : {}),
          updatedAt: Date.now(),
        });
        return await ctx.db.get(existing._id);
      }
      return existing;
    }

    // Derive an initial username from Clerk identity claims
    const username = await deriveUniqueUsername(ctx, identity);

    const id = await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      ...(username !== undefined && { username }),
      ...(usernameSearchValue(username) && {
        usernameSearch: usernameSearchValue(username),
      }),
      showProfilePic: true,
      apiKey: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return await ctx.db.get(id);
  },
});

/**
 * Update the authenticated user's profile settings.
 */
export const updateProfile = mutation({
  args: {
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await getUserByToken(ctx, identity.tokenIdentifier);
    if (!user) {
      throw new Error("User not found. Please sign in again.");
    }

    let validatedUsername: string | undefined;
    if (args.username !== undefined) {
      validatedUsername = validateUsername(args.username);
      const username = validatedUsername;
      const existing = await ctx.db
        .query("users")
        .withIndex("byUsername", (q) => q.eq("username", username))
        .unique();
      if (existing && existing._id !== user._id) {
        throw new Error("Username is already taken");
      }
    }

    await ctx.db.patch(user._id, {
      updatedAt: Date.now(),
      ...(validatedUsername !== undefined && {
        username: validatedUsername,
        usernameSearch: usernameSearchValue(validatedUsername),
      }),
    });
    return await ctx.db.get(user._id);
  },
});

/**
 * Regenerate the authenticated user's API key.
 */
export const regenerateApiKey = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await getUserByToken(ctx, identity.tokenIdentifier);
    if (!user) {
      throw new Error("User not found. Please sign in again.");
    }

    const newKey = crypto.randomUUID();
    await ctx.db.patch(user._id, {
      apiKey: newKey,
      updatedAt: Date.now(),
    });
    return newKey;
  },
});

/**
 * Look up a user by API key. Internal only — used by the stream session backend.
 */
export const getUserByApiKey = internalQuery({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("users")
      .withIndex("byApiKey", (q) => q.eq("apiKey", args.apiKey))
      .unique();
  },
});

/** Extract the Clerk user ID from a tokenIdentifier (e.g. "https://…|user_2xxx" → "user_2xxx"). */
function clerkUserId(tokenIdentifier: string): string {
  const parts = tokenIdentifier.split("|");
  return parts.at(-1) ?? tokenIdentifier;
}

function clerkIssuer(tokenIdentifier: string): string {
  const separator = tokenIdentifier.lastIndexOf("|");
  return separator > 0 ? tokenIdentifier.slice(0, separator) : tokenIdentifier;
}

function assertClerkUserIds(userIds: string[]) {
  if (userIds.length > MAX_RESOLVE_IDS) {
    throw new Error(`Resolve at most ${MAX_RESOLVE_IDS} users at a time`);
  }
  for (const userId of userIds) {
    if (
      userId.length === 0 ||
      userId.length > MAX_ID_LENGTH ||
      userId.includes("|")
    ) {
      throw new Error("Invalid Clerk user ID");
    }
  }
}

/**
 * Backfill the normalized username index in bounded, resumable batches.
 * Run this internal mutation before enabling username search for legacy data.
 */
export const backfillUsernameSearch = internalMutation({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const batchSize = Math.max(
      1,
      Math.min(args.batchSize ?? MAX_BACKFILL_BATCH, MAX_BACKFILL_BATCH),
    );
    const state = await ctx.db
      .query("user_search_migrations")
      .withIndex("byName", (q) => q.eq("name", USERNAME_SEARCH_MIGRATION))
      .unique();
    // New and edited users populate usernameSearch themselves. Once the
    // legacy rows are complete, avoid rescanning the users index on every
    // periodic recovery invocation.
    if (state?.complete) return { processed: 0, complete: true };
    const cursor = state?.cursor;
    const usersQuery = cursor
      ? ctx.db
          .query("users")
          .withIndex("byTokenIdentifier", (q) =>
            q.gt("tokenIdentifier", cursor),
          )
          .order("asc")
      : ctx.db
          .query("users")
          .withIndex("byTokenIdentifier", (q) => q)
          .order("asc");
    const users = await usersQuery.take(batchSize);
    for (const user of users) {
      const usernameSearch = usernameSearchValue(user.username);
      await ctx.db.patch(user._id, {
        ...(usernameSearch ? { usernameSearch } : {}),
      });
    }

    const now = Date.now();
    const complete = users.length < batchSize;
    const nextState: {
      name: string;
      cursor?: string;
      complete: boolean;
      updatedAt: number;
    } = {
      name: USERNAME_SEARCH_MIGRATION,
      complete,
      updatedAt: now,
    };
    const lastTokenIdentifier = users.at(-1)?.tokenIdentifier;
    if (lastTokenIdentifier) nextState.cursor = lastTokenIdentifier;
    if (state) await ctx.db.replace(state._id, nextState);
    else await ctx.db.insert("user_search_migrations", nextState);

    if (!complete) {
      await ctx.scheduler.runAfter(0, internal.users.backfillUsernameSearch, {
        batchSize,
      });
    }
    return { processed: users.length, complete };
  },
});

/**
 * Search users by username prefix. Returns up to 10 matches with their Clerk user ID.
 * Requires authentication.
 */
export const searchByUsername = query({
  args: { prefix: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const trimmed = args.prefix.trim().toLowerCase();
    if (trimmed.length === 0) return [];

    const migration = await ctx.db
      .query("user_search_migrations")
      .withIndex("byName", (q) => q.eq("name", USERNAME_SEARCH_MIGRATION))
      .unique();
    if (!migration?.complete) {
      throw new Error("Username search index migration is incomplete");
    }

    const candidates = await ctx.db
      .query("users")
      .withIndex("byUsernameSearch", (q) =>
        q
          .gte("usernameSearch", trimmed)
          .lt("usernameSearch", `${trimmed}\uffff`),
      )
      .take(10);

    return candidates.map((u) => ({
      userId: clerkUserId(u.tokenIdentifier),
      username: u.username ?? "unknown",
    }));
  },
});

/**
 * Look up usernames for a list of Clerk user IDs.
 * Used to display friendly names for allowed-user lists.
 */
export const resolveUsernames = query({
  args: { userIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    assertClerkUserIds(args.userIds);
    const issuer = clerkIssuer(identity.tokenIdentifier);
    const resolvedUsers = await Promise.all(
      args.userIds.map(async (userId) => {
        const user = await ctx.db
          .query("users")
          .withIndex("byTokenIdentifier", (q) =>
            q.eq("tokenIdentifier", `${issuer}|${userId}`),
          )
          .unique();
        return [userId, user?.username ?? userId] as const;
      }),
    );
    const byClerkId = new Map(resolvedUsers);

    return args.userIds.map((id) => ({
      userId: id,
      username: byClerkId.get(id) ?? id,
    }));
  },
});

/**
 * Remove one bounded batch of the authenticated user's saved variants.
 */
export const resetSavedVariants = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await getUserByToken(ctx, identity.tokenIdentifier);
    if (!user) {
      throw new Error("User not found");
    }

    // Cascade delete user_variants
    const variants = await ctx.db
      .query("user_variants")
      .withIndex("byUserTool", (q) => q.eq("userId", user._id))
      .take(100);
    for (const variant of variants) {
      await ctx.db.delete(variant._id);
    }

    return { remaining: variants.length === 100 };
  },
});
