"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import ArrowBigDownDashIcon from "@/components/ui/arrow-big-down-dash-icon";
import RefreshIcon from "@/components/ui/refresh-icon";
import SendHorizontalIcon from "@/components/ui/send-horizontal-icon";

import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { useCatGenerator, useSpriteMapperOptions } from "@/components/cat-builder/hooks";
import type { CatGeneratorApi, SpriteMapperApi } from "@/components/cat-builder/types";
import type { CatParams, TortieLayer } from "@/lib/cat-v3/types";
import { canvasToDataUrl, cloneParams, formatName, getColourSwatch } from "@/components/cat-builder/utils";

import type { PaletteMode } from "@/lib/palettes";
import { getPaletteMetadata } from "@/lib/palettes";

type StepId =
  | "colour"
  | "pattern"
  | "tortie"
  | "tortie-layer-1"
  | "tortie-layer-2"
  | "tortie-layer-3"
  | "tortie-layer-4"
  | "tortie-layer-5"
  | "tortie-layer-6"
  | "eyes"
  | "accents"
  | "skin-tint"
  | "accessories"
  | "scars"
  | "pose";

interface StepDefinition {
  id: StepId;
  title: string;
  navLabel: string;
  description: string;
  type:
    | "colour"
    | "pattern"
    | "tortie-toggle"
    | "tortie-layer"
    | "eyes"
    | "accents"
    | "skin-tint"
    | "accessories"
    | "scars"
    | "pose";
  parent?: StepId;
  layerIndex?: number;
}

interface StepState {
  completed: boolean;
  summary?: string;
}

interface TimelineEntry {
  id: StepId;
  title: string;
  summary: string;
  params: CatParams;
}

const STEP_DEFINITIONS: StepDefinition[] = [
  { id: "colour", title: "Base Colour", navLabel: "Base Colour", description: "Choose the base coat colour that sets the mood for the cat.", type: "colour" },
  { id: "pattern", title: "Pattern", navLabel: "Pattern", description: "Select the primary fur pattern.", type: "pattern" },
  { id: "tortie", title: "Tortie Layers", navLabel: "Tortie", description: "Decide if you want to add layered tortie colours.", type: "tortie-toggle" },
  { id: "tortie-layer-1", title: "Tortie Layer 1", navLabel: "Layer 1", description: "Shape the first tortie layer.", type: "tortie-layer", parent: "tortie", layerIndex: 0 },
  { id: "tortie-layer-2", title: "Tortie Layer 2", navLabel: "Layer 2", description: "Add a second tortie layer for extra depth.", type: "tortie-layer", parent: "tortie", layerIndex: 1 },
  { id: "tortie-layer-3", title: "Tortie Layer 3", navLabel: "Layer 3", description: "Optional third tortie layer.", type: "tortie-layer", parent: "tortie", layerIndex: 2 },
  { id: "tortie-layer-4", title: "Tortie Layer 4", navLabel: "Layer 4", description: "Bonus tortie layer for advanced builds.", type: "tortie-layer", parent: "tortie", layerIndex: 3 },
  { id: "tortie-layer-5", title: "Tortie Layer 5", navLabel: "Layer 5", description: "Keep layering unique blends.", type: "tortie-layer", parent: "tortie", layerIndex: 4 },
  { id: "tortie-layer-6", title: "Tortie Layer 6", navLabel: "Layer 6", description: "Final custom tortie layer slot.", type: "tortie-layer", parent: "tortie", layerIndex: 5 },
  { id: "eyes", title: "Eyes", navLabel: "Eyes", description: "Pick the primary and optional secondary eye colours.", type: "eyes" },
  { id: "accents", title: "Markings", navLabel: "Markings", description: "Add white patches, points, or vitiligo accents.", type: "accents" },
  { id: "skin-tint", title: "Skin & Tint", navLabel: "Skin & Tint", description: "Choose skin tone, overall tint, and white patch tinting.", type: "skin-tint" },
  { id: "accessories", title: "Accessories", navLabel: "Accessories", description: "Finish the look with plants, wild accessories, or collars.", type: "accessories" },
  { id: "scars", title: "Scars & Stories", navLabel: "Scars", description: "Add battle, environmental, or history scars.", type: "scars" },
  { id: "pose", title: "Age & Pose", navLabel: "Age & Pose", description: "Pick the sprite pose to showcase your cat.", type: "pose" },
];

const TORTIE_LAYER_STEPS: StepId[] = [
  "tortie-layer-1",
  "tortie-layer-2",
  "tortie-layer-3",
  "tortie-layer-4",
  "tortie-layer-5",
  "tortie-layer-6",
];

const MAX_TORTIE_LAYERS = TORTIE_LAYER_STEPS.length;

const DEFAULT_PARAMS: CatParams = {
  spriteNumber: 8,
  peltName: "SingleColour",
  colour: "WHITE",
  isTortie: false,
  tortie: [],
  eyeColour: "YELLOW",
  skinColour: "PINK",
  tint: "none",
  shading: false,
  reverse: false,
  accessories: [],
  scars: [],
  whitePatchesTint: "none",
};

const PALETTE_CONTROLS: { id: PaletteMode; label: string }[] = [
  { id: "off", label: "Classic" },
  ...getPaletteMetadata().map((p) => ({ id: p.id, label: p.label })),
];

const DISPLAY_CANVAS_SIZE = 540;

type GuidedPreviewSpriteProps = {
  cacheKey: string;
  mutate: (draft: CatParams) => void;
  size?: number;
  label?: string;
  badge?: ReactNode;
  selected?: boolean;
  rendererReady: boolean;
  requestPreview: (key: string, mutator: (draft: CatParams) => void) => Promise<string | null>;
  getCachedPreview: (key: string) => string | null;
  hasCachedPreview: (key: string) => boolean;
};

function GuidedPreviewSprite({
  cacheKey,
  mutate,
  size = 250,
  label,
  badge,
  selected,
  rendererReady,
  requestPreview,
  getCachedPreview,
  hasCachedPreview,
}: GuidedPreviewSpriteProps) {
  const [src, setSrc] = useState<string | null>(() => getCachedPreview(cacheKey));
  const [resolvedKey, setResolvedKey] = useState<string | null>(() =>
    hasCachedPreview(cacheKey) ? cacheKey : null
  );
  const mutateRef = useRef(mutate);
  const cachedSrc = getCachedPreview(cacheKey);
  const loading = rendererReady && resolvedKey !== cacheKey && !cachedSrc;
  const displaySrc = resolvedKey === cacheKey ? src : cachedSrc;

  useEffect(() => {
    mutateRef.current = mutate;
  }, [mutate]);

  useEffect(() => {
    let cancelled = false;
    if (!rendererReady) return;
    (async () => {
      const preview = await requestPreview(cacheKey, (draft) => mutateRef.current(draft));
      if (cancelled) return;
      setSrc(preview ?? null);
      setResolvedKey(cacheKey);
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey, rendererReady, requestPreview]);

  return (
    <div
      className={cn(
        "group relative block aspect-square w-full overflow-hidden rounded-2xl border transition",
        selected ? "border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.25)]" : "border-slate-700 hover:border-amber-300/70"
      )}
      style={{ backgroundColor: "rgba(8,11,18,0.88)", maxWidth: size }}
    >
      {displaySrc && !loading ? (
        <Image
          src={displaySrc}
          alt={label ?? ""}
          width={size}
          height={size}
          unoptimized
          draggable={false}
          style={{ imageRendering: "pixelated", width: "100%", height: "100%", objectFit: "contain" }}
        />
      ) : (
        <Loader2 className="size-5 animate-spin text-amber-200" />
      )}
      {badge && (
        <div className="pointer-events-none absolute left-2 top-2" aria-hidden>
          {badge}
        </div>
      )}
      {label && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-semibold uppercase tracking-wide text-amber-100 opacity-0 transition group-hover:opacity-100">
          {label}
        </div>
      )}
    </div>
  );
}

export function GuidedBuilderClient() {
  const router = useRouter();
  const [params, setParams] = useState<CatParams>(DEFAULT_PARAMS);
  const [tortieLayers, setTortieLayers] = useState<TortieLayer[]>([]);
  const [desiredTortieLayers, setDesiredTortieLayers] = useState(0);
  const [experimentalColourMode, setExperimentalColourMode] = useState<PaletteMode>("off");
  const [tortiePaletteMode, setTortiePaletteMode] = useState<PaletteMode>("off");
  const [stepStates, setStepStates] = useState<Record<StepId, StepState>>({} as Record<StepId, StepState>);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [unlockedSteps, setUnlockedSteps] = useState<StepId[]>(["colour"]);
  const [activeStep, setActiveStep] = useState<StepId>("colour");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const { mapper, options, loading: loadingOptions, error: optionError } = useSpriteMapperOptions();
  const { generator, ready: rendererReady } = useCatGenerator();
  const [shareInfo, setShareInfo] = useState<{ slug: string; url: string } | null>(null);

  const spriteMapperRef = useRef<SpriteMapperApi | null>(null);
  const generatorRef = useRef<CatGeneratorApi | null>(null);
  const previewRequestRef = useRef(0);
  const previewCacheRef = useRef<Map<string, string>>(new Map());
  const previewPendingRef = useRef<Map<string, Promise<string | null>>>(new Map());

  const createMapperRecord = useMutation(api.mapper.create);

  useEffect(() => {
    spriteMapperRef.current = mapper ?? null;
  }, [mapper]);

  useEffect(() => {
    track("guided_builder_started", {});
  }, []);

  useEffect(() => {
    if (!options) return;
    setParams((prev) => {
      const next = cloneParams(prev);
      if (options.pelts.length > 0 && !options.pelts.includes(next.peltName)) {
        next.peltName = options.pelts[0] ?? next.peltName;
      }
      if (options.eyeColours.length > 0 && !options.eyeColours.includes(next.eyeColour)) {
        next.eyeColour = options.eyeColours[0] ?? next.eyeColour;
      }
      if (options.skinColours.length > 0 && !options.skinColours.includes(next.skinColour)) {
        next.skinColour = options.skinColours[0] ?? next.skinColour;
      }
      if (options.sprites.length > 0 && !options.sprites.includes(next.spriteNumber)) {
        next.spriteNumber = options.sprites[0] ?? next.spriteNumber;
      }
      return next;
    });
  }, [options]);

  useEffect(() => {
    generatorRef.current = generator ?? null;
  }, [generator]);

  useEffect(() => {
    const generator = generatorRef.current;
    if (!generator) return;

    const requestId = ++previewRequestRef.current;
    setPreviewLoading(true);
    (async () => {
      try {
        const payload = cloneParams(params);
        const result = await generator.generateCat({
          ...payload,
          spriteNumber: payload.spriteNumber,
        });

        const url = result.imageDataUrl || canvasToDataUrl(result.canvas);
        if (!url) throw new Error("Renderer returned empty image");
        if (previewRequestRef.current === requestId) {
          setPreviewUrl(url);
        }
      } catch (error) {
        console.error("Failed to render preview", error);
        if (previewRequestRef.current === requestId) {
          setPreviewUrl(null);
        }
      } finally {
        if (previewRequestRef.current === requestId) {
          setPreviewLoading(false);
        }
      }
    })();
  }, [params]);

  const activeStepDefinition = useMemo(
    () => STEP_DEFINITIONS.find((step) => step.id === activeStep) ?? STEP_DEFINITIONS[0],
    [activeStep]
  );

  const getPaletteForMode = useCallback((mode: PaletteMode) => {
    const activeMapper = mapper ?? spriteMapperRef.current;
    if (!activeMapper) return [];
    if (mode === "off") {
      return activeMapper.getColours();
    }
    const extras = activeMapper.getExperimentalColoursByMode?.(mode);
    if (extras && extras.length) {
      return extras;
    }
    const fallback = activeMapper.getColourOptions(mode);
    if (fallback && fallback.length) {
      return fallback;
    }
    return activeMapper.getColours();
  }, [mapper]);

  const paletteColours = useMemo(() => getPaletteForMode(experimentalColourMode), [experimentalColourMode, getPaletteForMode]);

  const tortiePalette = useMemo(() => getPaletteForMode(tortiePaletteMode), [getPaletteForMode, tortiePaletteMode]);

  const ensureTortieSync = useCallback(
    (layers: TortieLayer[], snapshot: CatParams) => {
      const validLayers = layers.filter(
        (layer) => layer && layer.pattern && layer.colour && layer.mask
      ) as Required<TortieLayer>[];
      const next = cloneParams(snapshot);
      if (validLayers.length > 0 && snapshot.isTortie) {
        next.tortie = validLayers.map((layer) => ({ ...layer }));
        const [primary] = validLayers;
        next.tortiePattern = primary.pattern;
        next.tortieColour = primary.colour;
        next.tortieMask = primary.mask;
      } else {
        next.tortie = [];
        next.tortiePattern = undefined;
        next.tortieColour = undefined;
        next.tortieMask = undefined;
      }
      return next;
    },
    []
  );

  const computeDefaultTortieLayer = useCallback(
    (index: number, base: CatParams): TortieLayer => {
      const patternOptions = options?.pelts ?? [];
      const maskOptions = options?.tortieMasks ?? [];
      const palette = getPaletteForMode(tortiePaletteMode);
      const defaultPattern = patternOptions.includes("SingleColour")
        ? "SingleColour"
        : patternOptions[0] ?? base.peltName ?? "SingleColour";
      const defaultColour = palette.includes("GINGER")
        ? "GINGER"
        : palette[0] ?? base.colour ?? "GINGER";
      const maskPreferences = ["ONE", "TWO", "THREE", "FOUR"];
      const preferredMask = maskPreferences[index];
      const defaultMask = preferredMask && maskOptions.includes(preferredMask)
        ? preferredMask
        : maskOptions[0] ?? "ONE";
      return {
        pattern: defaultPattern,
        colour: defaultColour,
        mask: defaultMask,
      };
    },
    [getPaletteForMode, options, tortiePaletteMode]
  );

  const requestPreview = useCallback(
    async (key: string, mutator: (draft: CatParams) => void): Promise<string | null> => {
      const cached = previewCacheRef.current.get(key);
      if (cached) return cached;
      const generator = generatorRef.current;
      if (!rendererReady || !generator) {
        return null;
      }
      const pending = previewPendingRef.current.get(key);
      if (pending) {
        return pending;
      }

      const promise = (async () => {
        try {
          const draft = cloneParams(params);
          mutator(draft);
          const result = await generator.generateCat(draft as unknown as Record<string, unknown>);
          let image = result.imageDataUrl ?? null;
          if (!image && result.canvas && typeof (result.canvas as HTMLCanvasElement).toDataURL === "function") {
            image = canvasToDataUrl(result.canvas as HTMLCanvasElement);
          }
          if (image) {
            previewCacheRef.current.set(key, image);
          }
          return image ?? null;
        } catch (error) {
          console.warn("Preview generation failed", error);
          return null;
        } finally {
          previewPendingRef.current.delete(key);
        }
      })();

      previewPendingRef.current.set(key, promise);
      return promise;
    },
    [params, rendererReady]
  );

  const getCachedPreview = useCallback((key: string) => previewCacheRef.current.get(key) ?? null, []);
  const hasCachedPreview = useCallback((key: string) => previewCacheRef.current.has(key), []);
  const previewSpriteSharedProps = {
    rendererReady,
    requestPreview,
    getCachedPreview,
    hasCachedPreview,
  };

  const buildTortiePreviewMutator = useCallback(
    (layerIndex: number, overrides: Partial<TortieLayer>) => {
      return (draft: CatParams) => {
        draft.isTortie = true;
        const palette = getPaletteForMode(tortiePaletteMode);
        const fallbackColour = overrides.colour ?? palette[0] ?? draft.colour;
        const fallbackPattern = overrides.pattern ?? draft.peltName;
        const fallbackMask = overrides.mask ?? "ONE";
        const layers: TortieLayer[] = Array.isArray(draft.tortie)
          ? draft.tortie.map((layer) => (layer ? { ...layer } : { pattern: fallbackPattern, colour: fallbackColour, mask: fallbackMask }))
          : [];
        while (layers.length <= layerIndex) {
          layers.push({ pattern: fallbackPattern, colour: fallbackColour, mask: fallbackMask });
        }
        const existing = layers[layerIndex] || { pattern: fallbackPattern, colour: fallbackColour, mask: fallbackMask };
        layers[layerIndex] = {
          pattern: overrides.pattern ?? existing.pattern ?? fallbackPattern,
          colour: overrides.colour ?? existing.colour ?? fallbackColour,
          mask: overrides.mask ?? existing.mask ?? fallbackMask,
        };
        draft.tortie = layers;
        const primary = layers[0];
        if (primary) {
          draft.tortiePattern = primary.pattern;
          draft.tortieColour = primary.colour;
          draft.tortieMask = primary.mask;
        }
      };
    },
    [getPaletteForMode, tortiePaletteMode]
  );

  const unlockStep = useCallback(
    (stepId: StepId, select = false) => {
      setUnlockedSteps((prev) => {
        if (prev.includes(stepId)) return prev;
        const next = [...prev, stepId];
        return next;
      });
      if (select) {
        setActiveStep(stepId);
      }
    },
    []
  );

  const lockStep = useCallback((stepId: StepId) => {
    setUnlockedSteps((prev) => prev.filter((id) => id !== stepId));
    setStepStates((prev) => {
      if (!prev[stepId]) return prev;
      const next = { ...prev };
      delete next[stepId];
      return next;
    });
    setTimeline((prev) => prev.filter((entry) => entry.id !== stepId));
  }, []);

  const evaluateStep = useCallback(
    (stepId: StepId, snapshot: CatParams, layers?: TortieLayer[]): { complete: boolean; summary: string } => {
      const tortieSource = layers ?? tortieLayers;
      switch (stepId) {
        case "colour": {
          const colour = snapshot.colour;
          return {
            complete: Boolean(colour),
            summary: formatName(colour),
          };
        }
        case "pattern":
          return {
            complete: Boolean(snapshot.peltName),
            summary: formatName(snapshot.peltName),
          };
        case "tortie":
          return {
            complete: true,
            summary: snapshot.isTortie ? "Tortie enabled" : "Single coat",
          };
        case "eyes": {
          const primary = formatName(snapshot.eyeColour);
          const secondary = snapshot.eyeColour2 ? formatName(snapshot.eyeColour2) : "None";
          return {
            complete: Boolean(snapshot.eyeColour),
            summary: `Primary: ${primary}, Secondary: ${secondary}`,
          };
        }
        case "accents": {
          const parts: string[] = [];
          if (snapshot.whitePatches) parts.push(`White patches: ${formatName(snapshot.whitePatches)}`);
          if (snapshot.points) parts.push(`Points: ${formatName(snapshot.points)}`);
          if (snapshot.vitiligo) parts.push(`Vitiligo: ${formatName(snapshot.vitiligo)}`);
          return {
            complete: true,
            summary: parts.length ? parts.join(" · ") : "No extra markings",
          };
        }
        case "skin-tint": {
          const skin = formatName(snapshot.skinColour);
          const tint = snapshot.tint && snapshot.tint !== "none" ? formatName(snapshot.tint) : "No tint";
          const whiteTint =
            snapshot.whitePatchesTint && snapshot.whitePatchesTint !== "none"
              ? formatName(snapshot.whitePatchesTint)
              : "No white tint";
          return {
            complete: Boolean(snapshot.skinColour),
            summary: `${skin} skin · ${tint} · ${whiteTint}`,
          };
        }
        case "accessories": {
          const accessories = snapshot.accessories ?? [];
          return {
            complete: true,
            summary: accessories.length ? `Accessories: ${accessories.map(formatName).join(", ")}` : "No accessories",
          };
        }
        case "scars": {
          const scars = snapshot.scars ?? [];
          return {
            complete: true,
            summary: scars.length ? `Scars: ${scars.map(formatName).join(", ")}` : "No scars chosen",
          };
        }
        case "pose":
          return {
            complete: typeof snapshot.spriteNumber === "number",
            summary: `Pose ${snapshot.spriteNumber}`,
          };
        default:
          {
            const layerMatch = /^tortie-layer-(\d+)$/.exec(stepId);
            if (layerMatch) {
              const index = Number(layerMatch[1]) - 1;
              const layer = index >= 0 ? tortieSource[index] : null;
              const complete = Boolean(layer?.pattern && layer?.colour && layer?.mask);
              const summary = complete
                ? `${formatName(layer?.pattern)} · ${formatName(layer?.colour)} · ${formatName(layer?.mask)}`
                : "";
              return { complete, summary };
            }
            return { complete: true, summary: "" };
          }
      }
    },
    [tortieLayers]
  );

  const markStepState = useCallback(
    (stepId: StepId, snapshot: CatParams, layers?: TortieLayer[]) => {
      const { complete, summary } = evaluateStep(stepId, snapshot, layers);
      setStepStates((prev) => {
        if (complete && summary) {
          return { ...prev, [stepId]: { completed: true, summary } };
        }
        if (!prev[stepId]) {
          return prev;
        }
        const next = { ...prev };
        delete next[stepId];
        return next;
      });
      setTimeline((prev) => {
        const filtered = prev.filter((entry) => entry.id !== stepId);
        if (complete && summary) {
          const stepMeta = STEP_DEFINITIONS.find((step) => step.id === stepId);
          return [
            ...filtered,
            {
              id: stepId,
              title: stepMeta?.title ?? formatName(stepId),
              summary,
              params: cloneParams(snapshot),
            },
          ];
        }
        return filtered;
      });
      return complete;
    },
    [evaluateStep]
  );

  const findNextStepId = useCallback(
    (afterStepId: StepId, snapshot: CatParams): StepId | null => {
      const index = STEP_DEFINITIONS.findIndex((step) => step.id === afterStepId);
      for (let i = index + 1; i < STEP_DEFINITIONS.length; i += 1) {
        const candidate = STEP_DEFINITIONS[i];
        if (candidate.type === "tortie-layer") {
          const layerIndex = candidate.layerIndex ?? 0;
          if (!snapshot.isTortie) continue;
          if (layerIndex >= desiredTortieLayers) continue;
        }
        return candidate.id;
      }
      return null;
    },
    [desiredTortieLayers]
  );

  const unlockNextRelevantStep = useCallback(
    (afterStepId: StepId, snapshot: CatParams): StepId | null => {
      const candidate = findNextStepId(afterStepId, snapshot);
      if (candidate) {
        unlockStep(candidate);
      }
      return candidate;
    },
    [findNextStepId, unlockStep]
  );

  const applyTortieLayers = useCallback(
    (nextLayers: TortieLayer[], enabled: boolean) => {
      setShareInfo(null);
      setTortieLayers(nextLayers);
      setParams((prevParams) => {
        const draft = cloneParams(prevParams);
        draft.isTortie = enabled;
        const synced = ensureTortieSync(nextLayers, draft);
        markStepState("tortie", synced, nextLayers);
        return synced;
      });
    },
    [ensureTortieSync, markStepState]
  );

  const forceUnlockLayer = useCallback(
    (targetIndex: number) => {
      if (targetIndex < 0 || targetIndex >= MAX_TORTIE_LAYERS) return;
      const desiredCount = Math.min(MAX_TORTIE_LAYERS, targetIndex + 1);
      setDesiredTortieLayers(desiredCount);
      const seededLayers = (() => {
        const layers = tortieLayers.slice(0, desiredCount).map((layer, idx) => ({
          ...(layer ?? computeDefaultTortieLayer(idx, params)),
        }));
        while (layers.length < desiredCount) {
          layers.push(computeDefaultTortieLayer(layers.length, params));
        }
        return layers;
      })();
      applyTortieLayers(seededLayers, true);
      for (let i = 0; i <= targetIndex && i < TORTIE_LAYER_STEPS.length; i += 1) {
        unlockStep(TORTIE_LAYER_STEPS[i]);
      }
      for (let i = targetIndex + 1; i < TORTIE_LAYER_STEPS.length; i += 1) {
        lockStep(TORTIE_LAYER_STEPS[i]);
      }
      setActiveStep(TORTIE_LAYER_STEPS[Math.min(targetIndex, TORTIE_LAYER_STEPS.length - 1)]);
    },
    [applyTortieLayers, computeDefaultTortieLayer, lockStep, params, tortieLayers, unlockStep]
  );


  const updateParams = useCallback(
    (mutator: (draft: CatParams) => void, stepId?: StepId) => {
      setShareInfo(null);
      setParams((prev) => {
        const draft = cloneParams(prev);
        mutator(draft);
        if (stepId) {
          const complete = markStepState(stepId, draft);
          if (complete) {
            unlockNextRelevantStep(stepId, draft);
          }
        }
        return draft;
      });
    },
    [markStepState, unlockNextRelevantStep]
  );

  const handleSelectColour = useCallback(
    (colour: string) => {
      updateParams((draft) => {
        draft.colour = colour;
      }, "colour");
    },
    [updateParams]
  );

  const handleSelectPattern = useCallback(
    (pelt: string) => {
      updateParams((draft) => {
        draft.peltName = pelt;
      }, "pattern");
    },
    [updateParams]
  );

  const handlePoseSelect = useCallback(
    (spriteNumber: number) => {
      updateParams((draft) => {
        draft.spriteNumber = spriteNumber;
      }, "pose");
    },
    [updateParams]
  );

  const handleTortieToggle = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        const nextLayers = [computeDefaultTortieLayer(0, params)];
        setDesiredTortieLayers(1);
        applyTortieLayers(nextLayers, true);
        TORTIE_LAYER_STEPS.forEach((stepId, index) => {
          if (index === 0) {
            unlockStep(stepId);
          } else {
            lockStep(stepId);
          }
        });
      } else {
        setDesiredTortieLayers(0);
        applyTortieLayers([], false);
        TORTIE_LAYER_STEPS.forEach((stepId) => lockStep(stepId));
      }
    },
    [applyTortieLayers, computeDefaultTortieLayer, lockStep, params, unlockStep]
  );

  const handleTortieLayerUpdate = useCallback(
    (layerIndex: number, mutator: (layer: TortieLayer) => void) => {
      const ensuredCount = Math.max(desiredTortieLayers, layerIndex + 1);
      if (ensuredCount !== desiredTortieLayers) {
        setDesiredTortieLayers(ensuredCount);
      }
      const nextLayers = [...Array(Math.max(tortieLayers.length, layerIndex + 1))].map((_, idx) => {
        const existing = tortieLayers[idx];
        return {
          ...(existing ?? computeDefaultTortieLayer(idx, params)),
        } as TortieLayer;
      });
      const target = nextLayers[layerIndex] ?? computeDefaultTortieLayer(layerIndex, params);
      const mutated = { ...target };
      mutator(mutated);
      nextLayers[layerIndex] = mutated;
      applyTortieLayers(nextLayers, true);
      const stepId = TORTIE_LAYER_STEPS[layerIndex];
      if (stepId) {
        const updatedSnapshot = ensureTortieSync(nextLayers, cloneParams(params));
        markStepState(stepId, updatedSnapshot, nextLayers);
        const { complete } = evaluateStep(stepId, updatedSnapshot, nextLayers);
        if (complete) {
          unlockNextRelevantStep(stepId, updatedSnapshot);
        }
      }
    },
    [applyTortieLayers, computeDefaultTortieLayer, desiredTortieLayers, ensureTortieSync, evaluateStep, markStepState, params, tortieLayers, unlockNextRelevantStep]
  );

  const handleAccessoryToggle = useCallback(
    (accessory: string, enabled: boolean) => {
      updateParams((draft) => {
        const set = new Set((draft.accessories ?? []).filter((x): x is string => x !== null));
        if (enabled) {
          set.add(accessory);
        } else {
          set.delete(accessory);
        }
        draft.accessories = Array.from(set);
        draft.accessory = draft.accessories[0] ?? undefined;
      }, "accessories");
    },
    [updateParams]
  );

  const handleScarToggle = useCallback(
    (scar: string, enabled: boolean) => {
      updateParams((draft) => {
        const set = new Set((draft.scars ?? []).filter((x): x is string => x !== null));
        if (enabled) {
          set.add(scar);
        } else {
          set.delete(scar);
        }
        draft.scars = Array.from(set);
        draft.scar = draft.scars[0] ?? undefined;
      }, "scars");
    },
    [updateParams]
  );

  const handleShare = useCallback(
    async ({ copy = true }: { copy?: boolean } = {}): Promise<string | null> => {
      if (!timeline.length) {
        window.alert("Complete at least one step before sharing.");
        return null;
      }

      const ensureCopied = async (url: string) => {
        if (!copy) return;
        try {
          await navigator.clipboard.writeText(url);
          window.alert("Timeline link copied to clipboard.");
        } catch (error) {
          console.warn("Clipboard unavailable", error);
          window.prompt("Copy this link", url);
        }
      };

      if (shareInfo) {
        await ensureCopied(shareInfo.url);
        return shareInfo.url;
      }

      try {
      const payload = {
        mode: "wizard-timeline",
        version: 1,
        basePalette: experimentalColourMode,
        tortiePalette: tortiePaletteMode,
        steps: timeline.map((step) => ({
          id: step.id,
          title: step.title,
          summary: step.summary,
          params: step.params,
        })),
        finalParams: cloneParams(params),
        params: cloneParams(params),
        spriteNumber: params.spriteNumber,
        metaLocked: false,
      };
        const record = await createMapperRecord({ catData: payload });
        if (!record?.slug && !record?.id) {
          throw new Error("Share API did not return a slug.");
        }
        const slug = record.slug ?? record.id;
        const url = `${window.location.origin}/guided-builder/view/${slug}`;
        setShareInfo({ slug, url });
        await ensureCopied(url);
        return url;
      } catch (error) {
        console.error("Failed to share timeline", error);
        window.alert("Unable to create a share link right now.");
        return null;
      }
    },
    [createMapperRecord, experimentalColourMode, params, shareInfo, timeline, tortiePaletteMode]
  );

  const handleDownload = useCallback(() => {
    if (!previewUrl) return;
    const link = document.createElement("a");
    link.href = previewUrl;
    link.download = "guided-cat.png";
    link.click();
    track("guided_builder_exported", {});
  }, [previewUrl]);

  const handleReset = useCallback(() => {
    const currentStepIndex = unlockedSteps.indexOf(activeStep);
    track("guided_builder_reset", { at_step: currentStepIndex >= 0 ? currentStepIndex + 1 : 0 });
    setParams(DEFAULT_PARAMS);
    setTortieLayers([]);
    setDesiredTortieLayers(0);
    setExperimentalColourMode("off");
    setTortiePaletteMode("off");
    setStepStates({} as Record<StepId, StepState>);
    setTimeline([]);
    setUnlockedSteps(["colour"]);
    setActiveStep("colour");
    setShareInfo(null);
  }, [activeStep, unlockedSteps]);

  const stepIndexDisplay = useMemo(() => {
    const index = unlockedSteps.indexOf(activeStep);
    return index >= 0 ? `Step ${index + 1}` : "";
  }, [activeStep, unlockedSteps]);

  const nextStepCandidate = useMemo(() => findNextStepId(activeStep, params), [activeStep, findNextStepId, params]);
  const nextButtonLabel = nextStepCandidate ? "Next step" : "Finish tour";

  const renderPaletteControls = (mode: PaletteMode, onChange: (mode: PaletteMode) => void) => (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium text-neutral-300">Palette:</span>
      {PALETTE_CONTROLS.map((palette) => (
        <button
          key={palette.id}
          type="button"
          className={cn(
            "rounded-full border px-3 py-1 transition",
            mode === palette.id
              ? "border-amber-400 bg-amber-500/20 text-amber-100"
              : "border-slate-600 bg-slate-800/70 text-slate-200 hover:border-amber-400/70 hover:text-amber-100"
          )}
          onClick={() => onChange(palette.id)}
        >
          {palette.label}
        </button>
      ))}
    </div>
  );

  const renderColourStep = () => (
    <div className="space-y-4">
      {renderPaletteControls(experimentalColourMode, (mode) => {
        setExperimentalColourMode(mode);
        setParams((prev) => {
          const palette = getPaletteForMode(mode);
          if (!palette.includes(prev.colour)) {
            const fallback = palette[0] ?? prev.colour;
            const next = cloneParams(prev);
            next.colour = fallback;
            markStepState("colour", next);
            return next;
          }
          return prev;
        });
      })}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {paletteColours.map((colour) => (
          <button
            key={colour}
            type="button"
            className={cn(
              "flex items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-left transition hover:border-amber-400/70",
              params.colour === colour && "border-amber-400 bg-amber-500/10 text-amber-100"
            )}
            onClick={() => handleSelectColour(colour)}
          >
            <span
              className="size-6 rounded-full border border-slate-800 shadow-inner"
              style={{ background: getColourSwatch(colour, spriteMapperRef.current) }}
            />
            <span className="text-sm font-medium">{formatName(colour)}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderPatternStep = () => (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {options?.pelts.map((pelt) => {
        const previewKey = `pattern-${pelt}-${params.colour}-${params.spriteNumber}-${params.tint}-${params.whitePatches}`;
        const label = formatName(pelt);
        return (
          <button
            key={pelt}
            type="button"
            aria-label={`Select pattern ${label}`}
            className={cn(
              "block aspect-square w-full max-w-[250px] rounded-2xl border bg-slate-900/60 p-0 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
              params.peltName === pelt
                ? "border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.25)]"
                : "border-slate-800 hover:border-amber-300/70"
            )}
            onClick={() => handleSelectPattern(pelt)}
          >
            <GuidedPreviewSprite
              {...previewSpriteSharedProps}
              cacheKey={previewKey}
              mutate={(draft) => {
                draft.peltName = pelt;
              }}
              label={label}
              selected={params.peltName === pelt}
            />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );

  const renderTortieStep = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-700/60 bg-slate-900/60 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">Enable tortie layering</h3>
          <p className="text-sm text-neutral-300">Unlock up to three layered coats for complex torties.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-300">Tortie mode</span>
          <button
            type="button"
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition",
              params.isTortie
                ? "border-amber-400 bg-amber-500/20 text-amber-100"
                : "border-slate-700 bg-slate-800/70 text-slate-200 hover:border-amber-400/70 hover:text-amber-100"
            )}
            onClick={() => handleTortieToggle(!params.isTortie)}
          >
            {params.isTortie ? "Enabled" : "Disabled"}
          </button>
        </div>
      </div>
      {params.isTortie && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-300">Active layers: {desiredTortieLayers}</span>
            <div className="flex gap-2">
              {[1, 2, 3].filter((count) => count <= MAX_TORTIE_LAYERS).map((count) => (
                <button
                  key={count}
                  type="button"
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition",
                    desiredTortieLayers === count
                      ? "border-amber-400 bg-amber-500/20 text-amber-100"
                      : "border-slate-700 bg-slate-800/70 text-slate-200 hover:border-amber-400/70 hover:text-amber-100"
                  )}
                  onClick={() => {
                    setDesiredTortieLayers(count);
                    const seededLayers = (() => {
                      const existing = tortieLayers.slice(0, count).map((layer, idx) => ({
                        ...(layer ?? computeDefaultTortieLayer(idx, params)),
                      }));
                      while (existing.length < count) {
                        existing.push(computeDefaultTortieLayer(existing.length, params));
                      }
                      return existing;
                    })();
                    applyTortieLayers(seededLayers, true);
                    TORTIE_LAYER_STEPS.forEach((stepId, index) => {
                      if (index === 0 && count > 0) {
                        unlockStep(stepId);
                      } else {
                        lockStep(stepId);
                      }
                    });
                    setActiveStep("tortie-layer-1");
                  }}
                >
                  {count} layer{count > 1 ? "s" : ""}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs font-medium text-neutral-200 transition hover:border-amber-400/70 hover:text-amber-100"
              onClick={() => {
                if (desiredTortieLayers >= MAX_TORTIE_LAYERS) return;
                forceUnlockLayer(desiredTortieLayers);
              }}
              disabled={desiredTortieLayers >= MAX_TORTIE_LAYERS}
            >
              Custom + layer (max {MAX_TORTIE_LAYERS})
            </button>
          </div>
          <p className="text-sm text-neutral-300/80">
            Configure each layer in the sidebar navigation. Palette options are available on each layer.
          </p>
        </div>
      )}
    </div>
  );

  const renderTortieLayerStep = (layerIndex: number) => {
    if (!params.isTortie) {
      return <p className="text-sm text-neutral-300/80">Enable tortie layers first.</p>;
    }
    if (layerIndex >= desiredTortieLayers) {
      return <p className="text-sm text-neutral-300/80">Increase layer count on the previous step to configure this layer.</p>;
    }
    const layer = tortieLayers[layerIndex] ?? {};
    return (
      <div className="space-y-5">
        <section className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold text-neutral-200">Pattern</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {options?.pelts.map((pelt) => {
              const previewKey = `tortie-${layerIndex}-pattern-${pelt}-${tortiePaletteMode}-${layer.colour ?? params.colour}-${layer.mask ?? "MASK"}`;
              const label = formatName(pelt);
              const selected = layer.pattern === pelt;
              return (
                <button
                  key={`${layerIndex}-pattern-${pelt}`}
                  type="button"
                  aria-label={`Tortie layer ${layerIndex + 1} pattern ${label}`}
                  className={cn(
                    "block aspect-square w-full max-w-[250px] rounded-2xl border bg-slate-900/60 p-0 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
                    selected ? "border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.35)]" : "border-slate-800 hover:border-amber-300/70"
                  )}
                  onClick={() => handleTortieLayerUpdate(layerIndex, (draft) => {
                    draft.pattern = pelt;
                  })}
                >
                  <GuidedPreviewSprite
                    {...previewSpriteSharedProps}
                    cacheKey={previewKey}
                    mutate={buildTortiePreviewMutator(layerIndex, { pattern: pelt })}
                    label={label}
                    selected={selected}
                  />
                  <span className="sr-only">{label}</span>
                </button>
              );
            })}
          </div>
        </section>
        <section className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-semibold text-neutral-200">Colour</h3>
            <div className="sm:text-right">
              {renderPaletteControls(tortiePaletteMode, (mode) => {
                setTortiePaletteMode(mode);
                setTortieLayers((prev) => {
                  const palette = getPaletteForMode(mode);
                  const fallback = palette[0] ?? params.colour;
                  const updated = prev.map((entry, index) => {
                    if (!entry) return entry;
                    if (!entry.colour || !palette.includes(entry.colour)) {
                      const mutation: Partial<TortieLayer> = { colour: fallback };
                      if (index === layerIndex) {
                        mutation.colour = fallback;
                      }
                      return { ...entry, ...mutation };
                    }
                    if (index === layerIndex) {
                      return { ...entry };
                    }
                    return entry;
                  });
                  setParams((prevParams) => ensureTortieSync(updated, prevParams));
                  return updated;
                });
              })}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {tortiePalette.map((colour) => {
              const previewKey = `tortie-${layerIndex}-colour-${colour}-${tortiePaletteMode}-${layer.pattern ?? params.peltName}-${layer.mask ?? "MASK"}`;
              const label = formatName(colour);
              const selected = layer.colour === colour;
              return (
                <button
                  key={`${layerIndex}-colour-${colour}`}
                  type="button"
                  aria-label={`Tortie layer ${layerIndex + 1} colour ${label}`}
                  className={cn(
                    "block aspect-square w-full max-w-[250px] rounded-2xl border bg-slate-900/60 p-0 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
                    selected ? "border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.35)]" : "border-slate-800 hover:border-amber-300/70"
                  )}
                  onClick={() => handleTortieLayerUpdate(layerIndex, (draft) => {
                    draft.colour = colour;
                  })}
                >
                  <GuidedPreviewSprite
                    {...previewSpriteSharedProps}
                    cacheKey={previewKey}
                    mutate={buildTortiePreviewMutator(layerIndex, { colour })}
                    label={label}
                    selected={selected}
                    badge={
                      <span
                        className="block size-4 rounded-full border border-slate-900/70 shadow-inner"
                        style={{ background: getColourSwatch(colour, spriteMapperRef.current) }}
                      />
                    }
                  />
                  <span className="sr-only">{label}</span>
                </button>
              );
            })}
          </div>
        </section>
        <section className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold text-neutral-200">Mask</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {options?.tortieMasks.map((mask) => {
              const previewKey = `tortie-${layerIndex}-mask-${mask}-${tortiePaletteMode}-${layer.pattern ?? params.peltName}-${layer.colour ?? params.colour}`;
              const label = formatName(mask);
              const selected = layer.mask === mask;
              return (
                <button
                  key={`${layerIndex}-mask-${mask}`}
                  type="button"
                  aria-label={`Tortie layer ${layerIndex + 1} mask ${label}`}
                  className={cn(
                    "block aspect-square w-full max-w-[250px] rounded-2xl border bg-slate-900/60 p-0 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
                    selected ? "border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.35)]" : "border-slate-800 hover:border-amber-300/70"
                  )}
                  onClick={() => handleTortieLayerUpdate(layerIndex, (draft) => {
                    draft.mask = mask;
                  })}
                >
                  <GuidedPreviewSprite
                    {...previewSpriteSharedProps}
                    cacheKey={previewKey}
                    mutate={buildTortiePreviewMutator(layerIndex, { mask })}
                    label={label}
                    selected={selected}
                  />
                  <span className="sr-only">{label}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    );
  };

  const renderEyesStep = () => (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
        <h3 className="text-sm font-semibold">Primary eye colour</h3>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {options?.eyeColours.map((eye) => (
            <button
              key={`eye-primary-${eye}`}
              type="button"
              className={cn(
                "rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 py-2 text-left text-sm transition hover:border-amber-400/70",
                params.eyeColour === eye && "border-amber-400 bg-amber-500/10 text-amber-100"
              )}
              onClick={() => updateParams((draft) => {
                draft.eyeColour = eye;
              }, "eyes")}
            >
              {formatName(eye)}
            </button>
          ))}
        </div>
      </section>
      <section className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
        <h3 className="text-sm font-semibold">Secondary eye colour (optional)</h3>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          <button
            type="button"
            className={cn(
              "rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 py-2 text-left text-sm transition hover:border-amber-400/70",
              !params.eyeColour2 && "border-amber-400 bg-amber-500/10 text-amber-100"
            )}
            onClick={() => updateParams((draft) => {
              draft.eyeColour2 = undefined;
            }, "eyes")}
          >
            None
          </button>
          {options?.eyeColours.map((eye) => (
            <button
              key={`eye-secondary-${eye}`}
              type="button"
              className={cn(
                "rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 py-2 text-left text-sm transition hover:border-amber-400/70",
                params.eyeColour2 === eye && "border-amber-400 bg-amber-500/10 text-amber-100"
              )}
              onClick={() => updateParams((draft) => {
                draft.eyeColour2 = eye;
              }, "eyes")}
            >
              {formatName(eye)}
            </button>
          ))}
        </div>
      </section>
    </div>
  );

  const renderAccentsStep = () => {
    const mapper = spriteMapperRef.current;
    const whiteTintChoices = mapper?.getWhitePatchColourOptions("all", experimentalColourMode) ?? ["none"];
    const baseKey = `${params.spriteNumber}-${params.peltName}-${params.colour}-${params.eyeColour}-${params.skinColour}-${params.tint ?? "none"}`;

    const renderPreviewOption = (
      key: string,
      label: string,
      selected: boolean,
      mutate: (draft: CatParams) => void,
      size = 220,
      badge?: ReactNode
    ) => (
      <button
        key={key}
        type="button"
        className={cn(
          "block aspect-square w-full max-w-[220px] rounded-2xl border bg-slate-900/60 p-0 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
          selected ? "border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.35)]" : "border-slate-800 hover:border-amber-300/70"
        )}
        onClick={() => updateParams((draft) => mutate(draft), "accents")}
      >
        <GuidedPreviewSprite
          {...previewSpriteSharedProps}
          cacheKey={key}
          mutate={mutate}
          label={label}
          selected={selected}
          size={size}
          badge={badge}
        />
        <span className="sr-only">{label}</span>
      </button>
    );

    const whitePatchChoices = [
      { value: null, label: "None" },
      ...((options?.whitePatches ?? []).map((value) => ({ value, label: formatName(value) }))),
    ];

    const pointChoices = [
      { value: null, label: "None" },
      ...((options?.points ?? []).map((value) => ({ value, label: formatName(value) }))),
    ];

    const vitiligoChoices = [
      { value: null, label: "None" },
      ...((options?.vitiligo ?? []).map((value) => ({ value, label: formatName(value) }))),
    ];

    return (
      <div className="space-y-5">
        <section className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold">White patches</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {whitePatchChoices.map(({ value, label }) => {
              const isNone = value === null;
              const selected = isNone ? !params.whitePatches : params.whitePatches === value;
              const previewKey = `accent-white-${value ?? "none"}-${baseKey}`;
              return renderPreviewOption(previewKey, label, selected, (draft) => {
                draft.whitePatches = isNone ? undefined : (value as string);
              });
            })}
          </div>
        </section>

        <section className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold">Points</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pointChoices.map(({ value, label }) => {
              const isNone = value === null;
              const selected = isNone ? !params.points : params.points === value;
              const previewKey = `accent-points-${value ?? "none"}-${baseKey}`;
              return renderPreviewOption(previewKey, label, selected, (draft) => {
                draft.points = isNone ? undefined : (value as string);
              });
            })}
          </div>
        </section>

        <section className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold">Vitiligo</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {vitiligoChoices.map(({ value, label }) => {
              const isNone = value === null;
              const selected = isNone ? !params.vitiligo : params.vitiligo === value;
              const previewKey = `accent-vitiligo-${value ?? "none"}-${baseKey}`;
              return renderPreviewOption(previewKey, label, selected, (draft) => {
                draft.vitiligo = isNone ? undefined : (value as string);
              });
            })}
          </div>
        </section>

        <section className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold">White patch tint</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {whiteTintChoices.map((option) => {
              const selected = (params.whitePatchesTint ?? "none") === option;
              const previewKey = `accent-whitetint-${option}-${baseKey}`;
              const badge = option !== "none"
                ? (
                    <span
                      className="block size-4 rounded-full border border-slate-900/70 shadow-inner"
                      style={{ background: getColourSwatch(option, spriteMapperRef.current) }}
                    />
                  )
                : undefined;
              return renderPreviewOption(previewKey, formatName(option), selected, (draft) => {
                draft.whitePatchesTint = option;
              }, 200, badge);
            })}
          </div>
        </section>
      </div>
    );
  };

  const renderSkinTintStep = () => (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
        <h3 className="text-sm font-semibold">Skin colour</h3>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {options?.skinColours.map((skin) => (
            <button
              key={`skin-${skin}`}
              type="button"
              className={cn(
                "rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 py-2 text-left text-sm transition hover:border-amber-400/70",
                params.skinColour === skin && "border-amber-400 bg-amber-500/10 text-amber-100"
              )}
              onClick={() => updateParams((draft) => {
                draft.skinColour = skin;
              }, "skin-tint")}
            >
              {formatName(skin)}
            </button>
          ))}
        </div>
      </section>
      <section className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
        <h3 className="text-sm font-semibold">Overall tint</h3>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          <button
            type="button"
            className={cn(
              "rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 py-2 text-left text-sm transition hover:border-amber-400/70",
              (params.tint ?? "none") === "none" && "border-amber-400 bg-amber-500/10 text-amber-100"
            )}
            onClick={() => updateParams((draft) => {
              draft.tint = "none";
            }, "skin-tint")}
          >
            None
          </button>
          {options?.tints.map((tint) => (
            <button
              key={`tint-${tint}`}
              type="button"
              className={cn(
                "rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 py-2 text-left text-sm transition hover:border-amber-400/70",
                params.tint === tint && "border-amber-400 bg-amber-500/10 text-amber-100"
              )}
              onClick={() => updateParams((draft) => {
                draft.tint = tint;
              }, "skin-tint")}
            >
              {formatName(tint)}
            </button>
          ))}
        </div>
      </section>
    </div>
  );

  const renderAccessoriesStep = () => {
    const mapper = spriteMapperRef.current;
    const grouped = [
      { label: "Plant accessories", options: options?.plantAccessories ?? [] },
      { label: "Wild accessories", options: options?.wildAccessories ?? [] },
      { label: "Collars", options: options?.collarAccessories ?? [] },
    ];
    const allAccessories = new Set<string>(mapper?.getAccessories?.() ?? []);
    grouped.forEach((group) => {
      group.options.forEach((option) => allAccessories.delete(option));
    });
    const legacyOptions = Array.from(allAccessories);
    if (legacyOptions.length) {
      grouped.push({ label: "Legacy accessories", options: legacyOptions });
    }
    const chosen = new Set(params.accessories ?? []);
    return (
      <div className="space-y-6">
        {grouped.map((group) => (
          <section key={group.label} className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{group.label}</h3>
              <button
                type="button"
                className="text-xs text-neutral-300 underline underline-offset-4 hover:text-amber-200"
                onClick={() => {
                  group.options.forEach((option) => {
                    handleAccessoryToggle(option, false);
                  });
                }}
              >
                Clear group
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from(new Set(group.options)).map((option, optionIndex) => {
                const selected = chosen.has(option);
                const currentAccessories = params.accessories ?? [];
                const accessoryKey = [...currentAccessories, option].sort().join("_");
                const previewKey = `accessory-${group.label}-${option}-${accessoryKey}-${params.spriteNumber}`;
                const label = formatName(option);
                return (
                  <button
                    key={`${group.label}:${option}-${optionIndex}`}
                    type="button"
                    className={cn(
                      "block aspect-square w-full max-w-[220px] rounded-2xl border bg-slate-900/60 p-0 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
                      selected ? "border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.35)]" : "border-slate-800 hover:border-amber-300/70"
                    )}
                    onClick={() => handleAccessoryToggle(option, !selected)}
                  >
                    <GuidedPreviewSprite
                      {...previewSpriteSharedProps}
                      cacheKey={previewKey}
                      mutate={(draft) => {
                        const set = new Set((draft.accessories ?? []).filter((x): x is string => x !== null));
                        set.add(option);
                        draft.accessories = Array.from(set);
                        draft.accessory = draft.accessories[0] ?? undefined;
                      }}
                      label={label}
                      selected={selected}
                      size={220}
                      badge={
                        selected ? (
                          <span className="inline-flex items-center justify-center rounded-full bg-amber-500/80 px-2 py-0.5 text-[10px] font-semibold uppercase text-black">
                            Selected
                          </span>
                        ) : undefined
                      }
                    />
                    <span className="sr-only">{label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    );
  };

  const renderScarsStep = () => {
    const grouped = [
      { label: "Battle scars", options: options?.scarBattle ?? [] },
      { label: "Missing parts", options: options?.scarMissing ?? [] },
      { label: "Environmental scars", options: options?.scarEnvironmental ?? [] },
    ];
    const chosen = new Set(params.scars ?? []);
    return (
      <div className="space-y-6">
        {grouped.map((group) => (
          <section key={group.label} className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{group.label}</h3>
              <button
                type="button"
                className="text-xs text-neutral-300 underline underline-offset-4 hover:text-amber-200"
                onClick={() => {
                  group.options.forEach((option) => {
                    handleScarToggle(option, false);
                  });
                }}
              >
                Clear group
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {group.options.map((option) => {
              const selected = chosen.has(option);
              return (
                <button
                  key={`${group.label}:${option}`}
                    type="button"
                    className={cn(
                      "rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 py-2 text-left text-sm transition hover:border-amber-400/70",
                      selected && "border-amber-400 bg-amber-500/10 text-amber-100"
                    )}
                    onClick={() => handleScarToggle(option, !selected)}
                  >
                    {selected ? "✓ " : ""}
                    {formatName(option)}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    );
  };

  const renderPoseStep = () => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {options?.sprites.map((sprite) => (
        <button
          key={sprite}
          type="button"
          className={cn(
            "rounded-xl border border-slate-700/60 bg-slate-900/60 p-4 text-left transition hover:border-amber-400/60",
            params.spriteNumber === sprite && "border-amber-400 bg-amber-500/10 text-amber-100"
          )}
          onClick={() => handlePoseSelect(sprite)}
        >
          <div className="text-sm font-semibold">Pose {sprite}</div>
          <p className="mt-1 text-xs text-neutral-300/80">Changes age/body posture.</p>
        </button>
      ))}
    </div>
  );

  const renderStepContent = () => {
    switch (activeStepDefinition.type) {
      case "colour":
        return renderColourStep();
      case "pattern":
        return renderPatternStep();
      case "tortie-toggle":
        return renderTortieStep();
      case "tortie-layer":
        return renderTortieLayerStep(activeStepDefinition.layerIndex ?? 0);
      case "eyes":
        return renderEyesStep();
      case "accents":
        return renderAccentsStep();
      case "skin-tint":
        return renderSkinTintStep();
      case "accessories":
        return renderAccessoriesStep();
      case "scars":
        return renderScarsStep();
      case "pose":
        return renderPoseStep();
      default:
        return <div className="text-sm text-neutral-300/80">Step not implemented yet.</div>;
    }
  };

  const goToPreviousStep = useCallback(() => {
    const index = unlockedSteps.indexOf(activeStep);
    if (index > 0) {
      setActiveStep(unlockedSteps[index - 1]);
    }
  }, [activeStep, unlockedSteps]);

  const goToNextStep = useCallback(() => {
    setShareInfo(null);
    const snapshot = cloneParams(params);
    const evaluation = evaluateStep(activeStep, snapshot, tortieLayers);
    if (!evaluation.complete) {
      window.alert("Complete this step before continuing.");
      return;
    }

    markStepState(activeStep, snapshot, tortieLayers);
    const stepIndex = unlockedSteps.indexOf(activeStep);
    track("guided_builder_step_completed", {
      step_name: activeStep,
      step_number: stepIndex >= 0 ? stepIndex + 1 : 0,
    });

    const nextStepId = unlockNextRelevantStep(activeStep, snapshot);
    if (nextStepId) {
      setActiveStep(nextStepId);
      return;
    }

    track("guided_builder_completed", {
      has_name: false,
      has_creator: false,
    });
    void handleShare({ copy: false }).then((url) => {
      if (!url) return;
      router.push(url);
    });
  }, [activeStep, evaluateStep, handleShare, markStepState, params, router, tortieLayers, unlockNextRelevantStep, unlockedSteps]);

  if (loadingOptions) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-neutral-300">
        <Loader2 className="mr-2 size-5 animate-spin" />
        Loading sprite data…
      </div>
    );
  }

  if (optionError) {
    return (
      <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-6 text-red-200">
        Failed to load sprite metadata: {optionError}
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-[15rem,1fr] lg:grid-cols-[18rem,1fr] xl:grid-cols-[20rem,1fr]">
      <aside className="flex flex-col gap-5 rounded-3xl border border-slate-800 bg-slate-950/70 p-5 md:p-6">
        <header>
          <h1 className="text-xl font-semibold text-white">Guided Cat Builder</h1>
          <p className="mt-2 text-sm text-neutral-300">
            Step-by-step tour with timeline tracking. Preview updates instantly.
          </p>
        </header>
        <nav className="flex-1 space-y-1">
          {STEP_DEFINITIONS.map((step) => {
            const unlocked = unlockedSteps.includes(step.id);
            const state = stepStates[step.id];
            return (
              <button
                key={step.id}
                type="button"
                className={cn(
                  "w-full rounded-xl border border-transparent px-3 py-2.5 text-left text-sm transition",
                  unlocked
                    ? activeStep === step.id
                      ? "border-amber-400 bg-amber-500/20 text-amber-100"
                      : "border-slate-800 bg-slate-900/60 text-neutral-200 hover:border-amber-400/60 hover:text-amber-100"
                    : "cursor-not-allowed border-slate-900 bg-slate-900/40 text-neutral-500"
                )}
                onClick={() => unlocked && setActiveStep(step.id)}
                disabled={!unlocked}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{step.navLabel}</span>
                  {state?.completed && <span className="text-xs text-amber-200">✓</span>}
                </div>
                {state?.summary && (
                  <p className="mt-1 truncate text-xs text-neutral-300/80">{state.summary}</p>
                )}
              </button>
            );
          })}
        </nav>
        <footer className="space-y-3">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/60 bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-500/25"
            onClick={() => {
              void handleShare({ copy: true });
            }}
          >
            <SendHorizontalIcon size={16} />
            Share timeline
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-amber-400/60 hover:text-amber-100"
            onClick={handleReset}
          >
            <RefreshIcon size={16} />
            Start over
          </button>
        </footer>
      </aside>

      <main className="space-y-6">
        <section className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-950/70 p-6 lg:flex-row">
          <div className="flex-1 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="relative flex h-full items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
              {previewLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70">
                  <Loader2 className="size-6 animate-spin text-amber-200" />
                </div>
              )}
              {previewUrl ? (
                <Image
                  src={previewUrl}
                  alt="Cat preview"
                  width={DISPLAY_CANVAS_SIZE}
                  height={DISPLAY_CANVAS_SIZE}
                  className="w-full max-w-[22rem] scale-[1.1] object-contain"
                  priority
                  unoptimized
                  style={{ imageRendering: "pixelated" }}
                />
              ) : (
                <div className="text-sm text-neutral-400">Renderer unavailable.</div>
              )}
            </div>
          </div>
          <div className="flex w-full flex-col gap-3 lg:w-64">
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center justify-center gap-2 rounded-xl border border-amber-400/60 bg-amber-500/20 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/25"
            >
              <ArrowBigDownDashIcon size={16} />
              Download sprite
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
          <header className="flex flex-col gap-2 border-b border-slate-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="text-xs uppercase tracking-wide text-neutral-400">{stepIndexDisplay}</span>
              <h2 className="mt-1 text-2xl font-semibold text-white">{activeStepDefinition.title}</h2>
              <p className="mt-1 max-w-xl text-sm text-neutral-300">{activeStepDefinition.description}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-amber-400/60 hover:text-amber-100"
                onClick={goToPreviousStep}
                disabled={unlockedSteps.indexOf(activeStep) <= 0}
              >
                Back
              </button>
              <button
                type="button"
                className="rounded-xl border border-amber-400/60 bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/25"
                onClick={goToNextStep}
              >
                {nextButtonLabel}
              </button>
            </div>
          </header>
          <div className="mt-6 space-y-4">{renderStepContent()}</div>
        </section>
      </main>
    </div>
  );
}
