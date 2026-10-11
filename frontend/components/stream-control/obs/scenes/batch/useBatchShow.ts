"use client";

import { useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CatGeneratorApi,
  SpriteMapperApi,
} from "@/components/cat-builder/types";
import { api } from "@/convex/_generated/api";
import {
  BATCH_DEPART_MS,
  BATCH_REPACK_MS,
  BATCH_TORTIE_PLACEHOLDER_FALLBACK,
  BATCH_VERDICT_MS,
  type BatchLiveState,
  type BatchStage,
  type BatchStreamCat,
  type BatchStreamCommand,
  type BatchTortiePlaceholders,
  buildBatchStagePlan,
  buildPartialBatchParams,
  formatBatchNumber,
} from "@/lib/adoption/streamBatch";
import type { CatParams } from "@/lib/cat-v3/types";
import {
  BATCH_BEAT_MS,
  type BatchBeat,
  batchPhaseForBeat,
  buildStageBeats,
  landedAt,
  type StageCatInput,
  type StageTimeline,
  stageInputs,
  timelineBeatAt,
} from "./batchBeats";
import {
  type BatchShowView,
  type BatchViewCat,
  batchStatusLabel,
} from "./batchView";

/** A rendered sprite, tagged with the stage it shows and the stage-limited
 * params it was drawn from — looks keep the previous stage's image (and
 * its description) until the next one is published. `url` is null only
 * when a render failed and no earlier frame exists. */
type StagePreview = { url: string | null; stage: number; params: CatParams };

const TICK_MS = 100;
const RENDER_CHUNK = 6;
const RENDER_ATTEMPTS = 3;
/** Stamp wait (amendment 1): re-send report(k,false) this often … */
const STAMP_RETRY_MS = 2000;
/** … and anchor the stage locally after this long without an echo. */
const STAMP_LOCAL_AFTER_MS = 6000;
/** A late server stamp replaces the local anchor only when they agree this closely. */
const STAMP_SWITCH_TOLERANCE_MS = 2000;

interface UseBatchShowArgs {
  command: BatchStreamCommand & { seq: number };
  /** Live elimination state from the session — the control page culls into it. */
  liveState: BatchLiveState | null;
  apiKey: string;
  /** From useReducedMotion() in the wrapper; read ONLY when a timeline is built. */
  reducedMotion: boolean;
}

const EMPTY_IDS: string[] = [];

interface BeatSpec {
  kind: BatchBeat["kind"];
  stageId: string;
  startedAt: number;
  durationMs: number;
  anchor: BatchBeat["anchor"];
  timeline: StageTimeline | null;
  landedIds: string[];
  pendingCullId?: string;
  verdictEndsAt?: number;
}

function beatOf({
  timeline,
  pendingCullId,
  verdictEndsAt,
  ...base
}: BeatSpec): BatchBeat {
  const beat: BatchBeat = {
    ...base,
    order: timeline?.order ?? EMPTY_IDS,
    changedIds: timeline?.changedIds ?? EMPTY_IDS,
    unchangedIds: timeline?.unchangedIds ?? EMPTY_IDS,
    rareIds: timeline?.rareIds ?? EMPTY_IDS,
    groups: timeline?.groups ?? [],
  };
  if (pendingCullId !== undefined) beat.pendingCullId = pendingCullId;
  if (verdictEndsAt !== undefined) beat.verdictEndsAt = verdictEndsAt;
  return beat;
}

function windupBeat(stageId: string, startedAt: number): BatchBeat {
  return beatOf({
    kind: "windup",
    stageId,
    startedAt,
    durationMs: 0,
    anchor: "server",
    timeline: null,
    landedIds: EMPTY_IDS,
  });
}

const LOADING_BEAT = beatOf({
  kind: "loading",
  stageId: "loading",
  startedAt: 0,
  durationMs: 0,
  anchor: "server",
  timeline: null,
  landedIds: [],
});

function sameBeat(a: BatchBeat, b: BatchBeat): boolean {
  return (
    a.kind === b.kind &&
    a.stageId === b.stageId &&
    a.startedAt === b.startedAt &&
    a.durationMs === b.durationMs &&
    a.anchor === b.anchor &&
    a.order === b.order &&
    a.landedIds.length === b.landedIds.length &&
    a.pendingCullId === b.pendingCullId &&
    a.verdictEndsAt === b.verdictEndsAt
  );
}

type ReportedState = {
  stageFor: number | null;
  awaitingFor: number | null;
  stamp: { k: number; firstAt: number; lastAt: number } | null;
};
type LocalAnchor = { k: number; at: number };
type TimelineEntry = {
  k: number;
  timeline: StageTimeline;
  inputs: StageCatInput[];
};
type CullPlayback = { count: number; seenAt: number; reduced: boolean };

/** The engine's refs as one tick sees them; steps mutate only through these. */
interface TickRefs {
  reported: { current: ReportedState };
  localAnchor: { current: LocalAnchor | null };
  timeline: { current: TimelineEntry | null };
  cull: { current: CullPlayback | null };
  seenEliminations: { current: number };
  published: { current: Record<string, StagePreview> };
  staged: { current: Map<number, Map<string, StagePreview>> };
  placeholders: { current: BatchTortiePlaceholders };
  reducedMotion: { current: boolean };
}

/** Everything one evaluation reads: live state, stage plan, refs and the renderer hooks. */
interface TickContext {
  now: number;
  current: BatchLiveState | null;
  stages: BatchStage[];
  cats: BatchStreamCat[];
  maxEliminations: number;
  eliminated: string[];
  eliminatedNow: Set<string>;
  refs: TickRefs;
  report: (stageIndex: number, awaitingCull: boolean) => void;
  stageFrames: (stage: number) => void;
  frameStage: (stage: number) => number;
  setPublished: (next: Record<string, StagePreview>) => void;
}

/** The stage and departing cat a tick settles on; committed once at the end. */
interface TickCursor {
  stage: number;
  fading: string | null;
}

type StageAnchor = { at: number; anchor: BatchBeat["anchor"] };

/** A stage's deal facts, shared by the cull, verdict and awaiting steps. */
interface StagePlay {
  stageId: string;
  timeline: StageTimeline;
  anchor: StageAnchor;
  landed: string[];
}

/** A pass over one stage ends in its beat, or advances to the next stage. */
type StageStep = BatchBeat | "advance";

function sendStageReport(ctx: TickContext, target: number): void {
  ctx.report(target, false);
  ctx.refs.reported.current.stageFor = target;
  ctx.refs.reported.current.stamp = {
    k: target,
    firstAt: ctx.now,
    lastAt: ctx.now,
  };
}

/** Reports `next` and moves the cursor there; the next pass evaluates it. */
function advanceTo(
  ctx: TickContext,
  cursor: TickCursor,
  next: number,
): "advance" {
  sendStageReport(ctx, next);
  cursor.stage = next;
  cursor.fading = null;
  ctx.refs.timeline.current = null;
  ctx.refs.localAnchor.current = null;
  return "advance";
}

/** Step 2: the other instance advanced, or our own report echoed. */
function resyncStage(ctx: TickContext, cursor: TickCursor): void {
  const { current } = ctx;
  if (!current || current.stageIndex <= cursor.stage) return;
  cursor.stage = current.stageIndex;
  cursor.fading = null;
  ctx.refs.seenEliminations.current = Math.max(
    ctx.refs.seenEliminations.current,
    Math.min(cursor.stage, ctx.maxEliminations),
  );
}

/** Every stage revealed: report it once, then hold the done beat. */
function doneBeat(ctx: TickContext, stage: number): BatchBeat {
  if (ctx.refs.reported.current.stageFor !== stage) sendStageReport(ctx, stage);
  const last = ctx.refs.timeline.current;
  return beatOf({
    kind: "done",
    stageId: "done",
    startedAt: last ? last.timeline.totalMs : 0,
    durationMs: 0,
    anchor: "server",
    timeline: null,
    landedIds: EMPTY_IDS,
  });
}

/** Step 5a: frames for this stage must be staged before the deal. */
function framesStaged(
  ctx: TickContext,
  stage: number,
  survivors: readonly BatchStreamCat[],
): boolean {
  const staged = ctx.refs.staged.current.get(ctx.frameStage(stage));
  return survivors.every((cat) => staged?.has(cat.id));
}

/** Unbounded windup while frames render; stamped once the server has this stage. */
function stagingWindup(
  ctx: TickContext,
  stage: number,
  stageId: string,
): BatchBeat {
  ctx.stageFrames(stage);
  const { current } = ctx;
  const stamp =
    current && current.stageIndex === stage ? current.stageStartedAt : 0;
  return windupBeat(stageId, stamp ?? 0);
}

/** Step 5b: the server's stamp for this stage, or the local anchor kept while it never echoed. */
function resolveAnchor(ctx: TickContext, stage: number): StageAnchor | null {
  const { current, refs } = ctx;
  const serverAnchor =
    current &&
    current.stageIndex === stage &&
    typeof current.stageStartedAt === "number"
      ? current.stageStartedAt
      : null;
  const localAnchor = refs.localAnchor.current;
  const local = localAnchor?.k === stage ? localAnchor.at : null;
  if (serverAnchor !== null && local !== null) {
    // A late stamp replaces the local anchor only when they agree closely.
    if (Math.abs(serverAnchor - local) < STAMP_SWITCH_TOLERANCE_MS) {
      refs.localAnchor.current = null;
      return { at: serverAnchor, anchor: "server" };
    }
    return { at: local, anchor: "local" };
  }
  if (serverAnchor !== null) return { at: serverAnchor, anchor: "server" };
  if (local !== null) return { at: local, anchor: "local" };
  return awaitStamp(ctx, stage);
}

/** Stamp wait (amendment 1): report once, re-send every 2 s, anchor locally after 6 s. */
function awaitStamp(ctx: TickContext, stage: number): StageAnchor | null {
  const { now, refs } = ctx;
  const reported = refs.reported.current;
  if (reported.stageFor !== stage) {
    sendStageReport(ctx, stage);
  } else if (
    reported.stamp?.k === stage &&
    now - reported.stamp.lastAt >= STAMP_RETRY_MS
  ) {
    ctx.report(stage, false);
    reported.stamp.lastAt = now;
  }
  if (
    reported.stamp?.k === stage &&
    now - reported.stamp.firstAt >= STAMP_LOCAL_AFTER_MS
  ) {
    refs.localAnchor.current = { k: stage, at: now };
    return { at: now, anchor: "local" };
  }
  return null;
}

/** Step 5c: the stage timeline, built once per stage. */
function stageTimeline(
  ctx: TickContext,
  stage: number,
  survivors: readonly BatchStreamCat[],
): StageTimeline {
  const entry = ctx.refs.timeline.current;
  if (entry?.k === stage) return entry.timeline;
  const inputs = stageInputs(
    survivors,
    ctx.stages,
    stage,
    ctx.refs.placeholders.current,
  );
  const timeline = buildStageBeats(inputs, ctx.stages[stage], {
    reducedMotion: ctx.refs.reducedMotion.current,
  });
  ctx.refs.timeline.current = { k: stage, inputs, timeline };
  return timeline;
}

/** Publish every landed frame not yet shown (several at once = catch-up). */
function publishLanded(
  ctx: TickContext,
  stage: number,
  landed: readonly string[],
): void {
  const frames = ctx.refs.staged.current.get(ctx.frameStage(stage));
  const published = ctx.refs.published.current;
  const updates: Record<string, StagePreview> = {};
  for (const id of landed) {
    const frame = frames?.get(id);
    if (frame && published[id] !== frame) updates[id] = frame;
  }
  if (Object.keys(updates).length === 0) return;
  ctx.refs.published.current = { ...published, ...updates };
  ctx.setPublished(ctx.refs.published.current);
}

/** How long the windup / deal / hold beat runs, measured from the stage anchor. */
function timelineBeatDuration(
  timeline: StageTimeline,
  kind: "windup" | "deal" | "hold",
): number {
  if (kind === "windup") return timeline.windupMs;
  if (kind === "deal") return timeline.holdFromMs;
  return timeline.totalMs;
}

/** Windup → deal → hold on the stage anchor; the hold pre-renders the next stage. */
function dealBeat(
  ctx: TickContext,
  cursor: TickCursor,
  play: StagePlay,
  elapsed: number,
): BatchBeat {
  const { stageId, timeline, anchor, landed } = play;
  const kind = timelineBeatAt(timeline, elapsed);
  if (kind === "hold" && cursor.stage + 1 < ctx.stages.length) {
    ctx.stageFrames(cursor.stage + 1);
  }
  cursor.fading = null;
  return beatOf({
    kind,
    stageId,
    startedAt: anchor.at,
    durationMs: timelineBeatDuration(timeline, kind),
    anchor: anchor.anchor,
    timeline,
    landedIds: landed,
  });
}

/** Step 3: a cull landed for this stage → depart / repack, then advance. */
function cullBeat(
  ctx: TickContext,
  cursor: TickCursor,
  play: StagePlay,
): StageStep | null {
  const { eliminated, now, current, refs } = ctx;
  if (eliminated.length <= refs.seenEliminations.current) return null;
  const playing = refs.cull.current;
  const cull =
    playing?.count === eliminated.length
      ? playing
      : {
          count: eliminated.length,
          seenAt: now,
          reduced: refs.reducedMotion.current,
        };
  refs.cull.current = cull;
  const cullAnchor: BatchBeat["anchor"] =
    typeof current?.lastCullAt === "number" ? "server" : "local";
  const cullAt = current?.lastCullAt ?? cull.seenAt;
  const departMs = cull.reduced ? BATCH_BEAT_MS.departReduced : BATCH_DEPART_MS;
  const repackMs = cull.reduced ? BATCH_BEAT_MS.repackReduced : BATCH_REPACK_MS;
  const since = now - cullAt;
  const last = eliminated[eliminated.length - 1];
  const { stageId, timeline, landed } = play;
  if (since < departMs) {
    cursor.fading = last;
    return beatOf({
      kind: "depart",
      stageId,
      startedAt: cullAt,
      durationMs: departMs,
      anchor: cullAnchor,
      timeline,
      landedIds: landed,
      pendingCullId: last,
    });
  }
  if (since < departMs + repackMs) {
    cursor.fading = null;
    return beatOf({
      kind: "repack",
      stageId,
      startedAt: cullAt + departMs,
      durationMs: repackMs,
      anchor: cullAnchor,
      timeline,
      landedIds: landed,
    });
  }
  refs.seenEliminations.current = eliminated.length;
  refs.cull.current = null;
  return advanceTo(ctx, cursor, cursor.stage + 1);
}

/** Step 4: an armed cull counts down on the server's clock. */
function verdictBeat(
  ctx: TickContext,
  cursor: TickCursor,
  play: StagePlay,
): BatchBeat | null {
  const { current, now } = ctx;
  if (!current?.pendingCullId || typeof current.verdictAt !== "number") {
    return null;
  }
  cursor.fading = null;
  return beatOf({
    kind: "verdict",
    stageId: play.stageId,
    startedAt: current.verdictAt - BATCH_VERDICT_MS,
    durationMs: Math.max(0, current.verdictAt - now),
    anchor: "server",
    timeline: play.timeline,
    landedIds: play.landed,
    pendingCullId: current.pendingCullId,
    verdictEndsAt: current.verdictAt,
  });
}

/** Culls remain: wait for the control page, reporting awaitingCull once per stage. */
function awaitingBeat(
  ctx: TickContext,
  cursor: TickCursor,
  play: StagePlay,
): BatchBeat | null {
  if (ctx.eliminated.length >= ctx.maxEliminations) return null;
  const reported = ctx.refs.reported.current;
  if (reported.awaitingFor !== cursor.stage) {
    reported.awaitingFor = cursor.stage;
    ctx.report(cursor.stage, true);
  }
  cursor.fading = null;
  const { stageId, timeline, anchor, landed } = play;
  return beatOf({
    kind: "awaiting",
    stageId,
    startedAt: anchor.at + timeline.totalMs,
    durationMs: 0,
    anchor: anchor.anchor,
    timeline,
    landedIds: landed,
  });
}

/** One pass over the stage under the cursor: its beat, or "advance" once it rolled on. */
function evaluateStage(ctx: TickContext, cursor: TickCursor): StageStep {
  const { stage } = cursor;
  if (stage >= ctx.stages.length) return doneBeat(ctx, stage);
  const stageId = ctx.stages[stage].id;
  const survivors = ctx.cats.filter((cat) => !ctx.eliminatedNow.has(cat.id));
  if (!framesStaged(ctx, stage, survivors)) {
    return stagingWindup(ctx, stage, stageId);
  }
  const anchor = resolveAnchor(ctx, stage);
  if (!anchor) return windupBeat(stageId, 0);
  const timeline = stageTimeline(ctx, stage, survivors);
  const elapsed = ctx.now - anchor.at;
  const landed = landedAt(timeline, elapsed);
  publishLanded(ctx, stage, landed);
  const play: StagePlay = { stageId, timeline, anchor, landed };
  if (elapsed < timeline.totalMs) return dealBeat(ctx, cursor, play, elapsed);
  // The stage has rolled. Pre-render the next one while we wait.
  if (stage + 1 < ctx.stages.length) ctx.stageFrames(stage + 1);
  const cull = cullBeat(ctx, cursor, play);
  if (cull) return cull;
  const verdict = verdictBeat(ctx, cursor, play);
  if (verdict) return verdict;
  const awaiting = awaitingBeat(ctx, cursor, play);
  if (awaiting) return awaiting;
  // No culls left: straight on to the next stage.
  return advanceTo(ctx, cursor, stage + 1);
}

/**
 * The adoption elimination show's engine, shared by every look. Every beat
 * is a function of (command, liveState, now) plus the frames this instance
 * has staged locally — no timer chains. Deals are anchored on the server's
 * `stageStartedAt`, verdicts on `verdictAt`, depart/repack on `lastCullAt`,
 * so two overlay instances (OBS + the control preview) show the same frame
 * at the same moment and a reload joins the deal mid-way instead of
 * restarting it.
 */
export function useBatchShow({
  command,
  liveState,
  apiKey,
  reducedMotion,
}: UseBatchShowArgs): BatchShowView {
  const reportBatchStage = useMutation(api.catStream.reportBatchStage);
  const generatorRef = useRef<CatGeneratorApi | null>(null);
  const placeholdersRef = useRef<BatchTortiePlaceholders>(
    BATCH_TORTIE_PLACEHOLDER_FALLBACK,
  );

  const stages = useMemo(
    () => buildBatchStagePlan(command.config, command.cats),
    [command.config, command.cats],
  );
  const maxEliminations = Math.max(0, command.cats.length - command.finalCount);

  const live = liveState?.seq === command.seq ? liveState : null;
  const liveRef = useRef(live);
  liveRef.current = live;
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const [k, setK] = useState(() => live?.stageIndex ?? 0);
  const kRef = useRef(k);
  const [published, setPublished] = useState<Record<string, StagePreview>>({});
  const publishedRef = useRef(published);
  const [fadingId, setFadingId] = useState<string | null>(null);
  const fadingRef = useRef<string | null>(null);
  const [beat, setBeat] = useState<BatchBeat>(LOADING_BEAT);
  const beatRef = useRef(beat);
  // Frames rendered per stage (keyed by the clamped stage index); a version
  // counter re-runs the evaluator when a chunk lands.
  const stagedRef = useRef<Map<number, Map<string, StagePreview>>>(new Map());
  const stagingRef = useRef<Set<number>>(new Set());
  const [stagedVersion, setStagedVersion] = useState(0);
  const mountedRef = useRef(true);
  const failedRenderLoggedRef = useRef(false);
  // Each report fires once per k; the stamp wait re-sends (amendment 1).
  const reportedRef = useRef<ReportedState>({
    stageFor: null,
    awaitingFor: null,
    stamp: null,
  });
  const localAnchorRef = useRef<LocalAnchor | null>(null);
  const timelineRef = useRef<TimelineEntry | null>(null);
  // The cull currently being played out (depart/repack): remembers when
  // this instance first saw it (fallback anchor) and the motion setting.
  const cullRef = useRef<CullPlayback | null>(null);
  // Culls processed so far. Derived from the stage being revealed (each of
  // the first `maxEliminations` stages needs exactly one cull to advance),
  // NOT from eliminatedIds.length: reloading right after a cull landed but
  // before the previous overlay instance advanced the stage would otherwise
  // mark that cull as seen and ask for a second one on the same stage.
  const seenEliminationsRef = useRef(Math.min(k, maxEliminations));

  const eliminatedIds = live?.eliminatedIds ?? EMPTY_IDS;
  const eliminatedSet = useMemo(() => new Set(eliminatedIds), [eliminatedIds]);
  const markedId = live?.markedId ?? null;
  const potentialSet = useMemo(
    () => new Set(live?.potentialIds ?? []),
    [live?.potentialIds],
  );
  const favoriteSet = useMemo(
    () => new Set(live?.favoriteIds ?? []),
    [live?.favoriteIds],
  );
  const spotlightId = live?.spotlightId ?? null;

  const report = useCallback(
    (nextStageIndex: number, awaitingCull: boolean) => {
      reportBatchStage({
        apiKey,
        seq: command.seq,
        stageIndex: nextStageIndex,
        awaitingCull,
      }).catch((err) => {
        console.warn("[ObsOverlayClient] Failed to report batch stage", err);
      });
    },
    [apiKey, command.seq, reportBatchStage],
  );

  // Load the renderer + tortie placeholders once.
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const [{ default: catGenerator }, { default: spriteMapper }] =
          await Promise.all([
            import("@/lib/single-cat/catGeneratorV3"),
            import("@/lib/single-cat/spriteMapper"),
          ]);
        if (cancelled) return;
        generatorRef.current = catGenerator as CatGeneratorApi;
        const mapper = spriteMapper as unknown as SpriteMapperApi;
        if (!mapper.loaded) {
          await mapper.init();
        }
        if (cancelled) return;
        placeholdersRef.current = {
          mask:
            mapper.getTortieMasks()[0] ??
            BATCH_TORTIE_PLACEHOLDER_FALLBACK.mask,
          pattern:
            mapper.getPeltNames()[0] ??
            BATCH_TORTIE_PLACEHOLDER_FALLBACK.pattern,
          colour: BATCH_TORTIE_PLACEHOLDER_FALLBACK.colour,
        };
        readyRef.current = true;
        setReady(true);
      } catch (error) {
        console.error(
          "[ObsOverlayClient] Failed to load batch renderer",
          error,
        );
      }
    })();
    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, []);

  /** Clamped stage index whose frames stage k shows (k ≥ stages.length = the final params). */
  const frameStage = useCallback(
    (stage: number) => Math.min(stage, Math.max(0, stages.length - 1)),
    [stages.length],
  );

  /**
   * Renders every survivor's stage-`stage` frame in chunks of 6 into the
   * staged map; skips cats already staged. A failed render retries up to 3
   * times, then counts as staged with the previous stage's frame.
   */
  const stageFrames = useCallback(
    (stage: number) => {
      const generator = generatorRef.current;
      if (!generator) return;
      const key = frameStage(stage);
      if (stagingRef.current.has(key)) return;
      let map = stagedRef.current.get(key);
      if (!map) {
        map = new Map();
        stagedRef.current.set(key, map);
      }
      const staged = map;
      const eliminated = new Set(liveRef.current?.eliminatedIds ?? []);
      const pending = command.cats.filter(
        (cat) => !eliminated.has(cat.id) && !staged.has(cat.id),
      );
      if (pending.length === 0) return;
      stagingRef.current.add(key);
      const bump = () => {
        if (mountedRef.current) setStagedVersion((v) => v + 1);
      };
      (async () => {
        try {
          for (let start = 0; start < pending.length; start += RENDER_CHUNK) {
            if (!mountedRef.current) return;
            const chunk = pending.slice(start, start + RENDER_CHUNK);
            await Promise.all(
              chunk.map(async (cat) => {
                const params = buildPartialBatchParams(
                  cat,
                  stages,
                  key,
                  placeholdersRef.current,
                );
                let lastError: unknown = null;
                for (let attempt = 0; attempt < RENDER_ATTEMPTS; attempt++) {
                  try {
                    const result = await generator.generateCat(params);
                    const url =
                      result.imageDataUrl ??
                      ("toDataURL" in result.canvas
                        ? (result.canvas as HTMLCanvasElement).toDataURL(
                            "image/png",
                          )
                        : null);
                    if (url) {
                      staged.set(cat.id, { url, stage: key, params });
                      return;
                    }
                    lastError = new Error("renderer returned no image");
                  } catch (renderError) {
                    lastError = renderError;
                  }
                }
                const previous =
                  stagedRef.current.get(key - 1)?.get(cat.id) ??
                  publishedRef.current[cat.id] ??
                  null;
                staged.set(
                  cat.id,
                  previous ?? { url: null, stage: key, params },
                );
                if (!failedRenderLoggedRef.current) {
                  failedRenderLoggedRef.current = true;
                  console.warn(
                    "[ObsOverlayClient] Batch cat render failed; keeping the previous frame",
                    cat.label,
                    lastError,
                  );
                }
              }),
            );
            bump();
          }
        } finally {
          stagingRef.current.delete(key);
          bump();
        }
      })();
    },
    [command.cats, frameStage, stages],
  );

  /**
   * One evaluation: derives the beat for `now` from the live state and the
   * staged frames, publishes landed frames and fires the one-shot reports.
   * Runs on every tick and on every live/staging change.
   */
  const evaluate = useCallback(() => {
    const cursor: TickCursor = {
      stage: kRef.current,
      fading: fadingRef.current,
    };
    const commit = (next: BatchBeat) => {
      if (cursor.stage !== kRef.current) {
        kRef.current = cursor.stage;
        setK(cursor.stage);
      }
      if (cursor.fading !== fadingRef.current) {
        fadingRef.current = cursor.fading;
        setFadingId(cursor.fading);
      }
      if (!sameBeat(beatRef.current, next)) {
        beatRef.current = next;
        setBeat(next);
      }
    };

    if (!readyRef.current) {
      commit(LOADING_BEAT);
      return;
    }

    const current = liveRef.current;
    const eliminated = current?.eliminatedIds ?? EMPTY_IDS;
    const ctx: TickContext = {
      now: Date.now(),
      current,
      stages,
      cats: command.cats,
      maxEliminations,
      eliminated,
      eliminatedNow: new Set(eliminated),
      refs: {
        reported: reportedRef,
        localAnchor: localAnchorRef,
        timeline: timelineRef,
        cull: cullRef,
        seenEliminations: seenEliminationsRef,
        published: publishedRef,
        staged: stagedRef,
        placeholders: placeholdersRef,
        reducedMotion: reducedMotionRef,
      },
      report,
      stageFrames,
      frameStage,
      setPublished,
    };
    resyncStage(ctx, cursor);

    // Two passes at most: a stage that completes can advance once per tick.
    let next: StageStep = "advance";
    for (let pass = 0; pass < 2 && next === "advance"; pass++) {
      next = evaluateStage(ctx, cursor);
    }
    commit(
      next === "advance"
        ? windupBeat(stages[cursor.stage]?.id ?? "done", 0)
        : next,
    );
  }, [command.cats, frameStage, maxEliminations, report, stageFrames, stages]);

  const evaluateRef = useRef(evaluate);
  evaluateRef.current = evaluate;

  // The 100 ms ticker; live and staging changes evaluate immediately.
  useEffect(() => {
    const id = window.setInterval(() => evaluateRef.current(), TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: live/ready/stagedVersion are the re-evaluation triggers; the evaluator reads state through refs
  useEffect(() => {
    evaluateRef.current();
  }, [live, ready, stagedVersion]);

  // Per-cat stage facts (changed, value) for the stage being shown.
  const inputsById = useMemo(() => {
    const map = new Map<string, StageCatInput>();
    if (!ready || k >= stages.length) return map;
    const survivors = command.cats.filter((cat) => !eliminatedSet.has(cat.id));
    for (const input of stageInputs(
      survivors,
      stages,
      k,
      placeholdersRef.current,
    )) {
      map.set(input.id, input);
    }
    return map;
  }, [ready, k, stages, command.cats, eliminatedSet]);

  const saved = Boolean(command.slug);
  const qrUrl =
    beat.kind === "done" && command.slug && typeof window !== "undefined"
      ? `${window.location.origin}/adoption/${command.slug}`
      : null;

  return useMemo(() => {
    const kind = beat.kind;
    const awaitingLike = kind === "awaiting" || kind === "verdict";
    const landedSet = new Set(beat.landedIds);
    const cats: BatchViewCat[] = command.cats.map((cat, index) => {
      const input = inputsById.get(cat.id);
      const changed = input?.changed ?? false;
      const departing = cat.id === fadingId;
      return {
        id: cat.id,
        number: index + 1,
        numberLabel: formatBatchNumber(index + 1),
        label: cat.label,
        previewUrl: published[cat.id]?.url ?? null,
        // Never the final params: prose must not run ahead of the sprite.
        params:
          published[cat.id]?.params ??
          buildPartialBatchParams(cat, stages, -1, placeholdersRef.current),
        marked: awaitingLike && cat.id === markedId,
        potential: cat.id !== markedId && potentialSet.has(cat.id),
        favorite: favoriteSet.has(cat.id),
        spotlight: cat.id === spotlightId,
        eliminated: eliminatedSet.has(cat.id),
        fading: departing,
        departing,
        changed,
        landed: landedSet.has(cat.id),
        valueLabel: changed ? (input?.value?.label ?? null) : null,
      };
    });
    const byId = new Map(cats.map((cat) => [cat.id, cat]));
    const survivors = cats.filter((cat) => !cat.eliminated || cat.fading);
    const eliminated = eliminatedIds
      .map((id) => byId.get(id))
      .filter((cat): cat is BatchViewCat => Boolean(cat));
    const clampedIndex = Math.min(k, Math.max(0, stages.length - 1));
    const stageLabel = stages[clampedIndex]?.label ?? "";
    const pendingNumber = beat.pendingCullId
      ? (byId.get(beat.pendingCullId)?.numberLabel ?? null)
      : null;
    const spotlightCat = spotlightId ? (byId.get(spotlightId) ?? null) : null;
    return {
      title: command.title ?? "Adoption Elimination",
      phase: batchPhaseForBeat(kind),
      beat,
      stages,
      stageIndex: clampedIndex,
      stageNumber: Math.min(k + 1, stages.length),
      stageLabel,
      traitLabel: stageLabel,
      cats,
      survivors,
      eliminated,
      poolSize: command.cats.length,
      remaining: command.cats.length - eliminatedSet.size,
      finalCount: command.finalCount,
      maxEliminations,
      cullNumber: eliminatedIds.length + 1,
      spotlight: spotlightCat && !spotlightCat.eliminated ? spotlightCat : null,
      qrUrl,
      statusLabel: batchStatusLabel(kind, saved, stageLabel, pendingNumber),
      reducedMotion,
    };
  }, [
    command.cats,
    command.title,
    command.finalCount,
    beat,
    published,
    inputsById,
    markedId,
    potentialSet,
    favoriteSet,
    spotlightId,
    eliminatedSet,
    eliminatedIds,
    fadingId,
    k,
    stages,
    maxEliminations,
    qrUrl,
    saved,
    reducedMotion,
  ]);
}
