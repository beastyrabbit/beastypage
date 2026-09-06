import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel.js";
import { mutation, query } from "./_generated/server.js";
import { listLimit, requireHost } from "./streamAccess.js";
import { docIdToString } from "./utils.js";

type VoteDoc = Doc<"stream_votes">;

export const list = query({
  args: {
    session: v.id("stream_sessions"),
    stepId: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.session);
    if (!session) return [];
    let votes = await ctx.db
      .query("stream_votes")
      .withIndex("by_sessionId_and_voteRound", (q) =>
        q.eq("sessionId", args.session).eq("voteRound", session.voteRound ?? 0),
      )
      .take(listLimit(args.limit));
    votes = votes.filter(
      (vDoc) => docIdToString(vDoc.sessionId) === docIdToString(args.session),
    );
    if (args.stepId) {
      votes = votes.filter((vDoc) => (vDoc.stepId ?? "") === args.stepId);
    }
    votes.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    return votes.slice(0, args.limit).map(streamVoteToClient);
  },
});

export const create = mutation({
  args: {
    viewerSession: v.optional(v.string()),
    voteRound: v.optional(v.number()),
    sessionId: v.id("stream_sessions"),
    stepId: v.string(),
    optionKey: v.string(),
    optionMeta: v.optional(v.any()),
    votedBy: v.optional(v.id("stream_participants")),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (
      !session ||
      session.status !== "live" ||
      session.currentStep !== args.stepId ||
      args.voteRound !== (session.voteRound ?? 0)
    )
      throw new Error("This voting round is no longer active");
    if (
      !session.allowedOptions?.includes(args.optionKey) ||
      session.params?._disabledOptions?.[args.stepId]?.includes(args.optionKey)
    )
      throw new Error("Choice is not available");
    const tieFilter = session.params?._tieFilter;
    if (
      Array.isArray(tieFilter) &&
      tieFilter.length &&
      !tieFilter.includes(args.optionKey)
    )
      throw new Error("Choice is not in the tie-break");
    let optionMeta: Record<string, unknown>;
    if (args.votedBy) {
      if (session.params?._votesOpen !== true)
        throw new Error("Voting is closed");
      const participant = await ctx.db.get(args.votedBy);
      if (
        !participant ||
        participant.sessionId !== session._id ||
        participant.status !== "active" ||
        !participant.viewerSession ||
        participant.viewerSession !== args.viewerSession
      )
        throw new Error("Not an active participant");
      const duplicate = await ctx.db
        .query("stream_votes")
        .withIndex("by_sessionId_and_voteRound_and_votedBy", (q) =>
          q
            .eq("sessionId", session._id)
            .eq("voteRound", session.voteRound ?? 0)
            .eq("votedBy", participant._id),
        )
        .first();
      if (duplicate) throw new Error("You have already voted in this round");
      optionMeta = {
        participantId: docIdToString(participant._id),
        participantName: participant.displayName,
      };
    } else {
      await requireHost(ctx, session);
      optionMeta = { streamer: true };
      // Preserve presentation/provenance only after verifying host authority.
      for (const key of ["label", "step"] as const) {
        if (typeof args.optionMeta?.[key] === "string")
          optionMeta[key] = args.optionMeta[key].slice(0, 160);
      }
      if (args.optionMeta?.via === "coinFlip") optionMeta.via = "coinFlip";
    }
    const nowTs = Date.now();
    const insertDoc = {
      sessionId: args.sessionId,
      voteRound: session.voteRound ?? 0,
      stepId: args.stepId,
      optionKey: args.optionKey,
      createdAt: nowTs,
      updatedAt: nowTs,
      optionMeta,
      ...(args.votedBy ? { votedBy: args.votedBy } : {}),
    };
    const id = await ctx.db.insert("stream_votes", insertDoc);
    const doc = await ctx.db.get(id);
    return doc ? streamVoteToClient(doc) : null;
  },
});

function streamVoteToClient(doc: VoteDoc) {
  return {
    id: docIdToString(doc._id),
    session: docIdToString(doc.sessionId),
    step_id: doc.stepId,
    option_key: doc.optionKey,
    option_meta: doc.optionMeta ?? null,
    votedby: doc.votedBy
      ? docIdToString(doc.votedBy as Id<"stream_participants">)
      : null,
    created: doc.createdAt,
    updated: doc.updatedAt,
  };
}
