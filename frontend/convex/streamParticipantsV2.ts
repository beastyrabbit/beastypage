import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import { mutation, query } from "./_generated/server.js";
import { listLimit, requireHost } from "./streamAccess.js";
import { docIdToString } from "./utils.js";

type ParticipantDoc = Doc<"stream_participants">;

export const list = query({
  args: {
    session: v.id("stream_sessions"),
    viewerSession: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.session);
    if (!session) return [];
    if (!args.viewerSession) await requireHost(ctx, session);
    const source = args.viewerSession
      ? ctx.db
          .query("stream_participants")
          .withIndex("by_sessionId_and_viewerSession", (q) =>
            q
              .eq("sessionId", args.session)
              .eq("viewerSession", args.viewerSession),
          )
      : ctx.db
          .query("stream_participants")
          .withIndex("bySession", (q) => q.eq("sessionId", args.session));
    let participants = await source.take(listLimit(args.limit));
    participants = participants.filter(
      (p) => docIdToString(p.sessionId) === docIdToString(args.session),
    );
    if (args.viewerSession) {
      participants = participants.filter(
        (p) => (p.viewerSession ?? "") === args.viewerSession,
      );
    }
    participants.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    return participants.slice(0, args.limit).map(streamParticipantToClient);
  },
});

export const get = query({
  args: {
    id: v.id("stream_participants"),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    return doc ? streamParticipantToClient(doc) : null;
  },
});

export const create = mutation({
  args: {
    sessionId: v.id("stream_sessions"),
    viewerSession: v.optional(v.string()),
    displayName: v.string(),
    status: v.string(),
    fingerprint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const nowTs = Date.now();
    const session = await ctx.db.get(args.sessionId);
    if (
      !session ||
      session.status === "completed" ||
      session.params?._signupsOpen === false
    )
      throw new Error("Signups are closed");
    if (!args.viewerSession || args.viewerSession.length < 32)
      throw new Error("A private participant token is required");
    const existing = await ctx.db
      .query("stream_participants")
      .withIndex("by_sessionId_and_viewerSession", (q) =>
        q
          .eq("sessionId", args.sessionId)
          .eq("viewerSession", args.viewerSession),
      )
      .first();
    if (existing) return streamParticipantToClient(existing);
    if (!session.allowRepeatIps && args.fingerprint) {
      const duplicate = await ctx.db
        .query("stream_participants")
        .withIndex("by_sessionId_and_fingerprint", (q) =>
          q.eq("sessionId", args.sessionId).eq("fingerprint", args.fingerprint),
        )
        .first();
      if (duplicate) throw new Error("This device has already joined");
    }
    if (
      args.status !== "active" ||
      !args.displayName.trim() ||
      args.displayName.length > 40
    )
      throw new Error("Invalid participant");
    const insertDoc = {
      sessionId: args.sessionId,
      displayName: args.displayName,
      status: args.status,
      createdAt: nowTs,
      updatedAt: nowTs,
      ...(args.viewerSession !== undefined
        ? { viewerSession: args.viewerSession }
        : {}),
      ...(args.fingerprint !== undefined
        ? { fingerprint: args.fingerprint }
        : {}),
    };
    const id = await ctx.db.insert("stream_participants", insertDoc);
    const doc = await ctx.db.get(id);
    return doc ? streamParticipantToClient(doc) : null;
  },
});

export const update = mutation({
  args: {
    id: v.id("stream_participants"),
    displayName: v.optional(v.string()),
    status: v.optional(v.string()),
    fingerprint: v.optional(v.string()),
    viewerSession: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) return null;
    const session = await ctx.db.get(doc.sessionId);
    if (!session) throw new Error("Session not found");
    await requireHost(ctx, session);
    const updated = {
      ...doc,
      displayName: args.displayName ?? doc.displayName,
      status: args.status ?? doc.status,
      updatedAt: Date.now(),
      ...(args.fingerprint !== undefined
        ? { fingerprint: args.fingerprint }
        : {}),
      ...(args.viewerSession !== undefined
        ? { viewerSession: args.viewerSession }
        : {}),
    };
    await ctx.db.replace(args.id, updated);
    return streamParticipantToClient(updated);
  },
});

function streamParticipantToClient(doc: ParticipantDoc) {
  return {
    id: docIdToString(doc._id),
    session: docIdToString(doc.sessionId),
    display_name: doc.displayName,
    status: doc.status,
    created: doc.createdAt,
    updated: doc.updatedAt,
  };
}
