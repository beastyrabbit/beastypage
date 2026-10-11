"use client";

import { useMutation } from "convex/react";
import { Expand, Heart, Star } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useCatGenerator } from "@/components/cat-builder/hooks";
import type { SpriteMapperApi } from "@/components/cat-builder/types";
import { api } from "@/convex/_generated/api";
import {
  BATCH_TORTIE_PLACEHOLDER_FALLBACK,
  BATCH_VERDICT_MS,
  type BatchTortiePlaceholders,
  buildBatchStagePlan,
  buildPartialBatchParams,
  formatBatchNumber,
  parseBatchNumberInput,
} from "@/lib/adoption/streamBatch";
import { cn } from "@/lib/utils";
import { stageInputs, summarizeStage } from "../obs/scenes/batch/batchBeats";
import { useStreamControl } from "./context";
import { verdictSecondsLeft } from "./helpers";

/** A verdict whose finalize never ran reads "stuck" this long after verdictAt. */
const VERDICT_STUCK_MS = 10_000;

type Highlight = "potential" | "favorite" | "spotlight";
const HIGHLIGHT_KEYS: Record<string, Highlight> = {
  f: "favorite",
  p: "potential",
  s: "spotlight",
};

function cullStatusLabel(args: {
  pending: boolean;
  stuck: boolean;
  awaiting: boolean;
  dealing: boolean;
  label: string;
  cullsLeft: number;
}): string {
  if (args.pending) return args.stuck ? "Verdict stuck" : "Verdict…";
  if (args.awaiting) return `Pick one (${args.cullsLeft} culls left)`;
  if (args.dealing) return `Dealing ${args.label}…`;
  return "Finalists locked";
}

function cullCardStateClass(
  marked: boolean,
  potential: boolean,
  favorite: boolean,
): string {
  if (marked) {
    return "border-red-500/70 bg-red-500/10 shadow-[0_0_18px_rgba(239,68,68,0.35)]";
  }
  if (potential) {
    return "border-yellow-400/70 bg-yellow-400/10 shadow-[0_0_14px_rgba(250,204,21,0.3)]";
  }
  return favorite ? "border-pink-400/50 bg-pink-400/5" : "border-border/30";
}

function numberBadgeClass(marked: boolean, potential: boolean): string {
  if (marked) return "bg-red-500 text-white";
  if (potential) return "bg-yellow-400 text-yellow-950";
  return "bg-foreground/90 text-background";
}

function cullLabelClass(marked: boolean, potential: boolean): string {
  if (marked) return "text-red-300";
  return potential ? "text-yellow-300" : "text-foreground";
}

/**
 * Full-width live mirror of the elimination show, rendered below the
 * preview so the streamer can actually see the cats. Survivors render at
 * the overlay's current reveal stage. The number field is the console:
 * chat says a number, the streamer types it — Enter marks it, Enter again
 * arms the verdict (a 3 s countdown at the cat on stream, then the cull),
 * Esc cancels the verdict or clears the mark, F / P / S toggle favourite /
 * potential / spotlight. Clicking a card marks it, a double-click arms it.
 * While a verdict runs the marks are frozen; only Cancel and F/P/S stay live.
 */
export function BatchCullBoard() {
  const { currentBatchCommand: command, batchLiveState: liveState } =
    useStreamControl();
  const markBatchCat = useMutation(api.catStream.markBatchCat);
  const cullBatchCat = useMutation(api.catStream.cullBatchCat);
  const cancelBatchCull = useMutation(api.catStream.cancelBatchCull);
  const setBatchHighlight = useMutation(api.catStream.setBatchHighlight);
  const { generator } = useCatGenerator();
  const placeholdersRef = useRef<BatchTortiePlaceholders>(
    BATCH_TORTIE_PLACEHOLDER_FALLBACK,
  );
  const [placeholdersReady, setPlaceholdersReady] = useState(false);
  const renderTokenRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [numberInput, setNumberInput] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const active = Boolean(command && liveState?.seq === command.seq);
  const stages = useMemo(
    () => (command ? buildBatchStagePlan(command.config, command.cats) : []),
    [command],
  );
  const eliminated = useMemo(
    () => new Set(liveState?.eliminatedIds ?? []),
    [liveState?.eliminatedIds],
  );
  const survivors = useMemo(
    () =>
      command ? command.cats.filter((cat) => !eliminated.has(cat.id)) : [],
    [command, eliminated],
  );
  const stageIndex = liveState?.stageIndex ?? 0;
  const stage = stages[Math.min(stageIndex, stages.length - 1)] ?? null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: placeholdersReady flips once the ref is filled; the ref itself is stable
  const summary = useMemo(
    () =>
      stage
        ? summarizeStage(
            stageInputs(survivors, stages, stageIndex, placeholdersRef.current),
            stage,
          )
        : null,
    [stage, stages, stageIndex, survivors, placeholdersReady],
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

  // Verdict numeral + ring: tick while a cull is armed.
  const pendingCullId = liveState?.pendingCullId ?? null;
  useEffect(() => {
    if (!pendingCullId) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [pendingCullId]);

  if (!active || !command || !liveState) return null;

  const maxEliminations = command.cats.length - command.finalCount;
  const cullsLeft = maxEliminations - liveState.eliminatedIds.length;
  const verdictAt =
    typeof liveState.verdictAt === "number" ? liveState.verdictAt : null;
  const pending = Boolean(pendingCullId && verdictAt !== null);
  const stuck =
    pending && verdictAt !== null && verdictAt + VERDICT_STUCK_MS < now;
  const secondsLeft = pending ? verdictSecondsLeft(verdictAt, now) : null;
  const ringFraction =
    pending && verdictAt !== null
      ? Math.min(1, Math.max(0, (verdictAt - now) / BATCH_VERDICT_MS))
      : 0;
  // Marks and culls only while the overlay waits and no verdict is armed.
  const awaiting = liveState.awaitingCull && !pending;
  const dealing = !liveState.awaitingCull && stageIndex < stages.length;
  const potentials = new Set(liveState.potentialIds ?? []);
  const favorites = new Set(liveState.favoriteIds ?? []);
  const spotlightId = liveState.spotlightId ?? null;
  const spotlightCat = spotlightId
    ? (survivors.find((cat) => cat.id === spotlightId) ?? null)
    : null;
  const numberOf = (catId: string) =>
    formatBatchNumber(command.cats.findIndex((cat) => cat.id === catId) + 1);
  const stageLabel = (summary?.label ?? stage?.label ?? "").toUpperCase();
  const pendingNumber = pendingCullId ? numberOf(pendingCullId) : null;

  const report = (error: unknown, fallback: string) =>
    toast.error(error instanceof Error ? error.message : fallback);
  const clearAndRefocus = () => {
    setNumberInput("");
    inputRef.current?.focus();
  };

  const handleMark = (catId: string) => {
    if (!awaiting) return;
    markBatchCat({
      seq: command.seq,
      catId: liveState.markedId === catId ? null : catId,
    }).catch((error) => report(error, "Failed to mark the cat"));
  };

  /** Arm the verdict (or, on a stuck verdict for the same cat, apply it). */
  const handleArm = (catId: string) => {
    if (!liveState.awaitingCull) return;
    cullBatchCat({ seq: command.seq, catId }).catch((error) =>
      report(error, "Failed to remove the cat"),
    );
  };

  const handleCancel = () => {
    cancelBatchCull({ seq: command.seq }).catch((error) =>
      report(error, "Failed to cancel the verdict"),
    );
  };

  const handleHighlight = (catId: string, kind: Highlight) => {
    setBatchHighlight({ seq: command.seq, catId, kind }).catch((error) =>
      report(error, "Failed to update the highlight"),
    );
  };

  // Pick by number: chat says "number 13", the streamer types 13 and acts.
  const typedNumber = parseBatchNumberInput(numberInput, command.cats.length);
  const typedCat =
    typedNumber === null ? null : (command.cats[typedNumber - 1] ?? null);
  const typedGone = Boolean(typedCat && eliminated.has(typedCat.id));
  const typedUsable = Boolean(typedCat) && !typedGone;
  const markedCat = liveState.markedId
    ? (survivors.find((cat) => cat.id === liveState.markedId) ?? null)
    : null;
  const numberHint = (() => {
    if (numberInput.trim() === "") return null;
    if (!typedCat)
      return `No cat with that number (01–${formatBatchNumber(command.cats.length)})`;
    if (typedGone) return `${formatBatchNumber(typedNumber ?? 0)} already left`;
    return null;
  })();
  const actOnTyped = (kind: Highlight) => {
    if (!typedCat || !typedUsable) return;
    handleHighlight(typedCat.id, kind);
    clearAndRefocus();
  };
  // Enter: mark the typed cat; Enter on the marked cat's number arms the
  // verdict. During a stuck verdict Enter re-applies it (the server applies
  // an expired arm inline).
  const handleNumberSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) {
      if (stuck && pendingCullId) {
        handleArm(pendingCullId);
        clearAndRefocus();
      }
      return;
    }
    if (!typedCat || !typedUsable || !awaiting) return;
    if (markedCat && markedCat.id === typedCat.id) handleArm(typedCat.id);
    else handleMark(typedCat.id);
    clearAndRefocus();
  };
  const handleNumberKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (pending) handleCancel();
      else if (liveState.markedId) handleMark(liveState.markedId);
      clearAndRefocus();
      return;
    }
    const highlight = HIGHLIGHT_KEYS[event.key.toLowerCase()];
    if (highlight && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      actOnTyped(highlight);
    }
  };
  const handleRemoveMarked = () => {
    if (!markedCat || !awaiting) return;
    handleArm(markedCat.id);
    clearAndRefocus();
  };

  return (
    <section className="rounded-2xl border border-border/40 bg-background/80 p-5 backdrop-blur">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">
          Live Elimination — {survivors.length} cats
          {stage ? (
            <span className="ml-3 font-mono text-sm font-medium tabular-nums text-muted-foreground">
              Stage {Math.min(stageIndex + 1, stages.length)}/{stages.length} ·{" "}
              {stageLabel}
              {summary ? ` · ${summary.changedCount} changed` : ""}
              {summary && summary.rareIds.length > 0
                ? ` · rare ${summary.rareIds.map((id) => `#${numberOf(id)}`).join(" ")}`
                : ""}
            </span>
          ) : null}
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            Type the number chat says · Enter marks · same number + Enter
            removes · Esc cancels · F / P / S
          </span>
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-semibold",
              pending || awaiting
                ? "border-red-500/50 bg-red-500/10 text-red-300"
                : "border-border/40 text-muted-foreground",
            )}
          >
            {cullStatusLabel({
              pending,
              stuck,
              awaiting,
              dealing,
              label: stageLabel,
              cullsLeft,
            })}
          </span>
        </div>
      </div>

      {/* Pick by number — chat says a number, the streamer types it */}
      <form
        onSubmit={handleNumberSubmit}
        className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border/40 bg-muted/20 p-3"
      >
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span>Number</span>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            // biome-ignore lint/a11y/noAutofocus: the board is a keyboard console; the number field is its one input
            autoFocus
            value={numberInput}
            onChange={(event) => setNumberInput(event.target.value)}
            onKeyDown={handleNumberKey}
            placeholder="13"
            aria-label="Cat number"
            className="w-20 rounded-lg border border-border/50 bg-background px-3 py-1.5 font-mono text-lg font-bold tabular-nums text-foreground outline-none focus:border-amber-400"
          />
        </label>
        <span className="min-w-28 text-sm text-muted-foreground">
          {typedCat && typedUsable
            ? typedCat.label
            : (numberHint ?? "type what chat says")}
        </span>
        <button
          type="submit"
          disabled={!typedUsable || !awaiting}
          className="rounded-lg border border-red-500/60 bg-red-500/10 px-3 py-1.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {markedCat && typedCat && markedCat.id === typedCat.id
            ? "Remove"
            : "Mark"}
        </button>
        <button
          type="button"
          disabled={!typedUsable}
          onClick={() => actOnTyped("potential")}
          className="rounded-lg border border-yellow-400/60 bg-yellow-400/10 px-3 py-1.5 text-sm font-semibold text-yellow-200 transition hover:bg-yellow-400/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Potential
        </button>
        <button
          type="button"
          disabled={!typedUsable}
          onClick={() => actOnTyped("favorite")}
          className="rounded-lg border border-pink-400/60 bg-pink-400/10 px-3 py-1.5 text-sm font-semibold text-pink-200 transition hover:bg-pink-400/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Favourite
        </button>
        <button
          type="button"
          disabled={!typedUsable}
          onClick={() => actOnTyped("spotlight")}
          className="rounded-lg border border-sky-400/60 bg-sky-400/10 px-3 py-1.5 text-sm font-semibold text-sky-200 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Show big
        </button>
        <span className="mx-1 h-6 w-px bg-border/50" aria-hidden="true" />
        <button
          type="button"
          disabled={!awaiting || !markedCat}
          onClick={handleRemoveMarked}
          className="rounded-lg border border-red-500 bg-red-600 px-3 py-1.5 text-sm font-bold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {markedCat ? `Remove ${numberOf(markedCat.id)}` : "Remove marked"}
        </button>
      </form>

      {/* Verdict — the countdown running on stream */}
      {pending && pendingNumber ? (
        <output
          aria-live="polite"
          className="mb-4 flex flex-wrap items-center gap-4 rounded-2xl border border-red-500/50 bg-red-500/10 px-4 py-3"
        >
          {stuck ? (
            <span className="text-sm font-semibold text-red-200">
              Verdict stuck — Enter applies it, Esc clears it
            </span>
          ) : (
            <span className="text-sm font-semibold text-red-200">
              #{pendingNumber} leaves in{" "}
              <span className="ml-1 inline-block min-w-[1.5ch] font-mono text-2xl font-bold tabular-nums text-white">
                {secondsLeft ?? 0}
              </span>
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              handleCancel();
              clearAndRefocus();
            }}
            className="rounded-lg border border-border/50 bg-background px-3 py-1.5 text-sm font-semibold text-foreground transition hover:bg-foreground hover:text-background"
          >
            Cancel
          </button>
        </output>
      ) : null}

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
              <span className="mr-2 rounded-md bg-sky-500 px-2 py-0.5 font-mono text-white">
                {numberOf(spotlightCat.id)}
              </span>
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
          const isPending = pendingCullId === cat.id;
          const marked = liveState.markedId === cat.id || isPending;
          const potential = potentials.has(cat.id);
          const favorite = favorites.has(cat.id);
          const spotlighted = spotlightId === cat.id;
          return (
            <div key={cat.id} className="relative">
              {isPending ? (
                // Countdown ring: a conic sweep masked to a 2 px border.
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-1 rounded-[14px]"
                  style={{
                    padding: 2,
                    background: `conic-gradient(rgb(248 113 113) ${Math.round(ringFraction * 360)}deg, transparent 0)`,
                    WebkitMask:
                      "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                    WebkitMaskComposite: "xor",
                    maskComposite: "exclude",
                  }}
                />
              ) : null}
              <button
                type="button"
                onClick={() => handleMark(cat.id)}
                onDoubleClick={() => {
                  if (awaiting) handleArm(cat.id);
                }}
                disabled={!awaiting}
                className={cn(
                  "flex w-full flex-col items-center rounded-xl border p-2 transition",
                  cullCardStateClass(marked, potential, favorite),
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
                    "mt-1 flex items-center gap-1.5 text-sm font-bold",
                    cullLabelClass(marked, potential),
                  )}
                >
                  <span
                    className={cn(
                      "rounded-md px-1.5 font-mono text-base tabular-nums",
                      numberBadgeClass(marked, potential),
                    )}
                  >
                    {numberOf(cat.id)}
                  </span>
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
