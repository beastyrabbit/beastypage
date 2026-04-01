import { query, mutation } from "./_generated/server.js";
import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server.js";

/**
 * Get the currently authenticated user's profile.
 * Returns null if not authenticated or no user doc exists yet.
 */
export const viewer = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("byTokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user) {
      // Authenticated but no user doc yet -- return identity info for display
      return {
        _id: null as null,
        tokenIdentifier: identity.tokenIdentifier,
        displayName: (identity.name as string | undefined) ?? null,
        showProfilePic: true,
        profilePicUrl: (identity.pictureUrl as string | undefined) ?? null,
        email: (identity.email as string | undefined) ?? null,
        createdAt: null as null,
        updatedAt: null as null,
      };
    }

    return user;
  },
});

/**
 * Ensure a user document exists for the authenticated identity.
 * Called once after login. Creates a new doc or refreshes profile pic / email
 * from the latest identity claims.
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

    const now = Date.now();

    if (existing) {
      // Refresh fields that may change on the provider side
      await ctx.db.patch(existing._id, {
        profilePicUrl: (identity.pictureUrl as string | undefined) ?? existing.profilePicUrl,
        email: (identity.email as string | undefined) ?? existing.email,
        updatedAt: now,
      });
      return await ctx.db.get(existing._id);
    }

    const doc: {
      tokenIdentifier: string;
      showProfilePic: boolean;
      createdAt: number;
      updatedAt: number;
      displayName?: string;
      profilePicUrl?: string;
      email?: string;
    } = {
      tokenIdentifier: identity.tokenIdentifier,
      showProfilePic: true,
      createdAt: now,
      updatedAt: now,
    };
    const name = identity.name as string | undefined;
    if (name) doc.displayName = name;
    const pic = identity.pictureUrl as string | undefined;
    if (pic) doc.profilePicUrl = pic;
    const email = identity.email as string | undefined;
    if (email) doc.email = email;

    const id = await ctx.db.insert("users", doc);

    return await ctx.db.get(id);
  },
});

/**
 * Update the authenticated user's profile settings.
 * Only displayName and showProfilePic can be changed by the user.
 */
export const updateProfile = mutation({
  args: {
    displayName: v.optional(v.string()),
    showProfilePic: v.optional(v.boolean()),
  },
  handler: async (ctx: MutationCtx, args: { displayName?: string; showProfilePic?: boolean }) => {
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

    if (args.displayName !== undefined) {
      const trimmed = args.displayName.trim();
      if (trimmed.length === 0) {
        throw new Error("Display name cannot be empty");
      }
      if (trimmed.length > 50) {
        throw new Error("Display name must be 50 characters or fewer");
      }
      patch.displayName = trimmed;
    }

    if (args.showProfilePic !== undefined) {
      patch.showProfilePic = args.showProfilePic;
    }

    await ctx.db.patch(user._id, patch);
    return await ctx.db.get(user._id);
  },
});
