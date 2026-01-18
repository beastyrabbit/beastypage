import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

export const save = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    foundingMotherId: v.string(),
    foundingFatherId: v.string(),
    cats: v.array(v.object({
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
    })),
    config: v.object({
      minChildren: v.number(),
      maxChildren: v.number(),
      depth: v.number(),
      genderRatio: v.number()
    }),
    creatorName: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if tree with this slug already exists
    const existing = await ctx.db
      .query("ancestry_tree")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
      .first();

    if (existing) {
      // Update existing tree
      const patch: {
        name: string;
        foundingMotherId: string;
        foundingFatherId: string;
        cats: typeof args.cats;
        config: typeof args.config;
        updatedAt: number;
        creatorName?: string;
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

      await ctx.db.patch(existing._id, patch);
      return { id: existing._id, slug: args.slug };
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

    const id = await ctx.db.insert("ancestry_tree", insertData);

    return { id, slug: args.slug };
  }
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const tree = await ctx.db
      .query("ancestry_tree")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
      .first();

    return tree;
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
      createdAt: tree.createdAt,
      updatedAt: tree.updatedAt
    }));
  }
});

export const update = mutation({
  args: {
    slug: v.string(),
    name: v.optional(v.string()),
    cats: v.optional(v.array(v.object({
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
    }))),
    config: v.optional(v.object({
      minChildren: v.number(),
      maxChildren: v.number(),
      depth: v.number(),
      genderRatio: v.number()
    })),
    creatorName: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ancestry_tree")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
      .first();

    if (!existing) {
      throw new Error(`Tree with slug ${args.slug} not found`);
    }

    const updates: Record<string, unknown> = {
      updatedAt: Date.now()
    };

    if (args.name !== undefined) updates.name = args.name;
    if (args.cats !== undefined) updates.cats = args.cats;
    if (args.config !== undefined) updates.config = args.config;
    if (args.creatorName !== undefined) updates.creatorName = args.creatorName;

    await ctx.db.patch(existing._id, updates);
    return { id: existing._id, slug: args.slug };
  }
});

export const remove = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ancestry_tree")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
      .first();

    if (!existing) {
      throw new Error(`Tree with slug ${args.slug} not found`);
    }

    await ctx.db.delete(existing._id);
    return { success: true };
  }
});
