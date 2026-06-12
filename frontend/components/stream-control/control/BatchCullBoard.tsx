"use client";

import { useMutation } from "convex/react";
import { Expand, Heart, Star } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useCatGenerator } from "@/components/cat-builder/hooks";
import type { SpriteMapperApi } from "@/components/cat-builder/types";
import { api } from "@/convex/_generated/api";
import {
  BATCH_TORTIE_PLACEHOLDER_FALLBACK,
  type BatchTortiePlaceholders,
  buildBatchStagePlan,
  buildPartialBatchParams,
} from "@/lib/adoption/streamBatch";
import { cn } from "@/lib/utils";
import { useStreamControl } from "./context";

/**
 * Full-width live mirror of the elimination show, rendered below the
 * preview so the streamer can actually see the cats. Survivors render at
 * the overlay's current reveal stage; while the overlay waits for a cull,
 * a single click marks a cat (viewers see the mark on stream) and a
 * double-click removes it. Each card also has round corner buttons:
 * top-left shows the sprite big (overlay + here), top-right marks a
 * yellow "potential" (resets each cull), bottom-right a favourite
 * (persists for the whole show).
 */
export function BatchCullBoard() {
  const { currentBatchCommand: command, batchLiveState: liveState } =
    useStreamControl();
  const markBatchCat = useMutation(api.catStream.markBatchCat);
  const cullBatchCat = useMutation(api.catStream.cullBatchCat);
  const setBatchHighlight = useMutation(api.catStream.setBatchHighlight);
  const { generator } = useCatGenerator();
  const placeholdersRef = useRef<BatchTortiePlaceholders>(
    BATCH_TORTIE_PLACEHOLDER_FALLBACK,
  );
  const [placeholdersReady, setPlaceholdersReady] = useState(false);
  const renderTokenRef = useRef(0);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [culling, setCulling] = useState(false);

  const active = Boolean(command && liveState && liveState.seq === command.seq);
  const stages = useMemo(
    () => (command ? buildBatchStagePlan(command.config) : []),
    [command],
  );
  const eliminated = useMemo(
    () => new Set(liveState?.eliminatedIds ?? []),
    [liveState?.eliminatedIds],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { default: spriteMapper } = await import(
          "@/lib/single-cat/spriteMapper"
        );
        const mapper = spriteMapper as unknown as SpriteMapperApi;
        if (!mapper.loaded) await mapper.init();
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
        setPlaceholdersReady(true);
      } catch (error) {
        console.warn("Failed to load sprite mapper for cull board", error);
        setPlaceholdersReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-render survivors whenever the overlay advances a stage.
  // biome-ignore lint/correctness/useExhaustiveDependencies: survivors derive from command.cats + eliminatedIds, both covered
  useEffect(() => {
    if (!active || !command || !liveState) return;
    if (!generator || !placeholdersReady) return;
    const token = ++renderTokenRef.current;
    const survivors = command.cats.filter((cat) => !eliminated.has(cat.id));
    (async () => {
      for (const cat of survivors) {
        if (renderTokenRef.current !== token) return;
        try {
          const params = buildPartialBatchParams(
            cat,
            stages,
            Math.min(liveState.stageIndex, stages.length - 1),
            placeholdersRef.current,
          );
          const result = await generator.generateCat(params);
          const url =
            result.imageDataUrl ??
            ("toDataURL" in result.canvas
              ? (result.canvas as HTMLCanvasElement).toDataURL("image/png")
              : null);
          if (url && renderTokenRef.current === token) {
            setPreviews((previous) => ({ ...previous, [cat.id]: url }));
          }
        } catch {
          /* keep the previous preview */
        }
      }
    })();
    return () => {
      renderTokenRef.current += 1;
    };
  }, [
    active,
    generator,
    placeholdersReady,
    stages,
    liveState?.stageIndex,
    liveState?.eliminatedIds.length,
    command?.cats,
  ]);

  // Re-arm for the next removal round.
  useEffect(() => {
    if (liveState?.awaitingCull) {
      setCulling(false);
    }
  }, [liveState?.awaitingCull]);

  if (!active || !command || !liveState) return null;

  const survivors = command.cats.filter((cat) => !eliminated.has(cat.id));
  const maxEliminations = command.cats.length - command.finalCount;
  const cullsLeft = maxEliminations - liveState.eliminatedIds.length;
  const awaiting = liveState.awaitingCull && !culling;
  const potentials = new Set(liveState.potentialIds ?? []);
  const favorites = new Set(liveState.favoriteIds ?? []);
  const spotlightId = liveState.spotlightId ?? null;
  const spotlightCat = spotlightId
    ? (survivors.find((cat) => cat.id === spotlightId) ?? null)
    : null;

  const handleMark = (catId: string) => {
    if (!awaiting) return;
    markBatchCat({
      seq: command.seq,
      catId: liveState.markedId === catId ? null : catId,
    }).catch(() => {});
  };

  const handleCull = (catId: string) => {
    if (!awaiting) return;
    setCulling(true);
    cullBatchCat({ seq: command.seq, catId }).catch((error) => {
      setCulling(false);
      toast.error(
        error instanceof Error ? error.message : "Failed to remove the cat",
      );
    });
  };

  const handleHighlight = (
    catId: string,
    kind: "potential" | "favorite" | "spotlight",
  ) => {
    setBatchHighlight({ seq: command.seq, catId, kind }).catch(() => {});
  };

  return (
    <section className="rounded-2xl border border-border/40 bg-background/80 p-5 backdrop-blur">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">
          Live Elimination — {survivors.length} cats
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            Click marks a cat for chat · double-click removes it
          </span>
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-semibold",
              awaiting
                ? "border-red-500/50 bg-red-500/10 text-red-300"
                : "border-border/40 text-muted-foreground",
            )}
          >
            {awaiting
              ? `Pick one (${cullsLeft} culls left)`
              : cullsLeft > 0
                ? "Revealing…"
                : "Finalists locked"}
          </span>
        </div>
      </div>

      {/* Spotlight — the cat currently shown big on stream */}
      {spotlightCat && (
        <div className="mb-4 flex items-center gap-5 rounded-2xl border border-sky-500/40 bg-sky-500/5 p-4">
          {previews[spotlightCat.id] ? (
            // biome-ignore lint/performance/noImgElement: renders base64 data URLs
            <img
              src={previews[spotlightCat.id]}
              alt={spotlightCat.label}
              className="image-render-pixel size-64 object-contain"
            />
          ) : (
            <div className="flex size-64 items-center justify-center text-xs text-muted-foreground/40">
              …
            </div>
          )}
          <div className="flex flex-col gap-2">
            <span className="text-2xl font-bold text-foreground">
              {spotlightCat.label}
            </span>
            <span className="text-sm text-sky-300">
              Spotlighted — viewers see this cat big on stream.
            </span>
            <button
              type="button"
              onClick={() => handleHighlight(spotlightCat.id, "spotlight")}
              className="self-start rounded-lg border border-border/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background"
            >
              Close spotlight
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 xl:grid-cols-8">
        {survivors.map((cat) => {
          const url = previews[cat.id];
          const marked = liveState.markedId === cat.id;
          const potential = potentials.has(cat.id);
          const favorite = favorites.has(cat.id);
          const spotlighted = spotlightId === cat.id;
          return (
            <div key={cat.id} className="relative">
              <button
                type="button"
                onClick={() => handleMark(cat.id)}
                onDoubleClick={() => handleCull(cat.id)}
                disabled={!awaiting}
                className={cn(
                  "flex w-full flex-col items-center rounded-xl border p-2 transition",
                  marked
                    ? "border-red-500/70 bg-red-500/10 shadow-[0_0_18px_rgba(239,68,68,0.35)]"
                    : potential
                      ? "border-yellow-400/70 bg-yellow-400/10 shadow-[0_0_14px_rgba(250,204,21,0.3)]"
                      : favorite
                        ? "border-pink-400/50 bg-pink-400/5"
                        : "border-border/30",
                  spotlighted && "ring-2 ring-sky-400/70",
                  awaiting
                    ? "cursor-pointer hover:border-amber-500/50 hover:bg-amber-500/5"
                    : "cursor-default opacity-90",
                )}
              >
                {url ? (
                  // biome-ignore lint/performance/noImgElement: renders base64 data URLs
                  <img
                    src={url}
                    alt={cat.label}
                    className="image-render-pixel size-28 object-contain"
                  />
                ) : (
                  <div className="flex size-28 items-center justify-center text-xs text-muted-foreground/40">
                    …
                  </div>
                )}
                <span
                  className={cn(
                    "mt-1 text-sm font-bold",
                    marked
                      ? "text-red-300"
                      : potential
                        ? "text-yellow-300"
                        : "text-foreground",
                  )}
                >
                  {cat.label}
                </span>
              </button>

              {/* Round corner buttons — absolutely positioned SIBLINGS of
                  the card button (never nested inside it), so their clicks
                  can't reach the mark/cull handlers */}
              <button
                type="button"
                title="Show big on stream"
                onClick={() => handleHighlight(cat.id, "spotlight")}
                className={cn(
                  "absolute -left-1.5 -top-1.5 flex size-7 items-center justify-center rounded-full border shadow-sm transition",
                  spotlighted
                    ? "border-sky-400 bg-sky-500 text-white"
                    : "border-border/50 bg-background text-muted-foreground hover:border-sky-400/60 hover:text-sky-300",
                )}
              >
                <Expand className="size-3.5" />
              </button>
              <button
                type="button"
                title="Mark as potential (resets each cull)"
                onClick={() => handleHighlight(cat.id, "potential")}
                className={cn(
                  "absolute -right-1.5 -top-1.5 flex size-7 items-center justify-center rounded-full border shadow-sm transition",
                  potential
                    ? "border-yellow-400 bg-yellow-400 text-yellow-950"
                    : "border-border/50 bg-background text-muted-foreground hover:border-yellow-400/60 hover:text-yellow-300",
                )}
              >
                <Star className="size-3.5" />
              </button>
              <button
                type="button"
                title="Favourite (stays between culls)"
                onClick={() => handleHighlight(cat.id, "favorite")}
                className={cn(
                  "absolute -bottom-1.5 -right-1.5 flex size-7 items-center justify-center rounded-full border shadow-sm transition",
                  favorite
                    ? "border-pink-400 bg-pink-500 text-white"
                    : "border-border/50 bg-background text-muted-foreground hover:border-pink-400/60 hover:text-pink-300",
                )}
              >
                <Heart className={cn("size-3.5", favorite && "fill-current")} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
