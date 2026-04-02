import { query, mutation } from "./_generated/server.js";
import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server.js";

/** Resolve the authenticated user's _id, or throw. */
async function requireUserId(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("byTokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier)
    )
    .unique();
  if (!user) throw new Error("User not found");
  return user._id;
}

/** List all variants for the authenticated user + tool. */
export const list = query({
  args: { toolKey: v.string() },
  handler: async (ctx, { toolKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("byTokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
    if (!user) return [];
    return ctx.db
      .query("user_variants")
      .withIndex("byUserTool", (q) => q.eq("userId", user._id).eq("toolKey", toolKey))
      .collect();
  },
});

/** Create or update a variant. */
export const upsert = mutation({
  args: {
    toolKey: v.string(),
    variantId: v.string(),
    name: v.string(),
    slug: v.optional(v.string()),
    settings: v.any(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();

    // If setting this variant as active, deactivate others for this tool
    if (args.isActive) {
      const others = await ctx.db
        .query("user_variants")
        .withIndex("byUserTool", (q) => q.eq("userId", userId).eq("toolKey", args.toolKey))
        .collect();
      for (const other of others) {
        if (other.isActive && other.variantId !== args.variantId) {
          await ctx.db.patch(other._id, { isActive: false });
        }
      }
    }

    const existing = await ctx.db
      .query("user_variants")
      .withIndex("byUserVariant", (q) =>
        q.eq("userId", userId).eq("toolKey", args.toolKey).eq("variantId", args.variantId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        settings: args.settings,
        isActive: args.isActive,
        ...(args.slug !== undefined ? { slug: args.slug } : {}),
        updatedAt: now,
      });
      return existing._id;
    }

    return ctx.db.insert("user_variants", {
      userId,
      toolKey: args.toolKey,
      variantId: args.variantId,
      name: args.name,
      ...(args.slug !== undefined ? { slug: args.slug } : {}),
      settings: args.settings,
      isActive: args.isActive,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Delete a variant. */
export const remove = mutation({
  args: { toolKey: v.string(), variantId: v.string() },
  handler: async (ctx, { toolKey, variantId }) => {
    const userId = await requireUserId(ctx);
    const variant = await ctx.db
      .query("user_variants")
      .withIndex("byUserVariant", (q) =>
        q.eq("userId", userId).eq("toolKey", toolKey).eq("variantId", variantId)
      )
      .unique();
    if (!variant) throw new Error("Variant not found");
    await ctx.db.delete(variant._id);
  },
});

/** Rename a variant. */
export const rename = mutation({
  args: { toolKey: v.string(), variantId: v.string(), name: v.string() },
  handler: async (ctx, { toolKey, variantId, name }) => {
    const userId = await requireUserId(ctx);
    const variant = await ctx.db
      .query("user_variants")
      .withIndex("byUserVariant", (q) =>
        q.eq("userId", userId).eq("toolKey", toolKey).eq("variantId", variantId)
      )
      .unique();
    if (!variant) throw new Error("Variant not found");
    await ctx.db.patch(variant._id, { name, updatedAt: Date.now() });
  },
});

/** Set the active variant for a tool (deactivates others). */
export const setActive = mutation({
  args: { toolKey: v.string(), variantId: v.optional(v.string()) },
  handler: async (ctx, { toolKey, variantId }) => {
    const userId = await requireUserId(ctx);
    const variants = await ctx.db
      .query("user_variants")
      .withIndex("byUserTool", (q) => q.eq("userId", userId).eq("toolKey", toolKey))
      .collect();
    for (const v of variants) {
      const shouldBeActive = v.variantId === variantId;
      if (v.isActive !== shouldBeActive) {
        await ctx.db.patch(v._id, { isActive: shouldBeActive });
      }
    }
  },
});

/** Bulk import variants from localStorage. Skips any that already exist by variantId. */
export const importBatch = mutation({
  args: {
    toolKey: v.string(),
    variants: v.array(
      v.object({
        variantId: v.string(),
        name: v.string(),
        slug: v.optional(v.string()),
        settings: v.any(),
        isActive: v.boolean(),
        createdAt: v.number(),
        updatedAt: v.number(),
      })
    ),
  },
  handler: async (ctx, { toolKey, variants }) => {
    const userId = await requireUserId(ctx);
    let imported = 0;
    let activeDeactivated = false;

    for (const v of variants) {
      const existing = await ctx.db
        .query("user_variants")
        .withIndex("byUserVariant", (q) =>
          q.eq("userId", userId).eq("toolKey", toolKey).eq("variantId", v.variantId)
        )
        .unique();
      if (existing) continue;

      // Enforce at most one active variant per tool
      const isActive = v.isActive && !activeDeactivated;
      if (isActive) {
        // Deactivate existing active variants only when we're actually inserting an active one
        const all = await ctx.db
          .query("user_variants")
          .withIndex("byUserTool", (q) => q.eq("userId", userId).eq("toolKey", toolKey))
          .collect();
        for (const doc of all) {
          if (doc.isActive) await ctx.db.patch(doc._id, { isActive: false });
        }
        activeDeactivated = true;
      }

      await ctx.db.insert("user_variants", {
        userId,
        toolKey,
        variantId: v.variantId,
        name: v.name,
        ...(v.slug !== undefined ? { slug: v.slug } : {}),
        settings: v.settings,
        isActive,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
      });
      imported++;
    }
    return { imported, total: variants.length };
  },
});

/** List all variants grouped by tool for the profile page. */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("byTokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
    if (!user) return [];

    // Get all variants for this user, sorted by tool
    const variants = await ctx.db
      .query("user_variants")
      .withIndex("byUserTool", (q) => q.eq("userId", user._id))
      .collect();

    return variants;
  },
});
