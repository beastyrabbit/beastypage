import { query, mutation } from "./_generated/server.js";
import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server.js";

/**
 * Get the currently authenticated user's record.
 * Returns null if not authenticated or no user doc exists yet.
 */
export const viewer = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("byTokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
  },
});

/**
 * Ensure a user document exists for the authenticated identity.
 * Called once after sign-in.
 */
export const getOrCreateUser = mutation({
  args: {},
  handler: async (ctx: MutationCtx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("byTokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

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
  handler: async (
    ctx: MutationCtx,
    args: { username?: string; showProfilePic?: boolean }
  ) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("byTokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user) {
      throw new Error("User not found. Please sign in again.");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };

    if (args.username !== undefined) {
      const trimmed = args.username.trim();
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
      patch.username = trimmed;
    }

    if (args.showProfilePic !== undefined) {
      patch.showProfilePic = args.showProfilePic;
    }

    await ctx.db.patch(user._id, patch);
    return await ctx.db.get(user._id);
  },
});

/**
 * Delete the authenticated user's account.
 */
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx: MutationCtx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("byTokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.delete(user._id);
  },
});
