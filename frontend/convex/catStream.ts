import { type Infer, v } from "convex/values";
import { internal } from "./_generated/api.js";
import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx } from "./_generated/server.js";
import { internalMutation, mutation, query } from "./_generated/server.js";
import {
  batchCommandValidator,
  type batchStateValidator,
  evolutionCommandValidator,
  type evolutionStateValidator,
} from "./schema.js";
import { buildStreamWheelUpdate, pickStreamWheelSpin } from "./streamWheel.js";

type BatchState = Infer<typeof batchStateValidator>;
type EvolutionState = Infer<typeof evolutionStateValidator>;

/** Verdict window armed by cullBatchCat. Keep in sync with lib/adoption/streamBatch.ts BATCH_VERDICT_MS. */
const VERDICT_MS = 3000;
/** A verdict whose finalize never ran is "expired" after verdictAt + this. */
const VERDICT_GRACE_MS = 10_000;
/** Hold auto-releases after this. Keep in sync with lib/evolution/streamEvolution.ts EVOLUTION_HOLD_MAX_MS. */
const HOLD_MAX_MS = 90_000;

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
    if (sourceCommand?.type !== "spin" || sourceCommand.params === undefined) {
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
    const seq = prevSeq + 1;
    await ctx.db.patch(session._id, {
      status: "active" as const,
      currentCommand: {
        type: "evolution" as const,
        seq,
        evolution: args.evolution,
        timestamp: Date.now(),
      },
      // Fresh ceremony clock: no offset, no hold, not skipped.
      evolutionState: { seq, offsetMs: 0 },
      updatedAt: Date.now(),
    });
    return seq;
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
    if (command?.type !== "batch" || command?.seq !== args.seq) {
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
    // The pool is finalCount + stage count by construction, so the last
    // valid index (the "done" report) is the stage count. An overlay only
    // ever moves one stage at a time; anything else is not a report.
    const batch = command.batch;
    const lastStage = batch
      ? Math.max(0, batch.cats.length - batch.finalCount)
      : Number.POSITIVE_INFINITY;
    if (
      !Number.isInteger(args.stageIndex) ||
      args.stageIndex < 0 ||
      args.stageIndex > lastStage ||
      args.stageIndex > previous.stageIndex + 1
    ) {
      return;
    }
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
    // Stamp when a stage is entered (first report for the seq, or a stage
    // increase): every instance anchors its deal timeline on this server ms.
    const stamp =
      previous.stageStartedAt === undefined ||
      args.stageIndex > previous.stageIndex;
    await ctx.db.patch(session._id, {
      batchState: {
        ...previous,
        stageIndex: args.stageIndex,
        awaitingCull: args.awaitingCull,
        ...(stamp ? { stageStartedAt: Date.now() } : {}),
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
      command?.type !== "batch" ||
      command?.seq !== args.seq ||
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
 * (maybe leaves next, shown yellow) is kept across culls, minus the culled cat, "favorite"
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
      command?.type !== "batch" ||
      command?.seq !== args.seq ||
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
 * The cull itself, shared by finalizeBatchCull and the expired-verdict path:
 * the cat joins eliminatedIds, the overlay stops awaiting, the armed verdict
 * and the transient marks (removal candidate, spotlight) are dropped, the
 * cat leaves the potentials, favourites persist for the whole show.
 */
function applyBatchCull(
  state: BatchState,
  catId: string,
  now: number,
): BatchState {
  const {
    markedId: _clearedMark,
    spotlightId: _clearedSpotlight,
    pendingCullId: _clearedPending,
    verdictAt: _clearedVerdict,
    potentialIds: previousPotentials,
    ...rest
  } = state;
  const potentialIds = (previousPotentials ?? []).filter((id) => id !== catId);
  return {
    ...rest,
    awaitingCull: false,
    eliminatedIds: [...state.eliminatedIds, catId],
    lastCullAt: now,
    ...(potentialIds.length > 0 ? { potentialIds } : {}),
  };
}

/** Drop an armed verdict (pendingCullId + verdictAt) without touching the rest. */
function withoutArmedCull(state: BatchState): BatchState {
  const { pendingCullId: _pending, verdictAt: _verdict, ...rest } = state;
  return rest;
}

/**
 * Control page → session: ARM the cull of one cat during a batch
 * elimination. The overlay counts down VERDICT_MS at the cat, then the
 * scheduled finalizeBatchCull applies it. Only valid while the overlay is
 * waiting for a cull, and never below the configured finalist count.
 * A verdict whose finalize never ran (deploy, lost job) is expired after
 * VERDICT_GRACE_MS: re-arming the same cat then applies the cull inline,
 * another cat replaces the stale arm.
 */
export const cullBatchCat = mutation({
  args: { seq: v.number(), catId: v.string() },
  handler: async (ctx, args): Promise<{ verdictAt: number }> => {
    const session = await requireSession(ctx);
    const command = session.currentCommand;
    if (command?.type !== "batch" || command?.seq !== args.seq) {
      throw new Error("No matching batch is running.");
    }
    const batch = command.batch;
    let state = session.batchState;
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
    const now = Date.now();
    if (state.pendingCullId && state.verdictAt !== undefined) {
      if (now < state.verdictAt + VERDICT_GRACE_MS) {
        throw new Error("A verdict is already running.");
      }
      if (state.pendingCullId === args.catId) {
        await ctx.db.patch(session._id, {
          batchState: applyBatchCull(state, args.catId, now),
          updatedAt: now,
        });
        return { verdictAt: now };
      }
      state = withoutArmedCull(state);
    }
    const verdictAt = now + VERDICT_MS;
    await ctx.db.patch(session._id, {
      batchState: {
        ...state,
        markedId: args.catId,
        pendingCullId: args.catId,
        verdictAt,
      },
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(
      VERDICT_MS,
      internal.catStream.finalizeBatchCull,
      {
        sessionId: session._id,
        seq: args.seq,
        catId: args.catId,
        verdictAt,
      },
    );
    return { verdictAt };
  },
});

/**
 * Control page → session: clear the armed cull while the verdict is still
 * counting down (or whenever it is expired); the mark stays. Between
 * verdictAt and the grace end the finalize is about to land — too late.
 */
export const cancelBatchCull = mutation({
  args: { seq: v.number() },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx);
    const command = session.currentCommand;
    const state = session.batchState;
    if (
      command?.type !== "batch" ||
      command?.seq !== args.seq ||
      !state ||
      state.seq !== args.seq ||
      !state.pendingCullId ||
      state.verdictAt === undefined
    ) {
      return;
    }
    const now = Date.now();
    if (now >= state.verdictAt && now <= state.verdictAt + VERDICT_GRACE_MS) {
      throw new Error("Too late to cancel.");
    }
    await ctx.db.patch(session._id, {
      batchState: withoutArmedCull(state),
      updatedAt: now,
    });
  },
});

/**
 * Scheduled by cullBatchCat: apply the armed cull iff the same batch is
 * still running and the arm is unchanged (not cancelled, not re-armed).
 */
export const finalizeBatchCull = internalMutation({
  args: {
    sessionId: v.id("cat_stream_sessions"),
    seq: v.number(),
    catId: v.string(),
    verdictAt: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;
    const command = session.currentCommand;
    const state = session.batchState;
    if (
      command?.type !== "batch" ||
      command.seq !== args.seq ||
      !state ||
      state.seq !== args.seq ||
      state.pendingCullId !== args.catId ||
      state.verdictAt !== args.verdictAt
    ) {
      return;
    }
    const now = Date.now();
    await ctx.db.patch(session._id, {
      batchState: applyBatchCull(state, args.catId, now),
      updatedAt: now,
    });
  },
});

// ---------------------------------------------------------------------------
// Evolution ceremony clock (hold / reveal now / skip)
// ---------------------------------------------------------------------------

/**
 * The running evolution command and its clock state for `seq`, or null.
 * A show started before the clock state existed reads as a fresh clock.
 */
function evolutionClockFor(
  session: Doc<"cat_stream_sessions">,
  seq: number,
): { timestamp: number; state: EvolutionState } | null {
  const command = session.currentCommand;
  if (command?.type !== "evolution" || command.seq !== seq) return null;
  const stored = session.evolutionState;
  const state = stored?.seq === seq ? stored : { seq, offsetMs: 0 };
  return { timestamp: command.timestamp, state };
}

/** Fold an open hold into the offset and drop it; a no-op when not held. */
function releasedEvolutionState(
  state: EvolutionState,
  now: number,
): EvolutionState {
  if (state.holdStartedAt === undefined) return state;
  const { holdStartedAt, ...rest } = state;
  return {
    ...rest,
    offsetMs:
      state.offsetMs + Math.min(Math.max(0, now - holdStartedAt), HOLD_MAX_MS),
  };
}

/**
 * Control page → session: park the ceremony clock. With parkAtElapsedMs
 * the clock jumps there first (the page passes the current roll's near-miss
 * start), otherwise it stops where it is. Auto-releases after HOLD_MAX_MS.
 */
export const holdEvolution = mutation({
  args: { seq: v.number(), parkAtElapsedMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx);
    const clock = evolutionClockFor(session, args.seq);
    if (!clock || clock.state.holdStartedAt !== undefined) return;
    const now = Date.now();
    const offsetMs =
      args.parkAtElapsedMs === undefined
        ? clock.state.offsetMs
        : now - clock.timestamp - Math.max(0, args.parkAtElapsedMs);
    await ctx.db.patch(session._id, {
      evolutionState: { ...clock.state, offsetMs, holdStartedAt: now },
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(
      HOLD_MAX_MS,
      internal.catStream.autoReleaseEvolution,
      { sessionId: session._id, seq: args.seq, holdStartedAt: now },
    );
  },
});

/** Control page → session: resume the ceremony clock where the hold parked it. */
export const releaseEvolution = mutation({
  args: { seq: v.number() },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx);
    const clock = evolutionClockFor(session, args.seq);
    if (clock?.state.holdStartedAt === undefined) return;
    const now = Date.now();
    await ctx.db.patch(session._id, {
      evolutionState: releasedEvolutionState(clock.state, now),
      updatedAt: now,
    });
  },
});

/** Scheduled by holdEvolution: release iff that same hold is still open. */
export const autoReleaseEvolution = internalMutation({
  args: {
    sessionId: v.id("cat_stream_sessions"),
    seq: v.number(),
    holdStartedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;
    const state = session.evolutionState;
    if (
      !state ||
      state.seq !== args.seq ||
      state.holdStartedAt !== args.holdStartedAt
    ) {
      return;
    }
    const now = Date.now();
    await ctx.db.patch(session._id, {
      evolutionState: releasedEvolutionState(state, now),
      updatedAt: now,
    });
  },
});

/**
 * Control page → session: "Reveal now" — jump the ceremony clock to
 * targetElapsedMs on the server clock (no page skew), dropping any hold
 * without folding it (the offset is set absolutely).
 */
export const revealEvolutionAt = mutation({
  args: { seq: v.number(), targetElapsedMs: v.number() },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx);
    const clock = evolutionClockFor(session, args.seq);
    if (!clock) return;
    const now = Date.now();
    await ctx.db.patch(session._id, {
      evolutionState: {
        seq: args.seq,
        offsetMs: now - clock.timestamp - Math.max(0, args.targetElapsedMs),
        ...(clock.state.skipToBoard ? { skipToBoard: true } : {}),
      },
      updatedAt: now,
    });
  },
});

/** Control page → session: skip the rest of the ceremony to the lineage board. */
export const skipEvolutionToBoard = mutation({
  args: { seq: v.number() },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx);
    const clock = evolutionClockFor(session, args.seq);
    if (!clock) return;
    const now = Date.now();
    await ctx.db.patch(session._id, {
      evolutionState: {
        ...releasedEvolutionState(clock.state, now),
        skipToBoard: true,
      },
      updatedAt: now,
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
      command?.type !== "batch" ||
      command?.seq !== args.seq ||
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
