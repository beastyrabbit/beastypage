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

function beatOf(
  kind: BatchBeat["kind"],
  stageId: string,
  startedAt: number,
  durationMs: number,
  anchor: BatchBeat["anchor"],
  timeline: StageTimeline | null,
  landedIds: string[],
  extra: Partial<Pick<BatchBeat, "pendingCullId" | "verdictEndsAt">> = {},
): BatchBeat {
  return {
    kind,
    stageId,
    startedAt,
    durationMs,
    anchor,
    order: timeline?.order ?? EMPTY_IDS,
    landedIds,
    changedIds: timeline?.changedIds ?? EMPTY_IDS,
    unchangedIds: timeline?.unchangedIds ?? EMPTY_IDS,
    rareIds: timeline?.rareIds ?? EMPTY_IDS,
    groups: timeline?.groups ?? [],
    ...extra,
  };
}

const LOADING_BEAT = beatOf("loading", "loading", 0, 0, "server", null, []);

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
  const reportedRef = useRef<{
    stageFor: number | null;
    awaitingFor: number | null;
    stamp: { k: number; firstAt: number; lastAt: number } | null;
  }>({ stageFor: null, awaitingFor: null, stamp: null });
  const localAnchorRef = useRef<{ k: number; at: number } | null>(null);
  const timelineRef = useRef<{
    k: number;
    timeline: StageTimeline;
    inputs: StageCatInput[];
  } | null>(null);
  // The cull currently being played out (depart/repack): remembers when
  // this instance first saw it (fallback anchor) and the motion setting.
  const cullRef = useRef<{
    count: number;
    seenAt: number;
    reduced: boolean;
  } | null>(null);
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
    const now = Date.now();
    const current = liveRef.current;
    let stage = kRef.current;
    let fading = fadingRef.current;

    const commit = (next: BatchBeat) => {
      if (stage !== kRef.current) {
        kRef.current = stage;
        setK(stage);
      }
      if (fading !== fadingRef.current) {
        fadingRef.current = fading;
        setFadingId(fading);
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

    // Step 2: the other instance advanced, or our own report echoed.
    if (current && current.stageIndex > stage) {
      stage = current.stageIndex;
      fading = null;
      seenEliminationsRef.current = Math.max(
        seenEliminationsRef.current,
        Math.min(stage, maxEliminations),
      );
    }

    const eliminated = current?.eliminatedIds ?? EMPTY_IDS;
    const eliminatedNow = new Set(eliminated);

    const sendStageReport = (target: number) => {
      report(target, false);
      reportedRef.current.stageFor = target;
      reportedRef.current.stamp = { k: target, firstAt: now, lastAt: now };
    };
    const advanceTo = (next: number) => {
      sendStageReport(next);
      stage = next;
      fading = null;
      timelineRef.current = null;
      localAnchorRef.current = null;
    };

    // Two passes at most: a stage that completes can advance once per tick.
    for (let pass = 0; pass < 2; pass++) {
      if (stage >= stages.length) {
        if (reportedRef.current.stageFor !== stage) sendStageReport(stage);
        const last = timelineRef.current;
        commit(
          beatOf(
            "done",
            "done",
            last ? last.timeline.totalMs : 0,
            0,
            "server",
            null,
            EMPTY_IDS,
          ),
        );
        return;
      }

      const stageId = stages[stage].id;
      const survivors = command.cats.filter(
        (cat) => !eliminatedNow.has(cat.id),
      );

      // Step 5a: frames for this stage must be staged before the deal.
      const staged = stagedRef.current.get(frameStage(stage));
      const complete = survivors.every((cat) => staged?.has(cat.id));
      if (!complete) {
        stageFrames(stage);
        const stamp =
          current && current.stageIndex === stage ? current.stageStartedAt : 0;
        commit(
          beatOf("windup", stageId, stamp ?? 0, 0, "server", null, EMPTY_IDS),
        );
        return;
      }

      // Step 5b: the server's stamp for this stage, or a local anchor when
      // the stamp never echoes (amendment 1).
      const serverAnchor =
        current &&
        current.stageIndex === stage &&
        typeof current.stageStartedAt === "number"
          ? current.stageStartedAt
          : null;
      let anchorAt: number | null = null;
      let anchor: BatchBeat["anchor"] = "server";
      const local =
        localAnchorRef.current?.k === stage ? localAnchorRef.current.at : null;
      if (serverAnchor !== null && local !== null) {
        if (Math.abs(serverAnchor - local) < STAMP_SWITCH_TOLERANCE_MS) {
          localAnchorRef.current = null;
          anchorAt = serverAnchor;
        } else {
          anchorAt = local;
          anchor = "local";
        }
      } else if (serverAnchor !== null) {
        anchorAt = serverAnchor;
      } else if (local !== null) {
        anchorAt = local;
        anchor = "local";
      } else {
        const reported = reportedRef.current;
        if (reported.stageFor !== stage) {
          sendStageReport(stage);
        } else if (
          reported.stamp?.k === stage &&
          now - reported.stamp.lastAt >= STAMP_RETRY_MS
        ) {
          report(stage, false);
          reported.stamp.lastAt = now;
        }
        if (
          reported.stamp?.k === stage &&
          now - reported.stamp.firstAt >= STAMP_LOCAL_AFTER_MS
        ) {
          localAnchorRef.current = { k: stage, at: now };
          anchorAt = now;
          anchor = "local";
        } else {
          commit(beatOf("windup", stageId, 0, 0, "server", null, EMPTY_IDS));
          return;
        }
      }

      // Step 5c: the stage timeline, built once per stage.
      let entry = timelineRef.current;
      if (!entry || entry.k !== stage) {
        const inputs = stageInputs(
          survivors,
          stages,
          stage,
          placeholdersRef.current,
        );
        entry = {
          k: stage,
          inputs,
          timeline: buildStageBeats(inputs, stages[stage], {
            reducedMotion: reducedMotionRef.current,
          }),
        };
        timelineRef.current = entry;
      }
      const timeline = entry.timeline;
      const elapsed = now - anchorAt;
      const landed = landedAt(timeline, elapsed);

      // Publish every landed frame not yet shown (several at once = catch-up).
      const frames = stagedRef.current.get(frameStage(stage));
      const updates: Record<string, StagePreview> = {};
      for (const id of landed) {
        const frame = frames?.get(id);
        if (frame && publishedRef.current[id] !== frame) updates[id] = frame;
      }
      if (Object.keys(updates).length > 0) {
        publishedRef.current = { ...publishedRef.current, ...updates };
        setPublished(publishedRef.current);
      }

      if (elapsed < timeline.totalMs) {
        const kind = timelineBeatAt(timeline, elapsed);
        const durationMs =
          kind === "windup"
            ? timeline.windupMs
            : kind === "deal"
              ? timeline.holdFromMs
              : timeline.totalMs;
        if (kind === "hold" && stage + 1 < stages.length) {
          stageFrames(stage + 1);
        }
        fading = null;
        commit(
          beatOf(kind, stageId, anchorAt, durationMs, anchor, timeline, landed),
        );
        return;
      }

      // The stage has rolled. Pre-render the next one while we wait.
      if (stage + 1 < stages.length) stageFrames(stage + 1);

      // Step 3: a cull landed for this stage → depart / repack / advance.
      if (eliminated.length > seenEliminationsRef.current) {
        const cull =
          cullRef.current?.count === eliminated.length
            ? cullRef.current
            : {
                count: eliminated.length,
                seenAt: now,
                reduced: reducedMotionRef.current,
              };
        cullRef.current = cull;
        const cullAnchor: BatchBeat["anchor"] =
          typeof current?.lastCullAt === "number" ? "server" : "local";
        const cullAt = current?.lastCullAt ?? cull.seenAt;
        const departMs = cull.reduced
          ? BATCH_BEAT_MS.departReduced
          : BATCH_DEPART_MS;
        const repackMs = cull.reduced
          ? BATCH_BEAT_MS.repackReduced
          : BATCH_REPACK_MS;
        const since = now - cullAt;
        const last = eliminated[eliminated.length - 1];
        if (since < departMs) {
          fading = last;
          commit(
            beatOf(
              "depart",
              stageId,
              cullAt,
              departMs,
              cullAnchor,
              timeline,
              landed,
              {
                pendingCullId: last,
              },
            ),
          );
          return;
        }
        if (since < departMs + repackMs) {
          fading = null;
          commit(
            beatOf(
              "repack",
              stageId,
              cullAt + departMs,
              repackMs,
              cullAnchor,
              timeline,
              landed,
            ),
          );
          return;
        }
        seenEliminationsRef.current = eliminated.length;
        cullRef.current = null;
        advanceTo(stage + 1);
        continue;
      }

      // Step 4: an armed cull counts down on the server's clock.
      if (current?.pendingCullId && typeof current.verdictAt === "number") {
        fading = null;
        commit(
          beatOf(
            "verdict",
            stageId,
            current.verdictAt - BATCH_VERDICT_MS,
            Math.max(0, current.verdictAt - now),
            "server",
            timeline,
            landed,
            {
              pendingCullId: current.pendingCullId,
              verdictEndsAt: current.verdictAt,
            },
          ),
        );
        return;
      }

      if (eliminated.length < maxEliminations) {
        if (reportedRef.current.awaitingFor !== stage) {
          reportedRef.current.awaitingFor = stage;
          report(stage, true);
        }
        fading = null;
        commit(
          beatOf(
            "awaiting",
            stageId,
            anchorAt + timeline.totalMs,
            0,
            anchor,
            timeline,
            landed,
          ),
        );
        return;
      }

      // No culls left: straight on to the next stage.
      advanceTo(stage + 1);
    }
    commit(
      beatOf(
        "windup",
        stages[stage]?.id ?? "done",
        0,
        0,
        "server",
        null,
        EMPTY_IDS,
      ),
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
