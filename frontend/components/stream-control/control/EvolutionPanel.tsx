"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowUpRight, Dna, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { toEvolutionStreamCats } from "@/lib/evolution/streamEvolution";
import { cn } from "@/lib/utils";
import { useStreamControl } from "./context";
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
  } = useStreamControl();
  const createBatch = useMutation(api.adoption.createBatch);
  const createMapper = useMutation(api.mapper.create);
  const triggerEvolution = useMutation(api.catStream.triggerEvolution);

  const [selectedClans, setSelectedClans] = useState<EvolutionArchetype[]>(
    () => [...CONTROLLED_ARCHETYPES.slice(0, 3)],
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
      estimateCeremonySeconds(selectedClans.length, targetLevel, spinSeconds),
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
      let starterSource:
        | { type: "random" }
        | {
            type: "history";
            slug: string;
            profileId?: string | null;
            catName?: string | null;
            creatorName?: string | null;
          };
      if (starterMode === "history") {
        if (!trimmedHistorySlug) {
          throw new Error("Enter a history slug first");
        }
        if (historyRecord === undefined) {
          throw new Error("History starter is still loading");
        }
        if (!historyRecord?.cat_data) {
          throw new Error("No saved cat was found for that slug");
        }
        const {
          applyEvolutionStarterHairToPayload,
          resolveEvolutionStarterHair,
        } = await import("@/lib/evolution/evolutionGenerator");
        starterPayload = applyEvolutionStarterHairToPayload(
          historyRecord.cat_data,
          resolveEvolutionStarterHair(hairSprite),
        );
        starterSource = {
          type: "history",
          slug: historyRecord.slug ?? trimmedHistorySlug,
          profileId: historyRecord.id,
          catName: historyRecord.catName ?? null,
          creatorName: historyRecord.creatorName ?? null,
        };
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
            disabled={starting || commandBusy || selectedClans.length === 0}
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

      {/* Settings */}
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
            Lineage Title
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
    </div>
  );
}
