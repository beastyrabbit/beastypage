"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Image from "next/image";
import { ChevronDown, Copy, Download, Loader2, Minus, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import { useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useCatGenerator, useSpriteMapperOptions } from "@/components/cat-builder/hooks";
import type { BuilderOptions, CatGeneratorApi, SpriteMapperApi } from "@/components/cat-builder/types";
import { canvasToDataUrl, cloneParams, formatName, getColourSwatch } from "@/components/cat-builder/utils";

type PaletteMode = "off" | "mood" | "bold" | "darker" | "blackout";

interface TortieLayer {
  pattern?: string;
  colour?: string;
  mask?: string;
}

interface CatParams {
  spriteNumber: number;
  peltName: string;
  colour: string;
  isTortie: boolean;
  tortiePattern?: string;
  tortieColour?: string;
  tortieMask?: string;
  tortie?: TortieLayer[];
  eyeColour: string;
  eyeColour2?: string;
  skinColour: string;
  whitePatches?: string;
  whitePatchesTint?: string;
  points?: string;
  vitiligo?: string;
  tint?: string;
  shading: boolean;
  reverse: boolean;
  accessories?: string[];
  accessory?: string;
  scars?: string[];
  scar?: string;
}

export const DEFAULT_PARAMS: CatParams = {
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
  { id: "mood", label: "Mood" },
  { id: "bold", label: "Bold" },
  { id: "darker", label: "Darker" },
  { id: "blackout", label: "Blackout" },
];

const MAX_TORTIE_LAYERS = 6;
const DISPLAY_CANVAS_SIZE = 540;
const LEGACY_SPRITE_RANGE = Array.from({ length: 21 }, (_, index) => index);

type SectionId =
  | "pose"
  | "colour"
  | "pattern"
  | "tortie"
  | "eyes"
  | "markings"
  | "skin"
  | "accessories"
  | "scars";

interface SectionDefinition {
  id: SectionId;
  title: string;
  description: string;
  render: () => ReactNode;
}

export interface VisualBuilderInitialPayload {
  params: CatParams;
  tortie?: TortieLayer[];
  accessories?: string[];
  scars?: string[];
  paletteMode?: PaletteMode;
  tortiePaletteMode?: PaletteMode;
  slug?: string | null;
  shareUrl?: string | null;
  catName?: string | null;
  creatorName?: string | null;
}

type VisualBuilderClientProps = {
  initialCat?: VisualBuilderInitialPayload | null;
};

export function VisualBuilderClient({ initialCat }: VisualBuilderClientProps = {}) {
  const [params, setParams] = useState<CatParams>(DEFAULT_PARAMS);
  const [tortieLayers, setTortieLayers] = useState<TortieLayer[]>([]);
  const [experimentalColourMode, setExperimentalColourMode] = useState<PaletteMode>("off");
  const [tortiePaletteMode, setTortiePaletteMode] = useState<PaletteMode>("off");
  const [initialSpriteNumber, setInitialSpriteNumber] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [shareInfo, setShareInfo] = useState<{ slug: string; url: string } | null>(null);
  const [shareStale, setShareStale] = useState(false);
  const [lockedShareSlug, setLockedShareSlug] = useState<string | null>(null);
  const [catName, setCatName] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [randomizing, setRandomizing] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [expandedLayer, setExpandedLayer] = useState<number | null>(null);
  const [expandedMarking, setExpandedMarking] = useState<"white" | "points" | "vitiligo" | "tint" | null>(null);
  const [expandedAccessoryGroup, setExpandedAccessoryGroup] = useState<string | null>(null);
  const [expandedScarGroup, setExpandedScarGroup] = useState<string | null>(null);
  const [expandedSkinGroup, setExpandedSkinGroup] = useState<"skin" | "tint" | null>(null);
  const [expandedTortieSub, setExpandedTortieSub] = useState<Record<number, "pattern" | "colour" | "mask" | null>>({});
  const initialisedRef = useRef(false);
  const [, startMetaTransition] = useTransition();

  const { mapper, options, loading: loadingOptions, error: optionsError } = useSpriteMapperOptions();
  const { generator, ready: rendererReady, error: rendererError } = useCatGenerator();

  const unlockShare = useCallback(() => {
    if (!lockedShareSlug) return false;
    setLockedShareSlug(null);
    setShareInfo(null);
    setCatName("");
    setCreatorName("");
    if (typeof window !== "undefined") {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete("slug");
      const nextRelative = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
      window.history.replaceState(null, "", nextRelative);
    }
    return true;
  }, [lockedShareSlug]);

  const markShareDirty = useCallback((shouldUnlock = true) => {
    if (shouldUnlock) {
      unlockShare();
      setStatusMessage(null);
    }
    setShareStale(true);
  }, [unlockShare]);

  const isShareLocked = lockedShareSlug !== null;

  const deferredParams = useDeferredValue(params);
  const normalizedOptions = useMemo(() => {
    if (!options) return null;
    const sprites = new Set<number>([...options.sprites, ...LEGACY_SPRITE_RANGE]);
    if (initialSpriteNumber !== null) {
      sprites.add(initialSpriteNumber);
    }
    return {
      ...options,
      sprites: Array.from(sprites).sort((a, b) => a - b),
    } satisfies BuilderOptions;
  }, [options, initialSpriteNumber]);
  const deferredOptions = useDeferredValue(normalizedOptions);
  const viewParams = deferredParams ?? params;
  const viewOptions = deferredOptions ?? normalizedOptions;


  const spriteMapperRef = useRef<SpriteMapperApi | null>(null);
  const ensureTortieSync = useCallback((layers: TortieLayer[], snapshot: CatParams) => {
    const validLayers = layers.filter(
      (layer) => layer && layer.pattern && layer.colour && layer.mask
    ) as Required<TortieLayer>[];
    const next = cloneParams(snapshot);
    if (validLayers.length > 0) {
      next.isTortie = true;
      next.tortie = validLayers.map((layer) => ({ ...layer }));
      const [primary] = validLayers;
      next.tortiePattern = primary.pattern;
      next.tortieColour = primary.colour;
      next.tortieMask = primary.mask;
    } else {
      next.isTortie = false;
      next.tortie = [];
      next.tortiePattern = undefined;
      next.tortieColour = undefined;
      next.tortieMask = undefined;
    }
    return next;
  }, []);

  const generatorRef = useRef<CatGeneratorApi | null>(null);
  const previewCacheRef = useRef<Map<string, string>>(new Map());
  const previewPendingRef = useRef<Map<string, Promise<string | null>>>(new Map());
  const previewRequestRef = useRef(0);
  const initialSpriteNumberRef = useRef<number | null>(null);

  const createMapperRecord = useMutation(api.mapper.create);

  useEffect(() => {
    spriteMapperRef.current = mapper ?? null;
  }, [mapper]);

  useEffect(() => {
    generatorRef.current = generator ?? null;
  }, [generator]);

  useEffect(() => {
    if (!initialCat || initialisedRef.current) return;
    initialisedRef.current = true;
    const mergedParams = cloneParams({ ...DEFAULT_PARAMS, ...initialCat.params });
    const incomingTortie = (initialCat.tortie ?? mergedParams.tortie ?? []).filter(Boolean) as TortieLayer[];
    const synced = ensureTortieSync(incomingTortie, mergedParams);
    setParams(synced);
    setTortieLayers(synced.tortie ?? []);
    initialSpriteNumberRef.current = synced.spriteNumber ?? null;
    setExpandedTortieSub(() => {
      const mapping: Record<number, "pattern" | "colour" | "mask" | null> = {};
      (synced.tortie ?? []).forEach((_, idx) => {
        mapping[idx] = "colour";
      });
      return mapping;
    });
    setExperimentalColourMode(initialCat.paletteMode ?? "off");
    setTortiePaletteMode(initialCat.tortiePaletteMode ?? "off");
    setInitialSpriteNumber(synced.spriteNumber ?? null);
    setCatName(initialCat.catName ?? "");
    setCreatorName(initialCat.creatorName ?? "");
    console.log("[visual-builder] load slug", {
      slug: initialCat.slug,
      shareUrl: initialCat.shareUrl,
      paletteMode: initialCat.paletteMode,
      tortiePaletteMode: initialCat.tortiePaletteMode,
      colour: synced.colour,
      tortieColour: synced.tortieColour,
    });
    setLockedShareSlug(initialCat.slug ?? null);
    setShareInfo((prev) => {
      if (initialCat.shareUrl) {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const absolute = initialCat.shareUrl.startsWith("http")
          ? initialCat.shareUrl
          : origin
            ? `${origin.replace(/\/$/, "")}${initialCat.shareUrl}`
            : initialCat.shareUrl;
        return { slug: initialCat.slug ?? initialCat.shareUrl, url: absolute };
      }
      if (initialCat.slug) {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const url = origin
          ? `${origin}/visual-builder?slug=${encodeURIComponent(initialCat.slug)}`
          : `/visual-builder?slug=${initialCat.slug}`;
        return { slug: initialCat.slug, url };
      }
      return prev;
    });
    setExpandedLayer(null);
    setExpandedAccessoryGroup(null);
    setExpandedScarGroup(null);
    setExpandedSkinGroup(null);
    setShareStale(false);
  }, [ensureTortieSync, initialCat]);

  useEffect(() => {
    if (!normalizedOptions) return;
    setParams((prev) => {
      let needsUpdate = false;
      const initialSpriteNumber = initialSpriteNumberRef.current;
      const spriteAllowed = normalizedOptions.sprites.includes(prev.spriteNumber);

      if (!normalizedOptions.pelts.includes(prev.peltName)) needsUpdate = true;
      if (!normalizedOptions.eyeColours.includes(prev.eyeColour)) needsUpdate = true;
      if (!normalizedOptions.skinColours.includes(prev.skinColour)) needsUpdate = true;
      if (!spriteAllowed && !(initialSpriteNumber !== null && prev.spriteNumber === initialSpriteNumber)) {
        needsUpdate = true;
      }

      if (!needsUpdate) return prev;

      const next = cloneParams(prev);
      if (!normalizedOptions.pelts.includes(next.peltName)) {
        next.peltName = normalizedOptions.pelts[0] ?? next.peltName;
      }
      if (!normalizedOptions.eyeColours.includes(next.eyeColour)) {
        next.eyeColour = normalizedOptions.eyeColours[0] ?? next.eyeColour;
      }
      if (!normalizedOptions.skinColours.includes(next.skinColour)) {
        next.skinColour = normalizedOptions.skinColours[0] ?? next.skinColour;
      }
      if (!normalizedOptions.sprites.includes(next.spriteNumber)) {
        const preferred = initialSpriteNumber !== null ? initialSpriteNumber : undefined;
        if (preferred !== undefined && normalizedOptions.sprites.includes(preferred)) {
          next.spriteNumber = preferred;
        } else {
          next.spriteNumber = normalizedOptions.sprites[0] ?? next.spriteNumber;
        }
      }
      return next;
    });

    if (shareInfo) {
      markShareDirty(false);
    }
  }, [markShareDirty, normalizedOptions, shareInfo]);

  useEffect(() => {
    const generatorInstance = generatorRef.current;
    if (!rendererReady || !generatorInstance) return;
    const requestId = ++previewRequestRef.current;
    setPreviewLoading(true);
    (async () => {
      try {
        const payload = cloneParams(params);
        const result = await generatorInstance.generateCat({
          ...payload,
          spriteNumber: payload.spriteNumber,
        });
        let url = result.imageDataUrl ?? null;
        if (!url && result.canvas) {
          url = canvasToDataUrl(result.canvas as HTMLCanvasElement);
        }
        if (!url) throw new Error("Renderer returned empty preview");
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
  }, [params, rendererReady]);

  const updateParams = useCallback((mutator: (draft: CatParams) => void) => {
    markShareDirty();
    setParams((prev) => {
      const draft = cloneParams(prev);
      mutator(draft);
      return draft;
    });
  }, [markShareDirty]);

  const getPaletteForMode = useCallback((mode: PaletteMode) => {
    const mapperInstance = spriteMapperRef.current;
    if (!mapperInstance) return [];
    return mapperInstance.getColourOptions?.(mode) ?? mapperInstance.getColours();
  }, []);

  const paletteColours = useMemo(() => {
    const mapperInstance = mapper ?? spriteMapperRef.current;
    if (!mapperInstance) {
      return [params.colour ?? DEFAULT_PARAMS.colour];
    }
    const palette = getPaletteForMode(experimentalColourMode);
    if (palette.length > 0) {
      console.log("[visual-builder] palette colours", {
        mode: experimentalColourMode,
        colours: palette,
        currentColour: params.colour,
      });
      return palette;
    }
    const base = mapperInstance.getColours?.() ?? [];
    console.log("[visual-builder] fallback palette", {
      mode: experimentalColourMode,
      colours: base,
      currentColour: params.colour,
    });
    return base.length > 0 ? base : [params.colour ?? DEFAULT_PARAMS.colour];
  }, [experimentalColourMode, getPaletteForMode, mapper, params.colour]);

  const tortiePalette = useMemo(() => {
    const palette = getPaletteForMode(tortiePaletteMode);
    if (palette.length > 0) {
      return palette;
    }
    const mapperInstance = mapper ?? spriteMapperRef.current;
    const fallback = mapperInstance?.getColours?.() ?? paletteColours;
    return fallback.length > 0 ? fallback : paletteColours;
  }, [getPaletteForMode, mapper, paletteColours, tortiePaletteMode]);

  const computeDefaultTortieLayer = useCallback(
    (index: number, base: CatParams): TortieLayer => {
      const pelts = options?.pelts ?? [];
      const masks = options?.tortieMasks ?? [];
      const colours = tortiePalette.length > 0 ? tortiePalette : paletteColours;
      const defaultPattern = pelts.includes("SingleColour") ? "SingleColour" : pelts[0] ?? base.peltName ?? "SingleColour";
      const defaultColour = colours.includes("GINGER") ? "GINGER" : colours[0] ?? base.colour ?? "GINGER";
      const maskPreferences = ["ONE", "TWO", "THREE", "FOUR"];
      const preferred = maskPreferences[index];
      const defaultMask = preferred && masks.includes(preferred) ? preferred : masks[0] ?? "ONE";
      return {
        pattern: defaultPattern,
        colour: defaultColour,
        mask: defaultMask,
      };
    },
    [options?.pelts, options?.tortieMasks, paletteColours, tortiePalette]
  );

  const applyTortieLayers = useCallback(
    (layers: TortieLayer[], enabled: boolean) => {
      markShareDirty();
      setTortieLayers(layers);
      setExpandedTortieSub((previous) => {
        if (!enabled || layers.length === 0) return {};
        const mapping: Record<number, "pattern" | "colour" | "mask" | null> = {};
        layers.forEach((_, idx) => {
          if (Object.prototype.hasOwnProperty.call(previous, idx)) {
            mapping[idx] = previous[idx] ?? null;
          } else {
            mapping[idx] = "colour";
          }
        });
        return mapping;
      });
      setParams((prevParams) => {
        const draft = cloneParams(prevParams);
        draft.isTortie = enabled && layers.length > 0;
        return ensureTortieSync(layers, draft);
      });
    },
    [ensureTortieSync, markShareDirty]
  );

  const requestPreview = useCallback(
    async (key: string, mutator: (draft: CatParams) => void): Promise<string | null> => {
      const cached = previewCacheRef.current.get(key);
      if (cached) return cached;
      const generatorInstance = generatorRef.current;
      if (!rendererReady || !generatorInstance) return null;
      const pending = previewPendingRef.current.get(key);
      if (pending) return pending;
      const promise = (async () => {
        try {
          const draft = cloneParams(params);
          mutator(draft);
          const result = await generatorInstance.generateCat(draft as unknown as Record<string, unknown>);
          let preview = result.imageDataUrl ?? null;
          if (!preview && result.canvas) {
            preview = canvasToDataUrl(result.canvas as HTMLCanvasElement);
          }
          if (preview) {
            previewCacheRef.current.set(key, preview);
          }
          return preview ?? null;
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

  const PreviewSprite = useMemo(() => {
    function PreviewSpriteComponent({
      cacheKey,
      mutate,
      size = 280,
      label,
      badge,
      selected,
    }: {
      cacheKey: string;
      mutate: (draft: CatParams) => void;
      size?: number;
      label?: string;
      badge?: ReactNode;
      selected?: boolean;
    }) {
      const [src, setSrc] = useState<string | null>(() => previewCacheRef.current.get(cacheKey) ?? null);
      const [loading, setLoading] = useState<boolean>(!previewCacheRef.current.has(cacheKey));
      const mutateRef = useRef(mutate);
      useEffect(() => {
        mutateRef.current = mutate;
      }, [mutate]);
      useEffect(() => {
        let cancelled = false;
        if (!rendererReady) return;
        setLoading(!previewCacheRef.current.has(cacheKey));
        (async () => {
          const preview = await requestPreview(cacheKey, (draft) => mutateRef.current(draft));
          if (cancelled) return;
          if (preview) {
            setSrc(preview);
          }
          setLoading(false);
        })();
        return () => {
          cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [cacheKey, requestPreview, rendererReady]);
      return (
        <div
          className={cn(
            "relative flex aspect-square w-full max-w-[250px] items-center justify-center overflow-hidden rounded-2xl border bg-slate-900/60",
            selected ? "border-amber-400 shadow-[0_0_14px_rgba(245,158,11,0.35)]" : "border-slate-800"
          )}
        >
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="size-5 animate-spin text-amber-200" />
            </div>
          )}
          {src && (
            <Image
              src={src}
              alt={label ?? "Preview"}
              width={size}
              height={size}
              unoptimized
              className={cn("h-full w-full object-contain", selected ? "opacity-100" : "opacity-90")}
              style={{ imageRendering: "pixelated", width: "100%", height: "100%", objectFit: "contain" }}
            />
          )}
          {badge && (
            <div className="absolute right-2 top-2 rounded-full border border-black/50 bg-white/90 px-2 py-[2px] text-[10px] font-semibold text-slate-900 shadow">
              {badge}
            </div>
          )}
        </div>
      );
    }

    return PreviewSpriteComponent;
  }, [rendererReady, requestPreview]);

  const buildTortiePreviewMutator = useCallback(
    (layerIndex: number, overrides: Partial<TortieLayer>) => {
      return (draft: CatParams) => {
        draft.isTortie = true;
        const palette = getPaletteForMode(tortiePaletteMode);
        const fallbackColour = overrides.colour ?? palette[0] ?? draft.colour;
        const fallbackPattern = overrides.pattern ?? draft.peltName;
        const fallbackMask = overrides.mask ?? "ONE";
        const layers: TortieLayer[] = Array.isArray(draft.tortie)
          ? draft.tortie.map((layer) =>
              layer ? { ...layer } : { pattern: fallbackPattern, colour: fallbackColour, mask: fallbackMask }
            )
          : [];
        while (layers.length <= layerIndex) {
          layers.push({ pattern: fallbackPattern, colour: fallbackColour, mask: fallbackMask });
        }
        const existing = layers[layerIndex] ?? { pattern: fallbackPattern, colour: fallbackColour, mask: fallbackMask };
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

  const renderPaletteControls = useCallback((mode: PaletteMode, onChange: (value: PaletteMode) => void) => (
    <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
      <span className="font-semibold text-neutral-300">Palette:</span>
      {PALETTE_CONTROLS.map((palette) => (
        <button
          key={palette.id}
          type="button"
          className={cn(
            "rounded-full border border-slate-700/60 px-3 py-1 transition",
            mode === palette.id ? "border-amber-400 bg-amber-500/20 text-amber-100" : "hover:border-amber-300/70"
          )}
          onClick={() => onChange(palette.id)}
        >
          {palette.label}
        </button>
      ))}
    </div>
  ), []);

  const handleBasePaletteChange = useCallback((value: PaletteMode) => {
    setExperimentalColourMode(value);
    markShareDirty();
  }, [markShareDirty]);

  const handleTortiePaletteChange = useCallback((value: PaletteMode) => {
    setTortiePaletteMode(value);
    markShareDirty();
  }, [markShareDirty]);

  const renderColourSection = () => (
    <section id="colour" className="scroll-mt-40 space-y-4 rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-white">Base colour</h2>
        <p className="text-sm text-neutral-300">Pick the primary coat colour, including experimental palettes.</p>
      {renderPaletteControls(experimentalColourMode, handleBasePaletteChange)}
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {paletteColours.map((colour) => {
          const previewKey = `colour-${colour}-${experimentalColourMode}-${params.spriteNumber}-${params.peltName}`;
          const selected = params.colour === colour;
          const badgeColour = getColourSwatch(colour, spriteMapperRef.current);
          return (
            <button
              key={colour}
              type="button"
              className="text-left"
              onClick={() => updateParams((draft) => {
                draft.colour = colour;
              })}
            >
              <PreviewSprite
                cacheKey={previewKey}
                label={formatName(colour)}
                mutate={(draft) => {
                  draft.colour = colour;
                }}
                selected={selected}
                badge={
                  <span
                    className="block size-4 rounded-full border border-slate-900/70 shadow-inner"
                    style={{ background: badgeColour }}
                  />
                }
              />
              <p className={cn("mt-2 text-sm", selected ? "font-semibold text-amber-100" : "text-neutral-300")}>
                {formatName(colour)}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );

  const renderPatternSection = () => (
    <section id="pattern" className="scroll-mt-40 space-y-4 rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-white">Pattern / pelt</h2>
        <p className="text-sm text-neutral-300">Change the base coat style that other markings layer on top of.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {(options?.pelts ?? []).map((pelt) => {
          const previewKey = `pelt-${pelt}-${params.colour}-${params.spriteNumber}`;
          const selected = params.peltName === pelt;
          return (
            <button
              key={pelt}
              type="button"
              className="text-left"
              onClick={() => updateParams((draft) => {
                draft.peltName = pelt;
              })}
            >
              <PreviewSprite
                cacheKey={previewKey}
                label={formatName(pelt)}
                mutate={(draft) => {
                  draft.peltName = pelt;
                }}
                selected={selected}
              />
              <p className={cn("mt-2 text-sm", selected ? "font-semibold text-amber-100" : "text-neutral-300")}>
                {formatName(pelt)}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );

  const handleTortieToggle = useCallback(
    (enabled: boolean) => {
      if (!enabled) {
        applyTortieLayers([], false);
        setExpandedLayer(null);
        markShareDirty();
        return;
      }
      const firstLayer = tortieLayers[0] ?? computeDefaultTortieLayer(0, params);
      applyTortieLayers([firstLayer], true);
      setExpandedLayer(0);
      markShareDirty();
    },
    [applyTortieLayers, computeDefaultTortieLayer, markShareDirty, params, tortieLayers]
  );

  const handleAddLayer = useCallback(() => {
    if (tortieLayers.length >= MAX_TORTIE_LAYERS) return;
    const next = [...tortieLayers, computeDefaultTortieLayer(tortieLayers.length, params)];
    applyTortieLayers(next, true);
    setExpandedLayer(next.length - 1);
    markShareDirty();
  }, [applyTortieLayers, computeDefaultTortieLayer, markShareDirty, params, tortieLayers]);

  const handleRemoveLayer = useCallback(
    (index: number) => {
      if (index < 0 || index >= tortieLayers.length) return;
      const next = tortieLayers.filter((_, idx) => idx !== index);
      applyTortieLayers(next, next.length > 0);
      setExpandedLayer((prev) => {
        if (prev === null) return null;
        if (next.length === 0) return null;
        if (prev === index) {
          return Math.min(index, next.length - 1);
        }
        if (prev > index) return prev - 1;
        return prev;
      });
      markShareDirty();
    },
    [applyTortieLayers, markShareDirty, tortieLayers]
  );

  const handleUpdateLayer = useCallback(
    (index: number, mutator: (draft: TortieLayer) => void) => {
      const next = [...tortieLayers];
      while (next.length <= index) {
        next.push(computeDefaultTortieLayer(next.length, params));
      }
      const draftLayer = { ...(next[index] ?? computeDefaultTortieLayer(index, params)) };
      mutator(draftLayer);
      next[index] = draftLayer;
      applyTortieLayers(next, next.length > 0);
    },
    [applyTortieLayers, computeDefaultTortieLayer, params, tortieLayers]
  );

  const tortieSection = useMemo(() => {
    const currentParams = viewParams;
    const currentOptions = viewOptions;
    const currentLayers = tortieLayers;
    const hasLayers = currentParams.isTortie && currentLayers.length > 0;

    return (
      <section id="tortie" className="scroll-mt-40 space-y-4 rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Tortie layers</h2>
            <p className="text-sm text-neutral-300">
              Enable layered tortie colours and customize each mask individually.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleTortieToggle(!currentParams.isTortie)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition",
                currentParams.isTortie
                  ? "border border-amber-400 bg-amber-500/20 text-amber-100"
                  : "border border-slate-700 bg-slate-900/60 text-neutral-200 hover:border-amber-300/70"
              )}
            >
              {currentParams.isTortie ? "Disable tortie" : "Enable tortie"}
            </button>
            {currentParams.isTortie && (
              <button
                type="button"
                onClick={handleAddLayer}
                className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-sm text-neutral-200 transition hover:border-amber-300/70"
                disabled={currentLayers.length >= MAX_TORTIE_LAYERS}
              >
                <Plus className="size-3" /> Add layer
              </button>
            )}
          </div>
        </header>

        {hasLayers ? (
          <div className="space-y-6">
            {currentLayers.map((layer, layerIndex) => {
              const label = `Layer ${layerIndex + 1}`;
              const layerPrefix = `tortie-${layerIndex}`;
              const expanded = expandedLayer === layerIndex;

              let detailContent: ReactNode | null = null;
              if (expanded) {
                const patternContent = (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {(currentOptions?.pelts ?? []).map((pattern) => {
                      const previewKey = `${layerPrefix}-pattern-${pattern}-${layer.colour ?? currentParams.colour}-${layer.mask ?? "ONE"}`;
                      const selected = (layer.pattern ?? currentParams.peltName) === pattern;
                      return (
                        <button
                          key={`${layerPrefix}-pattern-${pattern}`}
                          type="button"
                          className="text-left"
                          onClick={() => handleUpdateLayer(layerIndex, (draft) => {
                            draft.pattern = pattern;
                          })}
                        >
                          <PreviewSprite
                            cacheKey={previewKey}
                            mutate={buildTortiePreviewMutator(layerIndex, { pattern })}
                            label={formatName(pattern)}
                            selected={selected}
                            size={260}
                          />
                          <p className={cn("mt-2 text-xs", selected ? "font-semibold text-amber-100" : "text-neutral-300")}>{formatName(pattern)}</p>
                        </button>
                      );
                    })}
                  </div>
                );

                const colourContent = (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                      <span className="font-semibold text-neutral-300">Palette:</span>
                      {renderPaletteControls(tortiePaletteMode, handleTortiePaletteChange)}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {tortiePalette.map((colour) => {
                        const previewKey = `${layerPrefix}-colour-${colour}-${layer.pattern ?? currentParams.peltName}-${layer.mask ?? "ONE"}`;
                        const selected = (layer.colour ?? currentParams.colour) === colour;
                        const badgeColour = getColourSwatch(colour, spriteMapperRef.current);
                        return (
                          <button
                            key={`${layerPrefix}-colour-${colour}`}
                            type="button"
                            className="text-left"
                            onClick={() => handleUpdateLayer(layerIndex, (draft) => {
                              draft.colour = colour;
                            })}
                          >
                            <PreviewSprite
                              cacheKey={previewKey}
                              mutate={buildTortiePreviewMutator(layerIndex, { colour })}
                              label={formatName(colour)}
                              selected={selected}
                              badge={
                                <span
                                  className="block size-4 rounded-full border border-slate-900/70 shadow-inner"
                                  style={{ background: badgeColour }}
                                />
                              }
                              size={260}
                            />
                            <p className={cn("mt-2 text-xs", selected ? "font-semibold text-amber-100" : "text-neutral-300")}>{formatName(colour)}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );

                const maskContent = (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {(currentOptions?.tortieMasks ?? []).map((mask) => {
                      const previewKey = `${layerPrefix}-mask-${mask}-${layer.pattern ?? currentParams.peltName}-${layer.colour ?? currentParams.colour}`;
                      const selected = (layer.mask ?? "ONE") === mask;
                      return (
                        <button
                          key={`${layerPrefix}-mask-${mask}`}
                          type="button"
                          className="text-left"
                          onClick={() => handleUpdateLayer(layerIndex, (draft) => {
                            draft.mask = mask;
                          })}
                        >
                          <PreviewSprite
                            cacheKey={previewKey}
                            mutate={buildTortiePreviewMutator(layerIndex, { mask })}
                            label={formatName(mask)}
                            selected={selected}
                            size={260}
                          />
                          <p className={cn("mt-2 text-xs", selected ? "font-semibold text-amber-100" : "text-neutral-300")}>{formatName(mask)}</p>
                        </button>
                      );
                    })}
                  </div>
                );

                const subSections = [
                  { id: "pattern", title: "Pattern", summary: formatName(layer.pattern ?? currentParams.peltName), content: patternContent },
                  { id: "colour", title: "Colour", summary: formatName(layer.colour ?? currentParams.colour), content: colourContent },
                  { id: "mask", title: "Mask", summary: formatName(layer.mask ?? "ONE"), content: maskContent },
                ] as const;

                const storedSub = expandedTortieSub[layerIndex];
                const activeSub = storedSub === undefined ? "colour" : storedSub;

                detailContent = (
                  <div className="space-y-3">
                    {subSections.map((sub) => {
                      const subExpanded = activeSub === sub.id;
                      return (
                        <div key={`${layerPrefix}-${sub.id}`} className="space-y-3 rounded-xl border border-slate-800/60 bg-slate-900/50 p-4">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedTortieSub((prev) => ({
                                ...prev,
                                [layerIndex]: prev[layerIndex] === sub.id ? null : sub.id,
                              }))
                            }
                            className="flex w-full items-center justify-between rounded-lg border border-slate-800/70 bg-slate-900/60 px-4 py-2 text-left transition hover:border-amber-300/70 focus:outline-none focus:ring-2 focus:ring-amber-300/40"
                            aria-expanded={subExpanded}
                          >
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-white">{sub.title}</span>
                              <span className="text-xs text-neutral-300/80">Current: {sub.summary}</span>
                            </div>
                            <ChevronDown
                              className={cn("size-4 text-neutral-300 transition-transform", subExpanded ? "rotate-180" : "rotate-0")}
                            />
                          </button>
                          {subExpanded && sub.content}
                        </div>
                      );
                    })}
                  </div>
                );
              }

              return (
                <div key={layerPrefix} className="space-y-4 rounded-2xl border border-slate-800/70 bg-slate-900/60 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setExpandedLayer(expanded ? null : layerIndex)}
                      className="flex flex-1 items-center justify-between rounded-xl border border-slate-800/70 bg-slate-900/70 px-4 py-3 text-left transition hover:border-amber-300/70 focus:outline-none focus:ring-2 focus:ring-amber-300/40"
                      aria-expanded={expanded}
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-semibold text-white">{label}</span>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-300">
                          <span className="rounded-full border border-slate-700/70 bg-slate-800 px-2 py-[2px]">
                            {formatName(layer.pattern ?? currentParams.peltName)}
                          </span>
                          <span className="rounded-full border border-slate-700/70 bg-slate-800 px-2 py-[2px]">
                            {formatName(layer.colour ?? currentParams.colour)}
                          </span>
                          <span className="rounded-full border border-slate-700/70 bg-slate-800 px-2 py-[2px]">
                            Mask {formatName(layer.mask ?? "ONE")}
                          </span>
                        </div>
                      </div>
                      <ChevronDown
                        className={cn("size-4 text-neutral-300 transition-transform", expanded ? "rotate-180" : "rotate-0")}
                      />
                    </button>
                    {currentLayers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLayer(layerIndex)}
                        className="inline-flex items-center gap-1 rounded-full border border-red-500/50 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-200 transition hover:bg-red-500/20"
                      >
                        <X className="size-3" /> Remove
                      </button>
                    )}
                  </div>
                  {detailContent}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/40 px-4 py-6 text-sm text-neutral-300">
            Tortie layering is currently disabled. Toggle it on to add up to six independent layers with their own colours and masks.
          </div>
        )}
      </section>
    );
  }, [
    PreviewSprite,
    buildTortiePreviewMutator,
    expandedLayer,
    expandedTortieSub,
    handleAddLayer,
    handleRemoveLayer,
    handleTortiePaletteChange,
    handleTortieToggle,
    handleUpdateLayer,
    renderPaletteControls,
    tortieLayers,
    tortiePalette,
    tortiePaletteMode,
    viewOptions,
    viewParams,
  ]);
  const renderTortieSection = useCallback(() => tortieSection, [tortieSection]);
  const renderEyesSection = () => (
    <section id="eyes" className="scroll-mt-40 space-y-4 rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-white">Eyes</h2>
        <p className="text-sm text-neutral-300">Select the primary and optional secondary eye colours.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-neutral-200">Primary</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {(options?.eyeColours ?? []).map((eye) => (
              <button
                key={`eye-primary-${eye}`}
                type="button"
                className={cn(
                  "rounded-full border border-slate-700/60 px-3 py-1 text-sm transition",
                  params.eyeColour === eye ? "border-amber-400 bg-amber-500/30 text-amber-100" : "text-neutral-200 hover:border-amber-300/70"
                )}
                onClick={() => updateParams((draft) => {
                  draft.eyeColour = eye;
                })}
              >
                {formatName(eye)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-neutral-200">Secondary (optional)</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={cn(
                "rounded-full border border-slate-700/60 px-3 py-1 text-sm transition",
                !params.eyeColour2 ? "border-amber-400 bg-amber-500/30 text-amber-100" : "text-neutral-200 hover:border-amber-300/70"
              )}
              onClick={() => updateParams((draft) => {
                draft.eyeColour2 = undefined;
              })}
            >
              None
            </button>
            {(options?.eyeColours ?? []).map((eye) => (
              <button
                key={`eye-secondary-${eye}`}
                type="button"
                className={cn(
                  "rounded-full border border-slate-700/60 px-3 py-1 text-sm transition",
                  params.eyeColour2 === eye ? "border-amber-400 bg-amber-500/30 text-amber-100" : "text-neutral-200 hover:border-amber-300/70"
                )}
                onClick={() => updateParams((draft) => {
                  draft.eyeColour2 = eye;
                })}
              >
                {formatName(eye)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );

  const markingsSection = useMemo(() => {
    const mapperInstance = spriteMapperRef.current;
    const currentParams = viewParams;
    const currentOptions = viewOptions;
    const whiteTintChoices = mapperInstance?.getWhitePatchColourOptions("all", experimentalColourMode) ?? ["none"];
    const baseKey = `${currentParams.spriteNumber}-${currentParams.peltName}-${currentParams.colour}-${currentParams.eyeColour}-${currentParams.skinColour}-${currentParams.tint ?? "none"}`;

    const whitePatchChoices = [
      { value: null, label: "None" },
      ...((currentOptions?.whitePatches ?? []).map((value) => ({ value, label: formatName(value) }))),
    ];

    const pointChoices = [
      { value: null, label: "None" },
      ...((currentOptions?.points ?? []).map((value) => ({ value, label: formatName(value) }))),
    ];

    const vitiligoChoices = [
      { value: null, label: "None" },
      ...((currentOptions?.vitiligo ?? []).map((value) => ({ value, label: formatName(value) }))),
    ];

    const renderPreviewOption = (
      key: string,
      label: string,
      selected: boolean,
      mutate: (draft: CatParams) => void,
      size = 280,
      badge?: ReactNode
    ) => (
      <button
        key={key}
        type="button"
        className="text-left"
        onClick={() => updateParams((draft) => mutate(draft))}
      >
        <PreviewSprite cacheKey={key} mutate={mutate} label={label} selected={selected} size={size} badge={badge} />
        <p className={cn("mt-2 text-xs", selected ? "font-semibold text-amber-100" : "text-neutral-300")}>{label}</p>
      </button>
    );

    const groups: {
      id: "white" | "points" | "vitiligo" | "tint";
      title: string;
      summary: string;
      options: { key: string; label: string; selected: boolean; mutate: (draft: CatParams) => void; badge?: ReactNode }[];
    }[] = [
      {
        id: "white",
        title: "White patches",
        summary: currentParams.whitePatches ? formatName(currentParams.whitePatches) : "None",
        options: [
          ...whitePatchChoices.map(({ value, label }) => {
            const isNone = value === null;
            return {
              key: `marking-white-${value ?? "none"}-${baseKey}`,
              label,
              selected: isNone ? !currentParams.whitePatches : currentParams.whitePatches === value,
              mutate: (draft: CatParams) => {
                draft.whitePatches = isNone ? undefined : (value as string);
              },
            };
          }),
        ],
      },
      {
        id: "points",
        title: "Points",
        summary: currentParams.points ? formatName(currentParams.points) : "None",
        options: [
          ...pointChoices.map(({ value, label }) => {
            const isNone = value === null;
            return {
              key: `marking-points-${value ?? "none"}-${baseKey}`,
              label,
              selected: isNone ? !currentParams.points : currentParams.points === value,
              mutate: (draft: CatParams) => {
                draft.points = isNone ? undefined : (value as string);
              },
            };
          }),
        ],
      },
      {
        id: "vitiligo",
        title: "Vitiligo",
        summary: currentParams.vitiligo ? formatName(currentParams.vitiligo) : "None",
        options: [
          ...vitiligoChoices.map(({ value, label }) => {
            const isNone = value === null;
            return {
              key: `marking-vitiligo-${value ?? "none"}-${baseKey}`,
              label,
              selected: isNone ? !currentParams.vitiligo : currentParams.vitiligo === value,
              mutate: (draft: CatParams) => {
                draft.vitiligo = isNone ? undefined : (value as string);
              },
            };
          }),
        ],
      },
      {
        id: "tint",
        title: "White patch tint",
        summary: currentParams.whitePatchesTint && currentParams.whitePatchesTint !== "none" ? formatName(currentParams.whitePatchesTint) : "None",
        options: whiteTintChoices.map((option) => {
          const selected = (currentParams.whitePatchesTint ?? "none") === option;
          const badge = option !== "none"
            ? (
                <span
                  className="block size-4 rounded-full border border-slate-900/70 shadow-inner"
                  style={{ background: getColourSwatch(option, spriteMapperRef.current) }}
                />
              )
            : undefined;
          return {
            key: `marking-tint-${option}-${baseKey}`,
            label: formatName(option),
            selected,
            mutate: (draft: CatParams) => {
              draft.whitePatchesTint = option;
            },
            badge,
          };
        }),
      },
    ];

    return (
      <section id="markings" className="scroll-mt-40 space-y-5 rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
        <header className="space-y-1">
          <h2 className="text-xl font-semibold text-white">Markings & accents</h2>
          <p className="text-sm text-neutral-300">Add white patches, points, vitiligo, and tint adjustments.</p>
        </header>
        {groups.map((group) => {
          const expanded = expandedMarking === group.id;
          return (
            <div key={group.id} className="space-y-3 rounded-2xl border border-slate-800/60 bg-slate-900/50 p-4">
              <button
                type="button"
                onClick={() => setExpandedMarking(expanded ? null : group.id)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-800/70 bg-slate-900/70 px-4 py-3 text-left transition hover:border-amber-300/70 focus:outline-none focus:ring-2 focus:ring-amber-300/40"
                aria-expanded={expanded}
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-white">{group.title}</span>
                  <span className="text-xs text-neutral-300/80">Current: {group.summary}</span>
                </div>
                <ChevronDown
                  className={cn(
                    "size-4 text-neutral-300 transition-transform",
                    expanded ? "rotate-180" : "rotate-0"
                  )}
                />
              </button>
              {expanded && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.options.map((option) =>
                    renderPreviewOption(option.key, option.label, option.selected, option.mutate, 280, option.badge)
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>
    );
  }, [PreviewSprite, expandedMarking, experimentalColourMode, updateParams, viewOptions, viewParams]);

  const renderMarkingsSection = useCallback(() => markingsSection, [markingsSection]);
  const renderSkinSection = () => {
    const skinKeyBase = `${params.spriteNumber}-${params.peltName}-${params.colour}-${params.eyeColour}-${params.tint ?? "none"}`;
    const tintKeyBase = `${params.spriteNumber}-${params.peltName}-${params.colour}-${params.eyeColour}`;
    const tintChoices = Array.from(new Set(options?.tints ?? [])).filter((entry) => entry !== "none");

    const groups: {
      id: "skin" | "tint";
      title: string;
      summary: string;
      content: ReactNode;
    }[] = [
      {
        id: "skin",
        title: "Skin colour",
        summary: formatName(params.skinColour ?? "PINK"),
        content: (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {(options?.skinColours ?? []).map((skin) => {
              const selected = params.skinColour === skin;
              const previewKey = `skin-${skin}-${skinKeyBase}`;
              return (
                <button
                  key={`skin-${skin}`}
                  type="button"
                  className="text-left"
                  onClick={() => updateParams((draft) => {
                    draft.skinColour = skin;
                  })}
                >
                  <PreviewSprite
                    cacheKey={previewKey}
                    mutate={(draft) => {
                      draft.skinColour = skin;
                    }}
                    selected={selected}
                    label={formatName(skin)}
                    size={260}
                  />
                  <p className={cn("mt-2 text-xs", selected ? "font-semibold text-amber-100" : "text-neutral-300")}>{formatName(skin)}</p>
                </button>
              );
            })}
          </div>
        ),
      },
      {
        id: "tint",
        title: "Overall tint",
        summary: params.tint && params.tint !== "none" ? formatName(params.tint) : "None",
        content: (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <button
              type="button"
              className="text-left"
              onClick={() => updateParams((draft) => {
                draft.tint = "none";
              })}
            >
              <PreviewSprite
                cacheKey={`tint-none-${tintKeyBase}`}
                mutate={(draft) => {
                  draft.tint = "none";
                }}
                selected={(params.tint ?? "none") === "none"}
                label="None"
                size={260}
              />
              <p className={cn("mt-2 text-xs", (params.tint ?? "none") === "none" ? "font-semibold text-amber-100" : "text-neutral-300")}>None</p>
            </button>
            {tintChoices.map((tint) => {
              const selected = params.tint === tint;
              const previewKey = `tint-${tint}-${tintKeyBase}`;
              return (
                <button
                  key={`tint-${tint}`}
                  type="button"
                  className="text-left"
                  onClick={() => updateParams((draft) => {
                    draft.tint = tint;
                  })}
                >
                <PreviewSprite
                  cacheKey={previewKey}
                  mutate={(draft) => {
                    draft.tint = tint;
                  }}
                  selected={selected}
                  label={formatName(tint)}
                  size={260}
                />
                <p className={cn("mt-2 text-xs", selected ? "font-semibold text-amber-100" : "text-neutral-300")}>{formatName(tint)}</p>
              </button>
            );
          })}
          </div>
        ),
      },
    ];

    return (
      <section id="skin" className="scroll-mt-40 space-y-5 rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
        <header className="space-y-1">
          <h2 className="text-xl font-semibold text-white">Skin & tint</h2>
          <p className="text-sm text-neutral-300">Adjust the skin tone, global tint, and shading options.</p>
        </header>
        <div className="space-y-4">
          {groups.map((group) => {
            const expanded = expandedSkinGroup === group.id;
            return (
              <div key={group.id} className="space-y-3 rounded-2xl border border-slate-800/60 bg-slate-900/50 p-4">
                <button
                  type="button"
                  onClick={() => setExpandedSkinGroup(expanded ? null : group.id)}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-800/70 bg-slate-900/70 px-4 py-3 text-left transition hover:border-amber-300/70 focus:outline-none focus:ring-2 focus:ring-amber-300/40"
                  aria-expanded={expanded}
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-white">{group.title}</span>
                    <span className="text-xs text-neutral-300/80">Current: {group.summary}</span>
                  </div>
                  <ChevronDown
                    className={cn(
                      "size-4 text-neutral-300 transition-transform",
                      expanded ? "rotate-180" : "rotate-0"
                    )}
                  />
                </button>
                {expanded && group.content}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => updateParams((draft) => {
              draft.shading = !draft.shading;
            })}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition",
              params.shading ? "border-amber-400 bg-amber-500/25 text-amber-100" : "border-slate-700 bg-slate-900/60 text-neutral-200 hover:border-amber-300/70"
            )}
          >
            {params.shading ? "Shading enabled" : "Enable shading"}
          </button>
          <button
            type="button"
            onClick={() => updateParams((draft) => {
              draft.reverse = !draft.reverse;
            })}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition",
              params.reverse ? "border-amber-400 bg-amber-500/25 text-amber-100" : "border-slate-700 bg-slate-900/60 text-neutral-200 hover:border-amber-300/70"
            )}
          >
            {params.reverse ? "Reverse pose" : "Normal pose"}
          </button>
        </div>
      </section>
    );
  };

  const toggleAccessory = useCallback(
    (value: string) => {
      updateParams((draft) => {
        const set = new Set(draft.accessories ?? []);
        if (set.has(value)) {
          set.delete(value);
        } else {
          set.add(value);
        }
        draft.accessories = Array.from(set);
        draft.accessory = draft.accessories[0] ?? undefined;
      });
      markShareDirty();
    },
    [markShareDirty, updateParams]
  );

  const toggleScar = useCallback(
    (value: string) => {
      updateParams((draft) => {
        const set = new Set(draft.scars ?? []);
        if (set.has(value)) {
          set.delete(value);
        } else {
          set.add(value);
        }
        draft.scars = Array.from(set);
        draft.scar = draft.scars[0] ?? undefined;
      });
      markShareDirty();
    },
    [markShareDirty, updateParams]
  );

  const accessoriesSection = useMemo(() => {
    const mapperInstance = spriteMapperRef.current;
    const currentOptions = viewOptions;
    const currentParams = viewParams;
    const grouped = [
      { label: "Plant accessories", options: currentOptions?.plantAccessories ?? [] },
      { label: "Wild accessories", options: currentOptions?.wildAccessories ?? [] },
      { label: "Collars", options: currentOptions?.collarAccessories ?? [] },
    ];
    const allAccessories = new Set<string>(mapperInstance?.getAccessories?.() ?? []);
    grouped.forEach((group) => {
      group.options.forEach((option) => allAccessories.delete(option));
    });
    const misc = Array.from(allAccessories);
    if (misc.length) {
      grouped.push({ label: "Misc accessories", options: misc });
    }
    const normalizedGroups = grouped.map((group) => ({
      label: group.label,
      options: Array.from(new Set(group.options)),
    }));
    const chosen = new Set(currentParams.accessories ?? []);

    const previewMutator = (option: string) => (draft: CatParams) => {
      draft.accessories = [option];
      draft.accessory = option;
    };

    return (
      <section id="accessories" className="scroll-mt-40 space-y-5 rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
        <header className="space-y-1">
          <h2 className="text-xl font-semibold text-white">Accessories</h2>
          <p className="text-sm text-neutral-300">Stack multiple accessories from any category.</p>
        </header>
        {normalizedGroups.map((group) => {
          const selectedLabels = (currentParams.accessories ?? []).filter((entry) => group.options.includes(entry)).map(formatName);
          const summary = selectedLabels.length ? selectedLabels.join(", ") : "None selected";
          const expanded = expandedAccessoryGroup === group.label;
          return (
            <div key={group.label} className="space-y-3 rounded-2xl border border-slate-800/60 bg-slate-900/50 p-4">
              <button
                type="button"
                onClick={() => setExpandedAccessoryGroup(expanded ? null : group.label)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-800/70 bg-slate-900/70 px-4 py-3 text-left transition hover:border-amber-300/70 focus:outline-none focus:ring-2 focus:ring-amber-300/40"
                aria-expanded={expanded}
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-white">{group.label}</span>
                  <span className="text-xs text-neutral-300/80">{summary}</span>
                </div>
                <ChevronDown
                  className={cn(
                    "size-4 text-neutral-300 transition-transform",
                    expanded ? "rotate-180" : "rotate-0"
                  )}
                />
              </button>
              {expanded && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.options.map((option) => {
                    const label = formatName(option);
                    const selected = chosen.has(option);
                    const previewKey = `accessory-${group.label}-${option}-${currentParams.spriteNumber}-${currentParams.colour}-${currentParams.peltName}`;
                    return (
                      <button
                        key={`${group.label}:${option}`}
                        type="button"
                        onClick={() => toggleAccessory(option)}
                        className={cn(
                          "text-left transition",
                          selected
                            ? "rounded-2xl border border-amber-400/70 bg-amber-500/10 shadow-[0_0_12px_rgba(245,158,11,0.25)]"
                            : "rounded-2xl border border-slate-800/70 bg-slate-900/60 hover:border-amber-300/70"
                        )}
                      >
                        <PreviewSprite
                          cacheKey={previewKey}
                          mutate={previewMutator(option)}
                          label={label}
                          selected={selected}
                          size={260}
                        />
                        <p className="px-3 pb-3 text-xs text-neutral-300">{label}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </section>
    );
  }, [PreviewSprite, expandedAccessoryGroup, toggleAccessory, viewOptions, viewParams]);
  const renderAccessoriesSection = useCallback(() => accessoriesSection, [accessoriesSection]);

  const scarsSection = useMemo(() => {
    const currentOptions = viewOptions;
    const currentParams = viewParams;
    const groups = [
      { label: "Battle scars", options: currentOptions?.scarBattle ?? [] },
      { label: "Missing parts", options: currentOptions?.scarMissing ?? [] },
      { label: "Environmental", options: currentOptions?.scarEnvironmental ?? [] },
    ];
    const chosen = new Set(currentParams.scars ?? []);

    const previewMutator = (option: string) => (draft: CatParams) => {
      draft.scars = [option];
      draft.scar = option;
    };

    return (
      <section id="scars" className="scroll-mt-40 space-y-5 rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
        <header className="space-y-1">
          <h2 className="text-xl font-semibold text-white">Scars</h2>
          <p className="text-sm text-neutral-300">Highlight the cat&apos;s story with layered scars.</p>
        </header>
        {groups.map((group) => {
          const selectedLabels = (currentParams.scars ?? []).filter((entry) => group.options.includes(entry)).map(formatName);
          const summary = selectedLabels.length ? selectedLabels.join(", ") : "None selected";
          const expanded = expandedScarGroup === group.label;
          return (
            <div key={group.label} className="space-y-3 rounded-2xl border border-slate-800/60 bg-slate-900/50 p-4">
              <button
                type="button"
                onClick={() => setExpandedScarGroup(expanded ? null : group.label)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-800/70 bg-slate-900/70 px-4 py-3 text-left transition hover:border-amber-300/70 focus:outline-none focus:ring-2 focus:ring-amber-300/40"
                aria-expanded={expanded}
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-white">{group.label}</span>
                  <span className="text-xs text-neutral-300/80">{summary}</span>
                </div>
                <ChevronDown
                  className={cn(
                    "size-4 text-neutral-300 transition-transform",
                    expanded ? "rotate-180" : "rotate-0"
                  )}
                />
              </button>
              {expanded && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.options.map((option) => {
                    const label = formatName(option);
                    const selected = chosen.has(option);
                    const previewKey = `scar-${group.label}-${option}-${currentParams.spriteNumber}-${currentParams.colour}-${currentParams.peltName}`;
                    return (
                      <button
                        key={`${group.label}:${option}`}
                        type="button"
                        onClick={() => toggleScar(option)}
                        className={cn(
                          "text-left transition",
                          selected
                            ? "rounded-2xl border border-amber-400/70 bg-amber-500/10 shadow-[0_0_12px_rgba(245,158,11,0.25)]"
                            : "rounded-2xl border border-slate-800/70 bg-slate-900/60 hover:border-amber-300/70"
                        )}
                      >
                        <PreviewSprite
                          cacheKey={previewKey}
                          mutate={previewMutator(option)}
                          label={label}
                          selected={selected}
                          size={260}
                        />
                        <p className="px-3 pb-3 text-xs text-neutral-300">{label}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </section>
    );
  }, [PreviewSprite, expandedScarGroup, toggleScar, viewOptions, viewParams]);

  const renderScarsSection = useCallback(() => scarsSection, [scarsSection]);
  const poseSection = useMemo(() => (
    <section id="pose" className="scroll-mt-40 space-y-4 rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-white">Pose & sprite</h2>
        <p className="text-sm text-neutral-300">Choose the sprite pose and orientation.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {(viewOptions?.sprites ?? []).map((sprite) => (
          <button
            key={sprite}
            type="button"
            className={cn(
              "rounded-xl border border-slate-700/60 bg-slate-900/60 p-0 transition hover:border-amber-400/60",
              params.spriteNumber === sprite && "border-amber-400 bg-amber-500/10 text-amber-100"
            )}
            onClick={() => updateParams((draft) => {
              draft.spriteNumber = sprite;
            })}
          >
            <PreviewSprite
              cacheKey={`pose-option-${sprite}`}
              mutate={(draft) => {
                draft.spriteNumber = sprite;
              }}
              selected={params.spriteNumber === sprite}
              label={`Pose ${sprite}`}
              size={180}
            />
          </button>
        ))}
      </div>
    </section>
  ), [PreviewSprite, params.spriteNumber, updateParams, viewOptions?.sprites]);

  const renderPoseSection = useCallback(() => poseSection, [poseSection]);

  const sections: SectionDefinition[] = [
    { id: "pose", title: "Pose & sprite", description: "", render: renderPoseSection },
    { id: "colour", title: "Base colour", description: "", render: renderColourSection },
    { id: "pattern", title: "Pattern", description: "", render: renderPatternSection },
    { id: "tortie", title: "Tortie layers", description: "", render: renderTortieSection },
    { id: "eyes", title: "Eyes", description: "", render: renderEyesSection },
    { id: "markings", title: "Markings", description: "", render: renderMarkingsSection },
    { id: "skin", title: "Skin & tint", description: "", render: renderSkinSection },
    { id: "accessories", title: "Accessories", description: "", render: renderAccessoriesSection },
    { id: "scars", title: "Scars", description: "", render: renderScarsSection },
  ];

  const buildSharePayload = useCallback(() => {
    const packaged = cloneParams(params);
    packaged.accessories = [...(packaged.accessories ?? [])];
    packaged.scars = [...(packaged.scars ?? [])];
    packaged.accessory = packaged.accessories[0] ?? undefined;
    packaged.scar = packaged.scars[0] ?? undefined;
    packaged.tortie = [...(tortieLayers ?? [])];
    if (packaged.tortie.length === 0) {
      packaged.isTortie = false;
      packaged.tortiePattern = undefined;
      packaged.tortieColour = undefined;
      packaged.tortieMask = undefined;
    } else {
      packaged.isTortie = true;
      const [primary] = packaged.tortie;
      packaged.tortiePattern = primary?.pattern;
      packaged.tortieColour = primary?.colour;
      packaged.tortieMask = primary?.mask;
    }
    return {
      mode: "visual-builder",
      version: 1,
      spriteNumber: packaged.spriteNumber,
      params: packaged,
      basePalette: experimentalColourMode,
      tortiePalette: tortiePaletteMode,
      accessorySlots: packaged.accessories ?? [],
      scarSlots: packaged.scars ?? [],
      tortieSlots: (packaged.tortie ?? []).map((layer) => ({ ...layer })),
      counts: {
        accessories: packaged.accessories?.length ?? 0,
        scars: packaged.scars?.length ?? 0,
        tortie: packaged.tortie?.length ?? 0,
      },
      metaLocked: false,
    };
  }, [experimentalColourMode, params, tortieLayers, tortiePaletteMode]);

  const handleSaveShare = useCallback(async () => {
    const ensureCopied = async (value: string) => {
      try {
        await navigator.clipboard.writeText(value);
        setStatusMessage("Link copied to clipboard.");
      } catch (error) {
        console.warn("Clipboard unavailable", error);
        setStatusMessage("Copy failed – link is shown below.");
        window.prompt("Copy this link", value);
      }
    };

    if (shareInfo && !shareStale) {
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", shareInfo.url);
      }
      await ensureCopied(shareInfo.url);
      return shareInfo.url;
    }

    try {
      setShareBusy(true);
      const payload = buildSharePayload();
      const record = await createMapperRecord({
        catData: payload,
        catName: catName.trim() || undefined,
        creatorName: creatorName.trim() || undefined,
      });
      if (!record) throw new Error("Share API did not return a record.");
      const slug = (record as { slug?: string; shareToken?: string; id?: string }).slug ?? (record as { shareToken?: string; id?: string }).shareToken ?? (record as { id?: string }).id;
      if (!slug) throw new Error("Share API did not return a slug.");
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const url = origin ? `${origin}/visual-builder?slug=${encodeURIComponent(slug)}` : `/visual-builder?slug=${slug}`;
      setShareInfo({ slug, url });
      setShareStale(false);
      setLockedShareSlug(slug);
      await ensureCopied(url);
      setStatusMessage("Saved to history!");
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", url);
      }
      return url;
    } catch (error) {
      console.error("Failed to share cat", error);
      setStatusMessage("Unable to create a save link right now.");
      return null;
    } finally {
      setShareBusy(false);
    }
  }, [buildSharePayload, catName, createMapperRecord, creatorName, shareInfo, shareStale]);

  const handleDownload = useCallback(() => {
    if (!previewUrl) return;
    const link = document.createElement("a");
    link.href = previewUrl;
    link.download = "visual-builder-cat.png";
    link.click();
  }, [previewUrl]);

  const handleReset = useCallback(() => {
    unlockShare();
    setShareInfo(null);
    setStatusMessage(null);
    setParams(DEFAULT_PARAMS);
    setTortieLayers([]);
    initialSpriteNumberRef.current = null;
    setInitialSpriteNumber(null);
    setExperimentalColourMode("off");
    setTortiePaletteMode("off");
    setCatName("");
    setCreatorName("");
    setExpandedLayer(null);
    setExpandedTortieSub({});
    setExpandedMarking(null);
    setExpandedAccessoryGroup(null);
    setExpandedScarGroup(null);
    setExpandedSkinGroup(null);
    previewCacheRef.current.clear();
    markShareDirty();
  }, [markShareDirty, unlockShare]);

  const handleRandomize = useCallback(async () => {
    const generatorInstance = generatorRef.current;
    if (!generatorInstance?.generateRandomParams) {
      window.alert("Random generator is not available in this build.");
      return;
    }
    try {
      setRandomizing(true);
      const paletteModes: PaletteMode[] = ["off", "mood", "bold", "darker", "blackout"];
      const pickMode = () => paletteModes[Math.floor(Math.random() * paletteModes.length)];
      const requestedPalette = pickMode();
      const requestedTortiePalette = pickMode();
      const random = await generatorInstance.generateRandomParams({
        ignoreForbiddenSprites: true,
        accessoryRange: { min: 0, max: MAX_TORTIE_LAYERS },
        scarRange: { min: 0, max: MAX_TORTIE_LAYERS },
        tortieRange: { min: 0, max: MAX_TORTIE_LAYERS },
        experimentalColourMode: requestedPalette,
        tortiePaletteMode: requestedTortiePalette,
      } as Record<string, unknown>);
      const combined = { ...DEFAULT_PARAMS, ...random } as CatParams;
      combined.accessories = Array.isArray(random?.accessories) ? (random?.accessories as string[]) : [];
      combined.scars = Array.isArray(random?.scars) ? (random?.scars as string[]) : [];
      combined.accessory = combined.accessories[0] ?? undefined;
      combined.scar = combined.scars[0] ?? undefined;
      const tortie = Array.isArray(random?.tortie) ? (random?.tortie as TortieLayer[]) : [];
      combined.isTortie = tortie.length > 0;
      combined.tortie = tortie;
      if (tortie.length > 0) {
        const [primary] = tortie;
        combined.tortiePattern = primary?.pattern;
        combined.tortieColour = primary?.colour;
        combined.tortieMask = primary?.mask;
      }
      const determinePaletteMode = (candidate: unknown, fallback: PaletteMode) => {
        if (typeof candidate !== "string") return "off";
        const lower = candidate.toLowerCase() as PaletteMode;
        return PALETTE_CONTROLS.some((entry) => entry.id === lower) ? lower : fallback;
      };

      const nextPaletteMode = determinePaletteMode(
        random?.basePalette ?? random?.experimentalColourMode,
        requestedPalette
      );
      const nextTortiePaletteMode = determinePaletteMode(random?.tortiePalette, requestedTortiePalette);
      setExperimentalColourMode(nextPaletteMode);
      setTortiePaletteMode(nextTortiePaletteMode);
      initialSpriteNumberRef.current = combined.spriteNumber ?? null;
      setInitialSpriteNumber(combined.spriteNumber ?? null);
      setParams(combined);
      setTortieLayers(tortie);
      setExpandedLayer(null);
      setExpandedTortieSub({});
      previewCacheRef.current.clear();
      unlockShare();
      setShareInfo(null);
      setStatusMessage("Random cat generated!");
      markShareDirty();
    } catch (error) {
      console.error("Random generation failed", error);
      window.alert("Failed to roll a random cat.");
    } finally {
      setRandomizing(false);
    }
  }, [markShareDirty, unlockShare]);

  const builderBaseUrl = useMemo(() => {
    if (!generator?.buildCatURL) return null;
    try {
      return generator.buildCatURL(params);
    } catch (error) {
      console.warn("Failed to build legacy URL", error);
      return null;
    }
  }, [generator, params]);

  if (loadingOptions) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-neutral-300">
        <Loader2 className="size-6 animate-spin text-amber-200" />
        <p className="text-sm">Loading sprite data…</p>
      </div>
    );
  }

  if (optionsError || rendererError) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-red-500/40 bg-red-500/10 px-6 py-12 text-center text-sm text-red-100">
        <Sparkles className="mx-auto mb-3 size-6" />
        <p>
          {optionsError ?? rendererError ?? "Something went wrong while loading the builder. Please refresh and try again."}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-12 px-6 py-16 lg:px-10">
      <section className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-slate-950 to-slate-950 p-8 text-balance shadow-[0_0_40px_rgba(245,158,11,0.15)]">
        <p className="text-xs uppercase tracking-widest text-amber-200/90">Visual Builder</p>
        <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Design a cat with live sprite previews</h1>
      </section>

      <div className="grid gap-10 lg:grid-cols-[minmax(420px,480px)_minmax(0,1fr)] xl:grid-cols-[minmax(460px,520px)_minmax(0,1fr)]">
        <aside className="flex flex-col gap-6 self-start lg:sticky lg:top-24">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Preview</h2>
              {previewLoading && <Loader2 className="size-4 animate-spin text-amber-200" />}
            </div>
            <div className="mt-4 rounded-2xl border border-slate-800/60 bg-slate-950/80 p-3">
              <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                {previewUrl ? (
                  <Image
                    src={previewUrl}
                    alt="Cat preview"
                    width={DISPLAY_CANVAS_SIZE}
                    height={DISPLAY_CANVAS_SIZE}
                    unoptimized
                    className="h-full w-full object-contain"
                    style={{ imageRendering: "pixelated", width: "100%", height: "100%", objectFit: "contain" }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                    Preview unavailable
                  </div>
                )}
              </div>
            </div>
            <form className="mt-5 space-y-3 text-sm">
              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-400">Cat name</label>
                <input
                  value={catName}
                  disabled={isShareLocked}
                  onChange={(event) => {
                    const value = event.target.value;
                    startMetaTransition(() => {
                      setCatName(value);
                      markShareDirty();
                      setStatusMessage(null);
                    });
                  }}
                  placeholder="Optional"
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-400">Creator</label>
                <input
                  value={creatorName}
                  disabled={isShareLocked}
                  onChange={(event) => {
                    const value = event.target.value;
                    startMetaTransition(() => {
                      setCreatorName(value);
                      markShareDirty();
                      setStatusMessage(null);
                    });
                  }}
                  placeholder="Optional"
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                />
              </div>
            </form>
            {isShareLocked ? (
              <p className="mt-3 text-xs text-neutral-400">
                Shared cats are read-only. Change any trait to unlock editing and create a new link.
              </p>
            ) : null}
            <div className="mt-6 grid gap-3">
              <button
                type="button"
                onClick={handleSaveShare}
                disabled={shareBusy || isShareLocked}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/60 bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Copy className="size-4" />
                {shareBusy ? "Preparing link…" : isShareLocked ? "Loaded share (read-only)" : "Save & Copy Link"}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={!previewUrl}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:border-amber-300/70 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download className="size-4" />
                Download PNG
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleRandomize}
                  disabled={randomizing}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm font-semibold text-neutral-200 transition hover:border-amber-300/70 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw className={cn("size-4", randomizing && "animate-spin")} />
                  Randomize
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm font-semibold text-neutral-200 transition hover:border-amber-300/70 hover:text-amber-100"
                >
                  <Minus className="size-4" />
                  Reset
                </button>
              </div>
              {builderBaseUrl && (
                <button
                  type="button"
                  onClick={() => {
                    const opened = window.open(builderBaseUrl, "_blank", "noopener=yes");
                    if (!opened) window.alert("Enable popups to open the legacy builder.");
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:border-amber-300/70 hover:text-amber-100"
                >
                  <Sparkles className="size-4" />
                  Open legacy builder
                </button>
              )}
            </div>
            {statusMessage && (
              <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                {statusMessage}
              </div>
            )}
          </div>
        </aside>

        <div className="space-y-10">
          <nav className="sticky top-24 z-10 -mt-2 flex flex-wrap gap-2 text-xs sm:text-sm lg:top-28">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-full border border-amber-400/60 bg-slate-900/70 px-3 py-1 text-amber-100/80 shadow-[0_0_0_1px_rgba(251,191,36,0.35)] transition hover:bg-amber-500/20 hover:text-amber-50"
              >
                {section.title}
              </a>
            ))}
          </nav>
          <div className="space-y-8">
            {sections.map((section) => (
              <div key={section.id}>
                {section.render()}
              </div>
            ))}
              </div>
              {shareStale && shareInfo && !shareBusy && (
                <p className="text-xs text-amber-200">You&apos;ve made changes since saving. Click “Save & Copy Link” to update the share link.</p>
              )}
            </div>
      </div>
    </div>
  );
}
