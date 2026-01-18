"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AlertTriangle, ArrowLeft, ArrowUpRight, Loader2, Lock, Trees, X } from "lucide-react";
import { encodeCatShare } from "@/lib/catShare";

interface TreeCat {
  id: string;
  name: {
    prefix: string;
    suffix: string;
    full: string;
  };
  gender: "M" | "F";
  lifeStage: string;
  params: Record<string, unknown>;
  generation: number;
}

interface AncestryTreeRecord {
  _id: string;
  slug: string;
  name: string;
  cats: TreeCat[];
  config: {
    depth: number;
    minChildren: number;
    maxChildren: number;
    genderRatio: number;
  };
  creatorName?: string;
  hasPassword: boolean;
  createdAt: number;
  updatedAt: number;
}

type AncestryTreeViewClientProps = {
  slug: string;
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

function formatTimestamp(created?: number): string | null {
  if (!created) return null;
  const date = new Date(created);
  return date.toLocaleString();
}

export function AncestryTreeViewClient({ slug }: AncestryTreeViewClientProps) {
  const record = useQuery(api.ancestryTree.getBySlug, { slug }) as AncestryTreeRecord | null | undefined;
  const [focusedPreview, setFocusedPreview] = useState<{ label: string; url: string } | null>(null);
  const [groupByGeneration, setGroupByGeneration] = useState(true);

  const enrichedCats = useMemo(() => {
    if (!record?.cats?.length) return [];
    return record.cats.map((cat) => ({
      ...cat,
      previewUrl: getPreviewUrlFromParams(cat.params),
    }));
  }, [record]);

  const catsByGeneration = useMemo(() => {
    if (!groupByGeneration) return null;
    const groups: Record<number, typeof enrichedCats> = {};
    for (const cat of enrichedCats) {
      const gen = cat.generation;
      if (!groups[gen]) groups[gen] = [];
      groups[gen].push(cat);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([gen, cats]) => ({ generation: Number(gen), cats }));
  }, [enrichedCats, groupByGeneration]);

  const formattedDate = formatTimestamp(record?.createdAt);
  const treeName = record?.name?.trim() || "Ancestry Tree";
  const treeCreator = record?.creatorName?.trim() || null;
  const treeUrl = `/projects/warrior-cats/ancestry-tree/${slug}`;
  const generations = (record?.config?.depth ?? 0) + 1;

  if (record === undefined) {
    return (
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center gap-3 px-6 py-16 text-muted-foreground">
        <Loader2 className="size-6 animate-spin text-primary" />
        <span className="text-sm">Loading ancestry tree...</span>
      </div>
    );
  }

  if (record === null) {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 px-6 py-16 text-center text-muted-foreground">
        <AlertTriangle className="size-8 text-red-300" />
        <p className="text-base">That ancestry tree could not be found.</p>
        <Link href="/history" className="inline-flex items-center gap-2 text-sm text-primary">
          <ArrowLeft className="size-4" /> Back to History
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-green-500/30 bg-gradient-to-br from-green-500/15 via-slate-950 to-slate-950 p-8 text-balance shadow-[0_0_40px_rgba(34,197,94,0.15)]">
        <Link href="/history" className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-green-200/80 transition hover:text-green-100">
          <ArrowLeft className="size-3" /> Back to History
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <Trees className="size-8 text-green-400" />
          <h1 className="text-4xl font-semibold text-white sm:text-5xl">{treeName}</h1>
          {record.hasPassword && (
            <span title="Password protected">
              <Lock className="size-5 text-amber-400" />
            </span>
          )}
        </div>
        <p className="mt-3 max-w-2xl text-sm text-neutral-200/85 sm:text-base">
          {treeCreator ? `Created by ${treeCreator}` : "Generated in the ancestry tree builder"}
          {formattedDate ? ` • ${formattedDate}` : null}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-neutral-200/80">
          <span className="rounded-full border border-green-400/30 bg-slate-950/60 px-3 py-1">
            {enrichedCats.length.toLocaleString()} cats
          </span>
          <span className="rounded-full border border-green-400/30 bg-slate-950/60 px-3 py-1">
            {generations} generation{generations !== 1 ? "s" : ""}
          </span>
          <Link
            href={treeUrl}
            className="inline-flex items-center gap-2 rounded-full border border-green-400/40 bg-green-500/20 px-4 py-2 text-xs font-semibold text-green-100 transition hover:bg-green-500/25"
          >
            Open Tree <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">All Cats</h2>
          <button
            type="button"
            onClick={() => setGroupByGeneration(!groupByGeneration)}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
              groupByGeneration
                ? "border-primary/60 bg-primary/20 text-foreground"
                : "border-border/60 bg-background/70 text-muted-foreground"
            }`}
          >
            Group by generation
          </button>
        </div>

        {enrichedCats.length === 0 ? (
          <div className="rounded-3xl border border-border/40 bg-background/50 p-10 text-center text-sm text-muted-foreground">
            No cats in this tree yet.
          </div>
        ) : groupByGeneration && catsByGeneration ? (
          <div className="flex flex-col gap-8">
            {catsByGeneration.map(({ generation, cats }) => (
              <div key={generation} className="flex flex-col gap-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Generation {generation + 1}
                  <span className="ml-2 font-normal text-muted-foreground/60">({cats.length} cats)</span>
                </h3>
                <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {cats.map((cat) => (
                    <CatCard
                      key={cat.id}
                      cat={cat}
                      onPreview={(label, url) => setFocusedPreview({ label, url })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {enrichedCats.map((cat) => (
              <CatCard
                key={cat.id}
                cat={cat}
                onPreview={(label, url) => setFocusedPreview({ label, url })}
              />
            ))}
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

type CatCardProps = {
  cat: {
    id: string;
    name: { full: string };
    gender: "M" | "F";
    generation: number;
    previewUrl: string;
  };
  onPreview: (label: string, url: string) => void;
};

function CatCard({ cat, onPreview }: CatCardProps) {
  const displayName = cat.name.full || "Unnamed";
  const genderIcon = cat.gender === "F" ? "♀" : "♂";
  const genderColor = cat.gender === "F" ? "text-pink-400" : "text-blue-400";

  return (
    <article className="flex flex-col gap-2 rounded-xl border border-border/40 bg-background/70 p-3 transition hover:border-primary/40">
      <button
        type="button"
        onClick={() => onPreview(displayName, cat.previewUrl)}
        className="relative aspect-square w-full overflow-hidden rounded-lg border border-border/30 bg-background transition hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        <Image
          src={cat.previewUrl}
          alt={displayName}
          width={200}
          height={200}
          unoptimized
          className="h-full w-full object-contain image-render-pixel"
        />
      </button>
      <div className="flex items-center justify-between gap-2 text-center">
        <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
        <span className={`text-sm ${genderColor}`}>{genderIcon}</span>
      </div>
    </article>
  );
}
