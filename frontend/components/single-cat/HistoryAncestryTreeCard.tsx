"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Trees, ChevronLeft } from "lucide-react";
import LockIcon from "@/components/ui/lock-icon";
import RightChevron from "@/components/ui/right-chevron";
import { encodeCatShare } from "@/lib/catShare";

type TreePreviewCat = {
  id: string;
  name: string;
  params: Record<string, unknown>;
};

type HistoryTreeItem = {
  kind: "tree";
  id: string;
  title: string;
  creator: string | null;
  created: number | null;
  slug: string;
  catCount: number;
  depth: number;
  hasPassword: boolean;
  previewCats: TreePreviewCat[];
};

type HistoryAncestryTreeCardProps = {
  item: HistoryTreeItem;
  onPreview: (title: string, url: string) => void;
};

function getPreviewUrlFromParams(params: Record<string, unknown>): string {
  const tortieSlots = params?.tortie as Array<Record<string, unknown> | null> | undefined;
  const encoded = encodeCatShare({
    params,
    accessorySlots: (params?.accessories as string[]) ?? [],
    scarSlots: (params?.scars as string[]) ?? [],
    tortieSlots: tortieSlots ?? [],
    counts: {
      accessories: ((params?.accessories as string[])?.length ?? 0),
      scars: ((params?.scars as string[])?.length ?? 0),
      tortie: (tortieSlots?.length ?? 0),
    },
  });
  return `/api/preview/_?cat=${encodeURIComponent(encoded)}`;
}

export function HistoryAncestryTreeCard({ item, onPreview }: HistoryAncestryTreeCardProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const totalCats = item.previewCats.length;
  const safeIndex = totalCats ? ((activeIndex % totalCats) + totalCats) % totalCats : 0;
  const activeCat = totalCats ? item.previewCats[safeIndex] : null;

  useEffect(() => {
    if (totalCats < 2) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % totalCats);
    }, 4000);
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

  const cardTitle = item.title || "Ancestry Tree";
  const creator = item.creator;
  const activePreviewUrl = activeCat ? getPreviewUrlFromParams(activeCat.params) : null;
  const activeDisplayName = activeCat?.name || cardTitle;
  const href = `/ancestry-tree/${item.slug}`;
  const generations = item.depth + 1;

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border/40 bg-background/70 p-4 transition hover:border-primary/40">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border/30 bg-background">
        <span className="absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-green-900/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-green-100">
          <Trees className="size-3" />
          Tree
        </span>
        {item.hasPassword && (
          <span className="absolute right-3 top-3 z-10" title="Password protected">
            <LockIcon size={16} className="text-amber-400" />
          </span>
        )}
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
            <RightChevron size={20} />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (activePreviewUrl) onPreview(activeDisplayName, activePreviewUrl);
          }}
          className="flex h-full w-full items-center justify-center"
          disabled={!activePreviewUrl}
        >
          {activePreviewUrl ? (
            <Image
              src={activePreviewUrl}
              alt={activeDisplayName}
              width={360}
              height={360}
              unoptimized
              className="h-full w-full object-contain image-render-pixel"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
              <Trees className="size-8 opacity-50" />
              No cats yet
            </div>
          )}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-foreground">{cardTitle}</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{item.catCount} cats</span>
          <span className="text-white/20">•</span>
          <span>{generations} gen{generations !== 1 ? "s" : ""}</span>
        </div>
        {creator && <p className="text-xs text-muted-foreground">by {creator}</p>}
        {item.created && (
          <p className="text-xs text-muted-foreground/80">{new Date(item.created).toLocaleString()}</p>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <Link
          href={href}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border/60 px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background"
        >
          View tree <ArrowUpRight className="size-4" />
        </Link>
      </div>
    </article>
  );
}
