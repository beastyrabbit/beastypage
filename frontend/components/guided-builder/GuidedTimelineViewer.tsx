"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Download, Loader2, RefreshCw, Share2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import type { CatParams, TortieLayer } from "@/lib/cat-v3/types";
import type { CatGeneratorApi } from "@/components/cat-builder/types";

type StepId =
  | "colour"
  | "pattern"
  | "tortie"
  | "tortie-layer-1"
  | "tortie-layer-2"
  | "tortie-layer-3"
  | "eyes"
  | "accents"
  | "skin-tint"
  | "accessories"
  | "scars"
  | "pose";

interface TimelineStep {
  id: StepId;
  title?: string;
  summary?: string;
  params: CatParams;
}

interface TimelinePayload {
  mode: string;
  version: number;
  basePalette?: string;
  tortiePalette?: string;
  steps: TimelineStep[];
  finalParams: CatParams;
}

interface MapperRecord {
  id: string;
  slug?: string | null;
  shareToken?: string | null;
  cat_data?: {
    metaLocked?: boolean;
    mode?: string;
    params?: CatParams;
    finalParams?: CatParams;
  } | null;
  catName?: string | null;
  creatorName?: string | null;
  created?: number;
}


type GuidedTimelineViewerProps = {
  slug?: string | null;
  encoded?: string | null;
};

const PREVIEW_SIZE = 420;

export function GuidedTimelineViewer({ slug, encoded }: GuidedTimelineViewerProps) {
  const mapperRecord = useQuery(
    api.mapper.getBySlug,
    slug ? { slugOrId: slug } : "skip"
  ) as MapperRecord | null | undefined;

  const [payload, setPayload] = useState<TimelinePayload | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [timelinePreviews, setTimelinePreviews] = useState<Record<number, string>>({});
  const [rendererReady, setRendererReady] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>("Loading timeline…");
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ catName?: string | null; creatorName?: string | null; created?: number | null }>({});
  const [catNameDraft, setCatNameDraft] = useState("");
  const [creatorNameDraft, setCreatorNameDraft] = useState("");
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaSaved, setMetaSaved] = useState(false);
  const updateMeta = useMutation(api.mapper.updateMeta);

  const generatorRef = useRef<CatGeneratorApi | null>(null);
  const catDataRecord = mapperRecord?.cat_data ?? undefined;
  const metaLocked = catDataRecord?.metaLocked ?? false;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { default: generator } = (await import("@/lib/single-cat/catGeneratorV3")) as {
          default: CatGeneratorApi;
        };
        if (!cancelled) {
          generatorRef.current = generator;
          setRendererReady(true);
        }
      } catch (err) {
        console.error("Failed to load renderer", err);
        if (!cancelled) {
          setError("Unable to load the renderer module.");
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
      setLoadingMessage("Fetching saved timeline…");
      return;
    }
    if (mapperRecord === null) {
      setError("No timeline found for that link.");
      setLoadingMessage(null);
      return;
    }
    if (mapperRecord.cat_data) {
      try {
        const cast = mapperRecord.cat_data as TimelinePayload;
        if (cast?.mode !== "wizard-timeline") {
          throw new Error("Unsupported payload format");
        }
        setPayload(cast);
        setMeta({
          catName: mapperRecord.catName ?? null,
          creatorName: mapperRecord.creatorName ?? null,
          created: mapperRecord.created ?? null,
        });
        setCatNameDraft((mapperRecord.catName ?? "").trim());
        setCreatorNameDraft((mapperRecord.creatorName ?? "").trim());
        const locked = metaLocked;
        setMetaSaved(locked || Boolean(mapperRecord.catName?.trim() || mapperRecord.creatorName?.trim()));
        setLoadingMessage(null);
      } catch (err) {
        console.error("Invalid timeline payload", err);
        setError("Stored timeline payload is corrupted.");
        setLoadingMessage(null);
      }
    }
  }, [mapperRecord, slug, metaLocked]);

  useEffect(() => {
    if (mapperRecord) {
      if (!metaSaved) {
        setCatNameDraft((mapperRecord.catName ?? "").trim());
        setCreatorNameDraft((mapperRecord.creatorName ?? "").trim());
      }
    } else if (!mapperRecord && !slug) {
      if (!metaSaved) {
        setCatNameDraft("");
        setCreatorNameDraft("");
      }
    }
  }, [mapperRecord, metaSaved, slug]);

  useEffect(() => {
    if (slug) return;
    if (!encoded) return;
    try {
      const decoded = decodeSharePayload(encoded);
    if (!decoded || decoded.mode !== "wizard-timeline") {
      throw new Error("Invalid payload");
    }
    setPayload(decoded);
    setMeta({});
    setMetaSaved(false);
    setLoadingMessage(null);
  } catch (err) {
      console.error("Failed to decode payload", err);
      setError("The provided share data is invalid or corrupted.");
      setLoadingMessage(null);
    }
  }, [encoded, slug]);

  useEffect(() => {
    if (!payload || !rendererReady) return;
    const generator = generatorRef.current;
    if (!generator) return;

    const steps = Array.isArray(payload.steps) ? payload.steps : [];
    setTimelinePreviews({});
    let cancelled = false;

    (async () => {
      const previews: Record<number, string> = {};
      for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index];
        try {
          const dataUrl = await renderParams(generator, step.params);
          if (cancelled) return;
          previews[index] = dataUrl;
          setTimelinePreviews((prev) => ({ ...prev, [index]: dataUrl }));
        } catch (err) {
          console.warn("Failed to render timeline step", step.id, err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [payload, rendererReady]);

  useEffect(() => {
    if (!payload || !rendererReady) return;
    const generator = generatorRef.current;
    if (!generator) return;

    const index = activeIndex >= 0 ? activeIndex : payload.steps.length - 1;
    const params = index >= 0 ? payload.steps[index]?.params : payload.finalParams;
    if (!params) return;

    let cancelled = false;
    setLoadingMessage((prev) => prev ?? "Rendering preview…");
    (async () => {
      try {
        const dataUrl = await renderParams(generator, params);
        if (!cancelled) {
          setActiveImage(dataUrl);
          setLoadingMessage(null);
        }
      } catch (err) {
        console.error("Failed to render active sprite", err);
        if (!cancelled) {
          setActiveImage(null);
          setError("Renderer error while generating preview.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeIndex, payload, rendererReady]);

  const steps = useMemo<TimelineStep[]>(() => payload?.steps ?? [], [payload]);

  const activeStep = activeIndex >= 0 ? steps[activeIndex] : null;

  const infoRows = useMemo(() => {
    const params = activeStep?.params ?? payload?.finalParams;
    if (!params) return [];
    const entries: Array<[string, string]> = [
      ["Pose", params.spriteNumber !== undefined ? `Pose ${params.spriteNumber}` : "—"],
      ["Pattern", params.peltName ?? "—"],
      ["Base Colour", params.colour ?? "—"],
      ["Eye Colour", params.eyeColour ?? "—"],
      ["Eye Colour 2", params.eyeColour2 ?? "None"],
      ["Skin Colour", params.skinColour ?? "—"],
      ["Tint", params.tint ?? "none"],
      ["White Patches", params.whitePatches ?? "none"],
      ["White Patch Tint", params.whitePatchesTint ?? "none"],
      ["Points", params.points ?? "none"],
      ["Vitiligo", params.vitiligo ?? "none"],
    ];
    const accessories = params.accessories ?? (params.accessory ? [params.accessory] : []);
    entries.push(["Accessories", accessories.length ? accessories.join(", ") : "none"]);
    const scars = params.scars ?? (params.scar ? [params.scar] : []);
    entries.push(["Scars", scars.length ? scars.join(", ") : "none"]);
    if (params.isTortie && Array.isArray(params.tortie)) {
      params.tortie.forEach((layer, index) => {
        if (!layer) return; // Skip null layers
        entries.push([
          `Tortie Layer ${index + 1}`,
          `${layer.pattern ?? "?"} · ${layer.colour ?? "?"} · ${layer.mask ?? "?"}`,
        ]);
      });
    } else {
      entries.push(["Tortie", params.isTortie ? "Enabled" : "Disabled"]);
    }
    return entries;
  }, [activeStep?.params, payload?.finalParams]);

  const recordId = mapperRecord?.id ?? null;
  const allowMetaEdit = Boolean(
    recordId &&
    slug &&
    !metaSaved &&
    !metaLocked &&
    (!mapperRecord?.catName?.trim() || !mapperRecord?.creatorName?.trim())
  );

  const handleMetaSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!recordId) return;
    const trimmedCat = catNameDraft.trim();
    const trimmedCreator = creatorNameDraft.trim();
    setMetaSaving(true);
    try {
      const result = await updateMeta({
        id: recordId as Id<"cat_profile">,
        catName: trimmedCat || undefined,
        creatorName: trimmedCreator || undefined,
      });
      const resolvedName = result?.catName ?? (trimmedCat || null);
      const resolvedCreator = result?.creatorName ?? (trimmedCreator || null);
      setMeta({
        catName: resolvedName,
        creatorName: resolvedCreator,
        created: result?.created ?? mapperRecord?.created ?? null,
      });
      setCatNameDraft(resolvedName ?? "");
      setCreatorNameDraft(resolvedCreator ?? "");
      setMetaSaved(true);
      window.alert("Saved to history!");
    } catch (err) {
      console.error("Failed to update guided builder metadata", err);
      window.alert("Unable to save the name right now. Please try again.");
    } finally {
      setMetaSaving(false);
    }
  };

  const displayName = meta.catName?.trim() || "Unnamed cat";
  const displayCreator = meta.creatorName?.trim() || null;

  if (loadingMessage && !payload && !error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-neutral-200">
        <Loader2 className="size-6 animate-spin text-amber-200" />
        <p className="text-sm">{loadingMessage}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-red-500/40 bg-red-500/10 p-8 text-red-100">
        <h1 className="text-2xl font-semibold">Timeline unavailable</h1>
        <p className="mt-3 text-sm">{error}</p>
        <Link href="/guided-builder" className="mt-5 inline-flex items-center gap-2 rounded-xl border border-red-500/50 px-4 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-500/20">
          <RefreshCw className="size-4" />
          Back to builder
        </Link>
      </div>
    );
  }

  if (!payload) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem,1fr]">
      <aside className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-wide text-neutral-400">Guided tour</p>
          <h1 className="text-2xl font-semibold text-white">Timeline viewer</h1>
          <p className="text-sm text-neutral-300">
            Step back through each decision and export the final sprite.
          </p>
          <Link
            href="/guided-builder"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-amber-400/60 hover:text-amber-100"
          >
            <RefreshCw className="size-4" />
            Create a new build
          </Link>
        </header>
        <section className="mt-6 space-y-3">
          <h2 className="text-sm font-semibold text-neutral-200">Timeline</h2>
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-2">
            {steps.map((step, index) => {
              const preview = timelinePreviews[index];
              const active = index === activeIndex;
              return (
                <button
                  key={`${step.id}-${index}`}
                  type="button"
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-3 text-left transition hover:border-amber-400/60",
                    active && "border-amber-400 bg-amber-500/10 text-amber-100"
                  )}
                  onClick={() => setActiveIndex(index)}
                >
                  <div className="size-16 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                    {preview ? (
                      <Image
                        src={preview}
                        alt=""
                        width={120}
                        height={120}
                        className="h-full w-full object-contain"
                        unoptimized
                        style={{ imageRendering: "pixelated" }}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-neutral-500">
                        …
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{step.title ?? formatName(step.id)}</div>
                    <p className="line-clamp-2 text-xs text-neutral-300/80">{step.summary ?? "—"}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </aside>

      <main className="space-y-6">
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="flex-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="relative flex h-full items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
                <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                  Guided
                </span>
                {activeImage ? (
                  <Image
                    src={activeImage}
                    alt="Cat preview"
                    width={PREVIEW_SIZE}
                    height={PREVIEW_SIZE}
                    className="w-full max-w-[20rem] object-contain"
                    priority
                    unoptimized
                    style={{ imageRendering: "pixelated" }}
                  />
                ) : (
                  <div className="flex min-h-[16rem] items-center justify-center text-sm text-neutral-400">
                    Awaiting renderer…
                  </div>
                )}
              </div>
            </div>
            <div className="flex w-full flex-col gap-3 lg:w-60">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-neutral-200">
                <div className="text-base font-semibold text-white">{displayName}</div>
                {displayCreator ? <div className="text-xs text-neutral-300">by {displayCreator}</div> : null}
              </div>
              <button
                type="button"
                className="flex items-center justify-center gap-2 rounded-xl border border-amber-400/60 bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/25"
                onClick={() => {
                  if (!activeImage) return;
                  const link = document.createElement("a");
                  link.href = activeImage;
                  link.download = "guided-cat.png";
                  link.click();
                }}
              >
                <Download className="size-4" />
                Download sprite
              </button>
              <button
                type="button"
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:border-amber-400/60 hover:text-amber-100"
                onClick={async () => {
                  if (!activeImage) return;
                  try {
                    await navigator.clipboard.writeText(activeImage);
                    window.alert("Copied image data URL to clipboard.");
                  } catch (err) {
                    console.warn("Clipboard unavailable", err);
                    window.prompt("Copy image data URL:", activeImage);
                  }
                }}
              >
                <Share2 className="size-4" />
                Copy data URL
              </button>
            </div>
          </div>
      </section>

      {allowMetaEdit && (
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
          <h3 className="text-sm font-semibold text-neutral-200">Name this cat</h3>
          <p className="mt-1 text-xs text-neutral-400">Set a display name and creator credit for history. This can only be done once.</p>
          <form className="mt-4 grid gap-3 sm:grid-cols-[1fr,1fr,auto]" onSubmit={handleMetaSubmit}>
            <input
              type="text"
              value={catNameDraft}
              onChange={(event) => setCatNameDraft(event.target.value)}
              placeholder="Cat name"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-neutral-100 focus:border-amber-400 focus:outline-none"
              maxLength={60}
            />
            <input
              type="text"
              value={creatorNameDraft}
              onChange={(event) => setCreatorNameDraft(event.target.value)}
              placeholder="Creator"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-neutral-100 focus:border-amber-400 focus:outline-none"
              maxLength={60}
            />
            <button
              type="submit"
              disabled={metaSaving}
              className="inline-flex items-center justify-center rounded-xl border border-amber-400/60 bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {metaSaving ? "Saving…" : "Save to history"}
            </button>
          </form>
        </section>
      )}

      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
        <header className="mb-6 border-b border-slate-800 pb-4">
          <h2 className="text-xl font-semibold text-white">Traits for this step</h2>
          {activeStep?.summary && <p className="mt-1 text-sm text-neutral-300">{activeStep.summary}</p>}
          </header>
          <table className="w-full table-fixed text-sm text-neutral-300">
            <tbody>
              {infoRows.map(([label, value]) => (
                <tr key={label} className="border-b border-slate-800/80 last:border-none">
                  <th className="w-40 py-2 pr-4 text-left font-medium text-neutral-400">{label}</th>
                  <td className="py-2 text-white">{formatName(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

function decodeSharePayload(encoded: string): TimelinePayload {
  if (typeof atob === "function") {
    const ascii = atob(encoded);
    return JSON.parse(ascii) as TimelinePayload;
  }
  throw new Error("Base64 decoding unavailable in this environment");
}

async function renderParams(generator: CatGeneratorApi, params: CatParams): Promise<string> {
  const result = await generator.generateCat({
    ...params,
    spriteNumber: params.spriteNumber,
  });
  if (result.imageDataUrl) return result.imageDataUrl;

  // Handle both HTMLCanvasElement and OffscreenCanvas
  const canvas = result.canvas;
  if (canvas instanceof HTMLCanvasElement) {
    return canvas.toDataURL("image/png");
  }
  // OffscreenCanvas - use convertToBlob
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

function formatName(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "number") return `#${value}`;
  return String(value)
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "None";
}
