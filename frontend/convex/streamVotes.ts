import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel.js";
import { docIdToString } from "./utils.js";

type VoteDoc = Doc<"stream_votes">;

export const list = query({
  args: {
    session: v.id("stream_sessions"),
    stepId: v.optional(v.string()),
    limit: v.number()
  },
  handler: async (ctx, args) => {
    let votes = await ctx.db.query("stream_votes").collect();
    votes = votes.filter((vDoc) => docIdToString(vDoc.sessionId) === docIdToString(args.session));
    if (args.stepId) {
      votes = votes.filter((vDoc) => (vDoc.stepId ?? "") === args.stepId);
    }
    votes.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    return votes.slice(0, args.limit).map(streamVoteToClient);
  }
});

export const create = mutation({
  args: {
    sessionId: v.id("stream_sessions"),
    stepId: v.string(),
    optionKey: v.string(),
    optionMeta: v.optional(v.any()),
    votedBy: v.optional(v.id("stream_participants"))
  },
  handler: async (ctx, args) => {
    const nowTs = Date.now();
    const insertDoc = {
      sessionId: args.sessionId,
      stepId: args.stepId,
      optionKey: args.optionKey,
      createdAt: nowTs,
      updatedAt: nowTs,
      ...(args.optionMeta !== undefined ? { optionMeta: args.optionMeta } : {}),
      ...(args.votedBy ? { votedBy: args.votedBy } : {})
    };
    const id = await ctx.db.insert("stream_votes", insertDoc);
    const doc = await ctx.db.get(id);
    return doc ? streamVoteToClient(doc) : null;
  }
});

function streamVoteToClient(doc: VoteDoc) {
  return {
    id: docIdToString(doc._id),
    session: docIdToString(doc.sessionId),
    step_id: doc.stepId,
    option_key: doc.optionKey,
    option_meta: doc.optionMeta ?? null,
    votedby: doc.votedBy ? docIdToString(doc.votedBy as Id<"stream_participants">) : null,
    created: doc.createdAt,
    updated: doc.updatedAt
  };
}
