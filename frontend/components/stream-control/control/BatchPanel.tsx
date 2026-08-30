"use client";

import { useMutation } from "convex/react";
import { ArrowUpRight, Cat, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useCatGenerator } from "@/components/cat-builder/hooks";
import { PaletteMultiSelect } from "@/components/common/PaletteMultiSelect";
import { api } from "@/convex/_generated/api";
import { toId } from "@/convex/utils";
import {
  BATCH_FINAL_COUNT,
  type BatchLayerConfig,
  type BatchStreamCat,
  batchStartCount,
} from "@/lib/adoption/streamBatch";
import {
  catDataToLegacyPersistence,
  syncChangedRegistryTraitsFromLegacy,
} from "@/lib/cat-system";
import { encodeCatShare } from "@/lib/catShare";
import type { PaletteId } from "@/lib/palettes";
import { cn } from "@/lib/utils";
import { withResolvedAfterlifeParams } from "@/utils/catSettingsHelpers";
import { useStreamControl } from "./context";
import { useFollowGuard } from "./useFollowGuard";

const LAYER_OPTIONS = [0, 1, 2, 3, 4] as const;

/**
 * Batch tab: the adoption generator's elimination format on stream. A pool
 * of `10 + stage count` cats is rolled upfront; the overlay reveals one
 * parameter per stage, and after each reveal the streamer culls one cat
 * here until ten finalists remain. The finalists are then saved as a
 * regular adoption batch and the overlay shows its QR code.
 */
export function BatchPanel() {
  const {
    settings,
    commandBusy,
    creatorNameDraft,
    syncSessionSettings,
    rawSessionSettings,
    currentBatchCommand,
    batchLiveState,
  } = useStreamControl();
  const { generator, ready: generatorReady } = useCatGenerator();
  const createBatch = useMutation(api.adoption.createBatch);
  const createMapper = useMutation(api.mapper.create);
  const triggerBatch = useMutation(api.catStream.triggerBatch);
  const attachBatchSlug = useMutation(api.catStream.attachBatchSlug);

  const [accessoryCount, setAccessoryCount] = useState(2);
  const [scarCount, setScarCount] = useState(2);
  const [tortieCount, setTortieCount] = useState(2);
  const [extendedModes, setExtendedModes] = useState<string[]>([]);
  const [includeBaseColours, setIncludeBaseColours] = useState(true);
  const [title, setTitle] = useState("Stream Litter");
  const [starting, setStarting] = useState(false);
  const [lastSlug, setLastSlug] = useState<string | null>(null);
  const startTokenRef = useRef(0);

  const config = useMemo<BatchLayerConfig>(
    () => ({ accessoryCount, scarCount, tortieCount }),
    [accessoryCount, scarCount, tortieCount],
  );
  const startCount = batchStartCount(config, BATCH_FINAL_COUNT);
  const stageCount = startCount - BATCH_FINAL_COUNT;

  // Follow the session's batchInfo — restores saved values and keeps a
  // second open control tab in sync. Functional setters bail out on equal
  // values so the sync effect below doesn't ping-pong, and fresh local
  // edits are never reverted by in-flight echoes.
  const { touch: touchLocalEdit, deferIfEditing, retryTick } = useFollowGuard();
  useEffect(() => {
    void retryTick;
    const info = rawSessionSettings?.batchInfo as
      | Record<string, unknown>
      | undefined;
    if (!info) return;
    const cancelRetry = deferIfEditing();
    if (cancelRetry) return cancelRetry;
    const followCount = (value: unknown, set: (v: number) => void) => {
      if (
        typeof value === "number" &&
        (LAYER_OPTIONS as readonly number[]).includes(value)
      ) {
        set(value);
      }
    };
    followCount(info.accessoryCount, (v) =>
      setAccessoryCount((prev) => (prev === v ? prev : v)),
    );
    followCount(info.scarCount, (v) =>
      setScarCount((prev) => (prev === v ? prev : v)),
    );
    followCount(info.tortieCount, (v) =>
      setTortieCount((prev) => (prev === v ? prev : v)),
    );
    if (
      Array.isArray(info.extendedModes) &&
      info.extendedModes.every((mode) => typeof mode === "string")
    ) {
      const next = info.extendedModes as string[];
      setExtendedModes((prev) =>
        prev.length === next.length && prev.every((m, i) => m === next[i])
          ? prev
          : next,
      );
    }
    if (typeof info.includeBaseColours === "boolean") {
      const next = info.includeBaseColours;
      setIncludeBaseColours((prev) => (prev === next ? prev : next));
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
    const stored = rawSettingsRef.current?.batchInfo as
      | Record<string, unknown>
      | undefined;
    const unchanged =
      stored &&
      stored.accessoryCount === accessoryCount &&
      stored.scarCount === scarCount &&
      stored.tortieCount === tortieCount &&
      stored.startCount === startCount &&
      stored.includeBaseColours === includeBaseColours &&
      Array.isArray(stored.extendedModes) &&
      stored.extendedModes.length === extendedModes.length &&
      stored.extendedModes.every((mode, i) => mode === extendedModes[i]);
    if (unchanged) return;
    touchLocalEdit();
    syncSessionSettings({
      batchInfo: {
        accessoryCount,
        scarCount,
        tortieCount,
        startCount,
        finalCount: BATCH_FINAL_COUNT,
        extendedModes,
        includeBaseColours,
      },
    });
  }, [
    sessionReady,
    accessoryCount,
    scarCount,
    tortieCount,
    startCount,
    extendedModes,
    includeBaseColours,
    syncSessionSettings,
    touchLocalEdit,
  ]);

  const handleStart = useCallback(async () => {
    if (starting || commandBusy) return;
    if (!generator?.generateRandomCat) {
      toast.error("Cat generator is still loading.");
      return;
    }
    const token = ++startTokenRef.current;
    setStarting(true);
    try {
      const cats: BatchStreamCat[] = [];
      let requiredCount = BATCH_FINAL_COUNT;
      while (cats.length < requiredCount) {
        const index = cats.length;
        const result = await generator.generateRandomCat({
          experimentalColourMode:
            extendedModes.length > 0
              ? extendedModes.filter((mode) => mode !== "base")
              : undefined,
          includeBaseColours,
          includeNewSprites: settings.includeNewSprites,
          exactLayerCounts: true,
          accessoryCount,
          scarCount,
          tortieCount,
        });
        const resolvedParams = withResolvedAfterlifeParams(
          result.params as unknown as Record<string, unknown>,
          settings.afterlifeMode,
        );
        syncChangedRegistryTraitsFromLegacy(resolvedParams, [
          "darkForest",
          "dead",
        ]);
        const accessorySlots = padSlots(
          result.slotSelections?.accessories,
          accessoryCount,
        );
        const scarSlots = padSlots(result.slotSelections?.scars, scarCount);
        const tortieSlots = padTortieSlots(
          result.slotSelections?.tortie,
          tortieCount,
        );
        cats.push({
          id: `cat-${token}-${index}`,
          label: `Cat ${index + 1}`,
          catData: {
            params:
              resolvedParams as unknown as BatchStreamCat["catData"]["params"],
            accessorySlots,
            scarSlots,
            tortieSlots,
            counts: {
              accessories: accessorySlots.filter((slot) => slot !== "none")
                .length,
              scars: scarSlots.filter((slot) => slot !== "none").length,
              tortie: tortieSlots.filter(Boolean).length,
            },
          },
        });
        requiredCount = batchStartCount(config, BATCH_FINAL_COUNT, cats);
      }
      if (startTokenRef.current !== token) return;

      await triggerBatch({
        batch: {
          title: title.trim() || "Stream Litter",
          finalCount: BATCH_FINAL_COUNT,
          config,
          cats: cats.map((cat) => ({
            ...cat,
            catData: catDataToLegacyPersistence(
              cat.catData,
            ) as unknown as BatchStreamCat["catData"],
          })),
        },
      });
      setLastSlug(null);
      toast.success("Elimination show started!");
    } catch (error) {
      console.error("[StreamControl] Failed to start batch show", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to start the batch",
      );
    } finally {
      if (startTokenRef.current === token) {
        setStarting(false);
      }
    }
  }, [
    accessoryCount,
    commandBusy,
    config,
    extendedModes,
    generator,
    includeBaseColours,
    scarCount,
    settings,
    starting,
    title,
    tortieCount,
    triggerBatch,
  ]);

  // When all culls are done, save the finalists and hand the slug to the
  // overlay for the QR code. A failed save schedules a real retry via
  // persistRetryTick — the show is in a terminal state by then, so no other
  // dependency would re-run this effect.
  const persistedSeqRef = useRef<number | null>(null);
  const [persistRetryTick, setPersistRetryTick] = useState(0);
  useEffect(() => {
    void persistRetryTick; // re-runs the save after a scheduled retry
    const command = currentBatchCommand;
    const state = batchLiveState;
    if (!command || !state || state.seq !== command.seq) return;
    if (command.slug) return;
    const maxEliminations = command.cats.length - command.finalCount;
    if (state.eliminatedIds.length < maxEliminations) return;
    if (persistedSeqRef.current === command.seq) return;
    persistedSeqRef.current = command.seq;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      try {
        const eliminated = new Set(state.eliminatedIds);
        const finalists = command.cats.filter((cat) => !eliminated.has(cat.id));
        const batchTitle = command.title ?? "Stream Litter";
        const catsPayload = await Promise.all(
          finalists.map(async (cat, index) => {
            const mapperResult = await createMapper({
              catData: catDataToLegacyPersistence(cat.catData),
              creatorName: creatorNameDraft.trim() || undefined,
            });
            const shareToken =
              mapperResult.shareToken ?? mapperResult.slug ?? mapperResult.id;
            return {
              label: `Cat ${index + 1}`,
              catData: catDataToLegacyPersistence(cat.catData),
              profileId: toId("cat_profile", mapperResult.id),
              encoded: encodeCatShare(
                cat.catData as unknown as Parameters<typeof encodeCatShare>[0],
              ),
              shareToken,
            };
          }),
        );
        const batch = await createBatch({
          cats: catsPayload,
          settings: {
            source: "stream-batch",
            accessoryCount: command.config.accessoryCount,
            scarCount: command.config.scarCount,
            tortieCount: command.config.tortieCount,
            totalFinalCats: finalists.length,
            afterlifeMode: settings.afterlifeMode,
            extendedModes,
            includeBaseColours,
            batchTitle,
            batchCreator: creatorNameDraft,
          },
          title: batchTitle,
          creatorName: creatorNameDraft,
        });
        const slug = batch.slug ?? batch.shareToken ?? null;
        if (!slug) throw new Error("Saving the batch returned no slug");
        await attachBatchSlug({ seq: command.seq, slug });
        setLastSlug(slug);
        toast.success("Litter saved to history!");
      } catch (error) {
        persistedSeqRef.current = null;
        console.error("[StreamControl] Failed to save batch finalists", error);
        toast.error("Failed to save the litter — retrying shortly.");
        retryTimer = setTimeout(
          () => setPersistRetryTick((tick) => tick + 1),
          5000,
        );
      }
    })();
    return () => {
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [
    attachBatchSlug,
    batchLiveState,
    createBatch,
    createMapper,
    creatorNameDraft,
    currentBatchCommand,
    extendedModes,
    includeBaseColours,
    persistRetryTick,
    settings,
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/40 bg-background/80 p-4 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleStart}
            disabled={starting || commandBusy || !generatorReady}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl bg-amber-600 px-6 py-3",
              "text-sm font-bold text-white shadow-lg shadow-amber-900/20 transition",
              "hover:bg-amber-500 active:bg-amber-700 disabled:opacity-50",
            )}
          >
            {starting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Cat className="size-4" />
            )}
            {starting ? "Rolling the pool…" : "Start Elimination"}
          </button>
          <p className="text-xs text-muted-foreground">
            {startCount} cats enter, {BATCH_FINAL_COUNT} survive — one cull
            after each of the first {stageCount} reveals.
          </p>
        </div>
        {lastSlug && (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            Last litter:
            <Link
              href={`/adoption/${lastSlug}`}
              target="_blank"
              className="inline-flex items-center gap-1 text-foreground underline"
            >
              /adoption/{lastSlug} <ArrowUpRight className="size-3" />
            </Link>
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-border/40 bg-background/80 p-5 backdrop-blur">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Elimination Settings
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ["Accessories", accessoryCount, setAccessoryCount],
              ["Scars", scarCount, setScarCount],
              ["Tortie Layers", tortieCount, setTortieCount],
            ] as const
          ).map(([label, value, setValue]) => (
            <div key={label}>
              <span className="mb-2 block text-xs font-medium text-muted-foreground">
                {label}
              </span>
              <div className="inline-flex gap-1 rounded-full border border-border/30 bg-muted/30 p-1">
                {LAYER_OPTIONS.map((option) => (
                  <button
                    type="button"
                    key={option}
                    onClick={() => setValue(option)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold transition",
                      value === option
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <label className="mt-4 flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Litter Title
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Stream Litter"
            className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </label>

        {/* Palettes — independent of the Spin tab */}
        <div className="mt-4">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Palettes
          </span>
          <PaletteMultiSelect
            selected={
              new Set(
                extendedModes.filter(
                  (mode): mode is PaletteId => mode !== "base",
                ),
              )
            }
            onChange={(selected) => setExtendedModes(Array.from(selected))}
            includeClassic={includeBaseColours}
            onClassicChange={setIncludeBaseColours}
            compact
          />
        </div>

        <p className="mt-4 text-xs text-muted-foreground/70">
          {stageCount} reveal stages → a starting pool of {startCount} cats.
          Afterlife comes from the Spin tab's settings.
        </p>
      </section>
    </div>
  );
}

function padSlots(values: string[] | undefined, count: number): string[] {
  const slots: string[] = [];
  for (let i = 0; i < count; i++) {
    slots.push(values?.[i] || "none");
  }
  return slots;
}

function padTortieSlots(
  values: unknown[] | undefined,
  count: number,
): BatchStreamCat["catData"]["tortieSlots"] {
  const slots: BatchStreamCat["catData"]["tortieSlots"] = [];
  for (let i = 0; i < count; i++) {
    slots.push(
      (values?.[i] as BatchStreamCat["catData"]["tortieSlots"][number]) ?? null,
    );
  }
  return slots;
}
