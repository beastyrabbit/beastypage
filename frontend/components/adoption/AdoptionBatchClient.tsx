"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AlertTriangle, ArrowLeft, ArrowUpRight, Loader2, X } from "lucide-react";
import { encodeCatShare } from "@/lib/catShare";

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
}

interface AdoptionCatRecord {
  index: number;
  label: string;
  catData: CatSharePayload;
  profileId?: string | null;
  encoded?: string | null;
  shareToken?: string | null;
  catName?: string | null;
  creatorName?: string | null;
  previews?: {
    tiny?: { url: string | null } | null;
    preview?: { url: string | null } | null;
    full?: { url: string | null } | null;
  } | null;
}

interface AdoptionBatchRecord {
  id: string;
  slug?: string | null;
  title?: string | null;
  creatorName?: string | null;
  settings?: Record<string, unknown> | null;
  cats: AdoptionCatRecord[];
  created?: number;
  updated?: number;
}

type AdoptionBatchClientProps = {
  slug: string;
};

/**
 * Get the best available preview URL from cached previews,
 * or construct on-demand URL if no cached preview exists.
 */
function getPreviewUrl(
  profileId: string,
  previews?: {
    tiny?: { url: string | null } | null;
    preview?: { url: string | null } | null;
    full?: { url: string | null } | null;
  }
): string {
  const cached = previews?.preview?.url ?? previews?.full?.url ?? previews?.tiny?.url ?? null;
  return cached ?? `/api/preview/${profileId}`;
}

/**
 * Get full-res URL or fall back to on-demand preview.
 */
function getFullUrl(
  profileId: string,
  previews?: {
    full?: { url: string | null } | null;
    preview?: { url: string | null } | null;
  }
): string {
  const cached = previews?.full?.url ?? previews?.preview?.url ?? null;
  return cached ?? `/api/preview/${profileId}`;
}

function formatTimestamp(created?: number): string |
 null {
  if (!created) return null;
  const date = new Date(created);
  return date.toLocaleString();
}

export function AdoptionBatchClient({ slug }: AdoptionBatchClientProps) {
  const record = useQuery(api.adoption.getBySlug, { slugOrId: slug }) as AdoptionBatchRecord | null | undefined;
  const [focusedPreview, setFocusedPreview] = useState<{ label: string; url: string } | null>(null);

  const enrichedCats = useMemo(() => {
    if (!record?.cats?.length) return [] as (AdoptionCatRecord & { encodedFinal: string | null; viewerUrl: string | null; previewUrl: string | null; fullUrl: string | null })[];
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return record.cats.map((cat) => {
      let encoded = cat.encoded ?? null;
      if ((!encoded || encoded.length === 0) && cat.catData) {
        try {
          encoded = encodeCatShare(cat.catData);
        } catch (error) {
          console.warn("Failed to encode adoption cat payload", error);
          encoded = null;
        }
      }
      const viewerUrl = cat.shareToken
        ? origin ? `${origin}/view/${cat.shareToken}` : `/view/${cat.shareToken}`
        : encoded
          ? origin ? `${origin}/view?cat=${encoded}` : `/view?cat=${encoded}`
          : null;

      const catProfileId = cat.profileId ?? cat.shareToken ?? `batch-cat-${cat.index}`;
      const previewUrl = getPreviewUrl(catProfileId, cat.previews ?? undefined);
      const fullUrl = getFullUrl(catProfileId, cat.previews ?? undefined);

      return {
        ...cat,
        encodedFinal: encoded,
        viewerUrl,
        previewUrl,
        fullUrl,
      };
    });
  }, [record]);

  const shareUrl = useMemo(() => {
    if (!record?.slug) return null;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return origin ? `${origin}/adoption/${record.slug}` : `/adoption/${record.slug}`;
  }, [record]);

  const formattedDate = formatTimestamp(record?.created);
  const batchTitle = record?.title?.trim() || "Adoption Batch";
  const batchCreator = record?.creatorName?.trim() || null;

  if (record === undefined) {
    return (
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center gap-3 px-6 py-16 text-muted-foreground">
        <Loader2 className="size-6 animate-spin text-primary" />
        <span className="text-sm">Loading adoption batch…</span>
      </div>
    );
  }

  if (record === null) {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 px-6 py-16 text-center text-muted-foreground">
        <AlertTriangle className="size-8 text-red-300" />
        <p className="text-base">That adoption batch could not be found.</p>
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-primary">
          <ArrowLeft className="size-4" /> Return home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-slate-950 to-slate-950 p-8 text-balance shadow-[0_0_40px_rgba(245,158,11,0.15)]">
        <Link href="/" className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-amber-200/80 transition hover:text-amber-100">
          <ArrowLeft className="size-3" /> Back to hub
        </Link>
        <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">{batchTitle}</h1>
        <p className="mt-3 max-w-2xl text-sm text-neutral-200/85 sm:text-base">
          {batchCreator ? `Created by ${batchCreator}` : "Generated in the adoption wizard"}
          {formattedDate ? ` • ${formattedDate}` : null}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-neutral-200/80">
          <span className="rounded-full border border-amber-400/30 bg-slate-950/60 px-3 py-1">
            {enrichedCats.length.toLocaleString()} cats in this batch
          </span>
          {shareUrl ? (
            <Link
              href={shareUrl}
              className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/20 px-4 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/25"
            >
              Share batch <ArrowUpRight className="size-4" />
            </Link>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-6">
        {enrichedCats.length === 0 ? (
          <div className="rounded-3xl border border-border/40 bg-background/50 p-10 text-center text-sm text-muted-foreground">
            No cats generated in this batch yet.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {enrichedCats.map((cat) => {
              const displayName = cat.catName?.trim() || cat.label;
              const creator = cat.creatorName?.trim() || batchCreator || "Creator unknown";
              const previewSrc = cat.previewUrl ?? cat.fullUrl;
              const fullSrc = cat.fullUrl ?? cat.previewUrl ?? null;
              return (
                <article
                  key={cat.index}
                  className="flex h-full flex-col gap-3 rounded-2xl border border-border/40 bg-background/70 p-4 transition hover:border-primary/40"
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (fullSrc) {
                        setFocusedPreview({ label: displayName, url: fullSrc });
                      }
                    }}
                    className="relative aspect-square w-full overflow-hidden rounded-xl border border-border/30 bg-background transition hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!fullSrc}
                    aria-label={fullSrc ? `Open preview for ${displayName}` : "Preview unavailable"}
                  >
                    {previewSrc ? (
                      <Image
                        src={previewSrc}
                        alt={displayName}
                        width={480}
                        height={480}
                        unoptimized
                        className="h-full w-full object-contain image-render-pixel"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                        Preview unavailable
                      </div>
                    )}
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/65 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                      Cat {cat.index + 1}
                    </span>
                  </button>

                  <div className="flex flex-col gap-2 text-center">
                    <h2 className="text-base font-semibold text-foreground">{displayName}</h2>
                    <p className="text-xs text-muted-foreground">{creator}</p>
                  </div>

                  <div className="mt-auto flex flex-col gap-2">
                    {cat.viewerUrl ? (
                      <Link
                        href={cat.viewerUrl}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border/60 px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background"
                      >
                        View cat <ArrowUpRight className="size-4" />
                      </Link>
                    ) : (
                      <p className="text-xs italic text-muted-foreground/70 text-center">Viewer link unavailable.</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {focusedPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6 py-10"
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            setFocusedPreview(null);
          }}
        >
          <div className="relative w-full max-w-4xl rounded-3xl border border-border/40 bg-background/95 p-8 shadow-2xl">
            <button
              type="button"
              onClick={() => setFocusedPreview(null)}
              aria-label="Close preview"
              className="absolute right-4 top-4 rounded-full border border-border/60 bg-background/80 p-1.5 text-muted-foreground transition hover:bg-foreground hover:text-background"
            >
              <X className="size-4" />
            </button>
            <div className="flex flex-col items-center gap-6">
              <h2 className="text-xl font-semibold text-foreground">{focusedPreview.label}</h2>
              <div className="w-full overflow-hidden rounded-2xl border border-border/40 bg-background/80">
                <Image
                  src={focusedPreview.url}
                  alt={focusedPreview.label}
                  width={1080}
                  height={1080}
                  unoptimized
                  className="h-auto w-full image-render-pixel"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
