import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import { docIdToString } from "./utils.js";

const MAX_NAME_LENGTH = 12;
const MAX_LEADERBOARD_LIMIT = 50;
const MAX_SCORE_ARCHIVE_LIMIT = 500;

type ScoreDoc = Doc<"coinflipper_scores">;

export type ScoreRecord = {
  id: string;
  name: string;
  score: number;
  createdAt: number;
};

function sanitizeName(raw: string): string {
  return raw.trim().slice(0, MAX_NAME_LENGTH);
}

function toClient(doc: ScoreDoc): ScoreRecord {
  return {
    id: docIdToString(doc._id),
    name: doc.playerName,
    score: doc.score,
    createdAt: doc.createdAt
  };
}

export const leaderboard = query({
  args: {
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const limit = args.limit && args.limit > 0 ? Math.min(args.limit, MAX_LEADERBOARD_LIMIT) : 10;
    const docs = await ctx.db
      .query("coinflipper_scores")
      .withIndex("byScore")
      .order("desc")
      .take(limit);
    return docs.map(toClient);
  }
});

export const listScores = query({
  args: {
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const limit = args.limit && args.limit > 0 ? Math.min(args.limit, MAX_SCORE_ARCHIVE_LIMIT) : 200;
    const docs = await ctx.db
      .query("coinflipper_scores")
      .withIndex("byScore")
      .order("desc")
      .take(limit);
    return docs.map(toClient);
  }
});

export const submitScore = mutation({
  args: {
    name: v.string(),
    score: v.number()
  },
  handler: async (ctx, args) => {
    const name = sanitizeName(args.name);
    if (!name) {
      throw new Error("Name must be provided");
    }

    const score = Number.isFinite(args.score) ? Math.floor(args.score) : 0;
    if (score <= 0) {
      throw new Error("Score must be greater than zero");
    }

    const now = Date.now();

    const id = await ctx.db.insert("coinflipper_scores", {
      playerName: name,
      score,
      createdAt: now
    });

    const inserted = await ctx.db.get(id);
    if (!inserted) {
      throw new Error("Failed to load inserted score");
    }

    return toClient(inserted);
  }
});
