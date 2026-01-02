"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { encodeCatShare, decodeCatShare, createCatShare } from "@/lib/catShare";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
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
  [key: string]: unknown;
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

interface TraitRow {
  label: string;
  value: string;
  type?: "darkForest";
}

const VALID_SPRITES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18];
const DISPLAY_CANVAS_SIZE = 900;
const PREVIEW_CANVAS_SIZE = 360;

type BuilderMeta = { slug?: string | null; catName?: string | null; creatorName?: string | null };

function buildVisualBuilderUrl(payload: CatSharePayload | null, meta?: BuilderMeta): string | null {
  if (meta?.slug) {
    return `/visual-builder?slug=${encodeURIComponent(meta.slug)}`;
  }
  if (!payload?.params) return null;
  try {
    const encoded = encodeCatShare(payload);
    const params = new URLSearchParams({ cat: encoded });
    if (meta?.catName) {
      params.set("name", meta.catName);
    }
    if (meta?.creatorName) {
      params.set("creator", meta.creatorName);
    }
    return `/visual-builder?${params.toString()}`;
  } catch (error) {
    console.warn("Failed to encode Visual Builder payload", error);
    return null;
  }
}

export function ViewerClient({ slug, encoded }: ViewerClientProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const generatorRef = useRef<CatGeneratorApi | null>(null);
  const router = useRouter();

  const mapperRecord = useQuery(
    api.mapper.getBySlug,
    slug ? { slugOrId: slug } : "skip"
  ) as MapperRecord | null | undefined;

  // Use cached preview if available, otherwise use on-demand endpoint
  const cachedPreviewUrl = mapperRecord?.previews?.full?.url ?? mapperRecord?.previews?.preview?.url ?? null;
  const previewImageUrl = cachedPreviewUrl ?? (mapperRecord?.id ? `/api/preview/${mapperRecord.id}` : null);

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

  const [builderBaseUrl, setBuilderBaseUrl] = useState<string | null>(null);
  const [showDarkForestTint, setShowDarkForestTint] = useState(true);

  const builderMeta = useMemo<BuilderMeta | null>(() => {
    if (!meta && !catPayload?.params) {
      return null;
    }
    const slugRef = meta?.slug ?? meta?.shareToken ?? null;
    const rawName = catPayload?.params ? (catPayload.params as Record<string, unknown>)?.["catName"] : null;
    const catName = meta?.catName ?? (typeof rawName === "string" ? rawName : null);
    const creatorName = meta?.creatorName ?? null;

    if (!slugRef && !catPayload?.params) {
      return null;
    }

    return {
      slug: slugRef ?? undefined,
      catName: catName ?? undefined,
      creatorName: creatorName ?? undefined,
    };
  }, [meta, catPayload]);

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
        created: mapperRecord.created ?? undefined,
      });
      setLoadingMessage(null);
    }
  }, [mapperRecord, slug]);

  useEffect(() => {
    if (slug) return;
    if (!encoded) return;
    let cancelled = false;
    (async () => {
      try {
        const decoded = await decodeCatShare(encoded);
        if (cancelled) return;
        if (!decoded || !decoded.params) {
          throw new Error("Invalid payload");
        }
        setCatPayload(decoded as CatSharePayload);
        setMeta(null);
        setLoadingMessage(null);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to decode encoded cat", err);
        setError("The provided share code is invalid or corrupted.");
        setLoadingMessage(null);
      }
    })();
    return () => {
      cancelled = true;
    };
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
    if (!builderMeta && !catPayload?.params) {
      setBuilderBaseUrl(null);
      return;
    }
    const url = buildVisualBuilderUrl(catPayload, builderMeta ?? undefined);
    setBuilderBaseUrl(url ?? null);

    if (!catPayload?.params || builderMeta?.slug) {
      return;
    }

    let cancelled = false;
    const counts = catPayload.counts ?? {
      accessories: catPayload.accessorySlots?.length ?? 0,
      scars: catPayload.scarSlots?.length ?? 0,
      tortie: catPayload.tortieSlots?.length ?? 0,
    };

    const shareSeed = {
      params: catPayload.params,
      accessorySlots: catPayload.accessorySlots ?? [],
      scarSlots: catPayload.scarSlots ?? [],
      tortieSlots: catPayload.tortieSlots ?? [],
      counts,
    } as const;

    (async () => {
      const shareRecord = await createCatShare(shareSeed);
      if (!cancelled && shareRecord?.slug) {
        setBuilderBaseUrl(`/visual-builder?share=${encodeURIComponent(shareRecord.slug)}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [builderMeta, catPayload]);

  useEffect(() => {
    if (!catPayload) {
      setSpriteVariants([]);
      setSpriteVariantsLoading(false);
      setSpriteVariantsOpen(false);
      return;
    }

    setSpriteVariants([]);
    setSpriteVariantsLoading(false);
    setSpriteVariantsOpen(false);
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
    router.push(target);
  };

  const downloadDataUrl = useCallback((dataUrl: string, filename: string) => {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const handleCopyMainSprite = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const blob: Blob | null = await new Promise((resolve) => {
        if ("toBlob" in canvas && typeof canvas.toBlob === "function") {
          canvas.toBlob((result) => resolve(result), "image/png");
        } else {
          resolve(null);
        }
      });
      if (blob && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
          window.alert("Sprite copied to clipboard.");
          return;
        } catch (error) {
          console.warn("Clipboard write failed, downloading instead", error);
          const reader = new FileReader();
          reader.onloadend = () => {
            if (typeof reader.result === "string") {
              downloadDataUrl(reader.result, "shared-cat.png");
            }
            window.alert("Clipboard unavailable; downloaded instead.");
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
      const fallback = canvas.toDataURL("image/png");
      downloadDataUrl(fallback, "shared-cat.png");
      window.alert("Clipboard unavailable; downloaded instead.");
    } catch (error) {
      console.error("Failed to copy main sprite", error);
      const fallback = canvas.toDataURL("image/png");
      downloadDataUrl(fallback, "shared-cat.png");
      window.alert("Clipboard unavailable; downloaded instead.");
    }
  }, [downloadDataUrl]);

  const handleCopyVariantSprite = useCallback(
    async (dataUrl: string, filename: string) => {
      try {
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ "image/png": blob }),
            ]);
            window.alert("Sprite copied to clipboard.");
            return;
          } catch (error) {
            console.warn("Clipboard write failed, downloading instead", error);
          }
        }
        downloadDataUrl(dataUrl, filename);
        window.alert("Clipboard unavailable; downloaded instead.");
      } catch (error) {
        console.warn("Clipboard write failed, downloading instead", error);
        downloadDataUrl(dataUrl, filename);
        window.alert("Clipboard unavailable; downloaded instead.");
      }
    },
    [downloadDataUrl]
  );

  const catDisplayName = useMemo(() => {
    const metaName = meta?.catName?.trim();
    if (metaName) return metaName;
    const payloadName = typeof (catPayload?.params as Record<string, unknown> | undefined)?.catName === "string"
      ? ((catPayload?.params as Record<string, unknown>).catName as string).trim()
      : "";
    return payloadName || "Shared Cat";
  }, [catPayload, meta]);

  const creatorDisplayName = useMemo(() => {
    const metaCreator = meta?.creatorName?.trim();
    if (metaCreator) return metaCreator;
    const payloadCreator = typeof (catPayload?.params as Record<string, unknown> | undefined)?.creatorName === "string"
      ? ((catPayload?.params as Record<string, unknown>).creatorName as string).trim()
      : "";
    return payloadCreator || null;
  }, [catPayload, meta]);

  const createdDisplay = useMemo(() => {
    if (!meta?.created) return null;
    try {
      return new Date(meta.created).toLocaleString();
    } catch {
      return null;
    }
  }, [meta]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-slate-950 to-slate-950 p-8 text-balance shadow-[0_0_40px_rgba(245,158,11,0.15)]">
        <p className="text-xs uppercase tracking-widest text-amber-200/90">Shared Cat Viewer</p>
        <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">{catDisplayName}</h1>
        <p className="mt-3 max-w-2xl text-sm text-neutral-200/85 sm:text-base">
          {creatorDisplayName ? `Created by ${creatorDisplayName}` : "Shared from the cat builder pipeline"}
          {createdDisplay ? ` • ${createdDisplay}` : null}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-neutral-200/80">
          {shareUrl ? (
            <button
              type="button"
              onClick={handleCopyShare}
              className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/20 px-4 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/25"
            >
              Copy share link <Copy className="size-3" />
            </button>
          ) : null}
          {builderBaseUrl ? (
            <button
              type="button"
              onClick={() => handleOpenBuilder(builderBaseUrl)}
              className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-slate-950/60 px-4 py-2 text-xs font-semibold text-amber-100 transition hover:border-amber-300/60 hover:text-white"
            >
              Open in Visual Builder <ArrowUpRight className="size-3" />
            </button>
          ) : null}
        </div>
      </section>

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
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={handleCopyMainSprite}
                  className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-4 py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-primary"
                >
                  <Copy className="size-3" /> Copy sprite
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-6">
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
                      <button
                        type="button"
                        onClick={() => handleCopyVariantSprite(variant.dataUrl, `${variant.name || "sprite"}.png`)}
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-primary"
                      >
                        <Copy className="size-3" /> Copy sprite
                      </button>
                    </div>
                  ))}
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
