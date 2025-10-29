"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { encodeCatShare, decodeCatShare } from "@/legacy/core/catShare";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  Clock,
  Copy,
  Loader2,
  Sparkles,
} from "lucide-react";

type ViewerClientProps = {
  slug?: string | null;
  encoded?: string | null;
};

interface CatGeneratorApi {
  generateCat: (params: Record<string, unknown>) => Promise<{ canvas: HTMLCanvasElement | OffscreenCanvas; imageDataUrl?: string }>;
  generateVariantSheet?: (
    baseParams: Record<string, unknown>,
    variants: { id: string; params: Record<string, unknown>; label?: string }[],
    options?: unknown
  ) => Promise<unknown>;
  buildCatURL?: (params: Record<string, unknown>) => string;
}

interface TortieSlot {
  mask?: string | null;
  pattern?: string | null;
  colour?: string | null;
}

interface CatSharePayload {
  params: Record<string, unknown>;
  accessorySlots?: string[];
  scarSlots?: string[];
  tortieSlots?: (TortieSlot | null)[];
  counts?: {
    accessories?: number;
    scars?: number;
    tortie?: number;
  };
}

interface ProfilePreviews {
  tiny?: { url: string | null; name?: string | null } | null;
  preview?: { url: string | null; name?: string | null } | null;
  full?: { url: string | null; name?: string | null } | null;
  spriteSheet?: { url: string | null; name?: string | null; meta?: unknown } | null;
  updatedAt?: number | null;
}

interface MapperRecord {
  id: string;
  shareToken?: string | null;
  slug?: string | null;
  cat_data?: CatSharePayload | null;
  catName?: string | null;
  creatorName?: string | null;
  created?: number;
  previews?: ProfilePreviews | null;
}

interface SpriteVariantPreview {
  id: string;
  spriteNumber: number;
  name: string;
  dataUrl: string;
}

interface BuilderSpec {
  id: string;
  accessory: string | null;
  scar: string | null;
  tortie: TortieSlot | null;
}

interface BuilderVariantPreview {
  id: string;
  label: string;
  spriteNumber: number;
  dataUrl: string;
  builderUrl?: string | null;
}

interface TraitRow {
  label: string;
  value: string;
  type?: "darkForest";
}

const VALID_SPRITES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18];
const BUILDER_VARIANT_LIMIT = 12;
const DISPLAY_CANVAS_SIZE = 900;
const PREVIEW_CANVAS_SIZE = 360;

export function ViewerClient({ slug, encoded }: ViewerClientProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const generatorRef = useRef<CatGeneratorApi | null>(null);

  const mapperRecord = useQuery(
    api.mapper.getBySlug,
    slug ? { slugOrId: slug } : "skip"
  ) as MapperRecord | null | undefined;

  const previewImageUrl = (mapperRecord?.previews?.full?.url ?? mapperRecord?.previews?.preview?.url) ?? null;

  const [catPayload, setCatPayload] = useState<CatSharePayload | null>(null);
  const [meta, setMeta] = useState<{
    shareToken?: string | null;
    slug?: string | null;
    catName?: string | null;
    creatorName?: string | null;
    created?: number;
  } | null>(null);
  const [rendererReady, setRendererReady] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string | null>("Loading cat…");
  const [error, setError] = useState<string | null>(null);

  const [spriteVariants, setSpriteVariants] = useState<SpriteVariantPreview[]>([]);
  const [spriteVariantsLoading, setSpriteVariantsLoading] = useState(false);
  const [spriteVariantsOpen, setSpriteVariantsOpen] = useState(false);

  const [builderSpecs, setBuilderSpecs] = useState<BuilderSpec[]>([]);
  const [builderVariantPreviews, setBuilderVariantPreviews] = useState<BuilderVariantPreview[]>([]);
  const [builderVariantsLoading, setBuilderVariantsLoading] = useState(false);
  const [builderVariantsOpen, setBuilderVariantsOpen] = useState(false);
  const [builderBaseUrl, setBuilderBaseUrl] = useState<string | null>(null);
  const [showDarkForestTint, setShowDarkForestTint] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { default: catGenerator } = await import("@/lib/single-cat/catGeneratorV3");
        if (cancelled) return;
        generatorRef.current = catGenerator as CatGeneratorApi;
        if (!cancelled) {
          setRendererReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load renderer", err);
          setError("Unable to load the renderer modules.");
          setLoadingMessage(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!slug) return;
    if (mapperRecord === undefined) {
      setLoadingMessage("Fetching saved cat…");
      return;
    }
    if (mapperRecord === null) {
      setError("No cat found for that link.");
      setLoadingMessage(null);
      return;
    }
    if (mapperRecord.cat_data) {
      setCatPayload(mapperRecord.cat_data);
      setMeta({
        shareToken: mapperRecord.shareToken ?? mapperRecord.slug ?? mapperRecord.id,
        slug: mapperRecord.slug ?? mapperRecord.shareToken ?? mapperRecord.id,
        catName: mapperRecord.catName ?? null,
        creatorName: mapperRecord.creatorName ?? null,
        created: mapperRecord.created ?? null,
      });
      setLoadingMessage(null);
    }
  }, [mapperRecord, slug]);

  useEffect(() => {
    if (slug) return;
    if (!encoded) return;
    try {
      const decoded = decodeCatShare(encoded);
      if (!decoded || !decoded.params) {
        throw new Error("Invalid payload");
      }
      setCatPayload(decoded as CatSharePayload);
      setMeta(null);
      setLoadingMessage(null);
    } catch (err) {
      console.error("Failed to decode encoded cat", err);
      setError("The provided share code is invalid or corrupted.");
      setLoadingMessage(null);
    }
  }, [encoded, slug]);

  useEffect(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    if (meta?.shareToken) {
      setShareUrl(origin ? `${origin}/view/${meta.shareToken}` : `/view/${meta.shareToken}`);
      return;
    }
    if (encoded) {
      setShareUrl(origin ? `${origin}/view?cat=${encoded}` : `/view?cat=${encoded}`);
      return;
    }
    if (catPayload) {
      try {
        const encodedPayload = encodeCatShare(catPayload);
        setShareUrl(origin ? `${origin}/view?cat=${encodedPayload}` : `/view?cat=${encodedPayload}`);
        return;
      } catch (err) {
        console.warn('Failed to encode share link', err);
      }
    }
    setShareUrl(null);
  }, [meta, encoded, catPayload]);

  useEffect(() => {
    if (!catPayload?.params?.darkForest) {
      setShowDarkForestTint(true);
    }
  }, [catPayload]);

  useEffect(() => {
    if (!catPayload?.params) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const renderFromRenderer = async () => {
      if (!rendererReady) return;
      const generator = generatorRef.current;
      if (!generator) return;
      try {
        const params =
          !showDarkForestTint && catPayload.params.darkForest
            ? { ...catPayload.params, darkForest: false, darkMode: false }
            : catPayload.params;
        const result = await generator.generateCat(params);
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(result.canvas as HTMLCanvasElement, 0, 0, canvas.width, canvas.height);
      } catch (err) {
        console.error("Failed to render cat", err);
        setError("Unable to render this cat payload.");
      }
    };

    const drawFromImage = (url: string) => {
      if (typeof window === "undefined") return;
      const image = new window.Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      };
      image.onerror = () => {
        console.warn('Preview image failed to load, falling back to renderer');
        renderFromRenderer();
      };
      image.src = url;
    };

    if (previewImageUrl && (showDarkForestTint || !catPayload.params.darkForest)) {
      drawFromImage(previewImageUrl);
      return;
    }

    renderFromRenderer();
  }, [rendererReady, catPayload, showDarkForestTint, previewImageUrl]);

  useEffect(() => {
    if (!rendererReady || !catPayload?.params) {
      setBuilderBaseUrl(null);
      return;
    }
    const generator = generatorRef.current;
    if (!generator?.buildCatURL) {
      setBuilderBaseUrl(null);
      return;
    }
    try {
      const url = generator.buildCatURL(catPayload.params);
      setBuilderBaseUrl(url);
    } catch (err) {
      console.warn("Failed to build base builder URL", err);
      setBuilderBaseUrl(null);
    }
  }, [rendererReady, catPayload]);

  useEffect(() => {
    if (!catPayload) {
      setSpriteVariants([]);
      setSpriteVariantsLoading(false);
      setSpriteVariantsOpen(false);
      setBuilderSpecs([]);
      setBuilderVariantPreviews([]);
      setBuilderVariantsLoading(false);
      setBuilderVariantsOpen(false);
      return;
    }

    const accessories = (catPayload.accessorySlots ?? []).filter(
      (entry): entry is string => !!entry && entry !== "none"
    );
    const scars = (catPayload.scarSlots ?? []).filter(
      (entry): entry is string => !!entry && entry !== "none"
    );
    const torties = (catPayload.tortieSlots ?? []).filter(
      (entry): entry is TortieSlot => !!entry
    );

    const accessoryOptions = accessories.length ? accessories : [null];
    const scarOptions = scars.length ? scars : [null];
    const tortieOptions = torties.length ? torties : [null];

    const specs: BuilderSpec[] = [];
    accessoryOptions.forEach((accessory) => {
      scarOptions.forEach((scar) => {
        tortieOptions.forEach((tortie, index) => {
          specs.push({
            id: `${accessory ?? "none"}|${scar ?? "none"}|${index}`,
            accessory,
            scar,
            tortie,
          });
        });
      });
    });

    setBuilderSpecs(specs.slice(0, BUILDER_VARIANT_LIMIT));
    setSpriteVariants([]);
    setSpriteVariantsLoading(false);
    setSpriteVariantsOpen(false);
    setBuilderVariantPreviews([]);
    setBuilderVariantsLoading(false);
    setBuilderVariantsOpen(false);
  }, [catPayload]);

  useEffect(() => {
    if (!rendererReady || !catPayload?.params) return;
    const generator = generatorRef.current;
    if (!generator) return;

    let cancelled = false;
    setSpriteVariantsLoading(true);
    setSpriteVariants([]);

    (async () => {
      const previews: SpriteVariantPreview[] = [];
      for (const spriteNumber of VALID_SPRITES) {
        if (cancelled) return;
        try {
          const params = { ...catPayload.params, spriteNumber };
          const result = await generator.generateCat(params);
          const previewCanvas = document.createElement("canvas");
          previewCanvas.width = PREVIEW_CANVAS_SIZE;
          previewCanvas.height = PREVIEW_CANVAS_SIZE;
          const ctx = previewCanvas.getContext("2d");
          if (!ctx) continue;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(result.canvas as HTMLCanvasElement, 0, 0, PREVIEW_CANVAS_SIZE, PREVIEW_CANVAS_SIZE);
          previews.push({
            id: `sprite-${spriteNumber}`,
            spriteNumber,
            name: `Sprite ${spriteNumber}`,
            dataUrl: previewCanvas.toDataURL("image/png"),
          });
        } catch (err) {
          console.warn("Failed to render sprite variant", err);
        }
      }
      if (!cancelled) {
        setSpriteVariants(previews);
        setSpriteVariantsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rendererReady, catPayload]);

  useEffect(() => {
    if (!rendererReady || builderSpecs.length === 0 || !catPayload?.params) {
      setBuilderVariantPreviews([]);
      setBuilderVariantsLoading(false);
      return;
    }
    const generator = generatorRef.current;
    if (!generator) return;

    let cancelled = false;
    setBuilderVariantsLoading(true);
    setBuilderVariantPreviews([]);

    (async () => {
      const previews: BuilderVariantPreview[] = [];
      for (const spec of builderSpecs) {
        if (cancelled) return;
        try {
          const params = buildVariantParams(catPayload.params, spec);
          const result = await generator.generateCat(params);
          const previewCanvas = document.createElement("canvas");
          previewCanvas.width = PREVIEW_CANVAS_SIZE;
          previewCanvas.height = PREVIEW_CANVAS_SIZE;
          const ctx = previewCanvas.getContext("2d");
          if (!ctx) continue;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(result.canvas as HTMLCanvasElement, 0, 0, PREVIEW_CANVAS_SIZE, PREVIEW_CANVAS_SIZE);
          const builderUrl = generator.buildCatURL ? generator.buildCatURL(params) : null;
          previews.push({
            id: spec.id,
            label: buildVariantLabel(spec),
            spriteNumber: params.spriteNumber as number,
            dataUrl: previewCanvas.toDataURL("image/png"),
            builderUrl,
          });
        } catch (err) {
          console.warn("Failed to render builder variant", err);
        }
      }
      if (!cancelled) {
        setBuilderVariantPreviews(previews);
        setBuilderVariantsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rendererReady, builderSpecs, catPayload]);

  const traitRows = useMemo(() => {
    if (!catPayload?.params) return [] as TraitRow[];
    const params = catPayload.params;
    const rows: TraitRow[] = [];
    const push = (label: string, value: unknown) => {
      const formatted = formatValue(value);
      if (!formatted || formatted === "None") return;
      rows.push({ label, value: formatted });
    };

    push("Colour", params.colour);
    push("Pelt", params.peltName);
    push("Eyes", buildEyeLabel(params));
    push("Eye Colour 2", params.eyeColour2);

    const accessories = (catPayload.accessorySlots ?? []).filter((item) => item && item !== "none");
    accessories.forEach((item, index) => push(`Accessory ${index + 1}`, item));

    const scars = (catPayload.scarSlots ?? []).filter((item) => item && item !== "none");
    scars.forEach((item, index) => push(`Scar ${index + 1}`, item));

    const torties = (catPayload.tortieSlots ?? []).filter((slot): slot is TortieSlot => !!slot);
    torties.forEach((slot, index) => push(`Tortie ${index + 1}`, formatTortieLayer(slot)));

    push("Tint", params.tint);
    push("Skin", params.skinColour);
    push("White Patches", params.whitePatches);
    push("Points", params.points);
    push("Vitiligo", params.vitiligo);

    if (params.darkForest) {
      rows.push({
        label: "Dark Forest",
        value: showDarkForestTint ? "Enabled" : "Disabled",
        type: "darkForest",
      });
    }

    if (params.dead) {
      rows.push({ label: "StarClan", value: "Yes" });
    }

    return rows;
  }, [catPayload, showDarkForestTint]);

  const spriteVariantsSubtitle = spriteVariantsLoading
    ? "Rendering preview sprites…"
    : spriteVariants.length > 0
    ? `${spriteVariants.length} sprite${spriteVariants.length === 1 ? "" : "s"} available`
    : "Sprite previews unavailable";

  const builderVariantsSubtitle = builderVariantsLoading
    ? "Preparing builder variants…"
    : builderSpecs.length > 0
    ? `${builderSpecs.length} variant${builderSpecs.length === 1 ? "" : "s"} available`
    : "No additional variants for this cat";

  const showLoader = !!loadingMessage || (slug && mapperRecord === undefined);
  const showCanvas = !showLoader && !error && !!catPayload;

  const handleCopyShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      window.alert("Share link copied to clipboard.");
    } catch (err) {
      console.warn("Clipboard unavailable", err);
      window.prompt("Copy this link", shareUrl);
    }
  };

  const handleOpenBuilder = (url?: string | null) => {
    const target = url ?? builderBaseUrl;
    if (!target) return;
    const opened = window.open(target, "_blank", "noopener=yes");
    if (!opened) {
      window.location.href = target;
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-12 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-foreground">Shared Cat Viewer</h1>
        <p className="text-sm text-muted-foreground">
          Short links powered by Convex with a fully local renderer. Inspect the cat, compare sprite variants, and jump back into the original builder.
        </p>
      </header>

      {showLoader && (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-border/40 bg-background/70 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-primary" />
          <span>{loadingMessage ?? "Loading cat…"}</span>
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-red-500/30 bg-red-950/40 px-6 py-10 text-sm text-red-100">
          <AlertTriangle className="size-6" />
          <span>{error}</span>
        </div>
      )}

      {showCanvas && (
        <div className="space-y-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,420px)]">
            <div className="rounded-3xl border border-border/40 bg-background/80 p-6 shadow-inner">
              <canvas
                ref={canvasRef}
                width={DISPLAY_CANVAS_SIZE}
                height={DISPLAY_CANVAS_SIZE}
                className="aspect-square w-full rounded-2xl border border-border/30 bg-background"
              />
            </div>

            <div className="flex flex-col gap-6">
              <div className="rounded-3xl border border-border/40 bg-background/70 p-5">
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  <span className="text-base font-semibold text-foreground">{meta?.catName || "Unnamed cat"}</span>
                  <span>{meta?.creatorName ? `Created by ${meta.creatorName}` : "Creator unknown"}</span>
                  {meta?.created && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground/70">
                      <Clock className="size-3" /> {new Date(meta.created).toLocaleString()}
                    </span>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {shareUrl && (
                      <button
                        type="button"
                        onClick={handleCopyShare}
                        className="inline-flex items-center gap-1 rounded-full border border-border/50 px-3 py-1 text-[11px] font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background"
                      >
                        <Copy className="size-3" /> Copy Share Link
                      </button>
                    )}
                    {builderBaseUrl && (
                      <button
                        type="button"
                        onClick={() => handleOpenBuilder(builderBaseUrl)}
                        className="inline-flex items-center gap-1 rounded-full border border-border/50 px-3 py-1 text-[11px] font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background"
                      >
                        <ArrowUpRight className="size-3" /> Original Visual Builder
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-border/40 bg-background/70 p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Sparkles className="size-4 text-primary" /> Trait Breakdown
                </h2>
                <div className="grid gap-2">
                  {traitRows.map((row) => {
                    if (row.type === "darkForest") {
                      return (
                        <div
                          key={row.label}
                          className="flex flex-col gap-1 rounded-xl border border-border/30 bg-background/60 px-3 py-2"
                        >
                          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                            {row.label}
                          </dt>
                          <dd className="flex items-center justify-between font-mono text-xs text-foreground sm:text-sm">
                            <span>Enabled</span>
                            <button
                              type="button"
                              aria-pressed={showDarkForestTint}
                              aria-label="Toggle dark forest tint"
                              onClick={() => setShowDarkForestTint((prev) => !prev)}
                              className={cn(
                                "relative inline-flex h-6 w-11 items-center rounded-full border border-border/40 bg-background/70 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40",
                                showDarkForestTint && "border-primary/60 bg-primary/80"
                              )}
                            >
                              <span
                                className={cn(
                                  "inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform",
                                  showDarkForestTint ? "translate-x-5" : "translate-x-1"
                                )}
                              />
                            </button>
                          </dd>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={row.label}
                        className="flex flex-col gap-1 rounded-xl border border-border/30 bg-background/60 px-3 py-2"
                      >
                        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                          {row.label}
                        </dt>
                        <dd className="font-mono text-xs text-foreground sm:text-sm break-words">
                          {row.value}
                        </dd>
                      </div>
                    );
                  })}
                  {traitRows.length === 0 && (
                    <p className="text-sm text-muted-foreground">No trait information available.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="glass-card px-6 py-6">
              <button
                type="button"
                onClick={() => setSpriteVariantsOpen((prev) => !prev)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/70 px-4 py-3 text-left transition hover:bg-background"
              >
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Sprite Variations</h3>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
                    {spriteVariantsSubtitle}
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    "size-4 text-muted-foreground transition-transform",
                    spriteVariantsOpen ? "rotate-180" : "rotate-0"
                  )}
                />
              </button>
              <div
                className={cn(
                  "grid overflow-hidden transition-all duration-300",
                  spriteVariantsOpen
                    ? "mt-4 max-h-[9999px] gap-4 md:grid-cols-2 xl:grid-cols-3"
                    : "max-h-0 gap-0"
                )}
              >
                {spriteVariantsOpen && spriteVariants.length === 0 && spriteVariantsLoading && (
                  <p className="col-span-full text-sm text-muted-foreground">Rendering preview sprites…</p>
                )}
                {spriteVariantsOpen && !spriteVariantsLoading && spriteVariants.length === 0 && (
                  <p className="col-span-full text-sm text-muted-foreground">
                    Sprite previews unavailable for this cat.
                  </p>
                )}
                {spriteVariantsOpen &&
                  spriteVariants.map((variant) => (
                    <div
                      key={variant.id}
                      className="rounded-2xl border border-border/40 bg-background/70 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">{variant.name}</p>
                        <span className="text-xs text-muted-foreground">#{variant.spriteNumber}</span>
                      </div>
                      <div className="mt-3 overflow-hidden rounded-xl border border-border/30 bg-background/80">
                        <Image
                          src={variant.dataUrl}
                          alt={variant.name}
                          width={PREVIEW_CANVAS_SIZE}
                          height={PREVIEW_CANVAS_SIZE}
                          unoptimized
                          className="mx-auto block h-72 w-72 image-render-pixel"
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="glass-card px-6 py-6">
              <button
                type="button"
                onClick={() => setBuilderVariantsOpen((prev) => !prev)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/70 px-4 py-3 text-left transition hover:bg-background"
              >
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Original Visual Builder Variants</h3>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
                    {builderVariantsSubtitle}
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    "size-4 text-muted-foreground transition-transform",
                    builderVariantsOpen ? "rotate-180" : "rotate-0"
                  )}
                />
              </button>
              <div
                className={cn(
                  "overflow-hidden transition-all duration-300",
                  builderVariantsOpen ? "mt-4 max-h-[9999px]" : "max-h-0"
                )}
              >
                {builderVariantsOpen && (
                  <div className="space-y-4">
                    {builderVariantsLoading && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" /> Generating preview variants…
                      </div>
                    )}
                    {!builderVariantsLoading && builderSpecs.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No additional variants were rolled for this cat.
                      </p>
                    )}
                    {!builderVariantsLoading && builderSpecs.length > 0 && builderVariantPreviews.length === 0 && (
                      <p className="text-sm text-muted-foreground">Preparing preview sprites…</p>
                    )}
                    {!builderVariantsLoading && builderVariantPreviews.length > 0 && (
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {builderVariantPreviews.map((variant, index) => (
                          <div
                            key={variant.id}
                            className="rounded-2xl border border-border/40 bg-background/70 p-4"
                          >
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold text-foreground">Variant {index + 1}</p>
                              <span className="text-xs text-muted-foreground">#{variant.spriteNumber}</span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{variant.label}</p>
                            <div className="mt-3 overflow-hidden rounded-xl border border-border/30 bg-background/80">
                              <Image
                                src={variant.dataUrl}
                                alt={variant.label}
                                width={PREVIEW_CANVAS_SIZE}
                                height={PREVIEW_CANVAS_SIZE}
                                unoptimized
                                className="mx-auto block h-72 w-72 image-render-pixel"
                              />
                            </div>
                            {variant.builderUrl && (
                              <button
                                type="button"
                                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background"
                                onClick={() => handleOpenBuilder(variant.builderUrl)}
                              >
                                <ArrowUpRight className="size-4" /> Open in Original Visual Builder
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/40 bg-background/60 px-4 py-3 text-sm text-muted-foreground">
        <div>
          <span className="font-medium text-foreground">Need more cats?</span>
          <p className="text-xs text-muted-foreground">Roll a new cat and check the history page for every saved generation.</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/gatcha"
            className="rounded-full border border-border/60 px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background"
          >
            Back to Generator
          </Link>
          <Link
            href="/history"
            className="rounded-full border border-border/60 px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background"
          >
            History
          </Link>
        </div>
      </div>
    </div>
  );
}

function buildVariantParams(base: Record<string, unknown>, spec: BuilderSpec) {
  const params: Record<string, unknown> = { ...base };
  params.accessories = [];
  params.scars = [];
  params.tortie = [];
  params.spriteNumber = 8;

  if (spec.accessory) {
    params.accessories = [spec.accessory];
    params.accessory = spec.accessory;
  } else {
    delete params.accessory;
  }

  if (spec.scar) {
    params.scars = [spec.scar];
    params.scar = spec.scar;
  } else {
    delete params.scar;
  }

  if (spec.tortie) {
    params.tortie = [spec.tortie];
    params.isTortie = true;
    params.tortieMask = spec.tortie.mask ?? undefined;
    params.tortiePattern = spec.tortie.pattern ?? undefined;
    params.tortieColour = spec.tortie.colour ?? undefined;
  } else {
    params.tortie = [];
    params.isTortie = false;
    delete params.tortieMask;
    delete params.tortiePattern;
    delete params.tortieColour;
  }

  return params;
}

function buildVariantLabel(spec: BuilderSpec) {
  const parts: string[] = [];
  parts.push(spec.accessory ? `Accessory: ${formatValue(spec.accessory)}` : "Accessory: None");
  parts.push(spec.scar ? `Scar: ${formatValue(spec.scar)}` : "Scar: None");
  parts.push(spec.tortie ? `Tortie: ${formatTortieLayer(spec.tortie)}` : "Tortie: None");
  return parts.join(" • ");
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === "" || value === "none") {
    return "None";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return String(value);
}

function formatTortieLayer(slot: TortieSlot | null | undefined): string {
  if (!slot) return "None";
  return [slot.mask, slot.pattern, slot.colour]
    .map((part) => formatValue(part))
    .join(" • ");
}

function buildEyeLabel(params: Record<string, unknown>) {
  const primary = formatValue(params.eyeColour);
  const secondary = formatValue(params.eyeColour2 ?? "None");
  if (secondary === "None" || secondary === primary) return primary;
  return `${primary} / ${secondary}`;
}
