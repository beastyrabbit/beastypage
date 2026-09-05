import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import { mutation, query } from "./_generated/server.js";
import { listLimit, requireHost } from "./streamAccess.js";
import { docIdToString } from "./utils.js";

type SessionDoc = Doc<"stream_sessions">;

export const list = query({
  args: {
    status: v.optional(v.string()),
    exclude: v.optional(v.string()),
    viewerKey: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    // Older host clients request exclude=completed. Owned sessions have two
    // supported states, so use the same indexed live query for that request.
    const status =
      args.status ?? (args.exclude === "completed" ? "live" : undefined);
    const source = args.viewerKey
      ? ctx.db
          .query("stream_sessions")
          .withIndex("byViewerKey", (q) => q.eq("viewerKey", args.viewerKey!))
      : status
        ? ctx.db
            .query("stream_sessions")
            .withIndex(
              "by_ownerTokenIdentifier_and_status_and_updatedAt",
              (q) =>
                q
                  .eq("ownerTokenIdentifier", identity?.tokenIdentifier)
                  .eq("status", status),
            )
        : ctx.db
            .query("stream_sessions")
            .withIndex("by_ownerTokenIdentifier_and_updatedAt", (q) =>
              q.eq("ownerTokenIdentifier", identity?.tokenIdentifier),
            );
    if (!args.viewerKey && !identity) return [];
    let sessions = await source.order("desc").take(listLimit(args.limit));
    if (args.status) {
      const target = args.status.toLowerCase();
      sessions = sessions.filter(
        (s) => (s.status ?? "").toLowerCase() === target,
      );
    }
    if (args.exclude) {
      const target = args.exclude.toLowerCase();
      sessions = sessions.filter(
        (s) => (s.status ?? "").toLowerCase() !== target,
      );
    }
    if (args.viewerKey) {
      const target = args.viewerKey.toLowerCase();
      sessions = sessions.filter(
        (s) => (s.viewerKey ?? "").toLowerCase() === target,
      );
    }
    sessions.sort(
      (a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt),
    );
    return sessions.slice(0, args.limit).map(streamSessionToClient);
  },
});

export const get = query({
  args: {
    id: v.id("stream_sessions"),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    return doc ? streamSessionToClient(doc) : null;
  },
});

export const create = mutation({
  args: {
    allowedOptions: v.optional(v.array(v.string())),
    viewerKey: v.string(),
    status: v.union(v.literal("live"), v.literal("completed")),
    currentStep: v.optional(v.string()),
    stepIndex: v.optional(v.number()),
    stepHistory: v.optional(v.any()),
    params: v.optional(v.any()),
    allowRepeatIps: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const nowTs = Date.now();
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to host a session");
    if (args.allowedOptions && args.allowedOptions.length > 2000)
      throw new Error("Too many choices");
    const insertDoc = {
      ownerTokenIdentifier: identity.tokenIdentifier,
      voteRound: 0,
      allowedOptions: args.allowedOptions ?? [],
      viewerKey: args.viewerKey,
      status: args.status,
      stepIndex: args.stepIndex ?? 0,
      stepHistory: args.stepHistory ?? [],
      params: args.params ?? {},
      allowRepeatIps: Boolean(args.allowRepeatIps ?? false),
      createdAt: nowTs,
      updatedAt: nowTs,
      ...(args.currentStep !== undefined
        ? { currentStep: args.currentStep }
        : {}),
    };
    const id = await ctx.db.insert("stream_sessions", insertDoc);
    const doc = await ctx.db.get(id);
    return doc ? streamSessionToClient(doc) : null;
  },
});

export const update = mutation({
  args: {
    allowedOptions: v.optional(v.array(v.string())),
    id: v.id("stream_sessions"),
    viewerKey: v.optional(v.string()),
    status: v.optional(v.union(v.literal("live"), v.literal("completed"))),
    currentStep: v.optional(v.string()),
    stepIndex: v.optional(v.number()),
    stepHistory: v.optional(v.any()),
    params: v.optional(v.any()),
    allowRepeatIps: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) return null;
    await requireHost(ctx, doc);
    if (args.allowedOptions && args.allowedOptions.length > 2000)
      throw new Error("Too many choices");
    const roundChanged =
      (args.currentStep !== undefined &&
        args.currentStep !== doc.currentStep) ||
      (args.stepIndex !== undefined && args.stepIndex !== doc.stepIndex) ||
      (args.params !== undefined &&
        (args.params?._tieIteration ?? 0) > (doc.params?._tieIteration ?? 0));
    const updated = {
      ...doc,
      voteRound: (doc.voteRound ?? 0) + (roundChanged ? 1 : 0),
      allowedOptions:
        args.allowedOptions ?? (roundChanged ? [] : doc.allowedOptions),
      viewerKey: args.viewerKey ?? doc.viewerKey,
      status: args.status ?? doc.status,
      updatedAt: Date.now(),
      ...(args.currentStep !== undefined
        ? { currentStep: args.currentStep }
        : {}),
      ...(args.stepIndex !== undefined ? { stepIndex: args.stepIndex } : {}),
      ...(args.stepHistory !== undefined
        ? { stepHistory: args.stepHistory }
        : {}),
      ...(args.params !== undefined ? { params: args.params } : {}),
      ...(args.allowRepeatIps !== undefined
        ? { allowRepeatIps: Boolean(args.allowRepeatIps) }
        : {}),
    };
    await ctx.db.replace(args.id, updated);
    return streamSessionToClient(updated);
  },
});

function streamSessionToClient(doc: SessionDoc) {
  return {
    id: docIdToString(doc._id),
    viewer_key: doc.viewerKey,
    status: doc.status,
    current_step: doc.currentStep,
    step_index: doc.stepIndex ?? 0,
    step_history: doc.stepHistory ?? [],
    params: doc.params ?? {},
    vote_round: doc.voteRound ?? 0,
    allow_repeat_ips: Boolean(doc.allowRepeatIps),
    created: doc.createdAt,
    updated: doc.updatedAt,
  };
}
