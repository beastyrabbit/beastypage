import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server.js";
import { mutation, query } from "./_generated/server.js";

/** Helper: get the authenticated user or throw. */
async function requireUser(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const user = await ctx.db
    .query("users")
    .withIndex("byTokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
  if (!user) throw new Error("User not found");
  return user;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Get or create the authenticated user's stream session.
 */
export const getSession = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("byTokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) return null;

    return ctx.db
      .query("cat_stream_sessions")
      .withIndex("byUserId", (q) => q.eq("userId", user._id))
      .unique();
  },
});

/**
 * Look up a stream session by API key. Used by the OBS overlay page.
 * Returns only session data — no user PII is exposed.
 */
export const getSessionByApiKey = query({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("byApiKey", (q) => q.eq("apiKey", args.apiKey))
      .unique();
    if (!user) return null;

    return ctx.db
      .query("cat_stream_sessions")
      .withIndex("byUserId", (q) => q.eq("userId", user._id))
      .unique();
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Ensure the user's stream session exists. Called from the control page on mount.
 */
export const ensureSession = mutation({
  args: { settings: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const existing = await ctx.db
      .query("cat_stream_sessions")
      .withIndex("byUserId", (q) => q.eq("userId", user._id))
      .unique();
    if (existing) return existing._id;

    return ctx.db.insert("cat_stream_sessions", {
      userId: user._id,
      status: "idle",
      settings: args.settings ?? {},
      testMode: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update the session's settings snapshot.
 */
export const updateSettings = mutation({
  args: { settings: v.any() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const session = await ctx.db
      .query("cat_stream_sessions")
      .withIndex("byUserId", (q) => q.eq("userId", user._id))
      .unique();
    if (!session) throw new Error("No stream session found");

    await ctx.db.patch(session._id, {
      settings: args.settings,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Trigger a spin on the OBS overlay. The control page generates the cat
 * params client-side and sends them here.
 */
export const triggerSpin = mutation({
  args: {
    params: v.any(),
    slots: v.optional(v.any()),
    countdownSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const session = await ctx.db
      .query("cat_stream_sessions")
      .withIndex("byUserId", (q) => q.eq("userId", user._id))
      .unique();
    if (!session) throw new Error("No stream session found");

    const prevSeq = session.currentCommand?.seq ?? 0;

    const command: Record<string, unknown> = {
      type: "spin" as const,
      seq: prevSeq + 1,
      params: args.params,
      timestamp: Date.now(),
    };
    if (args.slots !== undefined) command.slots = args.slots;
    if (args.countdownSeconds !== undefined)
      command.countdownSeconds = args.countdownSeconds;

    await ctx.db.patch(session._id, {
      status: "active" as const,
      currentCommand: command as typeof session.currentCommand,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Send a lobby command so the OBS overlay shows the pre-spin lobby.
 */
export const showLobby = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const session = await ctx.db
      .query("cat_stream_sessions")
      .withIndex("byUserId", (q) => q.eq("userId", user._id))
      .unique();
    if (!session) throw new Error("No stream session found");

    const prevSeq = session.currentCommand?.seq ?? 0;

    await ctx.db.patch(session._id, {
      status: "active",
      currentCommand: {
        type: "lobby",
        seq: prevSeq + 1,
        timestamp: Date.now(),
      },
      updatedAt: Date.now(),
    });
  },
});

/**
 * Send a BRB command — lobby cats without the settings table.
 */
export const showBrb = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const session = await ctx.db
      .query("cat_stream_sessions")
      .withIndex("byUserId", (q) => q.eq("userId", user._id))
      .unique();
    if (!session) throw new Error("No stream session found");

    const prevSeq = session.currentCommand?.seq ?? 0;

    await ctx.db.patch(session._id, {
      status: "active",
      currentCommand: {
        type: "brb",
        seq: prevSeq + 1,
        timestamp: Date.now(),
      },
      updatedAt: Date.now(),
    });
  },
});

/**
 * Clear the overlay (hide everything).
 */
export const clearOverlay = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const session = await ctx.db
      .query("cat_stream_sessions")
      .withIndex("byUserId", (q) => q.eq("userId", user._id))
      .unique();
    if (!session) throw new Error("No stream session found");

    const prevSeq = session.currentCommand?.seq ?? 0;

    await ctx.db.patch(session._id, {
      status: "idle",
      currentCommand: {
        type: "clear",
        seq: prevSeq + 1,
        timestamp: Date.now(),
      },
      updatedAt: Date.now(),
    });
  },
});

/**
 * Toggle test mode on the overlay.
 */
export const toggleTestMode = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const session = await ctx.db
      .query("cat_stream_sessions")
      .withIndex("byUserId", (q) => q.eq("userId", user._id))
      .unique();
    if (!session) throw new Error("No stream session found");

    const prevSeq = session.currentCommand?.seq ?? 0;
    const newTestMode = !session.testMode;

    await ctx.db.patch(session._id, {
      testMode: newTestMode,
      currentCommand: {
        type: "test",
        seq: prevSeq + 1,
        timestamp: Date.now(),
      },
      updatedAt: Date.now(),
    });
  },
});
