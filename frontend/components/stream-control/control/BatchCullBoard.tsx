"use client";

import { Expand, Heart, Star } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useCatGenerator } from "@/components/cat-builder/hooks";
import type {
  CatGeneratorApi,
  SpriteMapperApi,
} from "@/components/cat-builder/types";
import {
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
  parseBatchNumberInput,
} from "@/lib/adoption/streamBatch";
import {
  useCancelBatchCull,
  useCullBatchCat,
  useMarkBatchCat,
  useSetBatchHighlight,
} from "@/lib/data/stream";
import { cn } from "@/lib/utils";
import {
  type StageSummary,
  stageInputs,
  summarizeStage,
} from "../obs/scenes/batch/batchBeats";
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

type LiveBatchCommand = BatchStreamCommand & { seq: number; timestamp: number };
type GeneratedCat = Awaited<ReturnType<CatGeneratorApi["generateCat"]>>;

function report(error: unknown, fallback: string) {
  toast.error(error instanceof Error ? error.message : fallback);
}

/** Loads the sprite mapper once and fills the tortie placeholder params. */
function useTortiePlaceholders(): {
  placeholdersRef: RefObject<BatchTortiePlaceholders>;
  placeholdersReady: boolean;
} {
  const placeholdersRef = useRef<BatchTortiePlaceholders>(
    BATCH_TORTIE_PLACEHOLDER_FALLBACK,
  );
  const [placeholdersReady, setPlaceholdersReady] = useState(false);
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
  return { placeholdersRef, placeholdersReady };
}

/** The stage plan, who is still in and the current stage's summary. */
function useBatchBoardModel(
  command: LiveBatchCommand | null,
  liveState: BatchLiveState | null,
  placeholdersRef: RefObject<BatchTortiePlaceholders>,
  placeholdersReady: boolean,
) {
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
  return { active, stages, eliminated, survivors, stageIndex, stage, summary };
}

function previewUrl(result: GeneratedCat): string | null {
  return (
    result.imageDataUrl ??
    ("toDataURL" in result.canvas
      ? (result.canvas as HTMLCanvasElement).toDataURL("image/png")
      : null)
  );
}

/** Renders every survivor at the stage, publishing while the token stays current. */
async function renderSurvivorPreviews(args: {
  generator: CatGeneratorApi;
  survivors: readonly BatchStreamCat[];
  stages: BatchStage[];
  stageIndex: number;
  placeholdersRef: RefObject<BatchTortiePlaceholders>;
  isCurrent: () => boolean;
  publish: (catId: string, url: string) => void;
}): Promise<void> {
  for (const cat of args.survivors) {
    if (!args.isCurrent()) return;
    try {
      const params = buildPartialBatchParams(
        cat,
        args.stages,
        args.stageIndex,
        args.placeholdersRef.current,
      );
      const url = previewUrl(await args.generator.generateCat(params));
      if (url && args.isCurrent()) args.publish(cat.id, url);
    } catch {
      /* keep the previous preview */
    }
  }
}

/** Re-renders survivors whenever the overlay advances a stage. */
function useSurvivorPreviews(args: {
  active: boolean;
  command: LiveBatchCommand | null;
  liveState: BatchLiveState | null;
  generator: CatGeneratorApi | null;
  placeholdersRef: RefObject<BatchTortiePlaceholders>;
  placeholdersReady: boolean;
  stages: BatchStage[];
  eliminated: Set<string>;
}): Record<string, string> {
  const {
    active,
    command,
    liveState,
    generator,
    placeholdersRef,
    placeholdersReady,
    stages,
    eliminated,
  } = args;
  const renderTokenRef = useRef(0);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  // biome-ignore lint/correctness/useExhaustiveDependencies: survivors derive from command.cats + eliminatedIds, both covered
  useEffect(() => {
    if (!active || !command || !liveState) return;
    if (!generator || !placeholdersReady) return;
    const token = ++renderTokenRef.current;
    void renderSurvivorPreviews({
      generator,
      survivors: command.cats.filter((cat) => !eliminated.has(cat.id)),
      stages,
      stageIndex: Math.min(liveState.stageIndex, stages.length - 1),
      placeholdersRef,
      isCurrent: () => renderTokenRef.current === token,
      publish: (catId, url) =>
        setPreviews((previous) => ({ ...previous, [catId]: url })),
    });
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
  return previews;
}

/** Ticks every 250 ms while a cull is armed, for the verdict numeral and ring. */
function useVerdictClock(pendingCullId: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!pendingCullId) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [pendingCullId]);
  return now;
}

interface VerdictView {
  pending: boolean;
  stuck: boolean;
  secondsLeft: number | null;
  ringFraction: number;
}

/** The armed verdict as the board shows it: countdown, ring sweep, stuck flag. */
function verdictView(
  liveState: BatchLiveState,
  pendingCullId: string | null,
  now: number,
): VerdictView {
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
  return { pending, stuck, secondsLeft, ringFraction };
}

function useCullMutations() {
  const markBatchCat = useMarkBatchCat();
  const cullBatchCat = useCullBatchCat();
  const cancelBatchCull = useCancelBatchCull();
  const setBatchHighlight = useSetBatchHighlight();
  return { markBatchCat, cullBatchCat, cancelBatchCull, setBatchHighlight };
}
type CullMutations = ReturnType<typeof useCullMutations>;

interface CullActions {
  mark: (catId: string) => void;
  /** Arm the verdict (or, on a stuck verdict for the same cat, apply it). */
  arm: (catId: string) => void;
  cancel: () => void;
  highlight: (catId: string, kind: Highlight) => void;
}

/** Handlers gated on the live state: marks only while awaiting, arms only while a cull is open. */
function buildCullActions(
  mutations: CullMutations,
  seq: number,
  liveState: BatchLiveState,
  awaiting: boolean,
): CullActions {
  return {
    mark: (catId) => {
      if (!awaiting) return;
      mutations
        .markBatchCat({
          seq,
          catId: liveState.markedId === catId ? null : catId,
        })
        .catch((error) => report(error, "Failed to mark the cat"));
    },
    arm: (catId) => {
      if (!liveState.awaitingCull) return;
      mutations
        .cullBatchCat({ seq, catId })
        .catch((error) => report(error, "Failed to remove the cat"));
    },
    cancel: () => {
      mutations
        .cancelBatchCull({ seq })
        .catch((error) => report(error, "Failed to cancel the verdict"));
    },
    highlight: (catId, kind) => {
      mutations
        .setBatchHighlight({ seq, catId, kind })
        .catch((error) => report(error, "Failed to update the highlight"));
    },
  };
}

interface TypedCatState {
  typedCat: BatchStreamCat | null;
  typedUsable: boolean;
  markedCat: BatchStreamCat | null;
  hint: string | null;
}

function numberHint(
  input: string,
  typedNumber: number | null,
  typedCat: BatchStreamCat | null,
  typedGone: boolean,
  total: number,
): string | null {
  if (input.trim() === "") return null;
  if (!typedCat)
    return `No cat with that number (01–${formatBatchNumber(total)})`;
  if (typedGone) return `${formatBatchNumber(typedNumber ?? 0)} already left`;
  return null;
}

/** What the number field points at: chat says "13", the streamer types 13. */
function typedCatState(
  input: string,
  command: LiveBatchCommand,
  eliminated: Set<string>,
  survivors: readonly BatchStreamCat[],
  markedId: string | null,
): TypedCatState {
  const typedNumber = parseBatchNumberInput(input, command.cats.length);
  const typedCat =
    typedNumber === null ? null : (command.cats[typedNumber - 1] ?? null);
  const typedGone = Boolean(typedCat && eliminated.has(typedCat.id));
  const typedUsable = Boolean(typedCat) && !typedGone;
  const markedCat = markedId
    ? (survivors.find((cat) => cat.id === markedId) ?? null)
    : null;
  return {
    typedCat,
    typedUsable,
    markedCat,
    hint: numberHint(
      input,
      typedNumber,
      typedCat,
      typedGone,
      command.cats.length,
    ),
  };
}

/** Everything the number console's submit and key handlers act on. */
interface NumberConsole extends TypedCatState {
  markedId: string | null;
  awaiting: boolean;
  pending: boolean;
  stuck: boolean;
  pendingCullId: string | null;
  actions: CullActions;
  clearAndRefocus: () => void;
}

// Enter: mark the typed cat; Enter on the marked cat's number arms the
// verdict. During a stuck verdict Enter re-applies it (the server applies
// an expired arm inline).
function submitNumber(ctx: NumberConsole, event: FormEvent): void {
  event.preventDefault();
  const { typedCat, actions } = ctx;
  if (ctx.pending) {
    if (ctx.stuck && ctx.pendingCullId) {
      actions.arm(ctx.pendingCullId);
      ctx.clearAndRefocus();
    }
    return;
  }
  if (!typedCat || !ctx.typedUsable || !ctx.awaiting) return;
  if (ctx.markedCat?.id === typedCat.id) actions.arm(typedCat.id);
  else actions.mark(typedCat.id);
  ctx.clearAndRefocus();
}

function actOnTypedCat(ctx: NumberConsole, kind: Highlight): void {
  if (!ctx.typedCat || !ctx.typedUsable) return;
  ctx.actions.highlight(ctx.typedCat.id, kind);
  ctx.clearAndRefocus();
}

/** Esc cancels the verdict or clears the mark; F / P / S act on the typed cat. */
function handleConsoleKey(
  ctx: NumberConsole,
  event: KeyboardEvent<HTMLInputElement>,
): void {
  if (event.key === "Escape") {
    event.preventDefault();
    if (ctx.pending) ctx.actions.cancel();
    else if (ctx.markedId) ctx.actions.mark(ctx.markedId);
    ctx.clearAndRefocus();
    return;
  }
  const highlight = HIGHLIGHT_KEYS[event.key.toLowerCase()];
  if (highlight && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    actOnTypedCat(ctx, highlight);
  }
}

function removeMarkedCat(ctx: NumberConsole): void {
  if (!ctx.markedCat || !ctx.awaiting) return;
  ctx.actions.arm(ctx.markedCat.id);
  ctx.clearAndRefocus();
}

function StageHeadline({
  stageIndex,
  stageCount,
  label,
  summary,
  numberOf,
}: Readonly<{
  stageIndex: number;
  stageCount: number;
  label: string;
  summary: StageSummary | null;
  numberOf: (catId: string) => string;
}>) {
  const rareNumbers =
    summary?.rareIds.map((id) => `#${numberOf(id)}`).join(" ") ?? "";
  return (
    <span className="ml-3 font-mono text-sm font-medium tabular-nums text-muted-foreground">
      Stage {Math.min(stageIndex + 1, stageCount)}/{stageCount} · {label}
      {summary ? ` · ${summary.changedCount} changed` : ""}
      {rareNumbers ? ` · rare ${rareNumbers}` : ""}
    </span>
  );
}

/** Pick by number — chat says a number, the streamer types it. */
function NumberConsoleForm({
  ctx,
  inputRef,
  value,
  onChange,
  numberOf,
}: Readonly<{
  ctx: NumberConsole;
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  numberOf: (catId: string) => string;
}>) {
  const { typedCat, typedUsable, markedCat, awaiting } = ctx;
  return (
    <form
      onSubmit={(event) => submitNumber(ctx, event)}
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
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => handleConsoleKey(ctx, event)}
          placeholder="13"
          aria-label="Cat number"
          className="w-20 rounded-lg border border-border/50 bg-background px-3 py-1.5 font-mono text-lg font-bold tabular-nums text-foreground outline-none focus:border-amber-400"
        />
      </label>
      <span className="min-w-28 text-sm text-muted-foreground">
        {typedCat && typedUsable
          ? typedCat.label
          : (ctx.hint ?? "type what chat says")}
      </span>
      <button
        type="submit"
        disabled={!typedUsable || !awaiting}
        className="rounded-lg border border-red-500/60 bg-red-500/10 px-3 py-1.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {markedCat && markedCat.id === typedCat?.id ? "Remove" : "Mark"}
      </button>
      <button
        type="button"
        disabled={!typedUsable}
        onClick={() => actOnTypedCat(ctx, "potential")}
        className="rounded-lg border border-yellow-400/60 bg-yellow-400/10 px-3 py-1.5 text-sm font-semibold text-yellow-200 transition hover:bg-yellow-400/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Potential
      </button>
      <button
        type="button"
        disabled={!typedUsable}
        onClick={() => actOnTypedCat(ctx, "favorite")}
        className="rounded-lg border border-pink-400/60 bg-pink-400/10 px-3 py-1.5 text-sm font-semibold text-pink-200 transition hover:bg-pink-400/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Favourite
      </button>
      <button
        type="button"
        disabled={!typedUsable}
        onClick={() => actOnTypedCat(ctx, "spotlight")}
        className="rounded-lg border border-sky-400/60 bg-sky-400/10 px-3 py-1.5 text-sm font-semibold text-sky-200 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Show big
      </button>
      <span className="mx-1 h-6 w-px bg-border/50" aria-hidden="true" />
      <button
        type="button"
        disabled={!awaiting || !markedCat}
        onClick={() => removeMarkedCat(ctx)}
        className="rounded-lg border border-red-500 bg-red-600 px-3 py-1.5 text-sm font-bold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {markedCat ? `Remove ${numberOf(markedCat.id)}` : "Remove marked"}
      </button>
    </form>
  );
}

/** Verdict — the countdown running on stream. */
function VerdictBanner({
  pending,
  pendingNumber,
  stuck,
  secondsLeft,
  onCancel,
}: Readonly<{
  pending: boolean;
  pendingNumber: string | null;
  stuck: boolean;
  secondsLeft: number | null;
  onCancel: () => void;
}>) {
  if (!pending || !pendingNumber) return null;
  return (
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
        onClick={onCancel}
        className="rounded-lg border border-border/50 bg-background px-3 py-1.5 text-sm font-semibold text-foreground transition hover:bg-foreground hover:text-background"
      >
        Cancel
      </button>
    </output>
  );
}

/** Spotlight — the cat currently shown big on stream. */
function SpotlightCard({
  spotlightId,
  survivors,
  previews,
  numberOf,
  onClose,
}: Readonly<{
  spotlightId: string | null;
  survivors: readonly BatchStreamCat[];
  previews: Record<string, string>;
  numberOf: (catId: string) => string;
  onClose: (catId: string) => void;
}>) {
  const cat = spotlightId
    ? (survivors.find((candidate) => candidate.id === spotlightId) ?? null)
    : null;
  if (!cat) return null;
  const url = previews[cat.id];
  return (
    <div className="mb-4 flex items-center gap-5 rounded-2xl border border-sky-500/40 bg-sky-500/5 p-4">
      {url ? (
        // biome-ignore lint/performance/noImgElement: renders base64 data URLs
        <img
          src={url}
          alt={cat.label}
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
            {numberOf(cat.id)}
          </span>
          {cat.label}
        </span>
        <span className="text-sm text-sky-300">
          Spotlighted — viewers see this cat big on stream.
        </span>
        <button
          type="button"
          onClick={() => onClose(cat.id)}
          className="self-start rounded-lg border border-border/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background"
        >
          Close spotlight
        </button>
      </div>
    </div>
  );
}

interface BoardHighlights {
  markedId: string | null;
  pendingCullId: string | null;
  spotlightId: string | null;
  potentials: ReadonlySet<string>;
  favorites: ReadonlySet<string>;
}

/** One survivor: the card button, its countdown ring and the corner highlight buttons. */
function CullCard({
  cat,
  url,
  number,
  highlights,
  awaiting,
  ringFraction,
  actions,
}: Readonly<{
  cat: BatchStreamCat;
  url: string | undefined;
  number: string;
  highlights: BoardHighlights;
  awaiting: boolean;
  ringFraction: number;
  actions: CullActions;
}>) {
  const isPending = highlights.pendingCullId === cat.id;
  const marked = highlights.markedId === cat.id || isPending;
  const potential = highlights.potentials.has(cat.id);
  const favorite = highlights.favorites.has(cat.id);
  const spotlighted = highlights.spotlightId === cat.id;
  return (
    <div className="relative">
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
        onClick={() => actions.mark(cat.id)}
        onDoubleClick={() => {
          if (awaiting) actions.arm(cat.id);
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
            {number}
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
        onClick={() => actions.highlight(cat.id, "spotlight")}
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
        title="Mark as potential (stays until you clear it)"
        onClick={() => actions.highlight(cat.id, "potential")}
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
        onClick={() => actions.highlight(cat.id, "favorite")}
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
  const mutations = useCullMutations();
  const { generator } = useCatGenerator();
  const { placeholdersRef, placeholdersReady } = useTortiePlaceholders();
  const inputRef = useRef<HTMLInputElement>(null);
  const [numberInput, setNumberInput] = useState("");
  const { active, stages, eliminated, survivors, stageIndex, stage, summary } =
    useBatchBoardModel(command, liveState, placeholdersRef, placeholdersReady);
  const previews = useSurvivorPreviews({
    active,
    command,
    liveState,
    generator,
    placeholdersRef,
    placeholdersReady,
    stages,
    eliminated,
  });
  const pendingCullId = liveState?.pendingCullId ?? null;
  const now = useVerdictClock(pendingCullId);

  if (!active || !command || !liveState) return null;

  const maxEliminations = command.cats.length - command.finalCount;
  const cullsLeft = maxEliminations - liveState.eliminatedIds.length;
  const { pending, stuck, secondsLeft, ringFraction } = verdictView(
    liveState,
    pendingCullId,
    now,
  );
  // Marks and culls only while the overlay waits and no verdict is armed.
  const awaiting = liveState.awaitingCull && !pending;
  const dealing = !liveState.awaitingCull && stageIndex < stages.length;
  const highlights: BoardHighlights = {
    markedId: liveState.markedId ?? null,
    pendingCullId,
    spotlightId: liveState.spotlightId ?? null,
    potentials: new Set(liveState.potentialIds ?? []),
    favorites: new Set(liveState.favoriteIds ?? []),
  };
  const numberOf = (catId: string) =>
    formatBatchNumber(command.cats.findIndex((cat) => cat.id === catId) + 1);
  const stageLabel = (summary?.label ?? stage?.label ?? "").toUpperCase();
  const pendingNumber = pendingCullId ? numberOf(pendingCullId) : null;
  const actions = buildCullActions(mutations, command.seq, liveState, awaiting);
  const clearAndRefocus = () => {
    setNumberInput("");
    inputRef.current?.focus();
  };
  const numberConsole: NumberConsole = {
    ...typedCatState(
      numberInput,
      command,
      eliminated,
      survivors,
      highlights.markedId,
    ),
    markedId: highlights.markedId,
    awaiting,
    pending,
    stuck,
    pendingCullId,
    actions,
    clearAndRefocus,
  };

  return (
    <section className="rounded-2xl border border-border/40 bg-background/80 p-5 backdrop-blur">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">
          Live Elimination — {survivors.length} cats
          {stage ? (
            <StageHeadline
              stageIndex={stageIndex}
              stageCount={stages.length}
              label={stageLabel}
              summary={summary}
              numberOf={numberOf}
            />
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

      <NumberConsoleForm
        ctx={numberConsole}
        inputRef={inputRef}
        value={numberInput}
        onChange={setNumberInput}
        numberOf={numberOf}
      />

      <VerdictBanner
        pending={pending}
        pendingNumber={pendingNumber}
        stuck={stuck}
        secondsLeft={secondsLeft}
        onCancel={() => {
          actions.cancel();
          clearAndRefocus();
        }}
      />

      <SpotlightCard
        spotlightId={highlights.spotlightId}
        survivors={survivors}
        previews={previews}
        numberOf={numberOf}
        onClose={(catId) => actions.highlight(catId, "spotlight")}
      />

      <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 xl:grid-cols-8">
        {survivors.map((cat) => (
          <CullCard
            key={cat.id}
            cat={cat}
            url={previews[cat.id]}
            number={numberOf(cat.id)}
            highlights={highlights}
            awaiting={awaiting}
            ringFraction={ringFraction}
            actions={actions}
          />
        ))}
      </div>
    </section>
  );
}
