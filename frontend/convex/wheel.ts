import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";

type WheelSpinDoc = Doc<"wheel_spins">;

export const logSpin = mutation({
  args: {
    prizeName: v.string(),
    forced: v.boolean(),
    randomBucket: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const doc: Omit<WheelSpinDoc, "_id" | "_creationTime"> = {
      prizeName: args.prizeName,
      forced: args.forced,
      createdAt: Date.now()
    };
    if (typeof args.randomBucket === "number") {
      doc.randomBucket = args.randomBucket;
    }
    await ctx.db.insert("wheel_spins", doc);
  }
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const records = await ctx.db.query("wheel_spins").collect();

    const totals = new Map<string, { count: number; forced: number; lastSpinAt: number | null }>();
    let totalSpins = 0;
    let totalForced = 0;
    let mostRecent: number | null = null;

    const register = (doc: WheelSpinDoc) => {
      if (doc.forced) {
        totalForced += 1;
        return;
      }
      const current = totals.get(doc.prizeName) ?? { count: 0, forced: 0, lastSpinAt: null };
      current.count += 1;
      current.lastSpinAt = current.lastSpinAt ? Math.max(current.lastSpinAt, doc.createdAt) : doc.createdAt;
      totals.set(doc.prizeName, current);
      totalSpins += 1;
      mostRecent = mostRecent ? Math.max(mostRecent, doc.createdAt) : doc.createdAt;
    };

    records.forEach(register);

    const prizeStats = Array.from(totals.entries()).map(([prizeName, info]) => ({
      prizeName,
      count: info.count,
      forcedCount: info.forced,
      lastSpinAt: info.lastSpinAt
    }));

    return {
      totalSpins,
      totalForced,
      lastSpinAt: mostRecent,
      prizes: prizeStats
    };
  }
});
