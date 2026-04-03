import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { internalQuery, mutation, query } from "./_generated/server.js";

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

  const sanitized = raw
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 30);
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
      if (!existing.apiKey) {
        await ctx.db.patch(existing._id, {
          apiKey: crypto.randomUUID(),
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
      const existing = await ctx.db
        .query("users")
        .withIndex("byUsername", (q) => q.eq("username", validatedUsername!))
        .unique();
      if (existing && existing._id !== user._id) {
        throw new Error("Username is already taken");
      }
    }

    await ctx.db.patch(user._id, {
      updatedAt: Date.now(),
      ...(validatedUsername !== undefined && { username: validatedUsername }),
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

/**
 * Delete the authenticated user's account.
 */
export const deleteAccount = mutation({
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
      .collect();
    for (const variant of variants) {
      await ctx.db.delete(variant._id);
    }

    await ctx.db.delete(user._id);
  },
});
