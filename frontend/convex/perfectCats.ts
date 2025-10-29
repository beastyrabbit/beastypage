import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { createHash } from "crypto";

const INITIAL_RATING = 1500;
const K_FACTOR = 24;
const MINIMUM_POOL_SIZE = 16;
const RECENT_VOTE_SAMPLE = 40;

function stableStringify(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashCatParams(params: unknown): string {
  return createHash("sha1").update(stableStringify(params)).digest("hex");
}

function sanitizeCat(doc: Doc<"perfect_cats">) {
  return {
    id: doc._id,
    rating: doc.rating,
    wins: doc.wins,
    losses: doc.losses,
    appearances: doc.appearances,
    params: doc.params,
  } as const;
}

function pairKey(a: Id<"perfect_cats">, b: Id<"perfect_cats">): string {
  const [first, second] = [a as unknown as string, b as unknown as string].sort();
  return `${first}__${second}`;
}

function pickRandom<T>(items: T[]): T | null {
  if (!items.length) return null;
  const index = Math.floor(Math.random() * items.length);
  return items[index] ?? null;
}

export const registerCats = mutation({
  args: {
    cats: v.array(v.object({ params: v.any() })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const results = [] as Array<ReturnType<typeof sanitizeCat>>;
    for (const entry of args.cats) {
      const hash = hashCatParams(entry.params);
      const existing = await ctx.db
        .query("perfect_cats")
        .withIndex("byHash", (q) => q.eq("hash", hash))
        .unique();
      if (existing) {
        results.push(sanitizeCat(existing));
        continue;
      }
      const insertedId = await ctx.db.insert("perfect_cats", {
        hash,
        params: entry.params,
        rating: INITIAL_RATING,
        wins: 0,
        losses: 0,
        appearances: 0,
        createdAt: now,
        updatedAt: now,
        lastShownAt: undefined,
      });
      const inserted = await ctx.db.get(insertedId);
      if (inserted) {
        results.push(sanitizeCat(inserted));
      }
    }
    return results;
  },
});

type MatchupCat = ReturnType<typeof sanitizeCat>;

type MatchupResponse = {
  cats: MatchupCat[];
  needsSeed: number;
  totalCats: number;
};

export const requestMatchup = mutation({
  args: {
    clientId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MatchupResponse> => {
    const allCats = await ctx.db.query("perfect_cats").collect();
    const totalCats = allCats.length;
    const needsSeed = Math.max(0, MINIMUM_POOL_SIZE - totalCats);

    if (totalCats < 2) {
      return { cats: [], needsSeed, totalCats };
    }

    const candidateMap = new Map<string, Doc<"perfect_cats">>();
    const topRated = await ctx.db
      .query("perfect_cats")
      .withIndex("byRating", (q) => q)
      .order("desc")
      .take(24);
    for (const doc of topRated) {
      candidateMap.set(doc._id as unknown as string, doc);
    }

    const recentlyUpdated = await ctx.db
      .query("perfect_cats")
      .withIndex("byUpdated", (q) => q)
      .order("desc")
      .take(24);
    for (const doc of recentlyUpdated) {
      candidateMap.set(doc._id as unknown as string, doc);
    }

    for (const doc of allCats.slice(0, 40)) {
      candidateMap.set(doc._id as unknown as string, doc);
    }

    const pool = Array.from(candidateMap.values());
    if (pool.length < 2) {
      return { cats: [], needsSeed, totalCats };
    }

    const seenPairs = new Set<string>();
    if (args.clientId) {
      const recentVotes = await ctx.db
        .query("perfect_votes")
        .withIndex("byClient", (q) => q.eq("clientId", args.clientId))
        .order("desc")
        .take(RECENT_VOTE_SAMPLE);
      for (const vote of recentVotes) {
        seenPairs.add(pairKey(vote.catAId, vote.catBId));
      }
    }

    const first = pickRandom(pool);
    if (!first) {
      return { cats: [], needsSeed, totalCats };
    }

    let second: Doc<"perfect_cats"> | null = null;
    const attempts = Math.min(pool.length * 2, 40);
    for (let i = 0; i < attempts; i += 1) {
      const candidate = pickRandom(pool);
      if (!candidate || candidate._id === first._id) continue;
      const key = pairKey(first._id, candidate._id);
      if (seenPairs.has(key) && pool.length > 2) {
        continue;
      }
      second = candidate;
      break;
    }

    if (!second) {
      for (const candidate of pool) {
        if (candidate._id !== first._id) {
          second = candidate;
          break;
        }
      }
    }

    if (!second) {
      return { cats: [], needsSeed, totalCats };
    }

    const now = Date.now();
    await Promise.all([
      ctx.db.patch(first._id, { lastShownAt: now, updatedAt: now }),
      ctx.db.patch(second._id, { lastShownAt: now, updatedAt: now }),
    ]);

    return {
      cats: [sanitizeCat(first), sanitizeCat(second)],
      needsSeed,
      totalCats,
    };
  },
});

export const submitVote = mutation({
  args: {
    clientId: v.optional(v.string()),
    winnerId: v.id("perfect_cats"),
    loserId: v.id("perfect_cats"),
  },
  handler: async (ctx, args) => {
    if (args.winnerId === args.loserId) {
      throw new Error("Winner and loser must be different cats");
    }

    const [winner, loser] = await Promise.all([
      ctx.db.get(args.winnerId),
      ctx.db.get(args.loserId),
    ]);
    if (!winner || !loser) {
      throw new Error("One of the cats no longer exists");
    }

    const expectedWinner = 1 / (1 + 10 ** ((loser.rating - winner.rating) / 400));
    const expectedLoser = 1 / (1 + 10 ** ((winner.rating - loser.rating) / 400));

    const winnerRating = winner.rating + K_FACTOR * (1 - expectedWinner);
    const loserRating = loser.rating + K_FACTOR * (0 - expectedLoser);

    const now = Date.now();
    await Promise.all([
      ctx.db.patch(winner._id, {
        rating: winnerRating,
        wins: winner.wins + 1,
        appearances: winner.appearances + 1,
        updatedAt: now,
        lastShownAt: now,
      }),
      ctx.db.patch(loser._id, {
        rating: loserRating,
        losses: loser.losses + 1,
        appearances: loser.appearances + 1,
        updatedAt: now,
        lastShownAt: now,
      }),
    ]);

    await ctx.db.insert("perfect_votes", {
      catAId: args.winnerId,
      catBId: args.loserId,
      winnerId: args.winnerId,
      clientId: args.clientId ?? undefined,
      createdAt: now,
    });

    return {
      winner: { id: args.winnerId, rating: winnerRating },
      loser: { id: args.loserId, rating: loserRating },
    };
  },
});

export const leaderboard = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 20, 100));
    const cats = await ctx.db
      .query("perfect_cats")
      .withIndex("byRating", (q) => q)
      .order("desc")
      .take(limit);
    return cats.map((doc) => sanitizeCat(doc));
  },
});
