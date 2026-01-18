import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

/**
 * SECURITY NOTE: This is a simple hash function providing basic ownership protection.
 * It is NOT cryptographically secure and should NOT be used for sensitive authentication.
 *
 * This is intentionally lightweight protection to prevent casual overwrites of trees.
 * For production-grade security, implement password hashing via Convex actions using
 * argon2 or bcrypt with proper salt handling and constant-time comparison.
 *
 * Trade-offs accepted for this use case:
 * - No protection against determined attackers
 * - Predictable hash output (no random salt)
 * - Not suitable for authentication systems
 *
 * This is acceptable here because:
 * - Trees are not sensitive data
 * - Password is optional convenience feature
 * - Main goal is preventing accidental overwrites
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Add salt based on string length and first/last chars for basic protection
  const salt = str.length + (str.charCodeAt(0) || 0) + (str.charCodeAt(str.length - 1) || 0);
  return `${hash.toString(36)}-${salt.toString(36)}`;
}

const catValidator = v.object({
  id: v.string(),
  name: v.object({
    prefix: v.string(),
    suffix: v.string(),
    full: v.string()
  }),
  gender: v.union(v.literal("M"), v.literal("F")),
  lifeStage: v.string(),
  params: v.any(),
  motherId: v.union(v.string(), v.null()),
  fatherId: v.union(v.string(), v.null()),
  partnerIds: v.array(v.string()),
  childrenIds: v.array(v.string()),
  genetics: v.any(),
  source: v.string(),
  historyProfileId: v.optional(v.string()),
  generation: v.number()
});

const configValidator = v.object({
  minChildren: v.number(),
  maxChildren: v.number(),
  depth: v.number(),
  genderRatio: v.number(),
  partnerChance: v.optional(v.number()),
  paletteModes: v.optional(v.array(v.string())),
  offspringOptions: v.optional(v.object({
    accessoryChance: v.number(),
    maxAccessories: v.number(),
    scarChance: v.number(),
    maxScars: v.number()
  }))
});

export const save = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    foundingMotherId: v.string(),
    foundingFatherId: v.string(),
    cats: v.array(catValidator),
    config: configValidator,
    creatorName: v.optional(v.string()),
    password: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if tree with this slug already exists
    const existing = await ctx.db
      .query("ancestry_tree")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
      .first();

    if (existing) {
      // Tree exists - check password if it has one
      if (existing.passwordHash) {
        if (!args.password) {
          return { success: false, error: "password_required" } as const;
        }
        const providedHash = simpleHash(args.password);
        if (providedHash !== existing.passwordHash) {
          return { success: false, error: "invalid_password" } as const;
        }
      }

      // Update existing tree
      const patch: {
        name: string;
        foundingMotherId: string;
        foundingFatherId: string;
        cats: typeof args.cats;
        config: typeof args.config;
        updatedAt: number;
        creatorName?: string;
        passwordHash?: string;
      } = {
        name: args.name,
        foundingMotherId: args.foundingMotherId,
        foundingFatherId: args.foundingFatherId,
        cats: args.cats,
        config: args.config,
        updatedAt: now
      };

      if (args.creatorName !== undefined) {
        patch.creatorName = args.creatorName;
      }

      // If setting a new password on an unprotected tree
      if (args.password && !existing.passwordHash) {
        patch.passwordHash = simpleHash(args.password);
      }

      await ctx.db.patch(existing._id, patch);
      return { success: true, id: existing._id, slug: args.slug, isNew: false } as const;
    }

    // Create new tree
    const insertData: {
      slug: string;
      name: string;
      foundingMotherId: string;
      foundingFatherId: string;
      cats: typeof args.cats;
      config: typeof args.config;
      createdAt: number;
      updatedAt: number;
      creatorName?: string;
      passwordHash?: string;
    } = {
      slug: args.slug,
      name: args.name,
      foundingMotherId: args.foundingMotherId,
      foundingFatherId: args.foundingFatherId,
      cats: args.cats,
      config: args.config,
      createdAt: now,
      updatedAt: now,
    };

    if (args.creatorName !== undefined) {
      insertData.creatorName = args.creatorName;
    }

    if (args.password) {
      insertData.passwordHash = simpleHash(args.password);
    }

    const id = await ctx.db.insert("ancestry_tree", insertData);

    return { success: true, id, slug: args.slug, isNew: true } as const;
  }
});

// Check if a tree exists and whether it has a password
export const checkSlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const tree = await ctx.db
      .query("ancestry_tree")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
      .first();

    if (!tree) {
      return { exists: false, hasPassword: false };
    }

    return { exists: true, hasPassword: !!tree.passwordHash };
  }
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const tree = await ctx.db
      .query("ancestry_tree")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
      .first();

    if (!tree) return null;

    // Return tree data with hasPassword flag, but not the actual hash
    const { passwordHash, ...treeData } = tree;
    return { ...treeData, hasPassword: !!passwordHash };
  }
});

export const list = query({
  args: {
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    const trees = await ctx.db
      .query("ancestry_tree")
      .withIndex("byCreated")
      .order("desc")
      .take(limit);

    return trees.map((tree) => ({
      id: tree._id,
      slug: tree.slug,
      name: tree.name,
      catCount: tree.cats.length,
      config: tree.config,
      creatorName: tree.creatorName,
      hasPassword: !!tree.passwordHash,
      createdAt: tree.createdAt,
      updatedAt: tree.updatedAt,
      // Include first 6 cats for preview thumbnails in history
      previewCats: tree.cats.slice(0, 6).map((c) => ({
        id: c.id,
        name: c.name.full,
        params: c.params
      }))
    }));
  }
});

export const update = mutation({
  args: {
    slug: v.string(),
    name: v.optional(v.string()),
    cats: v.optional(v.array(catValidator)),
    config: v.optional(configValidator),
    creatorName: v.optional(v.string()),
    password: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ancestry_tree")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
      .first();

    if (!existing) {
      return { success: false, error: "not_found" } as const;
    }

    // Check password if tree has one
    if (existing.passwordHash) {
      if (!args.password) {
        return { success: false, error: "password_required" } as const;
      }
      const providedHash = simpleHash(args.password);
      if (providedHash !== existing.passwordHash) {
        return { success: false, error: "invalid_password" } as const;
      }
    }

    const updates: Record<string, unknown> = {
      updatedAt: Date.now()
    };

    if (args.name !== undefined) updates.name = args.name;
    if (args.cats !== undefined) updates.cats = args.cats;
    if (args.config !== undefined) updates.config = args.config;
    if (args.creatorName !== undefined) updates.creatorName = args.creatorName;

    await ctx.db.patch(existing._id, updates);
    return { success: true, id: existing._id, slug: args.slug } as const;
  }
});

export const remove = mutation({
  args: {
    slug: v.string(),
    password: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ancestry_tree")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
      .first();

    if (!existing) {
      return { success: false, error: "not_found" } as const;
    }

    // Check password if tree is protected
    if (existing.passwordHash) {
      if (!args.password) {
        return { success: false, error: "password_required" } as const;
      }
      const providedHash = simpleHash(args.password);
      if (providedHash !== existing.passwordHash) {
        return { success: false, error: "invalid_password" } as const;
      }
    }

    await ctx.db.delete(existing._id);
    return { success: true } as const;
  }
});
