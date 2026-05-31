"use client";

import { useMutation, useQuery } from "convex/react";
import {
  ArrowUpRight,
  GitBranch,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
} from "lucide-react";
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
import type { CatGeneratorApi, SpriteMapperApi } from "@/components/cat-builder/types";
import FilledCheckedIcon from "@/components/ui/filled-checked-icon";
import TriangleAlertIcon from "@/components/ui/triangle-alert-icon";
import { api } from "@/convex/_generated/api";
import { toId } from "@/convex/utils";
import { encodeCatShare } from "@/lib/catShare";
import type { CatParams } from "@/lib/cat-v3/types";
import {
  buildEvolutionBatchSettings,
  type EvolutionAddition,
  type EvolutionBatchResult,
  type EvolutionControls,
  type EvolutionGeneratedCat,
  type EvolutionLevel,
  type EvolutionRange,
  type EvolutionRoll,
  generateEvolutionBatch,
  getTortieLayerParts,
  normalizeEvolutionControls,
} from "@/lib/evolution/evolutionGenerator";
import { buildEvolutionPools } from "@/lib/evolution/evolutionPools";
import { useDefaultCreatorName } from "@/lib/useDefaultCreatorName";
import { cn } from "@/lib/utils";

type StarterMode = "random" | "history";
type SaveState = "idle" | "saving" | "saved" | "error";
type HairSprite = "long" | "short";

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

type AdditionDisplayRow = {
  id: string;
  label: string;
  value: string;
};

type EvolutionRollRow = AdditionDisplayRow & {
  branch: string;
  level: number;
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
const HAIR_SPRITES: Array<{
  id: HairSprite;
  label: string;
  spriteNumber: 8 | 9;
}> = [
  { id: "short", label: "Short hair", spriteNumber: 8 },
  { id: "long", label: "Long hair", spriteNumber: 9 },
];

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatValue(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatAddition(addition: EvolutionAddition) {
  if (addition.kind === "tortie") {
    return addition.value.colour
      ? `${formatValue(addition.value.mask ?? "")} / ${formatValue(addition.value.pattern ?? "")} / ${formatValue(addition.value.colour)}`
      : addition.label;
  }
  return formatValue(addition.value);
}

function getTortieParts(addition: Extract<EvolutionAddition, { kind: "tortie" }>) {
  return addition.parts?.length > 0
    ? addition.parts
    : getTortieLayerParts(addition.value);
}

function buildAdditionDisplayRows(
  additions: EvolutionAddition[],
  idPrefix: string,
): AdditionDisplayRow[] {
  let tortieLayerIndex = 0;
  return additions.flatMap((addition, additionIndex) => {
    if (addition.kind === "tortie") {
      tortieLayerIndex += 1;
      const layerLabel = `Tortie ${tortieLayerIndex}`;
      return getTortieParts(addition).map((part) => ({
        id: `${idPrefix}-${additionIndex}-${part.kind}`,
        label: `${layerLabel} ${part.label}`,
        value: formatValue(part.value),
      }));
    }
    return [
      {
        id: `${idPrefix}-${additionIndex}-${addition.kind}`,
        label: addition.kind === "accessory" ? "Accessory" : "Scar",
        value: formatAddition(addition),
      },
    ];
  });
}

function buildRollDisplayRows(
  rolls: EvolutionRoll[] | undefined,
  additions: EvolutionAddition[],
  idPrefix: string,
): AdditionDisplayRow[] {
  if (!rolls?.length) return buildAdditionDisplayRows(additions, idPrefix);
  return rolls.map((roll, index) => {
    if (roll.kind === "tortie-count") {
      return {
        id: `${idPrefix}-roll-${index}`,
        label: roll.label,
        value:
          roll.range.min === roll.range.max
            ? String(roll.value)
            : `${roll.value} from ${roll.range.min}-${roll.range.max}`,
      };
    }
    return {
      id: `${idPrefix}-roll-${index}`,
      label: roll.label,
      value: formatValue(String(roll.value)),
    };
  });
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

function controlRangeText(range: EvolutionRange) {
  return range.min === range.max ? String(range.min) : `${range.min}-${range.max}`;
}

function RangeInputs({
  label,
  range,
  onChange,
}: {
  label: string;
  range: EvolutionRange;
  onChange: (range: EvolutionRange) => void;
}) {
  const update = (field: keyof EvolutionRange, value: string) => {
    const numeric = Number.parseInt(value, 10);
    const next = { ...range, [field]: Number.isFinite(numeric) ? numeric : 0 };
    onChange({
      min: Math.min(Math.max(next.min, 0), 2),
      max: Math.min(Math.max(next.max, 0), 2),
    });
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
        {label}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Min
          <input
            type="number"
            min={0}
            max={2}
            value={range.min}
            onChange={(event) => update("min", event.target.value)}
            className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Max
          <input
            type="number"
            min={0}
            max={2}
            value={range.max}
            onChange={(event) => update("max", event.target.value)}
            className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </label>
      </div>
    </fieldset>
  );
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
  const [starterMode, setStarterMode] = useState<StarterMode>("random");
  const [hairSprite, setHairSprite] = useState<HairSprite>("short");
  const [historySlug, setHistorySlug] = useState("");
  const [controls, setControls] = useState<EvolutionControls>(() =>
    normalizeEvolutionControls(),
  );
  const [records, setRecords] = useState<UiEvolutionCat[]>([]);
  const [rollRows, setRollRows] = useState<EvolutionRollRow[]>([]);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationComplete, setGenerationComplete] = useState(false);
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

  const groupedRecords = useMemo(() => {
    const starter = records.find((record) => record.level === 0) ?? null;
    const branches = new Map<string, UiEvolutionCat[]>();
    for (const record of records) {
      if (record.level === 0 || !record.branchLabel) continue;
      const list = branches.get(record.branchLabel) ?? [];
      list.push(record);
      branches.set(record.branchLabel, list);
    }
    return {
      starter,
      branches: Array.from(branches.entries()).map(([branch, cats]) => ({
        branch,
        cats: cats.sort((a, b) => a.level - b.level),
      })),
    };
  }, [records]);

  const renderRecord = useCallback(async (cat: EvolutionGeneratedCat) => {
    const generator = generatorRef.current;
    if (!generator) throw new Error("Cat renderer is not ready");
    const rendered = await generator.generateCat(cat.catData.params);
    return {
      ...cat,
      previewUrl:
        rendered.imageDataUrl ??
        imageDataFromCanvas(rendered.canvas as HTMLCanvasElement | OffscreenCanvas),
      profileId: null,
      shareToken: null,
      catName: null,
    } satisfies UiEvolutionCat;
  }, []);

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
            const persisted = persistedCats.find((item) => item.key === record.key);
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
    setGenerationComplete(false);
    setRecords([]);
    setRollRows([]);
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
      const selectedHair =
        HAIR_SPRITES.find((option) => option.id === hairSprite) ?? HAIR_SPRITES[0];

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
          selectedHair.spriteNumber,
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
            spriteNumber: selectedHair.spriteNumber,
          } satisfies CatParams),
          accessorySlots: [],
          scarSlots: [],
          tortieSlots: [],
          counts: { accessories: 0, scars: 0, tortie: 0 },
        };
        starterSource = { type: "random" };
      }

      const pools = buildEvolutionPools(mapperRef.current);
      const result = generateEvolutionBatch(starterPayload, controls, pools);
      const orderedCats = [
        result.starter,
        ...result.cats.filter((cat) => cat.level !== 0),
      ];
      const renderedRecords: UiEvolutionCat[] = [];

      for (const cat of orderedCats) {
        if (generationTokenRef.current !== token) return;
        setActiveLabel(cat.label);
        const rendered = await renderRecord(cat);
        renderedRecords.push(rendered);
        setRecords([...renderedRecords]);

        if (cat.additions.length > 0) {
          setRollRows((previous) => [
            ...previous,
            ...buildRollDisplayRows(cat.rolls, cat.additions, cat.key).map(
              (row) => ({
                ...row,
                branch: cat.branchLabel ?? "Starter",
                level: Number(cat.level),
              }),
            ),
          ]);
        }
        await wait(cat.level === 0 ? 220 : 130);
      }

      if (generationTokenRef.current !== token) return;
      setActiveLabel(null);
      setGenerationComplete(true);
      await persistResult(result, starterSource);
    } catch (generationError) {
      console.error("Failed to generate evolution batch", generationError);
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Evolution generation failed.",
      );
      setSaveState("error");
    } finally {
      if (generationTokenRef.current === token) {
        setIsGenerating(false);
        setActiveLabel(null);
      }
    }
  }, [
    controls,
    hairSprite,
    historyRecord,
    persistResult,
    renderRecord,
    starterMode,
    trimmedHistorySlug,
  ]);

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

  const statusNode = (() => {
    if (isGenerating) {
      return (
        <span className="inline-flex items-center gap-2 text-sm text-amber-200">
          <Loader2 className="size-4 animate-spin" />
          {activeLabel ? `Revealing ${activeLabel}` : "Generating evolution"}
        </span>
      );
    }
    if (saveState === "saving") {
      return (
        <span className="inline-flex items-center gap-2 text-sm text-amber-200">
          <Loader2 className="size-4 animate-spin" /> Saving evolution batch
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

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-border/40 bg-background/70 p-4">
        <fieldset className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
            Hair
          </legend>
          <div className="grid gap-2 sm:w-auto sm:grid-cols-2">
            {HAIR_SPRITES.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setHairSprite(option.id)}
                className={cn(
                  "flex min-w-36 items-center justify-center rounded-lg border px-3 py-2 text-center text-sm font-semibold transition",
                  hairSprite === option.id
                    ? "border-primary/60 bg-primary/15 text-foreground"
                    : "border-border/60 bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="grid gap-4 rounded-2xl border border-border/40 bg-background/70 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <fieldset className="flex flex-col gap-3">
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
                      ? "border-primary/60 bg-primary/15 text-foreground"
                      : "border-border/60 bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {mode === "random" ? "Random" : "History"}
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
                  <span className="text-[11px] text-amber-200">Loading cat</span>
                ) : null}
                {trimmedHistorySlug && historyRecord === null ? (
                  <span className="text-[11px] text-red-300">
                    No cat found for that slug
                  </span>
                ) : null}
              </label>
            ) : null}
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
              Shape
            </legend>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Branches
              <input
                type="number"
                min={1}
                max={12}
                value={controls.branchCount}
                onChange={(event) =>
                  setControls((current) =>
                    normalizeEvolutionControls({
                      ...current,
                      branchCount: Number.parseInt(event.target.value, 10),
                    }),
                  )
                }
                className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </label>
            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">Evolutions</span>
              <div className="grid grid-cols-3 gap-2">
                {TARGET_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() =>
                      setControls((current) =>
                        normalizeEvolutionControls({ ...current, targetLevel: level }),
                      )
                    }
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-semibold transition",
                      controls.targetLevel === level
                        ? "border-primary/60 bg-primary/15 text-foreground"
                        : "border-border/60 bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </fieldset>

          <div className="grid gap-3">
            <RangeInputs
              label="Torties per evolution"
              range={controls.torties}
              onChange={(range) =>
                setControls((current) =>
                  normalizeEvolutionControls({ ...current, torties: range }),
                )
              }
            />
            <RangeInputs
              label="Accessories per evolution"
              range={controls.accessories}
              onChange={(range) =>
                setControls((current) =>
                  normalizeEvolutionControls({ ...current, accessories: range }),
                )
              }
            />
          </div>

          <div className="grid gap-3 sm:col-span-2 xl:col-span-1">
            <RangeInputs
              label="Scars per evolution"
              range={controls.scars}
              onChange={(range) =>
                setControls((current) =>
                  normalizeEvolutionControls({ ...current, scars: range }),
                )
              }
            />
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-muted-foreground">
              <span>Scars enabled</span>
              <input
                type="checkbox"
                checked={controls.scarsEnabled}
                onChange={(event) =>
                  setControls((current) => ({
                    ...current,
                    scarsEnabled: event.target.checked,
                  }))
                }
                className="size-4 accent-primary"
              />
            </label>
          </div>
        </div>

        <aside className="flex flex-col justify-between gap-4 rounded-xl border border-border/40 bg-slate-950/50 p-4">
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <span className="rounded-lg border border-border/30 bg-background/50 px-3 py-2">
              {controls.branchCount} branches
            </span>
            <span className="rounded-lg border border-border/30 bg-background/50 px-3 py-2">
              {controls.targetLevel}{" "}
              {controls.targetLevel === 1 ? "evolution" : "evolutions"}
            </span>
            <span className="rounded-lg border border-border/30 bg-background/50 px-3 py-2">
              Sprite{" "}
              {HAIR_SPRITES.find((option) => option.id === hairSprite)
                ?.spriteNumber ?? 9}
            </span>
            <span className="rounded-lg border border-border/30 bg-background/50 px-3 py-2">
              Torties {controlRangeText(controls.torties)}
            </span>
            <span className="rounded-lg border border-border/30 bg-background/50 px-3 py-2">
              Scars {controls.scarsEnabled ? controlRangeText(controls.scars) : "off"}
            </span>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || saveState === "saving"}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isGenerating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Generate Evolution
          </button>
          {statusNode}
        </aside>
      </section>

      {rollRows.length > 0 ? (
        <section className="rounded-2xl border border-border/40 bg-background/70 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <GitBranch className="size-4 text-primary" /> Evolution rolls
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {rollRows.slice(-18).map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background px-3 py-2 text-xs"
              >
                <span className="font-semibold text-muted-foreground">
                  {row.branch} E{row.level}
                </span>
                <span className="truncate text-foreground">
                  {row.label}: {row.value}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {records.length > 0 ? (
        <section className="flex flex-col gap-5">
          {groupedRecords.starter ? (
            <EvolutionCatCard record={groupedRecords.starter} prominent />
          ) : null}
          <div className="grid gap-5 lg:grid-cols-2">
            {groupedRecords.branches.map((branch) => (
              <div
                key={branch.branch}
                className="rounded-2xl border border-border/40 bg-background/70 p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-foreground">
                    Branch {branch.branch}
                  </h2>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {branch.cats[0]?.archetype ?? "evolution"}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {branch.cats.map((cat) => (
                    <EvolutionCatCard key={cat.key} record={cat} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {generationComplete ? (
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
                <ArrowUpRight className="size-4" /> Open evolution
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => {
                generationTokenRef.current += 1;
                setRecords([]);
                setRollRows([]);
                setGenerationComplete(false);
                setSaveState("idle");
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-border/60 px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background"
            >
              <RotateCcw className="size-4" /> Clear
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function EvolutionCatCard({
  record,
  prominent = false,
}: {
  record: UiEvolutionCat;
  prominent?: boolean;
}) {
  const name = record.catName?.trim() || record.label;
  const href = record.shareToken ? `/view/${record.shareToken}` : null;
  const additionRows = buildRollDisplayRows(
    record.rolls,
    record.additions,
    `${record.key}-summary`,
  );

  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border/40 bg-background p-3",
        prominent && "sm:grid sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center",
      )}
    >
      <div className="relative aspect-square overflow-hidden rounded-lg border border-border/30 bg-slate-950/40">
        {record.previewUrl ? (
          <Image
            src={record.previewUrl}
            alt={name}
            width={420}
            height={420}
            unoptimized
            className="h-full w-full object-contain image-render-pixel"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            Rendering
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-md bg-black/65 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
          {record.level === 0 ? "Starter" : `E${record.level}`}
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="truncate text-sm font-semibold text-foreground">{name}</h3>
        {record.archetype ? (
          <p className="text-xs text-muted-foreground">
            {formatValue(record.archetype)}
          </p>
        ) : null}
        {additionRows.length > 0 ? (
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            {additionRows.slice(0, 6).map((row) => (
              <span
                key={row.id}
                className="truncate"
              >
                {row.label}: {row.value}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Base form</p>
        )}
        {href ? (
          <Link
            href={href}
            className="mt-auto inline-flex items-center gap-2 text-xs font-semibold text-primary"
          >
            View cat <ArrowUpRight className="size-3" />
          </Link>
        ) : null}
      </div>
    </article>
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
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Save className="size-4 text-primary" /> Cat names
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
