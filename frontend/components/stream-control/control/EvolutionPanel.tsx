"use client";

import { useMutation, useQuery } from "convex/react";
import {
  ArrowUpRight,
  Dna,
  FastForward,
  Loader2,
  Pause,
  Play,
  SkipForward,
  Square,
} from "lucide-react";
import Link from "next/link";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import type { SpriteMapperApi } from "@/components/cat-builder/types";
import {
  getArchetypeTheme,
  withAlpha,
} from "@/components/evolution/archetypes";
import { api } from "@/convex/_generated/api";
import {
  estimateCeremonySeconds,
  formatDuration,
} from "@/lib/evolution/ceremonyEstimate";
import {
  CONTROLLED_ARCHETYPES,
  type EvolutionArchetype,
  type EvolutionLevel,
  type EvolutionStarterHair,
  generateEvolutionBatch,
  normalizeEvolutionControls,
  WILD_ARCHETYPES,
} from "@/lib/evolution/evolutionGenerator";
import { buildEvolutionPools } from "@/lib/evolution/evolutionPools";
import { persistEvolutionBatch } from "@/lib/evolution/persistEvolutionBatch";
import { buildRandomEvolutionStarter } from "@/lib/evolution/randomStarter";
import {
  EVOLUTION_HOLD_MAX_MS,
  type EvolutionLiveState,
  type EvolutionStreamCommand,
  toEvolutionStreamCats,
} from "@/lib/evolution/streamEvolution";
import { cn } from "@/lib/utils";
import type { ShowLookId } from "../obs/looks/lookMeta";
import { useStreamControl } from "./context";
import {
  type EvolutionLedger,
  evolutionLedger,
  pacingAvailable,
} from "./helpers";
import { useFollowGuard } from "./useFollowGuard";

const CLAN_ORDER: EvolutionArchetype[] = [
  ...CONTROLLED_ARCHETYPES,
  ...WILD_ARCHETYPES,
];

const TARGET_LEVELS: EvolutionLevel[] = [1, 2, 3];
/** Charge lengths — long enough for the contender gathering to play out. */
const SPIN_TIMES = [8, 15, 30, 60] as const;
const HAIR_SPRITES: Array<{ id: EvolutionStarterHair; label: string }> = [
  { id: "random", label: "Random" },
  { id: "short", label: "Short" },
  { id: "long", label: "Long" },
];

type MapperRecord = {
  id: string;
  slug?: string | null;
  cat_data?: unknown;
  catName?: string | null;
  creatorName?: string | null;
};

type StarterSource =
  | { type: "random" }
  | {
      type: "history";
      slug: string;
      profileId?: string | null;
      catName?: string | null;
      creatorName?: string | null;
    };

/** Load a saved cat as the evolution starter, with the chosen hair sprite. */
async function resolveHistoryStarter(
  historyRecord: MapperRecord | null | undefined,
  trimmedHistorySlug: string,
  hairSprite: EvolutionStarterHair,
): Promise<{ starterPayload: unknown; starterSource: StarterSource }> {
  if (!trimmedHistorySlug) {
    throw new Error("Enter a history slug first");
  }
  if (historyRecord === undefined) {
    throw new Error("History starter is still loading");
  }
  if (!historyRecord?.cat_data) {
    throw new Error("No saved cat was found for that slug");
  }
  const { applyEvolutionStarterHairToPayload, resolveEvolutionStarterHair } =
    await import("@/lib/evolution/evolutionGenerator");
  return {
    starterPayload: applyEvolutionStarterHairToPayload(
      historyRecord.cat_data,
      resolveEvolutionStarterHair(hairSprite),
    ),
    starterSource: {
      type: "history",
      slug: historyRecord.slug ?? trimmedHistorySlug,
      profileId: historyRecord.id,
      catName: historyRecord.catName ?? null,
      creatorName: historyRecord.creatorName ?? null,
    },
  };
}

const LEDGER_BUTTON =
  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40";

/** Settings form, or the same form folded under a disclosure while a show is live. */
function SettingsFrame({
  live,
  children,
}: Readonly<{
  live: boolean;
  children: ReactNode;
}>) {
  if (!live) return <>{children}</>;
  return (
    <details className="group">
      <summary className="cursor-pointer select-none rounded-xl border border-border/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:text-foreground">
        Settings
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/** Ms until a hold auto-releases; null when this show is not held. */
function autoReleaseMsFor(
  liveState: EvolutionLiveState | null,
  seq: number,
  now: number,
): number | null {
  if (liveState?.seq !== seq || typeof liveState.holdStartedAt !== "number")
    return null;
  return Math.max(0, EVOLUTION_HOLD_MAX_MS - (now - liveState.holdStartedAt));
}

/** Clock pill: the auto-release countdown while held, else time left or "board". */
function ledgerClockLabel(
  ledger: EvolutionLedger,
  autoReleaseMs: number | null,
): string {
  if (ledger.held && autoReleaseMs !== null)
    return `held · auto-release in ${formatDuration(autoReleaseMs / 1000)}`;
  if (ledger.done) return "board";
  return `${formatDuration(ledger.etaMs / 1000)} left`;
}

function holdButtonTitle(canPace: boolean, held: boolean): string {
  if (!canPace) return "Classic chamber runs on its own clock";
  return held ? "Resume the ceremony" : "Park the roll at its near miss";
}

function ledgerRows(ledger: EvolutionLedger): Array<[string, string]> {
  const roll = ledger.roll
    ? `${ledger.roll.index + 1}/${ledger.roll.count} · ${ledger.roll.traitLabel} · ${ledger.roll.phase}`
    : "—";
  return [
    ["Step", ledger.stepLabel],
    ["Branch", ledger.branch ?? "—"],
    ["Rank", ledger.rank ?? "—"],
    ["Roll", roll],
  ];
}

/**
 * Live ceremony ledger: where the shared clock is, plus Hold / Reveal now /
 * Skip to board / End show. Hold and Reveal now only reach the themed
 * engine — the classic chamber keeps its own clock, so they are disabled
 * for it and the ledger is marked approximate.
 */
function EvolutionLedgerCard({
  command,
  liveState,
  showLook,
  commandBusy,
  endShow,
}: Readonly<{
  command: EvolutionStreamCommand & { seq: number; timestamp: number };
  liveState: EvolutionLiveState | null;
  showLook: ShowLookId;
  commandBusy: boolean;
  endShow: () => Promise<void>;
}>) {
  const holdEvolution = useMutation(api.catStream.holdEvolution);
  const releaseEvolution = useMutation(api.catStream.releaseEvolution);
  const revealEvolutionAt = useMutation(api.catStream.revealEvolutionAt);
  const skipEvolutionToBoard = useMutation(api.catStream.skipEvolutionToBoard);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const ledger = evolutionLedger(command, liveState, now);
  const canPace = pacingAvailable(showLook);
  const { seq } = command;
  const autoReleaseMs = autoReleaseMsFor(liveState, seq, now);
  const report = (error: unknown, fallback: string) =>
    toast.error(error instanceof Error ? error.message : fallback);
  const handleHold = () => {
    if (ledger.held) {
      releaseEvolution({ seq }).catch((error) =>
        report(error, "Failed to release the hold"),
      );
      return;
    }
    holdEvolution({
      seq,
      parkAtElapsedMs: ledger.holdParkAtMs ?? undefined,
    }).catch((error) => report(error, "Failed to hold the ceremony"));
  };
  const handleRevealNow = () => {
    if (ledger.revealNowAtMs === null) return;
    revealEvolutionAt({ seq, targetElapsedMs: ledger.revealNowAtMs }).catch(
      (error) => report(error, "Failed to reveal"),
    );
  };
  const handleSkip = () => {
    skipEvolutionToBoard({ seq }).catch((error) =>
      report(error, "Failed to skip to the board"),
    );
  };
  const rows = ledgerRows(ledger);

  return (
    <section
      className="rounded-2xl border border-amber-500/30 bg-background/80 p-5 backdrop-blur"
      data-evolution-ledger
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Ceremony{" "}
          <span className="font-normal normal-case">
            {canPace ? "on the shared clock" : "(approximate)"}
          </span>
        </h3>
        <span
          className={cn(
            "rounded-full border px-3 py-1 font-mono text-xs tabular-nums",
            ledger.held
              ? "border-amber-400/60 bg-amber-400/10 text-amber-200"
              : "border-border/40 text-muted-foreground",
          )}
        >
          {ledgerClockLabel(ledger, autoReleaseMs)}
        </span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <progress
        className="mt-3 block h-1.5 w-full appearance-none overflow-hidden rounded-full border-0 bg-muted/40 [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-amber-500 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted/40 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-amber-500 [&::-webkit-progress-value]:transition-[width] [&::-webkit-progress-value]:duration-300"
        aria-label="Ceremony progress"
        max={100}
        value={Math.round(ledger.progress * 100)}
      />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleHold}
          disabled={!canPace || ledger.done}
          title={holdButtonTitle(canPace, ledger.held)}
          className={cn(
            LEDGER_BUTTON,
            ledger.held
              ? "border-amber-400/70 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25"
              : "border-border/50 text-foreground hover:bg-foreground hover:text-background",
          )}
        >
          {ledger.held ? (
            <Play className="size-3.5" aria-hidden="true" />
          ) : (
            <Pause className="size-3.5" aria-hidden="true" />
          )}
          {ledger.held ? "Release" : "Hold"}
        </button>
        <button
          type="button"
          onClick={handleRevealNow}
          disabled={!canPace || ledger.revealNowAtMs === null}
          title={
            canPace
              ? "Jump the roll to its landing"
              : "Classic chamber runs on its own clock"
          }
          className={cn(
            LEDGER_BUTTON,
            "border-sky-400/60 bg-sky-400/10 text-sky-200 hover:bg-sky-400/20",
          )}
        >
          <FastForward className="size-3.5" aria-hidden="true" />
          Reveal now
        </button>
        <button
          type="button"
          onClick={handleSkip}
          disabled={ledger.done}
          className={cn(
            LEDGER_BUTTON,
            "border-border/50 text-muted-foreground hover:bg-foreground hover:text-background",
          )}
        >
          <SkipForward className="size-3.5" aria-hidden="true" />
          Skip to board
        </button>
        <button
          type="button"
          onClick={() => void endShow()}
          disabled={commandBusy}
          className={cn(
            LEDGER_BUTTON,
            "border-red-500/50 text-red-300 hover:bg-red-500/10",
          )}
        >
          <Square className="size-3.5" aria-hidden="true" />
          End show
        </button>
        {!canPace ? (
          <span className="text-xs text-muted-foreground">
            Classic chamber runs on its own clock
          </span>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Evolution tab: configure and start an evolution ceremony on the OBS
 * overlay. Generation and persistence happen here (the authed surface);
 * the overlay receives params-only cat data plus the saved batch slug.
 */
export function EvolutionPanel() {
  const {
    commandBusy,
    creatorNameDraft,
    syncSessionSettings,
    rawSessionSettings,
    currentEvolutionCommand,
    evolutionLiveState,
    showLive,
    showLook,
    endShow,
  } = useStreamControl();
  const live = Boolean(currentEvolutionCommand && showLive);
  const createBatch = useMutation(api.adoptionV2.createBatch);
  const createMapper = useMutation(api.mapper.create);
  const triggerEvolution = useMutation(api.catStream.triggerEvolution);

  const [selectedClans, setSelectedClans] = useState<EvolutionArchetype[]>(() =>
    CONTROLLED_ARCHETYPES.slice(0, 3),
  );
  const [targetLevel, setTargetLevel] = useState<EvolutionLevel>(2);
  const [spinSeconds, setSpinSeconds] =
    useState<(typeof SPIN_TIMES)[number]>(15);
  const [starterMode, setStarterMode] = useState<"random" | "history">(
    "random",
  );
  const [hairSprite, setHairSprite] = useState<EvolutionStarterHair>("random");
  const [historySlug, setHistorySlug] = useState("");
  const [title, setTitle] = useState("Stream Evolution");
  const [starting, setStarting] = useState(false);
  const [lastSlug, setLastSlug] = useState<string | null>(null);
  const startTokenRef = useRef(0);

  const trimmedHistorySlug = historySlug.trim();
  const historyRecord = useQuery(
    api.mapper.getBySlug,
    starterMode === "history" && trimmedHistorySlug
      ? { slugOrId: trimmedHistorySlug }
      : "skip",
  ) as MapperRecord | null | undefined;

  const estimateSeconds = useMemo(
    () =>
      estimateCeremonySeconds(
        selectedClans.length,
        targetLevel,
        spinSeconds,
        "overlay",
      ),
    [selectedClans.length, targetLevel, spinSeconds],
  );

  // Follow the session's evolutionInfo — restores saved values and keeps a
  // second open control tab in sync. Fresh local edits are never reverted
  // by in-flight echoes (useFollowGuard).
  const { touch: touchLocalEdit, deferIfEditing, retryTick } = useFollowGuard();
  useEffect(() => {
    void retryTick;
    const info = rawSessionSettings?.evolutionInfo as
      | Record<string, unknown>
      | undefined;
    if (!info) return;
    const cancelRetry = deferIfEditing();
    if (cancelRetry) return cancelRetry;
    if (
      Array.isArray(info.clans) &&
      info.clans.every((clan) =>
        (CLAN_ORDER as readonly string[]).includes(clan as string),
      )
    ) {
      const next = info.clans as EvolutionArchetype[];
      setSelectedClans((prev) =>
        prev.length === next.length && prev.every((c, i) => c === next[i])
          ? prev
          : next,
      );
    }
    if (
      typeof info.targetLevel === "number" &&
      (TARGET_LEVELS as readonly number[]).includes(info.targetLevel)
    ) {
      setTargetLevel(info.targetLevel as EvolutionLevel);
    }
    if (
      typeof info.spinSeconds === "number" &&
      (SPIN_TIMES as readonly number[]).includes(info.spinSeconds)
    ) {
      setSpinSeconds(info.spinSeconds as (typeof SPIN_TIMES)[number]);
    }
    if (info.starterMode === "random" || info.starterMode === "history") {
      setStarterMode(info.starterMode);
    }
  }, [rawSessionSettings, deferIfEditing, retryTick]);

  // Keep the lobby's "what's coming up" card in sync (once the session is
  // loaded — earlier writes would race the settings seeding). The stored
  // snapshot is read through a ref so this only fires on LOCAL changes —
  // remote updates must never make this effect write stale values back.
  const sessionReady = rawSessionSettings !== null;
  const rawSettingsRef = useRef(rawSessionSettings);
  rawSettingsRef.current = rawSessionSettings;
  useEffect(() => {
    if (!sessionReady) return;
    const stored = rawSettingsRef.current?.evolutionInfo as
      | Record<string, unknown>
      | undefined;
    const unchanged =
      stored &&
      stored.targetLevel === targetLevel &&
      stored.spinSeconds === spinSeconds &&
      stored.starterMode === starterMode &&
      Array.isArray(stored.clans) &&
      stored.clans.length === selectedClans.length &&
      stored.clans.every((clan, i) => clan === selectedClans[i]);
    if (unchanged) return;
    touchLocalEdit();
    syncSessionSettings({
      evolutionInfo: {
        clans: selectedClans,
        targetLevel,
        spinSeconds,
        starterMode,
      },
    });
  }, [
    sessionReady,
    selectedClans,
    targetLevel,
    spinSeconds,
    starterMode,
    syncSessionSettings,
    touchLocalEdit,
  ]);

  const toggleClan = useCallback((clan: EvolutionArchetype) => {
    setSelectedClans((previous) =>
      previous.includes(clan)
        ? previous.filter((entry) => entry !== clan)
        : [
            ...CLAN_ORDER.filter((entry) =>
              [...previous, clan].includes(entry),
            ),
          ],
    );
  }, []);

  const handleStart = useCallback(async () => {
    if (starting || commandBusy) return;
    if (selectedClans.length === 0) {
      toast.error("Pick at least one clan.");
      return;
    }
    const token = ++startTokenRef.current;
    setStarting(true);
    try {
      const { default: spriteMapper } = await import(
        "@/lib/single-cat/spriteMapper"
      );
      const mapper = spriteMapper as unknown as SpriteMapperApi;
      if (!mapper.loaded) {
        await mapper.init();
      }
      if (startTokenRef.current !== token) return;

      let starterPayload: unknown;
      let starterSource: StarterSource;
      if (starterMode === "history") {
        ({ starterPayload, starterSource } = await resolveHistoryStarter(
          historyRecord,
          trimmedHistorySlug,
          hairSprite,
        ));
      } else {
        starterPayload = await buildRandomEvolutionStarter(hairSprite);
        starterSource = { type: "random" };
      }

      const pools = buildEvolutionPools(mapper);
      const controls = normalizeEvolutionControls({
        branchCount: selectedClans.length,
        targetLevel,
      });
      const result = generateEvolutionBatch(starterPayload, controls, pools, {
        archetypes: selectedClans,
      });

      const saved = await persistEvolutionBatch({
        result,
        starterSource,
        title: title.trim() || "Stream Evolution",
        creator: creatorNameDraft,
        createMapper,
        createBatch,
      });
      if (startTokenRef.current !== token) return;
      if (!saved.batchSlug) {
        throw new Error("Saving the evolution batch returned no slug");
      }

      const orderedCats = [
        result.starter,
        ...result.cats.filter((cat) => cat.level !== 0),
      ];
      const payload = {
        slug: saved.batchSlug,
        totalCount: orderedCats.length,
        chargeDurationMs: spinSeconds * 1000,
        cats: toEvolutionStreamCats(orderedCats),
      };
      await triggerEvolution({ evolution: payload });

      setLastSlug(saved.batchSlug);
      toast.success("Evolution ceremony started!");
    } catch (error) {
      console.error("[StreamControl] Failed to start evolution", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to start evolution",
      );
    } finally {
      if (startTokenRef.current === token) {
        setStarting(false);
      }
    }
  }, [
    commandBusy,
    createBatch,
    createMapper,
    creatorNameDraft,
    hairSprite,
    historyRecord,
    selectedClans,
    spinSeconds,
    starting,
    starterMode,
    targetLevel,
    title,
    triggerEvolution,
    trimmedHistorySlug,
  ]);

  return (
    <div className="space-y-6">
      {/* Start */}
      <section className="rounded-2xl border border-border/40 bg-background/80 p-4 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleStart}
            disabled={
              starting || commandBusy || showLive || selectedClans.length === 0
            }
            className={cn(
              "inline-flex items-center gap-2 rounded-xl bg-amber-600 px-6 py-3",
              "text-sm font-bold text-white shadow-lg shadow-amber-900/20 transition",
              "hover:bg-amber-500 active:bg-amber-700 disabled:opacity-50",
            )}
          >
            {starting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Dna className="size-4" />
            )}
            {starting ? "Summoning…" : "Start Evolution"}
          </button>
          <div className="text-xs text-muted-foreground">
            <div>
              {selectedClans.length} clans × level {targetLevel} ={" "}
              {selectedClans.length * targetLevel} evolutions
            </div>
            <div>
              Ceremony runs ~{formatDuration(estimateSeconds)} on stream
            </div>
          </div>
        </div>
        {lastSlug && (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            Last lineage:
            <Link
              href={`/evolution/${lastSlug}`}
              target="_blank"
              className="inline-flex items-center gap-1 text-foreground underline"
            >
              /evolution/{lastSlug} <ArrowUpRight className="size-3" />
            </Link>
          </p>
        )}
      </section>

      {/* Live ledger — replaces the settings form while a ceremony is on air */}
      {live && currentEvolutionCommand ? (
        <EvolutionLedgerCard
          command={currentEvolutionCommand}
          liveState={evolutionLiveState}
          showLook={showLook}
          commandBusy={commandBusy}
          endShow={endShow}
        />
      ) : null}

      {/* Settings */}
      <SettingsFrame live={live}>
        <section className="rounded-2xl border border-border/40 bg-background/80 p-5 backdrop-blur">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Ceremony Settings
          </h3>
          <div className="space-y-5">
            {/* Clans */}
            <div>
              <span className="mb-2 block text-xs font-medium text-muted-foreground">
                Clans ({selectedClans.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {CLAN_ORDER.map((clan) => {
                  const theme = getArchetypeTheme(clan);
                  const selected = selectedClans.includes(clan);
                  return (
                    <button
                      type="button"
                      key={clan}
                      onClick={() => toggleClan(clan)}
                      aria-pressed={selected}
                      className={cn(
                        "rounded-lg border px-2.5 py-1.5 text-xs font-semibold capitalize transition",
                        selected
                          ? "text-foreground"
                          : "border-border/40 text-muted-foreground hover:text-foreground",
                      )}
                      style={
                        selected
                          ? {
                              borderColor: withAlpha(theme.from, 0.6),
                              background: withAlpha(theme.from, 0.15),
                            }
                          : undefined
                      }
                    >
                      {theme.glyph} {clan}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Target level + spin time */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="mb-2 block text-xs font-medium text-muted-foreground">
                  Target Level
                </span>
                <div className="inline-flex gap-1 rounded-full border border-border/30 bg-muted/30 p-1">
                  {TARGET_LEVELS.map((level) => (
                    <button
                      type="button"
                      key={level}
                      onClick={() => setTargetLevel(level)}
                      className={cn(
                        "rounded-full px-4 py-1 text-xs font-semibold transition",
                        targetLevel === level
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="mb-2 block text-xs font-medium text-muted-foreground">
                  Spin Time
                </span>
                <div className="inline-flex gap-1 rounded-full border border-border/30 bg-muted/30 p-1">
                  {SPIN_TIMES.map((seconds) => (
                    <button
                      type="button"
                      key={seconds}
                      onClick={() => setSpinSeconds(seconds)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-semibold transition",
                        spinSeconds === seconds
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {seconds}s
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Starter */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="mb-2 block text-xs font-medium text-muted-foreground">
                  Starter
                </span>
                <div className="inline-flex gap-1 rounded-full border border-border/30 bg-muted/30 p-1">
                  {(["random", "history"] as const).map((mode) => (
                    <button
                      type="button"
                      key={mode}
                      onClick={() => setStarterMode(mode)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-semibold capitalize transition",
                        starterMode === mode
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {mode === "random" ? "Mystery egg" : "Saved cat"}
                    </button>
                  ))}
                </div>
                {starterMode === "history" && (
                  <input
                    type="text"
                    value={historySlug}
                    onChange={(event) => setHistorySlug(event.target.value)}
                    placeholder="History slug, e.g. AbCd1234"
                    className="mt-2 w-full rounded-lg border border-border/50 bg-background px-3 py-2 font-mono text-xs text-foreground focus:border-primary focus:outline-none"
                  />
                )}
                {starterMode === "history" &&
                  trimmedHistorySlug &&
                  historyRecord === null && (
                    <p className="mt-1 text-xs text-red-400">
                      No saved cat found for that slug.
                    </p>
                  )}
              </div>
              <div>
                <span className="mb-2 block text-xs font-medium text-muted-foreground">
                  Starter Hair
                </span>
                <div className="inline-flex gap-1 rounded-full border border-border/30 bg-muted/30 p-1">
                  {HAIR_SPRITES.map((hair) => (
                    <button
                      type="button"
                      key={hair.id}
                      onClick={() => setHairSprite(hair.id)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-semibold transition",
                        hairSprite === hair.id
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {hair.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Title */}
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              <span>Lineage Title</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Stream Evolution"
                className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </label>
          </div>
        </section>
      </SettingsFrame>
    </div>
  );
}
