"use client";

import { useQuery } from "convex/react";
import { ArrowUpRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import ArrowBackIcon from "@/components/ui/arrow-back-icon";
import TriangleAlertIcon from "@/components/ui/triangle-alert-icon";
import { api } from "@/convex/_generated/api";
import { encodeCatShare } from "@/lib/catShare";
import {
  getEvolutionMeta,
  isEvolutionBatchSettings,
} from "@/lib/evolution/evolutionGenerator";
import { cn } from "@/lib/utils";
import { EvolutionTree, type EvolutionTreeCat } from "./EvolutionTree";
import { pixelFontClass } from "./evolutionDisplay";

type EvolutionBatchClientProps = {
  slug: string;
};

type EvolutionBatchRecord = {
  id: string;
  slug?: string | null;
  title?: string | null;
  creatorName?: string | null;
  settings?: Record<string, unknown> | null;
  cats: EvolutionCatRecord[];
  created?: number | null;
  updated?: number | null;
};

type EvolutionCatRecord = {
  index: number;
  label: string;
  catData: Record<string, unknown>;
  profileId?: string | null;
  encoded?: string | null;
  shareToken?: string | null;
  editToken?: string | null;
  catName?: string | null;
  creatorName?: string | null;
  previews?: {
    tiny?: { url: string | null } | null;
    preview?: { url: string | null } | null;
    full?: { url: string | null } | null;
  } | null;
};

function cleanDisplay(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function getPreviewUrl(
  profileId: string | null,
  encodedCatData: string | null,
  previews?: {
    tiny?: { url: string | null } | null;
    preview?: { url: string | null } | null;
    full?: { url: string | null } | null;
  },
) {
  const cached =
    previews?.preview?.url ??
    previews?.full?.url ??
    previews?.tiny?.url ??
    null;
  if (cached) return cached;
  if (encodedCatData) {
    return `/api/preview/_?cat=${encodeURIComponent(encodedCatData)}`;
  }
  if (profileId) return `/api/preview/${profileId}`;
  return null;
}

function formatTimestamp(value?: number | null) {
  if (!value) return null;
  return new Date(value).toLocaleString();
}

export function EvolutionBatchClient({ slug }: EvolutionBatchClientProps) {
  const record = useQuery(api.adoptionV2.getBySlug, { slugOrId: slug }) as
    | EvolutionBatchRecord
    | null
    | undefined;

  const treeCats = useMemo<EvolutionTreeCat[]>(() => {
    if (!record?.cats?.length) return [];
    return record.cats.map((cat) => {
      let encoded = cat.encoded ?? null;
      if ((!encoded || encoded.length === 0) && cat.catData) {
        try {
          encoded = encodeCatShare(
            cat.catData as unknown as Parameters<typeof encodeCatShare>[0],
          );
        } catch (error) {
          console.warn("Failed to encode evolution cat payload", error);
          encoded = null;
        }
      }
      const href = cat.shareToken
        ? `/view/${cat.shareToken}`
        : encoded
          ? `/view?cat=${encoded}`
          : null;
      const meta = getEvolutionMeta(cat.catData);
      return {
        key: `${cat.index}-${cat.label}`,
        label: cat.label,
        name: cleanDisplay(cat.catName) || cat.label,
        level: Number(meta?.level ?? 0),
        branchLabel: meta?.branchLabel ?? null,
        archetype: meta?.archetype ?? null,
        additions: meta?.additions ?? [],
        rolls: meta?.rolls ?? [],
        previewUrl: getPreviewUrl(
          cat.profileId ?? null,
          encoded,
          cat.previews ?? undefined,
        ),
        href,
      };
    });
  }, [record]);

  if (record === undefined) {
    return (
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center gap-3 px-6 py-16 text-muted-foreground">
        <Loader2 className="size-6 animate-spin text-primary" />
        <span className="text-sm">Loading evolution batch</span>
      </div>
    );
  }

  if (record === null || !isEvolutionBatchSettings(record.settings)) {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 px-6 py-16 text-center text-muted-foreground">
        <TriangleAlertIcon size={32} className="text-red-300" />
        <p className="text-base">That evolution batch could not be found.</p>
        <Link
          href="/history"
          className="inline-flex items-center gap-2 text-sm text-primary"
        >
          <ArrowBackIcon size={16} /> Return to history
        </Link>
      </div>
    );
  }

  const title = cleanDisplay(record.title) || "Evolution Batch";
  const creator = cleanDisplay(record.creatorName);
  const formattedDate = formatTimestamp(record.created);
  const shareUrl = record.slug ? `/evolution/${record.slug}` : null;
  const lineCount = new Set(
    treeCats.map((cat) => cat.branchLabel).filter(Boolean),
  ).size;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-12 sm:px-6 lg:px-8">
      <section className="relative overflow-hidden rounded-3xl border border-violet-500/25 bg-slate-950 p-6 sm:p-8">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 70% at 10% 0%, rgba(168, 85, 247, 0.16), transparent 60%), radial-gradient(ellipse 55% 65% at 90% 20%, rgba(251, 146, 60, 0.13), transparent 60%)",
          }}
          aria-hidden
        />
        <div className="relative">
          <Link
            href="/history"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground transition hover:text-foreground"
          >
            <ArrowBackIcon size={12} /> History
          </Link>
          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className={cn(pixelFontClass, "text-[10px] text-violet-300")}>
                EVOLUTION LINEAGE
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">
                {title}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {creator ? `Created by ${creator}` : "Evolution Lines"}
                {formattedDate ? ` • ${formattedDate}` : null}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span
                className={cn(
                  pixelFontClass,
                  "rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-[9px]",
                )}
              >
                {treeCats.length} FORMS
              </span>
              <span
                className={cn(
                  pixelFontClass,
                  "rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-[9px]",
                )}
              >
                {lineCount} LINES
              </span>
              {shareUrl ? (
                <Link
                  href={shareUrl}
                  className="inline-flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 font-semibold text-foreground transition hover:bg-foreground hover:text-background"
                >
                  Share <ArrowUpRight className="size-3" />
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <EvolutionTree cats={treeCats} />
    </div>
  );
}
