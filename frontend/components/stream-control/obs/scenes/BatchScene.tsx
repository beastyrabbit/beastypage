"use client";

import { useMutation } from "convex/react";
import Image from "next/image";
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
} from "@/lib/adoption/streamBatch";
import { cn } from "@/lib/utils";
import { QrBadge } from "../QrBadge";

interface BatchSceneProps {
  command: BatchStreamCommand & { seq: number };
  /** Live elimination state from the session — the control page culls into it. */
  liveState: BatchLiveState | null;
  apiKey: string;
}

type ScenePhase = "loading" | "revealing" | "awaitingCull" | "done";

/** A rendered sprite, tagged with the stage it shows — the grid keeps the
 * previous stage's image until the next one is ready (no flicker). */
type StagePreview = { url: string; stage: number };

/** Hold after a stage finishes revealing, before cull/advance. */
const REVEAL_HOLD_MS = 2200;
/** How long an eliminated card lingers (fading) before leaving the grid. */
const ELIMINATION_FADE_MS = 1100;

/** Inner size of the cat grid on the 1280×1080 canvas. */
const GRID_WIDTH = 1280 - 64 - 32 - 4;
const GRID_HEIGHT = 1080 - 48 - 52 - 32 - 4;
const GRID_GAP = 8;
const LABEL_HEIGHT = 34;

/**
 * Pick the column count that maximises sprite size for the survivor count —
 * fewer cats automatically get bigger sprites after every elimination.
 */
function packGrid(count: number): { columns: number; spriteSize: number } {
  let best = { columns: 1, spriteSize: 0 };
  for (let columns = 1; columns <= Math.max(1, count); columns++) {
    const rows = Math.ceil(count / columns);
    const cellWidth = (GRID_WIDTH - (columns - 1) * GRID_GAP) / columns - 16;
    const cellHeight = (GRID_HEIGHT - (rows - 1) * GRID_GAP) / rows;
    const size = Math.floor(Math.min(cellWidth, cellHeight - LABEL_HEIGHT));
    if (size > best.spriteSize) {
      best = { columns, spriteSize: size };
    }
  }
  best.spriteSize = Math.min(best.spriteSize, 340);
  return best;
}

/**
 * The adoption elimination show: every cat starts as a bare kit; each stage
 * reveals one more parameter on all survivors, then the show waits for the
 * streamer to cull one cat from the control page — until `finalCount`
 * remain. Reveals continue without culls after that, and the saved litter's
 * QR appears at the end. Progress is synced through the session's
 * batchState, so an overlay reload resumes where the show left off.
 */
export function BatchScene({ command, liveState, apiKey }: BatchSceneProps) {
  const reportBatchStage = useMutation(api.catStream.reportBatchStage);
  const generatorRef = useRef<CatGeneratorApi | null>(null);
  const placeholdersRef = useRef<BatchTortiePlaceholders>(
    BATCH_TORTIE_PLACEHOLDER_FALLBACK,
  );
  const renderTokenRef = useRef(0);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stages = useMemo(
    () => buildBatchStagePlan(command.config),
    [command.config],
  );
  const maxEliminations = Math.max(0, command.cats.length - command.finalCount);

  const resumeState = liveState?.seq === command.seq ? liveState : null;
  const [phase, setPhase] = useState<ScenePhase>("loading");
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

  // Cull reaction: when the control page eliminates a cat, fade it out and
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

  const survivors = command.cats.filter(
    (cat) => !eliminatedSet.has(cat.id) || cat.id === fadingId,
  );
  const remaining = command.cats.length - eliminatedSet.size;
  const currentStage = stages[Math.min(stageIndex, stages.length - 1)];
  const { columns, spriteSize } = packGrid(survivors.length);
  const spotlightCat = spotlightId
    ? (survivors.find((cat) => cat.id === spotlightId) ?? null)
    : null;
  const spotlightPreview = spotlightCat
    ? (previews[spotlightCat.id] ?? null)
    : null;

  const qrUrl =
    phase === "done" && command.slug && typeof window !== "undefined"
      ? `${window.location.origin}/adoption/${command.slug}`
      : null;

  return (
    <div
      className="relative flex flex-col"
      style={{ width: "1280px", height: "1080px", padding: "24px 32px" }}
    >
      <style>{`
        @keyframes obs-batch-flash {
          0% { filter: brightness(2.2); }
          100% { filter: brightness(1); }
        }
        @keyframes obs-batch-marked {
          0%, 100% { box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.5), 0 0 26px rgba(239, 68, 68, 0.35); }
          50% { box-shadow: 0 0 0 5px rgba(239, 68, 68, 0.95), 0 0 44px rgba(239, 68, 68, 0.6); }
        }
        @keyframes obs-batch-potential {
          0%, 100% { box-shadow: 0 0 0 3px rgba(250, 204, 21, 0.45), 0 0 22px rgba(250, 204, 21, 0.3); }
          50% { box-shadow: 0 0 0 4px rgba(250, 204, 21, 0.8), 0 0 36px rgba(250, 204, 21, 0.5); }
        }
        .obs-batch-card { position: relative; transition: opacity 1s ease, transform 1s ease; border-radius: 16px; padding: 6px 8px; }
        .obs-batch-card.marked { animation: obs-batch-marked 1.1s ease-in-out infinite; background: rgba(80, 12, 12, 0.45); }
        .obs-batch-card.potential { animation: obs-batch-potential 1.4s ease-in-out infinite; background: rgba(80, 64, 8, 0.4); }
        .obs-batch-card.eliminated { opacity: 0; transform: scale(0.7) rotate(6deg); }
        .obs-batch-sprite { animation: obs-batch-flash 600ms ease; }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between pb-3">
        <span className="font-mono text-xl font-bold uppercase tracking-[0.3em] text-amber-200">
          🐾 {command.title ?? "Adoption Elimination"}
        </span>
        <div className="flex items-center gap-5 font-mono text-base text-white/70">
          <span>
            Cats: <strong className="text-xl text-white">{remaining}</strong>
            <span className="text-white/50"> → {command.finalCount}</span>
          </span>
          <span>
            Stage{" "}
            <strong className="text-xl text-white">
              {Math.min(stageIndex + 1, stages.length)}
            </strong>
            /{stages.length}
          </span>
          <span className="text-amber-300">
            {phase === "loading"
              ? "Summoning…"
              : phase === "done"
                ? command.slug
                  ? "✨ Complete ✨"
                  : "Saving…"
                : phase === "awaitingCull"
                  ? "Choosing who leaves…"
                  : `Rolling ${currentStage?.label ?? ""}…`}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-5">
        {/* Cat grid */}
        <div
          className="grid min-w-0 flex-1 content-evenly justify-items-center gap-2 overflow-hidden rounded-3xl border-2 p-4"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            background:
              "linear-gradient(180deg, rgba(10,10,10,0.92) 0%, rgba(15,12,5,0.90) 100%)",
            borderColor: "rgba(245, 158, 11, 0.2)",
            boxShadow:
              "0 0 60px rgba(245, 158, 11, 0.06), inset 0 1px 0 rgba(245, 158, 11, 0.08)",
          }}
        >
          {survivors.map((cat) => {
            const preview = previews[cat.id];
            const marked = cat.id === markedId && phase === "awaitingCull";
            const potential = !marked && potentialSet.has(cat.id);
            const favorite = favoriteSet.has(cat.id);
            return (
              <div
                key={cat.id}
                className={cn(
                  "obs-batch-card flex flex-col items-center",
                  marked && "marked",
                  potential && "potential",
                  cat.id === fadingId && "eliminated",
                )}
              >
                {preview ? (
                  <Image
                    // Keyed by the rendered stage, not the live one — the
                    // previous sprite stays until the new render is ready.
                    key={`${cat.id}-${preview.stage}`}
                    src={preview.url}
                    alt={cat.label}
                    width={spriteSize}
                    height={spriteSize}
                    unoptimized
                    className="obs-batch-sprite image-render-pixel object-contain"
                    style={{ width: spriteSize, height: spriteSize }}
                  />
                ) : (
                  <div
                    className="flex items-center justify-center text-[10px] text-white/30"
                    style={{ width: spriteSize, height: spriteSize }}
                  >
                    …
                  </div>
                )}
                {favorite && (
                  <span
                    className="absolute right-1 top-1 text-xl"
                    style={{
                      filter: "drop-shadow(0 0 6px rgba(244,114,182,0.8))",
                    }}
                  >
                    💖
                  </span>
                )}
                <span
                  className={cn(
                    "max-w-full truncate text-base font-bold",
                    marked
                      ? "text-red-300"
                      : potential
                        ? "text-yellow-200"
                        : "text-white/90",
                  )}
                >
                  {cat.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Spotlight — one cat shown big over the grid */}
        {spotlightCat && spotlightPreview && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
            <div
              className="flex flex-col items-center rounded-3xl border-2 px-12 py-8"
              style={{
                background: "rgba(8, 8, 10, 0.94)",
                borderColor: "rgba(56, 189, 248, 0.5)",
                boxShadow:
                  "0 0 90px rgba(0,0,0,0.8), 0 0 50px rgba(56,189,248,0.25)",
              }}
            >
              <Image
                src={spotlightPreview.url}
                alt={spotlightCat.label}
                width={520}
                height={520}
                unoptimized
                className="image-render-pixel object-contain"
                style={{ width: 520, height: 520 }}
              />
              <span className="mt-2 text-3xl font-black text-white">
                {spotlightCat.label}
              </span>
            </div>
          </div>
        )}

        {/* QR side panel — once the show is over and the litter is saved */}
        {qrUrl && (
          <div className="flex w-[250px] shrink-0 flex-col items-center justify-center">
            <QrBadge url={qrUrl} label="Scan for the litter" size={185} />
          </div>
        )}
      </div>
    </div>
  );
}
