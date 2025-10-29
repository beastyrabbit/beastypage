"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Loader2, ArrowUpRight, Search, SlidersHorizontal, X, ChevronLeft, ChevronRight } from "lucide-react";
import { encodeCatShare } from "@/legacy/core/catShare";

type SortMode = "newest" | "oldest" | "name";

type AdoptionHistoryCat = {
  index: number;
  label: string;
  catName?: string | null;
  creatorName?: string | null;
  previewUrl: string | null;
  fullUrl: string | null;
  viewerUrl: string | null;
};

type HistoryItem =
  | { kind: "single"; id: string; title: string; creator: string | null; created: number | null; previewUrl: string | null; fullUrl: string | null; slug: string; variant: "single" | "guided"; href: string }
  | {
      kind: "adoption";
      id: string;
      title: string;
      creator: string | null;
      created: number | null;
      previewUrl: string | null;
      fullUrl: string | null;
      slug: string;
      cats: AdoptionHistoryCat[];
    };

function cleanDisplay(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  if (trimmed.toLowerCase() === "unnamed cat") return "";
  return trimmed;
}

function bestPreview(previews?: {
  tiny?: { url: string | null } | null;
  preview?: { url: string | null } | null;
  full?: { url: string | null } | null;
}) {
  return previews?.preview?.url ?? previews?.full?.url ?? previews?.tiny?.url ?? null;
}

function fullPreview(previews?: {
  full?: { url: string | null } | null;
  preview?: { url: string | null } | null;
}) {
  return previews?.full?.url ?? previews?.preview?.url ?? null;
}

const STORAGE_ORIGIN =
  process.env.NEXT_PUBLIC_CONVEX_URL ??
  process.env.CONVEX_SELF_HOSTED_URL ??
  null;

function fixPreviewUrl(url: string | null): string | null {
  if (!url || !STORAGE_ORIGIN) return url;
  try {
    const base = new URL(STORAGE_ORIGIN);
    const resolved = url.startsWith("/") ? new URL(url, base) : new URL(url);
    resolved.protocol = base.protocol;
    resolved.host = base.host;
    return resolved.toString();
  } catch {
    if (url.startsWith("/")) {
      return `${STORAGE_ORIGIN.replace(/\/$/, "")}${url}`;
    }
    return url;
  }
}

export function HistoryClient() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [focusedPreview, setFocusedPreview] = useState<{ url: string; title: string } | null>(null);

  const profilesQuery = useQuery(api.mapper.listHistory, { limit: 200 });
  const batchesQuery = useQuery(api.adoption.listBatches, { limit: 120 });

  const profiles = profilesQuery ?? [];
  const batches = batchesQuery ?? [];

  const singleItems: HistoryItem[] = profiles
    .filter((profile) => !profile.adoptionBatchId)
    .map((profile) => {
      const mode = (profile.cat_data as { mode?: string } | null)?.mode ?? null;
      const variant: "single" | "guided" = mode === "wizard-timeline" ? "guided" : "single";
      const slug = profile.slug ?? profile.shareToken ?? profile.id;
      const href = variant === "guided" ? `/guided-builder/view/${slug}` : `/view/${slug}`;
      return {
        kind: "single" as const,
        id: profile.id,
        title: cleanDisplay(profile.catName),
        creator: cleanDisplay(profile.creatorName) || null,
        created: profile.created ?? null,
        previewUrl: fixPreviewUrl(bestPreview(profile.previews ?? undefined)),
        fullUrl: fixPreviewUrl(fullPreview(profile.previews ?? undefined)),
        slug,
        variant,
        href,
      };
    });

  const adoptionItems: HistoryItem[] = batches.map((batch) => {
    const baseTitle = cleanDisplay(batch.title) || "Adoption Batch";
    const baseCreator = cleanDisplay(batch.creatorName) || null;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const cats: AdoptionHistoryCat[] = (batch.cats ?? []).map((cat, index) => {
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
        ? origin
          ? `${origin}/view/${cat.shareToken}`
          : `/view/${cat.shareToken}`
        : encoded
          ? origin
            ? `${origin}/view?cat=${encoded}`
            : `/view?cat=${encoded}`
          : null;
      const previewUrl = fixPreviewUrl(bestPreview(cat.previews ?? undefined));
      const fullUrl = fixPreviewUrl(fullPreview(cat.previews ?? undefined)) ?? previewUrl;
      return {
        index,
        label: cat.label ?? "",
        catName: cat.catName ?? null,
        creatorName: cat.creatorName ?? null,
        previewUrl,
        fullUrl,
        viewerUrl,
      };
    });
    const firstCat = cats[0] ?? null;
    const previewUrl = firstCat?.previewUrl ?? null;
    const fullUrl = firstCat?.fullUrl ?? previewUrl;
    return {
      kind: "adoption" as const,
      id: batch.id,
      title: baseTitle,
      creator: baseCreator,
      created: batch.created ?? null,
      previewUrl,
      fullUrl,
      slug: batch.slug ?? batch.id,
      cats,
    };
  });

  const allItems = useMemo(() => [...singleItems, ...adoptionItems], [singleItems, adoptionItems]);

  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return allItems;
    return allItems.filter((item) =>
      [item.title, item.creator, item.slug]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term))
    );
  }, [allItems, searchTerm]);

  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      switch (sortMode) {
        case "oldest":
          return (a.created ?? 0) - (b.created ?? 0);
        case "name":
          return a.title.localeCompare(b.title);
        case "newest":
        default:
          return (b.created ?? 0) - (a.created ?? 0);
      }
    });
  }, [filteredItems, sortMode]);

  if (profilesQuery === undefined || batchesQuery === undefined) {
    return (
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center gap-3 px-6 py-16 text-muted-foreground">
        <Loader2 className="size-6 animate-spin text-primary" />
        <span className="text-sm">Loading history…</span>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Cat History</h1>
        <p className="text-sm text-muted-foreground">Every saved cat and adoption preview rendered via the backend pipeline.</p>
      </header>

      <div className="flex flex-col gap-4 rounded-3xl border border-border/40 bg-background/70 p-6 text-sm text-muted-foreground">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <label className="flex w-full flex-col gap-1 text-xs uppercase tracking-wide text-muted-foreground/70 md:max-w-md">
            <span className="flex items-center gap-2 text-[11px]">
              <Search className="size-3" /> Search
            </span>
            <div className="relative">
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by name, creator, or slug"
                className="w-full rounded-xl border border-border/50 bg-background px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground/70"
                >
                  Clear
                </button>
              )}
            </div>
          </label>

          <div className="flex flex-col gap-2 text-xs uppercase tracking-wide text-muted-foreground/70 md:items-end">
            <span className="flex items-center gap-2 text-[11px] md:justify-end">
              <SlidersHorizontal className="size-3" /> Sort
            </span>
            <div className="flex flex-wrap justify-start gap-2 md:justify-end">
              {([
                { label: "Newest", value: "newest" },
                { label: "Oldest", value: "oldest" },
                { label: "Name", value: "name" },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSortMode(option.value)}
                  className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                    sortMode === option.value
                      ? "border-primary/60 bg-primary/20 text-foreground"
                      : "border-border/60 bg-background/70 text-muted-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {sortedItems.map((item) => (
          <HistoryCard
            key={item.id}
            item={item}
            onPreview={(title, url) => setFocusedPreview({ title, url })}
          />
        ))}
      </div>

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
              <h2 className="text-xl font-semibold text-foreground">{focusedPreview.title}</h2>
              <div className="w-full overflow-hidden rounded-2xl border border-border/40 bg-background/80">
                <Image
                  src={focusedPreview.url}
                  alt={focusedPreview.title}
                  width={1080}
                  height={1080}
                  unoptimized
                  className="h-auto w-full"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type HistoryCardProps = {
  item: HistoryItem;
  onPreview: (title: string, url: string) => void;
};

function HistoryCard({ item, onPreview }: HistoryCardProps) {
  if (item.kind === "adoption") {
    return <HistoryAdoptionCard item={item} onPreview={onPreview} />;
  }
  return <HistorySingleCard item={item} onPreview={onPreview} />;
}

type HistorySingleCardProps = {
  item: Extract<HistoryItem, { kind: "single" }>;
  onPreview: (title: string, url: string) => void;
};

function HistorySingleCard({ item, onPreview }: HistorySingleCardProps) {
  const title = cleanDisplay(item.title);
  const previewUrl = item.previewUrl;
  const fullUrl = item.fullUrl ?? previewUrl;
  const creator = cleanDisplay(item.creator);
  const href = item.href;
  const variantLabel = item.variant === "guided" ? "Guided" : "Single";
  const actionLabel = item.variant === "guided" ? "Open tour" : "View";

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border/40 bg-background/70 p-4 transition hover:border-primary/40">
      <button
        type="button"
        onClick={() => {
          if (fullUrl) onPreview(title, fullUrl);
        }}
        className="relative aspect-square w-full overflow-hidden rounded-xl border border-border/30 bg-background transition hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!fullUrl}
        aria-label={fullUrl ? `Open preview for ${title}` : "Preview unavailable"}
      >
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt={title}
            width={360}
            height={360}
            unoptimized
            className="h-full w-full object-contain image-render-pixel"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            Preview unavailable
          </div>
        )}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/65 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
          {variantLabel}
        </span>
      </button>

      <div className="flex flex-col gap-2">
        {title ? <h2 className="text-base font-semibold text-foreground">{title}</h2> : null}
        {creator ? <p className="text-xs text-muted-foreground">by {creator}</p> : null}
        {item.created ? (
          <p className="text-xs text-muted-foreground/80">{new Date(item.created).toLocaleString()}</p>
        ) : null}
      </div>

      <Link
        href={href}
        className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border/60 px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background"
      >
        {actionLabel} <ArrowUpRight className="size-4" />
      </Link>
    </article>
  );
}

type HistoryAdoptionCardProps = {
  item: Extract<HistoryItem, { kind: "adoption" }>;
  onPreview: (title: string, url: string) => void;
};

function HistoryAdoptionCard({ item, onPreview }: HistoryAdoptionCardProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const totalCats = item.cats.length;
  const safeIndex = totalCats ? ((activeIndex % totalCats) + totalCats) % totalCats : 0;
  const activeCat = totalCats ? item.cats[safeIndex] : null;

  useEffect(() => {
    if (totalCats < 2) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % totalCats);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [totalCats]);

  const handlePrev = () => {
    if (!totalCats) return;
    setActiveIndex((prev) => (prev - 1 + totalCats) % totalCats);
  };

  const handleNext = () => {
    if (!totalCats) return;
    setActiveIndex((prev) => (prev + 1) % totalCats);
  };

  const cardTitle = cleanDisplay(item.title);
  const creator = cleanDisplay(item.creator);
  const activeDisplayName = cleanDisplay(activeCat?.catName) || cleanDisplay(activeCat?.label) || cardTitle || "Adoption preview";
  const href = `/adoption/${item.slug}`;

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border/40 bg-background/70 p-4 transition hover:border-primary/40">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border/30 bg-background">
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/65 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
          Batch
        </span>
        {totalCats > 1 && (
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Previous cat"
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80"
          >
            <ChevronLeft className="size-5" />
          </button>
        )}
        {totalCats > 1 && (
          <button
            type="button"
            onClick={handleNext}
            aria-label="Next cat"
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80"
          >
            <ChevronRight className="size-5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (activeCat?.fullUrl) onPreview(activeDisplayName, activeCat.fullUrl);
            else if (activeCat?.previewUrl) onPreview(activeDisplayName, activeCat.previewUrl);
          }}
          className="flex h-full w-full items-center justify-center"
          disabled={!activeCat?.previewUrl && !activeCat?.fullUrl}
        >
          {activeCat?.previewUrl ? (
            <Image
              src={activeCat.previewUrl}
              alt={activeDisplayName}
              width={360}
              height={360}
              unoptimized
              className="h-full w-full object-contain image-render-pixel"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              Preview unavailable
            </div>
          )}
        </button>

      </div>

      <div className="flex flex-col gap-2">
        {cardTitle ? <h2 className="text-base font-semibold text-foreground">{cardTitle}</h2> : null}
        {creator ? <p className="text-xs text-muted-foreground">by {creator}</p> : null}
        {item.created ? (
          <p className="text-xs text-muted-foreground/80">{new Date(item.created).toLocaleString()}</p>
        ) : null}
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <Link
          href={href}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border/60 px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background"
        >
          View batch <ArrowUpRight className="size-4" />
        </Link>
      </div>
    </article>
  );
}
