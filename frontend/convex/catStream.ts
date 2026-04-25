import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server.js";
import { mutation, query } from "./_generated/server.js";
import { wheelSpinValidator } from "./schema.js";

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

/** Helper: get the authenticated user's stream session or throw. */
async function requireSession(ctx: MutationCtx) {
  const user = await requireUser(ctx);
  const session = await ctx.db
    .query("cat_stream_sessions")
    .withIndex("byUserId", (q) => q.eq("userId", user._id))
    .unique();
  if (!session) throw new Error("No stream session found");
  return session;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Get the authenticated user's stream session, if one exists.
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
 * Ensure the user's stream session exists. When settings are supplied, apply
 * them to an existing session or seed them into a newly created session.
 */
export const ensureSession = mutation({
  args: { settings: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const existing = await ctx.db
      .query("cat_stream_sessions")
      .withIndex("byUserId", (q) => q.eq("userId", user._id))
      .unique();
    if (existing) {
      if (args.settings !== undefined) {
        await ctx.db.patch(existing._id, {
          settings: args.settings,
          updatedAt: Date.now(),
        });
      }
      return existing._id;
    }

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
    const session = await requireSession(ctx);
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
    wheelSpin: v.optional(wheelSpinValidator),
    countdownSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx);
    const prevSeq = session.currentCommand?.seq ?? 0;

    const command: Record<string, unknown> = {
      type: "spin" as const,
      seq: prevSeq + 1,
      params: args.params,
      timestamp: Date.now(),
    };
    if (args.slots !== undefined) command.slots = args.slots;
    if (args.wheelSpin !== undefined) command.wheelSpin = args.wheelSpin;
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
 * Trigger only the wheel reward for the active cat on the OBS overlay.
 */
export const triggerWheel = mutation({
  args: {
    params: v.any(),
    slots: v.optional(v.any()),
    wheelSpin: wheelSpinValidator,
  },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx);
    const prevSeq = session.currentCommand?.seq ?? 0;

    await ctx.db.patch(session._id, {
      status: "active" as const,
      currentCommand: {
        type: "wheel",
        seq: prevSeq + 1,
        params: args.params,
        slots: args.slots,
        wheelSpin: args.wheelSpin,
        timestamp: Date.now(),
      },
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
    const session = await requireSession(ctx);
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
    const session = await requireSession(ctx);
    const prevSeq = session.currentCommand?.seq ?? 0;
    await ctx.db.patch(session._id, {
      status: "active",
      currentCommand: { type: "brb", seq: prevSeq + 1, timestamp: Date.now() },
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
    const session = await requireSession(ctx);
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
    const session = await requireSession(ctx);
    const prevSeq = session.currentCommand?.seq ?? 0;
    await ctx.db.patch(session._id, {
      testMode: !session.testMode,
      currentCommand: { type: "test", seq: prevSeq + 1, timestamp: Date.now() },
      updatedAt: Date.now(),
    });
  },
});
