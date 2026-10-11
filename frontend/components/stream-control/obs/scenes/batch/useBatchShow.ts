"use client";

import { useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CatGeneratorApi,
  SpriteMapperApi,
} from "@/components/cat-builder/types";
import { api } from "@/convex/_generated/api";
import {
  BATCH_TORTIE_PLACEHOLDER_FALLBACK,
  type BatchLiveState,
  type BatchStreamCommand,
  type BatchTortiePlaceholders,
  buildBatchStagePlan,
  buildPartialBatchParams,
  formatBatchNumber,
} from "@/lib/adoption/streamBatch";
import {
  type BatchScenePhase,
  type BatchShowView,
  type BatchViewCat,
  batchStatusLabel,
} from "./batchView";

/** A rendered sprite, tagged with the stage it shows — looks keep the
 * previous stage's image until the next one is ready (no flicker). */
type StagePreview = { url: string; stage: number };

/** Hold after a stage finishes revealing, before cull/advance. */
const REVEAL_HOLD_MS = 2200;
/** How long an eliminated cat lingers (leaving) before it is gone. */
const ELIMINATION_FADE_MS = 1100;

interface UseBatchShowArgs {
  command: BatchStreamCommand & { seq: number };
  /** Live elimination state from the session — the control page culls into it. */
  liveState: BatchLiveState | null;
  apiKey: string;
}

/**
 * The adoption elimination show's engine, shared by every look: every cat
 * starts as a bare kit; each stage reveals one more parameter on all
 * survivors, then the show waits for the streamer to cull one cat from the
 * control page — until `finalCount` remain. Reveals continue without culls
 * after that, and the saved litter's QR appears at the end. Progress is
 * synced through the session's batchState, so an overlay reload resumes
 * where the show left off.
 */
export function useBatchShow({
  command,
  liveState,
  apiKey,
}: UseBatchShowArgs): BatchShowView {
  const reportBatchStage = useMutation(api.catStream.reportBatchStage);
  const generatorRef = useRef<CatGeneratorApi | null>(null);
  const placeholdersRef = useRef<BatchTortiePlaceholders>(
    BATCH_TORTIE_PLACEHOLDER_FALLBACK,
  );
  const renderTokenRef = useRef(0);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stages = useMemo(
    () => buildBatchStagePlan(command.config, command.cats),
    [command.config, command.cats],
  );
  const maxEliminations = Math.max(0, command.cats.length - command.finalCount);

  const resumeState = liveState?.seq === command.seq ? liveState : null;
  const [phase, setPhase] = useState<BatchScenePhase>("loading");
  const [stageIndex, setStageIndex] = useState(
    () => resumeState?.stageIndex ?? 0,
  );
  const [previews, setPreviews] = useState<Record<string, StagePreview>>({});
  const [ready, setReady] = useState(false);

  const eliminatedIds = useMemo(
    () => (liveState?.seq === command.seq ? liveState.eliminatedIds : []),
    [liveState, command.seq],
  );
  const eliminatedSet = useMemo(() => new Set(eliminatedIds), [eliminatedIds]);
  const lastEliminatedId = eliminatedIds[eliminatedIds.length - 1] ?? null;
  const live = liveState?.seq === command.seq ? liveState : null;
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
  const [fadingId, setFadingId] = useState<string | null>(null);

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
    };
  }, []);

  // Reveal driver: render every survivor at the current stage, then either
  // wait for a cull or advance to the next stage.
  // biome-ignore lint/correctness/useExhaustiveDependencies: eliminatedSet is intentionally read without re-running — culls advance via the effect below
  useEffect(() => {
    if (!ready) return;
    const generator = generatorRef.current;
    if (!generator) return;
    const token = ++renderTokenRef.current;
    setPhase("revealing");

    (async () => {
      const survivors = command.cats.filter(
        (cat) => !eliminatedSet.has(cat.id),
      );
      const revealedThrough = Math.min(stageIndex, stages.length - 1);
      // Render in small parallel batches to keep the overlay responsive.
      for (let start = 0; start < survivors.length; start += 6) {
        if (renderTokenRef.current !== token) return;
        const chunk = survivors.slice(start, start + 6);
        await Promise.all(
          chunk.map(async (cat) => {
            try {
              const params = buildPartialBatchParams(
                cat,
                stages,
                revealedThrough,
                placeholdersRef.current,
              );
              const result = await generator.generateCat(params);
              const url =
                result.imageDataUrl ??
                ("toDataURL" in result.canvas
                  ? (result.canvas as HTMLCanvasElement).toDataURL("image/png")
                  : null);
              if (url && renderTokenRef.current === token) {
                setPreviews((previous) => ({
                  ...previous,
                  [cat.id]: { url, stage: revealedThrough },
                }));
              }
            } catch (renderError) {
              console.warn(
                "[ObsOverlayClient] Failed to render batch cat",
                cat.label,
                renderError,
              );
            }
          }),
        );
      }
      if (renderTokenRef.current !== token) return;

      if (stageIndex >= stages.length) {
        setPhase("done");
        report(stageIndex, false);
        return;
      }

      const cullsRemaining = eliminatedSet.size < maxEliminations;
      advanceTimerRef.current = setTimeout(() => {
        if (renderTokenRef.current !== token) return;
        if (cullsRemaining) {
          setPhase("awaitingCull");
          report(stageIndex, true);
        } else {
          const next = stageIndex + 1;
          setStageIndex(next);
          report(next, false);
        }
      }, REVEAL_HOLD_MS);
    })();

    return () => {
      renderTokenRef.current += 1;
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }
    };
  }, [ready, stageIndex, stages, command.cats, maxEliminations, report]);

  // Cull reaction: when the control page eliminates a cat, let it leave and
  // continue with the next stage. An elimination is only marked as seen
  // once we are in the awaiting phase — a cull that lands while the scene
  // is still (re)rendering (e.g. right after an overlay reload, while the
  // server still says awaitingCull) is processed as soon as the scene
  // re-enters awaitingCull instead of being swallowed.
  //
  // The processed count is derived from the stage being revealed (each of
  // the first `maxEliminations` stages needs exactly one cull to advance),
  // NOT from eliminatedIds.length: reloading right after a cull landed but
  // before the previous overlay instance advanced the stage would otherwise
  // mark that cull as seen and ask for a second one on the same stage.
  const seenEliminationsRef = useRef(Math.min(stageIndex, maxEliminations));
  useEffect(() => {
    if (eliminatedIds.length <= seenEliminationsRef.current) return;
    if (phase !== "awaitingCull") return;
    seenEliminationsRef.current = eliminatedIds.length;
    setFadingId(lastEliminatedId);
    const timer = setTimeout(() => {
      setFadingId(null);
      const next = stageIndex + 1;
      setStageIndex(next);
      report(next, false);
    }, ELIMINATION_FADE_MS);
    return () => clearTimeout(timer);
  }, [eliminatedIds.length, lastEliminatedId, phase, report, stageIndex]);

  const saved = Boolean(command.slug);
  const qrUrl =
    phase === "done" && command.slug && typeof window !== "undefined"
      ? `${window.location.origin}/adoption/${command.slug}`
      : null;

  return useMemo(() => {
    const awaiting = phase === "awaitingCull";
    const cats: BatchViewCat[] = command.cats.map((cat, index) => ({
      id: cat.id,
      number: index + 1,
      numberLabel: formatBatchNumber(index + 1),
      label: cat.label,
      previewUrl: previews[cat.id]?.url ?? null,
      marked: awaiting && cat.id === markedId,
      potential: cat.id !== markedId && potentialSet.has(cat.id),
      favorite: favoriteSet.has(cat.id),
      spotlight: cat.id === spotlightId,
      eliminated: eliminatedSet.has(cat.id),
      fading: cat.id === fadingId,
    }));
    const byId = new Map(cats.map((cat) => [cat.id, cat]));
    const survivors = cats.filter((cat) => !cat.eliminated || cat.fading);
    const eliminated = eliminatedIds
      .map((id) => byId.get(id))
      .filter((cat): cat is BatchViewCat => Boolean(cat));
    const clampedIndex = Math.min(stageIndex, stages.length - 1);
    const stageLabel = stages[clampedIndex]?.label ?? "";
    const spotlightCat = spotlightId ? (byId.get(spotlightId) ?? null) : null;
    return {
      title: command.title ?? "Adoption Elimination",
      phase,
      stages,
      stageIndex: clampedIndex,
      stageNumber: Math.min(stageIndex + 1, stages.length),
      stageLabel,
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
      statusLabel: batchStatusLabel(phase, saved, stageLabel),
    };
  }, [
    command.cats,
    command.title,
    command.finalCount,
    phase,
    previews,
    markedId,
    potentialSet,
    favoriteSet,
    spotlightId,
    eliminatedSet,
    eliminatedIds,
    fadingId,
    stageIndex,
    stages,
    maxEliminations,
    qrUrl,
    saved,
  ]);
}
