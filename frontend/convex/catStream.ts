import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server.js";
import { mutation, query } from "./_generated/server.js";
import { batchCommandValidator, evolutionCommandValidator } from "./schema.js";
import { buildStreamWheelUpdate, pickStreamWheelSpin } from "./streamWheel.js";

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
 * Merge a partial update into the session's settings server-side. Used for
 * the instant per-field syncs (lobby sliders, overlay appearance, mode info
 * cards) so concurrent writers can't clobber each other's fields.
 */
export const mergeSettings = mutation({
  args: { settings: v.any() },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx);
    const current = (session.settings ?? {}) as Record<string, unknown>;
    await ctx.db.patch(session._id, {
      settings: { ...current, ...(args.settings as Record<string, unknown>) },
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
    const session = await requireSession(ctx);
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

    return prevSeq + 1;
  },
});

/**
 * Attach the saved share slug to the in-flight spin command so the overlay
 * can show a QR code for it. Does NOT bump `seq` — the overlay must not
 * re-dispatch the command, only pick up the slug.
 */
export const attachViewSlug = mutation({
  args: { seq: v.number(), slug: v.string() },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx);
    const command = session.currentCommand;
    if (!command) return;
    // Race guard: a newer command may have replaced the spin by the time the
    // history save finishes — never stamp a slug onto an unrelated command.
    // One exception: a wheel started before the save finished replaces the
    // spin with a wheel command derived from it (same cat, seq + 1,
    // lastWheelSpinForSeq points at the spin) — the QR belongs on it too.
    const isSameSpin = command.type === "spin" && command.seq === args.seq;
    const isDerivedWheel =
      command.type === "wheel" &&
      command.seq === args.seq + 1 &&
      session.lastWheelSpinForSeq === args.seq;
    if (!isSameSpin && !isDerivedWheel) {
      return;
    }
    await ctx.db.patch(session._id, {
      currentCommand: { ...command, viewSlug: args.slug },
      updatedAt: Date.now(),
    });
  },
});

/**
 * Trigger only the wheel reward for the active cat on the OBS overlay.
 */
export const triggerWheel = mutation({
  args: {},
  handler: async (ctx) => {
    const session = await requireSession(ctx);
    const sourceCommand = session.currentCommand;
    if (
      !sourceCommand ||
      sourceCommand.type !== "spin" ||
      sourceCommand.params === undefined
    ) {
      throw new Error("Spin a cat before spinning the wheel.");
    }
    if (session.lastWheelSpinForSeq === sourceCommand.seq) {
      throw new Error("Wheel already spun for this cat.");
    }
    const now = Date.now();
    const wheelSpin = pickStreamWheelSpin();
    const wheelUpdate = buildStreamWheelUpdate(session, wheelSpin, now);

    await ctx.db.insert("wheel_spins", wheelUpdate.wheelLog);

    await ctx.db.patch(session._id, wheelUpdate.patch);

    return wheelSpin;
  },
});

/**
 * Start an evolution ceremony on the OBS overlay. The batch is already
 * generated and saved by the control page — the payload carries the saved
 * slug plus params-only cat data for the overlay to re-render.
 */
export const triggerEvolution = mutation({
  args: { evolution: evolutionCommandValidator },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx);
    const prevSeq = session.currentCommand?.seq ?? 0;
    await ctx.db.patch(session._id, {
      status: "active" as const,
      currentCommand: {
        type: "evolution" as const,
        seq: prevSeq + 1,
        evolution: args.evolution,
        timestamp: Date.now(),
      },
      updatedAt: Date.now(),
    });
    return prevSeq + 1;
  },
});

/**
 * Start a batch elimination show on the OBS overlay. The control page
 * generates the full starting pool upfront (params only); the finalists
 * are saved later, once culling is done, and the slug is attached via
 * attachBatchSlug.
 */
export const triggerBatch = mutation({
  args: { batch: batchCommandValidator },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx);
    const prevSeq = session.currentCommand?.seq ?? 0;
    const seq = prevSeq + 1;
    await ctx.db.patch(session._id, {
      status: "active" as const,
      currentCommand: {
        type: "batch" as const,
        seq,
        batch: args.batch,
        timestamp: Date.now(),
      },
      batchState: {
        seq,
        stageIndex: 0,
        awaitingCull: false,
        eliminatedIds: [],
      },
      updatedAt: Date.now(),
    });
    return seq;
  },
});

/**
 * Overlay → session: report which reveal stage is playing and whether the
 * show is waiting for the streamer to cull. ApiKey-authenticated, like the
 * overlay's session query.
 */
export const reportBatchStage = mutation({
  args: {
    apiKey: v.string(),
    seq: v.number(),
    stageIndex: v.number(),
    awaitingCull: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("byApiKey", (q) => q.eq("apiKey", args.apiKey))
      .unique();
    if (!user) throw new Error("Unknown API key");
    const session = await ctx.db
      .query("cat_stream_sessions")
      .withIndex("byUserId", (q) => q.eq("userId", user._id))
      .unique();
    if (!session) throw new Error("No stream session found");
    const command = session.currentCommand;
    if (!command || command.type !== "batch" || command.seq !== args.seq) {
      return;
    }
    const previous =
      session.batchState?.seq === args.seq
        ? session.batchState
        : {
            seq: args.seq,
            stageIndex: 0,
            awaitingCull: false,
            eliminatedIds: [],
          };
    // Two overlay instances can report independently (the OBS source plus
    // the control page's preview iframe). Never let a slower instance
    // rewind the live state:
    // - reports for an earlier stage are stale;
    // - re-opening the cull prompt for a stage whose cull already landed
    //   would make the control board ask for a second cull;
    // - the only legit way out of awaitingCull on the same stage is the
    //   cull itself, never a report.
    if (args.stageIndex < previous.stageIndex) return;
    if (args.stageIndex === previous.stageIndex) {
      if (args.awaitingCull && previous.eliminatedIds.length > args.stageIndex)
        return;
      if (!args.awaitingCull && previous.awaitingCull) return;
    }
    await ctx.db.patch(session._id, {
      batchState: {
        ...previous,
        stageIndex: args.stageIndex,
        awaitingCull: args.awaitingCull,
      },
      updatedAt: Date.now(),
    });
  },
});

/**
 * Control page → session: mark a cat as the removal candidate so viewers
 * see who is on the chopping block before the actual cull.
 */
export const markBatchCat = mutation({
  args: { seq: v.number(), catId: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx);
    const command = session.currentCommand;
    const state = session.batchState;
    if (
      !command ||
      command.type !== "batch" ||
      command.seq !== args.seq ||
      !state ||
      state.seq !== args.seq
    ) {
      return;
    }
    const { markedId: _previousMark, ...rest } = state;
    await ctx.db.patch(session._id, {
      batchState: args.catId ? { ...rest, markedId: args.catId } : rest,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Control page → session: toggle a highlight on a batch cat. "potential"
 * (maybe leaves next, shown yellow) resets after every cull, "favorite"
 * persists across culls, "spotlight" shows the cat enlarged on the overlay
 * and the control board (only one at a time — toggling another cat moves it).
 */
export const setBatchHighlight = mutation({
  args: {
    seq: v.number(),
    catId: v.string(),
    kind: v.union(
      v.literal("potential"),
      v.literal("favorite"),
      v.literal("spotlight"),
    ),
  },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx);
    const command = session.currentCommand;
    const state = session.batchState;
    if (
      !command ||
      command.type !== "batch" ||
      command.seq !== args.seq ||
      !state ||
      state.seq !== args.seq
    ) {
      return;
    }
    if (args.kind === "spotlight") {
      const { spotlightId: previous, ...rest } = state;
      await ctx.db.patch(session._id, {
        batchState:
          previous === args.catId ? rest : { ...rest, spotlightId: args.catId },
        updatedAt: Date.now(),
      });
      return;
    }
    const key = args.kind === "potential" ? "potentialIds" : "favoriteIds";
    const current = state[key] ?? [];
    const next = current.includes(args.catId)
      ? current.filter((id) => id !== args.catId)
      : [...current, args.catId];
    await ctx.db.patch(session._id, {
      batchState: { ...state, [key]: next },
      updatedAt: Date.now(),
    });
  },
});

/**
 * Control page → session: cull one cat during a batch elimination. Only
 * valid while the overlay is waiting for a cull, and never below the
 * configured finalist count.
 */
export const cullBatchCat = mutation({
  args: { seq: v.number(), catId: v.string() },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx);
    const command = session.currentCommand;
    if (!command || command.type !== "batch" || command.seq !== args.seq) {
      throw new Error("No matching batch is running.");
    }
    const batch = command.batch;
    const state = session.batchState;
    if (!batch || !state || state.seq !== args.seq) {
      throw new Error("Batch state is out of sync.");
    }
    if (!state.awaitingCull) {
      throw new Error("The overlay is not waiting for a cull right now.");
    }
    if (state.eliminatedIds.includes(args.catId)) {
      throw new Error("That cat was already removed.");
    }
    if (!batch.cats.some((cat) => cat.id === args.catId)) {
      throw new Error("Unknown cat.");
    }
    const maxEliminations = batch.cats.length - batch.finalCount;
    if (state.eliminatedIds.length >= maxEliminations) {
      throw new Error("All eliminations are done.");
    }
    // Transient marks (removal candidate, potentials, spotlight) reset with
    // every cull; favourites persist for the whole show.
    const {
      markedId: _clearedMark,
      potentialIds: _clearedPotentials,
      spotlightId: _clearedSpotlight,
      ...rest
    } = state;
    await ctx.db.patch(session._id, {
      batchState: {
        ...rest,
        awaitingCull: false,
        eliminatedIds: [...state.eliminatedIds, args.catId],
      },
      updatedAt: Date.now(),
    });
  },
});

/**
 * Attach the saved adoption-batch slug to the running batch command so the
 * overlay can show the QR code. Does NOT bump `seq`.
 */
export const attachBatchSlug = mutation({
  args: { seq: v.number(), slug: v.string() },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx);
    const command = session.currentCommand;
    if (
      !command ||
      command.type !== "batch" ||
      command.seq !== args.seq ||
      !command.batch
    ) {
      return;
    }
    await ctx.db.patch(session._id, {
      currentCommand: {
        ...command,
        batch: { ...command.batch, slug: args.slug },
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
    await ctx.db.patch(session._id, {
      testMode: !session.testMode,
      updatedAt: Date.now(),
    });
  },
});
