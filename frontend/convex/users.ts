import { query, mutation } from "./_generated/server.js";
import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server.js";

/** Look up a user document by their auth token identifier. */
async function getUserByToken(
  ctx: QueryCtx | MutationCtx,
  tokenIdentifier: string
) {
  return ctx.db
    .query("users")
    .withIndex("byTokenIdentifier", (q) =>
      q.eq("tokenIdentifier", tokenIdentifier)
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
      "Username can only contain letters, numbers, hyphens, and underscores"
    );
  }
  return trimmed;
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
    if (existing) return existing;

    const id = await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      showProfilePic: true,
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
    showProfilePic: v.optional(v.boolean()),
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
      ...(args.showProfilePic !== undefined && {
        showProfilePic: args.showProfilePic,
      }),
    });
    return await ctx.db.get(user._id);
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

    await ctx.db.delete(user._id);
  },
});
