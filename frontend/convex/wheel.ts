import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import { mutation, query } from "./_generated/server.js";
import { STREAM_WHEEL_PRIZES } from "./streamWheel.js";

type WheelSpinDoc = Doc<"wheel_spins">;

export const logSpin = mutation({
  args: {
    prizeName: v.string(),
    forced: v.boolean(),
    randomBucket: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.forced) {
      throw new Error("Forced wheel spins are internal-only");
    }
    if (!STREAM_WHEEL_PRIZES.some((prize) => prize.name === args.prizeName)) {
      throw new Error("Unknown wheel prize");
    }
    if (
      args.randomBucket !== undefined &&
      (!Number.isInteger(args.randomBucket) ||
        args.randomBucket < 0 ||
        args.randomBucket >= 100)
    ) {
      throw new Error("Invalid wheel random bucket");
    }
    const doc: Omit<WheelSpinDoc, "_id" | "_creationTime"> = {
      prizeName: args.prizeName,
      forced: args.forced,
      createdAt: Date.now(),
    };
    if (typeof args.randomBucket === "number") {
      doc.randomBucket = args.randomBucket;
    }
    await ctx.db.insert("wheel_spins", doc);
  },
});

export const stats = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // The wheel UI displays a recent-window disclosure; keep its reactive
    // query small so each spin does not re-read the entire archive.
    const limit = Math.max(1, Math.min(args.limit ?? 2_000, 10_000));
    const recordsWithNext = await ctx.db
      .query("wheel_spins")
      .withIndex("byCreated")
      .order("desc")
      .take(limit + 1);
    const records = recordsWithNext.slice(0, limit);

    const totals = new Map<
      string,
      { count: number; forced: number; lastSpinAt: number | null }
    >();
    let totalSpins = 0;
    let totalForced = 0;
    let mostRecent: number | null = null;

    const register = (doc: WheelSpinDoc) => {
      if (doc.forced) {
        totalForced += 1;
      }
      const current = totals.get(doc.prizeName) ?? {
        count: 0,
        forced: 0,
        lastSpinAt: null,
      };
      if (!doc.forced) current.count += 1;
      if (doc.forced) current.forced += 1;
      current.lastSpinAt = current.lastSpinAt
        ? Math.max(current.lastSpinAt, doc.createdAt)
        : doc.createdAt;
      totals.set(doc.prizeName, current);
      if (!doc.forced) {
        totalSpins += 1;
        mostRecent = mostRecent
          ? Math.max(mostRecent, doc.createdAt)
          : doc.createdAt;
      }
    };

    records.forEach(register);

    const prizeStats = Array.from(totals.entries()).map(
      ([prizeName, info]) => ({
        prizeName,
        count: info.count,
        forcedCount: info.forced,
        lastSpinAt: info.lastSpinAt,
      }),
    );

    return {
      totalSpins,
      totalForced,
      lastSpinAt: mostRecent,
      prizes: prizeStats,
      sampleSize: records.length,
      truncated: recordsWithNext.length > limit,
    };
  },
});
