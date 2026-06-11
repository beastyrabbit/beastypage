"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowUpRight, Loader2, RotateCcw } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type AdoptionMetadata,
  AdoptionMetadataPanel,
} from "@/components/adoption/AdoptionMetadataPanel";
import type {
  CatGeneratorApi,
  SpriteMapperApi,
} from "@/components/cat-builder/types";
import FilledCheckedIcon from "@/components/ui/filled-checked-icon";
import TriangleAlertIcon from "@/components/ui/triangle-alert-icon";
import { api } from "@/convex/_generated/api";
import { toId } from "@/convex/utils";
import type { CatParams } from "@/lib/cat-v3/types";
import { encodeCatShare } from "@/lib/catShare";
import {
  buildEvolutionBatchSettings,
  CONTROLLED_ARCHETYPES,
  type EvolutionArchetype,
  type EvolutionBatchResult,
  type EvolutionControls,
  type EvolutionGeneratedCat,
  type EvolutionLevel,
  type EvolutionPools,
  type EvolutionRange,
  generateEvolutionBatch,
  generateTeaserVariant,
  isWildArchetype,
  normalizeEvolutionControls,
  WILD_ARCHETYPES,
} from "@/lib/evolution/evolutionGenerator";
import { buildEvolutionPools } from "@/lib/evolution/evolutionPools";
import { useDefaultCreatorName } from "@/lib/useDefaultCreatorName";
import { cn } from "@/lib/utils";
import { ARCHETYPE_THEMES, withAlpha } from "./archetypes";
import { EvolutionCeremony } from "./EvolutionCeremony";
import { EvolutionTree, type EvolutionTreeCat } from "./EvolutionTree";
import { pixelFontClass, stageRank } from "./evolutionDisplay";

type StarterMode = "random" | "history";
type SaveState = "idle" | "saving" | "saved" | "error";
type HairSprite = "random" | "long" | "short";
type ChamberPhase = "setup" | "ceremony" | "tree";

type MapperRecord = {
  id: string;
  slug?: string | null;
  shareToken?: string | null;
  cat_data?: unknown;
  catName?: string | null;
  creatorName?: string | null;
};

type UiEvolutionCat = EvolutionGeneratedCat & {
  previewUrl: string | null;
  profileId?: string | null;
  shareToken?: string | null;
  catName?: string | null;
};

type PersistedCatInfo = {
  key: string;
  profileId: string;
  shareToken: string;
};

const DEFAULT_METADATA: AdoptionMetadata = {
  title: "Evolution Batch",
  creator: "",
};

const TARGET_LEVELS: EvolutionLevel[] = [1, 2, 3];
const LAYER_STEPS = [0, 1, 2] as const;
const TORTIE_STEPS = [0, 1, 2, 3, 4] as const;
const HAIR_SPRITES: Array<{
  id: HairSprite;
  label: string;
  spriteNumber: 8 | 9 | null;
}> = [
  { id: "random", label: "Random", spriteNumber: null },
  { id: "short", label: "Short hair", spriteNumber: 8 },
  { id: "long", label: "Long hair", spriteNumber: 9 },
];

function resolveHairSprite(hair: HairSprite): 8 | 9 {
  const option = HAIR_SPRITES.find((entry) => entry.id === hair);
  if (option?.spriteNumber) return option.spriteNumber;
  return Math.random() < 0.5 ? 8 : 9;
}

const SPIN_TIMES = [5, 8, 15, 30, 90] as const;

/** Controlled clans first, wild clans behind them. */
const CLAN_ORDER: EvolutionArchetype[] = [
  ...CONTROLLED_ARCHETYPES,
  ...WILD_ARCHETYPES,
];

/** Rough per-step costs (seconds at 1x) used for the ceremony estimate. */
const ESTIMATE_SUMMON = 5;
const ESTIMATE_BANNER = 3.5;
const ESTIMATE_REVEAL = 6.7;

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function estimateCeremonySeconds(
  clanCount: number,
  targetLevel: number,
  spinSeconds: number,
) {
  const evolutions = clanCount * targetLevel;
  return (
    ESTIMATE_SUMMON +
    clanCount * ESTIMATE_BANNER +
    evolutions * (spinSeconds + ESTIMATE_REVEAL)
  );
}

function imageDataFromCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): string | null {
  if ("toDataURL" in canvas && typeof canvas.toDataURL === "function") {
    return canvas.toDataURL("image/png");
  }
  return null;
}

function cleanRandomStarterLayers(params: CatParams): CatParams {
  const next = { ...params };
  next.accessories = [];
  next.scars = [];
  next.tortie = [];
  next.isTortie = false;
  delete next.accessory;
  delete next.scar;
  delete next.tortieMask;
  delete next.tortiePattern;
  delete next.tortieColour;
  return next;
}

function applySpriteToStarterPayload(input: unknown, spriteNumber: number) {
  if (!input || typeof input !== "object") return input;
  const raw = structuredClone(input) as Record<string, unknown>;
  if (raw.params && typeof raw.params === "object") {
    raw.params = {
      ...(raw.params as Record<string, unknown>),
      spriteNumber,
    };
    return raw;
  }
  return { ...raw, spriteNumber };
}

export function EvolutionGeneratorClient() {
  const createBatch = useMutation(api.adoption.createBatch);
  const createMapper = useMutation(api.mapper.create);
  const updateBatchMeta = useMutation(api.adoption.updateBatchMeta);
  const updateProfileMeta = useMutation(api.mapper.updateMeta);
  const defaultCreator = useDefaultCreatorName();
  const generatorRef = useRef<CatGeneratorApi | null>(null);
  const mapperRef = useRef<SpriteMapperApi | null>(null);
  const metadataRef = useRef<AdoptionMetadata>(DEFAULT_METADATA);
  const generationTokenRef = useRef(0);
  const [phase, setPhase] = useState<ChamberPhase>("setup");
  const [ceremonyKey, setCeremonyKey] = useState(0);
  const [expectedCount, setExpectedCount] = useState(0);
  const [modulesReady, setModulesReady] = useState(false);
  const [starterMode, setStarterMode] = useState<StarterMode>("random");
  const [hairSprite, setHairSprite] = useState<HairSprite>("random");
  const [historySlug, setHistorySlug] = useState("");
  const [starterPreview, setStarterPreview] = useState<string | null>(null);
  const [ceremonyPools, setCeremonyPools] = useState<EvolutionPools | null>(
    null,
  );
  const [spinSeconds, setSpinSeconds] =
    useState<(typeof SPIN_TIMES)[number]>(8);
  const [selectedClans, setSelectedClans] = useState<EvolutionArchetype[]>(
    () => [...CONTROLLED_ARCHETYPES],
  );
  const [controls, setControls] = useState<EvolutionControls>(() =>
    normalizeEvolutionControls(),
  );
  const [records, setRecords] = useState<UiEvolutionCat[]>([]);
  const recordsRef = useRef<UiEvolutionCat[]>([]);
  recordsRef.current = records;
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedToken, setLastSavedToken] = useState<string | null>(null);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [savedMetadata, setSavedMetadata] =
    useState<AdoptionMetadata>(DEFAULT_METADATA);
  const [metadataMessage, setMetadataMessage] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataSaving, setMetadataSaving] = useState(false);

  const trimmedHistorySlug = historySlug.trim();
  const historyRecord = useQuery(
    api.mapper.getBySlug,
    starterMode === "history" && trimmedHistorySlug
      ? { slugOrId: trimmedHistorySlug }
      : "skip",
  ) as MapperRecord | null | undefined;

  useEffect(() => {
    if (!defaultCreator || metadataRef.current.creator) return;
    const next = { ...metadataRef.current, creator: defaultCreator };
    metadataRef.current = next;
    setSavedMetadata(next);
  }, [defaultCreator]);

  useEffect(() => {
    metadataRef.current = savedMetadata;
  }, [savedMetadata]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (generatorRef.current && mapperRef.current) return;
        const [{ default: catGenerator }, { default: spriteMapper }] =
          await Promise.all([
            import("@/lib/single-cat/catGeneratorV3"),
            import("@/lib/single-cat/spriteMapper"),
          ]);
        if (cancelled) return;
        generatorRef.current = catGenerator as CatGeneratorApi;
        mapperRef.current = spriteMapper as unknown as SpriteMapperApi;
        if (!mapperRef.current.loaded) {
          await mapperRef.current.init();
        }
        if (!cancelled) setModulesReady(true);
      } catch (loadError) {
        console.error("Failed to load evolution generator modules", loadError);
        if (!cancelled) {
          setError("Unable to load the cat renderer.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Live altar preview for a history starter (respects the hair choice).
  useEffect(() => {
    setStarterPreview(null);
    if (
      starterMode !== "history" ||
      !historyRecord?.cat_data ||
      !modulesReady
    ) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const selectedHair = HAIR_SPRITES.find(
          (option) => option.id === hairSprite,
        );
        const payload = (
          selectedHair?.spriteNumber
            ? applySpriteToStarterPayload(
                historyRecord.cat_data,
                selectedHair.spriteNumber,
              )
            : historyRecord.cat_data
        ) as Record<string, unknown>;
        const params = (payload.params ?? payload) as CatParams;
        const rendered = await generatorRef.current?.generateCat(params);
        if (cancelled || !rendered) return;
        setStarterPreview(
          rendered.imageDataUrl ??
            imageDataFromCanvas(
              rendered.canvas as HTMLCanvasElement | OffscreenCanvas,
            ),
        );
      } catch (previewError) {
        console.warn("Failed to render starter preview", previewError);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [starterMode, historyRecord, hairSprite, modulesReady]);

  const renderRecord = useCallback(async (cat: EvolutionGeneratedCat) => {
    const generator = generatorRef.current;
    if (!generator) throw new Error("Cat renderer is not ready");
    const rendered = await generator.generateCat(cat.catData.params);
    return {
      ...cat,
      previewUrl:
        rendered.imageDataUrl ??
        imageDataFromCanvas(
          rendered.canvas as HTMLCanvasElement | OffscreenCanvas,
        ),
      profileId: null,
      shareToken: null,
      catName: null,
    } satisfies UiEvolutionCat;
  }, []);

  // Renders one slot-machine tease frame: a variant of the upcoming cat with
  // the same trait shape as the real roll but random values.
  const requestTeaserFrame = useCallback(
    async (index: number) => {
      const generator = generatorRef.current;
      const upcoming = recordsRef.current[index];
      if (!generator || !upcoming || !ceremonyPools) return null;
      const parent =
        Number(upcoming.level) <= 1
          ? recordsRef.current[0]
          : recordsRef.current[index - 1];
      if (!parent) return null;
      try {
        const params = generateTeaserVariant(
          parent.catData,
          upcoming.additions,
          ceremonyPools,
          { archetype: upcoming.archetype },
        );
        const rendered = await generator.generateCat(params);
        return (
          rendered.imageDataUrl ??
          imageDataFromCanvas(
            rendered.canvas as HTMLCanvasElement | OffscreenCanvas,
          )
        );
      } catch (teaserError) {
        console.warn("Failed to render teaser frame", teaserError);
        return null;
      }
    },
    [ceremonyPools],
  );

  const persistResult = useCallback(
    async (
      result: EvolutionBatchResult,
      starterSource: Parameters<typeof buildEvolutionBatchSettings>[1],
    ) => {
      setSaveState("saving");
      setLastSavedToken(null);
      setLastSavedId(null);
      const currentMeta = metadataRef.current;
      try {
        const persistedCats: PersistedCatInfo[] = [];
        const catsPayload = await Promise.all(
          result.cats.map(async (cat, index) => {
            const encoded = encodeCatShare(
              cat.catData as unknown as Parameters<typeof encodeCatShare>[0],
            );
            const mapperResult = await createMapper({
              catData: cat.catData,
            });
            const profileId = mapperResult.id;
            const shareToken =
              mapperResult.shareToken ?? mapperResult.slug ?? mapperResult.id;
            persistedCats.push({ key: cat.key, profileId, shareToken });
            return {
              label: cat.label || `Evolution ${index + 1}`,
              catData: cat.catData,
              profileId: toId("cat_profile", profileId),
              encoded,
              shareToken,
            };
          }),
        );
        const settings = buildEvolutionBatchSettings(result, starterSource);
        const batch = await createBatch({
          cats: catsPayload,
          settings: {
            ...settings,
            batchTitle: currentMeta.title,
            batchCreator: currentMeta.creator,
          },
          title: currentMeta.title,
          creatorName: currentMeta.creator,
        });
        setRecords((previous) =>
          previous.map((record) => {
            const persisted = persistedCats.find(
              (item) => item.key === record.key,
            );
            return persisted ? { ...record, ...persisted } : record;
          }),
        );
        setLastSavedId(batch.id ?? null);
        setLastSavedToken(batch.slug ?? batch.shareToken ?? null);
        setSaveState("saved");
      } catch (saveError) {
        console.error("Failed to save evolution batch", saveError);
        setSaveState("error");
        setMetadataError("Failed to save evolution batch.");
      }
    },
    [createBatch, createMapper],
  );

  const handleGenerate = useCallback(async () => {
    const token = generationTokenRef.current + 1;
    generationTokenRef.current = token;
    setError(null);
    setSaveState("idle");
    setMetadataError(null);
    setMetadataMessage(null);
    setLastSavedId(null);
    setLastSavedToken(null);
    setRecords([]);
    setExpectedCount(selectedClans.length * controls.targetLevel + 1);
    setCeremonyKey((value) => value + 1);
    setPhase("ceremony");
    setIsGenerating(true);

    try {
      if (!generatorRef.current || !mapperRef.current) {
        throw new Error("Generator modules are still loading");
      }
      if (!mapperRef.current.loaded) {
        await mapperRef.current.init();
      }

      let starterPayload: unknown;
      let starterSource: Parameters<typeof buildEvolutionBatchSettings>[1];
      const starterSprite = resolveHairSprite(hairSprite);

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
        starterPayload = applySpriteToStarterPayload(
          historyRecord.cat_data,
          starterSprite,
        );
        starterSource = {
          type: "history",
          slug: historyRecord.slug ?? trimmedHistorySlug,
          profileId: historyRecord.id,
          catName: historyRecord.catName ?? null,
          creatorName: historyRecord.creatorName ?? null,
        };
      } else {
        const { generateRandomParamsV3Detailed } = await import(
          "@/lib/cat-v3/randomGenerator"
        );
        const randomStarter = await generateRandomParamsV3Detailed({
          exactLayerCounts: true,
          slotOverrides: {
            accessories: 0,
            scars: 0,
            tortie: 0,
          },
        });
        starterPayload = {
          params: cleanRandomStarterLayers({
            ...randomStarter.params,
            spriteNumber: starterSprite,
          } satisfies CatParams),
          accessorySlots: [],
          scarSlots: [],
          tortieSlots: [],
          counts: { accessories: 0, scars: 0, tortie: 0 },
        };
        starterSource = { type: "random" };
      }

      const pools = buildEvolutionPools(mapperRef.current);
      setCeremonyPools(pools);
      const result = generateEvolutionBatch(starterPayload, controls, pools, {
        archetypes: selectedClans,
      });
      const orderedCats = [
        result.starter,
        ...result.cats.filter((cat) => cat.level !== 0),
      ];
      const renderedRecords: UiEvolutionCat[] = [];

      for (const cat of orderedCats) {
        if (generationTokenRef.current !== token) return;
        const rendered = await renderRecord(cat);
        renderedRecords.push(rendered);
        setRecords([...renderedRecords]);
      }

      if (generationTokenRef.current !== token) return;
      await persistResult(result, starterSource);
    } catch (generationError) {
      console.error("Failed to generate evolution batch", generationError);
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Evolution generation failed.",
      );
      setSaveState("error");
      setPhase("setup");
    } finally {
      if (generationTokenRef.current === token) {
        setIsGenerating(false);
      }
    }
  }, [
    controls,
    hairSprite,
    historyRecord,
    persistResult,
    renderRecord,
    selectedClans,
    starterMode,
    trimmedHistorySlug,
  ]);

  const handleReset = useCallback(() => {
    generationTokenRef.current += 1;
    setRecords([]);
    setPhase("setup");
    setSaveState("idle");
    setIsGenerating(false);
    setError(null);
    setMetadataError(null);
    setMetadataMessage(null);
    setLastSavedId(null);
    setLastSavedToken(null);
  }, []);

  const handleMetadataSave = useCallback(
    async (nextMetadata: AdoptionMetadata) => {
      if (!lastSavedId) {
        setMetadataError("Save the batch first.");
        return;
      }
      const dirty =
        nextMetadata.title !== savedMetadata.title ||
        nextMetadata.creator !== savedMetadata.creator;
      if (!dirty) {
        setMetadataMessage("Nothing to save");
        return;
      }
      try {
        setMetadataSaving(true);
        setMetadataMessage(null);
        setMetadataError(null);
        await updateBatchMeta({
          id: toId("adoption_batch", lastSavedId),
          title: nextMetadata.title,
          creatorName: nextMetadata.creator,
        });
        setSavedMetadata(nextMetadata);
        metadataRef.current = nextMetadata;
        setMetadataMessage("Saved");
      } catch (metadataSaveError) {
        console.error("Failed to save evolution metadata", metadataSaveError);
        setMetadataError("Failed to save metadata.");
      } finally {
        setMetadataSaving(false);
      }
    },
    [lastSavedId, savedMetadata, updateBatchMeta],
  );

  const handleCatNameSave = useCallback(
    async (record: UiEvolutionCat, catName: string) => {
      if (!record.profileId) return;
      await updateProfileMeta({
        id: toId("cat_profile", record.profileId),
        catName,
      });
      setRecords((previous) =>
        previous.map((item) =>
          item.key === record.key ? { ...item, catName: catName.trim() } : item,
        ),
      );
    },
    [updateProfileMeta],
  );

  const treeCats = useMemo<EvolutionTreeCat[]>(
    () =>
      records.map((record) => ({
        key: record.key,
        label: record.label,
        name: record.catName?.trim() || record.label,
        level: Number(record.level),
        branchLabel: record.branchLabel,
        archetype: record.archetype,
        additions: record.additions,
        rolls: record.rolls,
        previewUrl: record.previewUrl,
        href: record.shareToken ? `/view/${record.shareToken}` : null,
      })),
    [records],
  );

  const saveStatusNode = (() => {
    if (saveState === "saving") {
      return (
        <span className="inline-flex items-center gap-2 text-sm text-amber-200">
          <Loader2 className="size-4 animate-spin" /> Saving evolution batch…
        </span>
      );
    }
    if (saveState === "saved") {
      return (
        <span className="inline-flex items-center gap-2 text-sm text-emerald-200">
          <FilledCheckedIcon size={16} />
          Saved to history
          {lastSavedToken ? (
            <Link
              href={`/evolution/${lastSavedToken}`}
              className="inline-flex items-center gap-1 underline"
            >
              open <ArrowUpRight className="size-3" />
            </Link>
          ) : null}
        </span>
      );
    }
    if (saveState === "error" && error) {
      return (
        <span className="inline-flex items-center gap-2 text-sm text-red-200">
          <TriangleAlertIcon size={16} /> {error}
        </span>
      );
    }
    return null;
  })();

  if (phase === "ceremony") {
    return (
      <div className="flex flex-col gap-3">
        <EvolutionCeremony
          key={ceremonyKey}
          cats={records}
          totalCount={expectedCount}
          onFinish={() => setPhase("tree")}
          pools={ceremonyPools}
          chargeDurationMs={spinSeconds * 1000}
          requestTeaserFrame={requestTeaserFrame}
        />
        {saveStatusNode ? (
          <div className="flex justify-center">{saveStatusNode}</div>
        ) : null}
      </div>
    );
  }

  if (phase === "tree") {
    return (
      <div className="flex flex-col gap-6">
        <header className="flex flex-col items-center gap-3 text-center">
          <span className={cn(pixelFontClass, "text-xs text-amber-200")}>
            ✨ ALL CEREMONIES HELD ✨
          </span>
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
            The {savedMetadata.title || "Evolution"} lineage
          </h1>
          {saveStatusNode}
        </header>

        <EvolutionTree cats={treeCats} animateIn />

        <section className="flex flex-col gap-3">
          <AdoptionMetadataPanel
            savedValue={savedMetadata}
            onSave={handleMetadataSave}
            busy={metadataSaving}
            message={metadataMessage}
            error={metadataError}
            canSave={!!lastSavedId}
          />
          {lastSavedId ? (
            <CatNameEditor records={records} onSave={handleCatNameSave} />
          ) : null}
          <div className="flex flex-wrap gap-2">
            {lastSavedToken ? (
              <Link
                href={`/evolution/${lastSavedToken}`}
                className="inline-flex items-center gap-2 rounded-xl border border-border/60 px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background"
              >
                <ArrowUpRight className="size-4" /> Open share page
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setCeremonyKey((value) => value + 1);
                setPhase("ceremony");
              }}
              disabled={isGenerating}
              className="inline-flex items-center gap-2 rounded-xl border border-border/60 px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background disabled:opacity-60"
            >
              ▶ Replay ceremony
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-2 rounded-xl border border-border/60 px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background"
            >
              <RotateCcw className="size-4" /> Evolve another
            </button>
          </div>
        </section>
      </div>
    );
  }

  const canGenerate =
    modulesReady &&
    !isGenerating &&
    selectedClans.length > 0 &&
    (starterMode === "random" ||
      Boolean(trimmedHistorySlug && historyRecord?.cat_data));

  return (
    <div className="flex flex-col gap-6">
      <ChamberHero />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* The altar */}
        <section className="flex flex-col gap-5 rounded-3xl border border-border/40 bg-slate-950/70 p-5">
          <span className={cn(pixelFontClass, "text-[10px] text-amber-200/90")}>
            THE ALTAR
          </span>
          <div className="relative mx-auto flex size-48 items-center justify-center">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `radial-gradient(circle, ${withAlpha("#fbbf24", 0.14)}, transparent 70%)`,
              }}
              aria-hidden
            />
            <div className="absolute inset-2 animate-pulse-soft rounded-full border border-amber-300/25" />
            {starterMode === "history" && starterPreview ? (
              <Image
                src={starterPreview}
                alt="Starter cat preview"
                width={320}
                height={320}
                unoptimized
                className="image-render-pixel relative size-40 object-contain"
              />
            ) : (
              <span
                className={cn(
                  pixelFontClass,
                  "relative text-4xl text-amber-200/60",
                )}
                aria-hidden
              >
                ?
              </span>
            )}
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
              Starter
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {(["random", "history"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setStarterMode(mode)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm font-semibold transition",
                    starterMode === mode
                      ? "border-amber-300/60 bg-amber-400/15 text-foreground"
                      : "border-border/60 bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {mode === "random" ? "Mystery egg" : "Saved cat"}
                </button>
              ))}
            </div>
            {starterMode === "history" ? (
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Slug
                <input
                  type="text"
                  value={historySlug}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setHistorySlug(event.target.value)
                  }
                  placeholder="Saved cat slug"
                  className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                />
                {trimmedHistorySlug && historyRecord === undefined ? (
                  <span className="text-[11px] text-amber-200">
                    Loading cat…
                  </span>
                ) : null}
                {trimmedHistorySlug && historyRecord === null ? (
                  <span className="text-[11px] text-red-300">
                    No cat found for that slug
                  </span>
                ) : null}
              </label>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                A clean random cat is summoned when the ritual begins.
              </p>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
              Starting coat
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {HAIR_SPRITES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setHairSprite(option.id)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-xs font-semibold transition sm:text-sm",
                    hairSprite === option.id
                      ? "border-amber-300/60 bg-amber-400/15 text-foreground"
                      : "border-border/60 bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Shorthair lines can grow out a long coat mid-line — and it stays.
            </p>
          </fieldset>
        </section>

        {/* The ritual */}
        <section className="flex flex-col gap-5 rounded-3xl border border-border/40 bg-slate-950/70 p-5">
          <span
            className={cn(pixelFontClass, "text-[10px] text-violet-300/90")}
          >
            THE RITUAL
          </span>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
              Clans to roll · {selectedClans.length} selected
            </span>
            <div className="flex flex-wrap gap-1.5">
              {CLAN_ORDER.map((archetype) => {
                const theme = ARCHETYPE_THEMES[archetype];
                const selected = selectedClans.includes(archetype);
                const wild = isWildArchetype(archetype);
                return (
                  <button
                    key={archetype}
                    type="button"
                    onClick={() =>
                      setSelectedClans((current) =>
                        current.includes(archetype)
                          ? current.filter((clan) => clan !== archetype)
                          : CLAN_ORDER.filter(
                              (clan) =>
                                current.includes(clan) || clan === archetype,
                            ),
                      )
                    }
                    title={`${theme.label}Clan — ${theme.blurb}${wild ? " (wild: may roll any palette)" : ""}`}
                    aria-label={`${theme.label}Clan${wild ? " (wild)" : ""}`}
                    aria-pressed={selected}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-lg border text-base transition",
                      wild && "border-dashed",
                      selected
                        ? "scale-105"
                        : "border-border/60 bg-background opacity-50 grayscale hover:opacity-100 hover:grayscale-0",
                    )}
                    style={
                      selected
                        ? {
                            borderColor: withAlpha(theme.from, 0.7),
                            background: withAlpha(theme.to, 0.18),
                          }
                        : undefined
                    }
                  >
                    <span aria-hidden>{theme.glyph}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                Final rank
              </span>
              <div className="grid grid-cols-3 gap-2">
                {TARGET_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() =>
                      setControls((current) =>
                        normalizeEvolutionControls({
                          ...current,
                          targetLevel: level,
                        }),
                      )
                    }
                    className={cn(
                      "rounded-lg border px-2 py-2.5 text-xs font-semibold transition",
                      controls.targetLevel === level
                        ? "border-violet-300/60 bg-violet-500/15 text-foreground"
                        : "border-border/60 bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {stageRank(level)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                Spin time
              </span>
              <div className="grid grid-cols-5 gap-1">
                {SPIN_TIMES.map((seconds) => (
                  <button
                    key={seconds}
                    type="button"
                    onClick={() => setSpinSeconds(seconds)}
                    className={cn(
                      "rounded-lg border px-1 py-2.5 text-xs font-semibold transition",
                      spinSeconds === seconds
                        ? "border-violet-300/60 bg-violet-500/15 text-foreground"
                        : "border-border/60 bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {seconds}s
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <RangeControl
              label="Torties / stage"
              range={controls.torties}
              steps={TORTIE_STEPS}
              onChange={(range) =>
                setControls((current) =>
                  normalizeEvolutionControls({ ...current, torties: range }),
                )
              }
            />
            <RangeControl
              label="Accessories / stage"
              range={controls.accessories}
              onChange={(range) =>
                setControls((current) =>
                  normalizeEvolutionControls({
                    ...current,
                    accessories: range,
                  }),
                )
              }
            />
            <RangeControl
              label="Scars / stage"
              range={controls.scars}
              onChange={(range) =>
                setControls((current) =>
                  normalizeEvolutionControls({ ...current, scars: range }),
                )
              }
              disabled={!controls.scarsEnabled}
              trailing={
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={controls.scarsEnabled}
                    onChange={(event) =>
                      setControls((current) => ({
                        ...current,
                        scarsEnabled: event.target.checked,
                      }))
                    }
                    className="size-3.5 accent-primary"
                  />
                  enabled
                </label>
              }
            />
          </div>

          <div className="mt-auto flex flex-col gap-3 border-t border-border/30 pt-4">
            <p className="text-xs text-muted-foreground">
              {selectedClans.length}{" "}
              {selectedClans.length === 1 ? "clan" : "clans"} ·{" "}
              {selectedClans.length * controls.targetLevel + 1} cats · ranks up
              to {stageRank(controls.targetLevel)} · ceremony ≈{" "}
              {formatDuration(
                estimateCeremonySeconds(
                  selectedClans.length,
                  controls.targetLevel,
                  spinSeconds,
                ),
              )}{" "}
              at 1×
            </p>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
              className={cn(
                pixelFontClass,
                "group relative inline-flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl border border-amber-300/50 bg-gradient-to-r from-amber-500/25 via-orange-500/25 to-rose-500/25 px-6 py-4 text-xs text-amber-100 transition hover:border-amber-200 hover:from-amber-500/40 hover:via-orange-500/40 hover:to-rose-500/40 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
              )}
            >
              {isGenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <span aria-hidden>⚡</span>
              )}
              BEGIN EVOLUTION
            </button>
            {!modulesReady && !error ? (
              <span className="text-center text-[11px] text-muted-foreground">
                Warming up the chamber…
              </span>
            ) : null}
            {error ? (
              <span className="inline-flex items-center justify-center gap-2 text-sm text-red-200">
                <TriangleAlertIcon size={16} /> {error}
              </span>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function ChamberHero() {
  return (
    <header className="relative overflow-hidden rounded-3xl border border-violet-500/25 bg-slate-950 p-8 sm:p-10">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 70% at 15% 0%, rgba(168, 85, 247, 0.18), transparent 60%), radial-gradient(ellipse 55% 65% at 85% 10%, rgba(251, 146, 60, 0.15), transparent 60%), radial-gradient(ellipse 70% 60% at 50% 110%, rgba(34, 211, 238, 0.12), transparent 65%)",
        }}
        aria-hidden
      />
      <div className="relative flex flex-col gap-4">
        <p className={cn(pixelFontClass, "text-[10px] text-violet-300")}>
          CAT GACHA · EVOLUTION
        </p>
        <h1
          className={cn(
            pixelFontClass,
            "text-xl leading-relaxed text-white sm:text-3xl",
          )}
        >
          THE EVOLUTION{" "}
          <span className="bg-gradient-to-r from-amber-300 via-rose-300 to-violet-300 bg-clip-text text-transparent">
            CHAMBER
          </span>
        </h1>
        <p className="max-w-2xl text-sm text-neutral-200/85">
          Place one kit on the altar and watch its descendants earn their ranks
          across elemental clans — every ceremony rolled live with new coats,
          accessories, and battle scars.
        </p>
      </div>
    </header>
  );
}

function RangeControl({
  label,
  range,
  onChange,
  steps = LAYER_STEPS,
  disabled = false,
  trailing,
}: {
  label: string;
  range: EvolutionRange;
  onChange: (range: EvolutionRange) => void;
  steps?: readonly number[];
  disabled?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <fieldset
      className={cn("flex flex-col gap-2 transition", disabled && "opacity-50")}
    >
      <legend className="flex w-full items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
        {label}
        {trailing}
      </legend>
      {(["min", "max"] as const).map((field) => (
        <div key={field} className="flex items-center gap-2">
          <span className="w-7 text-[10px] uppercase text-muted-foreground">
            {field}
          </span>
          <div
            className="grid flex-1 gap-1"
            style={{
              gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
            }}
          >
            {steps.map((step) => (
              <button
                key={step}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...range, [field]: step })}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed",
                  range[field] === step
                    ? "border-violet-300/60 bg-violet-500/15 text-foreground"
                    : "border-border/50 bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {step}
              </button>
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}

function CatNameEditor({
  records,
  onSave,
}: {
  records: UiEvolutionCat[];
  onSave: (record: UiEvolutionCat, catName: string) => Promise<void>;
}) {
  const editable = records.filter((record) => record.profileId);
  if (editable.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border/40 bg-background/70 p-4">
      <div className="mb-3 text-sm font-semibold text-foreground">
        Name the lineage
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {editable.map((record) => (
          <CatNameRow key={record.key} record={record} onSave={onSave} />
        ))}
      </div>
    </section>
  );
}

function CatNameRow({
  record,
  onSave,
}: {
  record: UiEvolutionCat;
  onSave: (record: UiEvolutionCat, catName: string) => Promise<void>;
}) {
  const [name, setName] = useState(record.catName ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dirty = name.trim() !== (record.catName ?? "").trim();

  useEffect(() => {
    setName(record.catName ?? "");
  }, [record.catName]);

  const submit = async () => {
    try {
      setSaving(true);
      setMessage(null);
      await onSave(record, name);
      setMessage("Saved");
      window.setTimeout(() => setMessage(null), 1800);
    } finally {
      setSaving(false);
    }
  };

  return (
    <label className="flex flex-col gap-2 text-xs text-muted-foreground">
      {record.label}
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Cat name"
          className="min-w-0 flex-1 rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!dirty || saving}
          className="inline-flex w-20 items-center justify-center rounded-lg border border-border/60 px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-3 animate-spin" /> : "Save"}
        </button>
      </div>
      {message ? <span className="text-emerald-300">{message}</span> : null}
    </label>
  );
}
