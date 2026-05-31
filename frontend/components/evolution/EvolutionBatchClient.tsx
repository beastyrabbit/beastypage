"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowUpRight, GitBranch, Loader2, Save } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  type AdoptionMetadata,
  AdoptionMetadataPanel,
} from "@/components/adoption/AdoptionMetadataPanel";
import ArrowBackIcon from "@/components/ui/arrow-back-icon";
import TriangleAlertIcon from "@/components/ui/triangle-alert-icon";
import XIcon from "@/components/ui/x-icon";
import { api } from "@/convex/_generated/api";
import { toId } from "@/convex/utils";
import { encodeCatShare } from "@/lib/catShare";
import {
  getEvolutionMeta,
  getTortieLayerParts,
  isEvolutionBatchSettings,
  type EvolutionAddition,
  type EvolutionRoll,
} from "@/lib/evolution/evolutionGenerator";

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
  catName?: string | null;
  creatorName?: string | null;
  previews?: {
    tiny?: { url: string | null } | null;
    preview?: { url: string | null } | null;
    full?: { url: string | null } | null;
  } | null;
};

type EnrichedCat = EvolutionCatRecord & {
  encodedFinal: string | null;
  viewerUrl: string | null;
  previewUrl: string | null;
  fullUrl: string | null;
  branchLabel: string | null;
  level: number;
  archetype: string | null;
  additions: EvolutionAddition[];
  rolls: EvolutionRoll[];
};

type AdditionDisplayRow = {
  id: string;
  label: string;
  value: string;
};

function cleanDisplay(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function formatValue(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatAddition(addition: EvolutionAddition) {
  if (addition.kind === "tortie") {
    return [
      addition.value.mask,
      addition.value.pattern,
      addition.value.colour,
    ]
      .filter(Boolean)
      .map((value) => formatValue(value ?? ""))
      .join(" / ");
  }
  return formatValue(addition.value);
}

function getTortieParts(addition: Extract<EvolutionAddition, { kind: "tortie" }>) {
  return addition.parts?.length > 0
    ? addition.parts
    : getTortieLayerParts(addition.value);
}

function buildAdditionDisplayRows(
  additions: EvolutionAddition[],
  idPrefix: string,
): AdditionDisplayRow[] {
  let tortieLayerIndex = 0;
  return additions.flatMap((addition, additionIndex) => {
    if (addition.kind === "tortie") {
      tortieLayerIndex += 1;
      const layerLabel = `Tortie ${tortieLayerIndex}`;
      return getTortieParts(addition).map((part) => ({
        id: `${idPrefix}-${additionIndex}-${part.kind}`,
        label: `${layerLabel} ${part.label}`,
        value: formatValue(part.value),
      }));
    }
    return [
      {
        id: `${idPrefix}-${additionIndex}-${addition.kind}`,
        label: addition.kind === "accessory" ? "Accessory" : "Scar",
        value: formatAddition(addition),
      },
    ];
  });
}

function buildRollDisplayRows(
  rolls: EvolutionRoll[] | undefined,
  additions: EvolutionAddition[],
  idPrefix: string,
): AdditionDisplayRow[] {
  if (!rolls?.length) return buildAdditionDisplayRows(additions, idPrefix);
  return rolls.map((roll, index) => {
    if (roll.kind === "tortie-count") {
      return {
        id: `${idPrefix}-roll-${index}`,
        label: roll.label,
        value:
          roll.range.min === roll.range.max
            ? String(roll.value)
            : `${roll.value} from ${roll.range.min}-${roll.range.max}`,
      };
    }
    return {
      id: `${idPrefix}-roll-${index}`,
      label: roll.label,
      value: formatValue(String(roll.value)),
    };
  });
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
  const updateBatchMeta = useMutation(api.adoption.updateBatchMeta);
  const updateProfileMeta = useMutation(api.mapper.updateMeta);
  const record = useQuery(api.adoption.getBySlug, { slugOrId: slug }) as
    | EvolutionBatchRecord
    | null
    | undefined;
  const [focusedPreview, setFocusedPreview] = useState<{
    label: string;
    url: string;
  } | null>(null);
  const [metadataMessage, setMetadataMessage] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataSaving, setMetadataSaving] = useState(false);

  const enrichedCats = useMemo(() => {
    if (!record?.cats?.length) return [] as EnrichedCat[];
    const origin = typeof window !== "undefined" ? window.location.origin : "";
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
      const viewerUrl = cat.shareToken
        ? origin
          ? `${origin}/view/${cat.shareToken}`
          : `/view/${cat.shareToken}`
        : encoded
          ? origin
            ? `${origin}/view?cat=${encoded}`
            : `/view?cat=${encoded}`
          : null;
      const previewUrl = getPreviewUrl(
        cat.profileId ?? null,
        encoded,
        cat.previews ?? undefined,
      );
      const meta = getEvolutionMeta(cat.catData);
      return {
        ...cat,
        encodedFinal: encoded,
        viewerUrl,
        previewUrl,
        fullUrl: previewUrl,
        branchLabel: meta?.branchLabel ?? null,
        level: Number(meta?.level ?? 0),
        archetype: meta?.archetype ?? null,
        additions: meta?.additions ?? [],
        rolls: meta?.rolls ?? [],
      };
    });
  }, [record]);

  const grouped = useMemo(() => {
    const starter =
      enrichedCats.find((cat) => cat.level === 0) ?? enrichedCats[0] ?? null;
    const branches = new Map<string, EnrichedCat[]>();
    for (const cat of enrichedCats) {
      if (cat.level === 0 || !cat.branchLabel) continue;
      const list = branches.get(cat.branchLabel) ?? [];
      list.push(cat);
      branches.set(cat.branchLabel, list);
    }
    return {
      starter,
      branches: Array.from(branches.entries()).map(([branch, cats]) => ({
        branch,
        cats: cats.sort((a, b) => a.level - b.level),
      })),
    };
  }, [enrichedCats]);

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
  const metadataValue: AdoptionMetadata = {
    title: record.title ?? "",
    creator: record.creatorName ?? "",
  };

  const handleMetadataSave = async (nextMetadata: AdoptionMetadata) => {
    try {
      setMetadataSaving(true);
      setMetadataError(null);
      setMetadataMessage(null);
      await updateBatchMeta({
        id: toId("adoption_batch", record.id),
        title: nextMetadata.title,
        creatorName: nextMetadata.creator,
      });
      setMetadataMessage("Saved");
    } catch (error) {
      console.error("Failed to update evolution batch metadata", error);
      setMetadataError("Failed to save metadata.");
    } finally {
      setMetadataSaving(false);
    }
  };

  const handleCatNameSave = async (cat: EnrichedCat, catName: string) => {
    if (!cat.profileId) return;
    await updateProfileMeta({
      id: toId("cat_profile", cat.profileId),
      catName,
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-12 sm:px-6 lg:px-8">
      <section className="rounded-2xl border border-border/40 bg-background/70 p-6">
        <Link
          href="/history"
          className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground transition hover:text-foreground"
        >
          <ArrowBackIcon size={12} /> History
        </Link>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">
              {title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {creator ? `Created by ${creator}` : "Evolution Lines"}
              {formattedDate ? ` • ${formattedDate}` : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-lg border border-border/50 bg-background px-3 py-2">
              {enrichedCats.length} forms
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
      </section>

      <AdoptionMetadataPanel
        savedValue={metadataValue}
        onSave={handleMetadataSave}
        busy={metadataSaving}
        message={metadataMessage}
        error={metadataError}
        canSave
      />

      {grouped.starter ? (
        <EvolutionDetailCard
          cat={grouped.starter}
          onPreview={setFocusedPreview}
          prominent
        />
      ) : null}

      <section className="grid gap-5 lg:grid-cols-2">
        {grouped.branches.map((branch) => (
          <div
            key={branch.branch}
            className="rounded-2xl border border-border/40 bg-background/70 p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <GitBranch className="size-4 text-primary" /> Branch {branch.branch}
              </h2>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {branch.cats[0]?.archetype ?? "evolution"}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {branch.cats.map((cat) => (
                <EvolutionDetailCard
                  key={`${cat.index}-${cat.label}`}
                  cat={cat}
                  onPreview={setFocusedPreview}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      <CatNameEditor cats={enrichedCats} onSave={handleCatNameSave} />

      {focusedPreview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6 py-10">
          <button
            type="button"
            aria-label="Close preview"
            className="absolute inset-0 cursor-default"
            onClick={() => setFocusedPreview(null)}
          />
          <div className="relative w-full max-w-4xl rounded-2xl border border-border/40 bg-background/95 p-8 shadow-2xl">
            <button
              type="button"
              onClick={() => setFocusedPreview(null)}
              aria-label="Close preview"
              className="absolute right-4 top-4 rounded-full border border-border/60 bg-background/80 p-1.5 text-muted-foreground transition hover:bg-foreground hover:text-background"
            >
              <XIcon size={16} />
            </button>
            <div className="flex flex-col items-center gap-6">
              <h2 className="text-xl font-semibold text-foreground">
                {focusedPreview.label}
              </h2>
              <div className="w-full overflow-hidden rounded-xl border border-border/40 bg-background/80">
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
      ) : null}
    </div>
  );
}

function EvolutionDetailCard({
  cat,
  onPreview,
  prominent = false,
}: {
  cat: EnrichedCat;
  onPreview: (preview: { label: string; url: string }) => void;
  prominent?: boolean;
}) {
  const title = cleanDisplay(cat.catName) || cat.label;
  const preview = cat.previewUrl ?? cat.fullUrl;
  const additionRows = buildRollDisplayRows(
    cat.rolls,
    cat.additions,
    `${cat.index}-summary`,
  );

  return (
    <article
      className={`flex flex-col gap-3 rounded-xl border border-border/40 bg-background p-3 ${
        prominent ? "sm:grid sm:grid-cols-[190px_minmax(0,1fr)] sm:items-center" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => {
          if (preview) onPreview({ label: title, url: preview });
        }}
        disabled={!preview}
        className="relative aspect-square overflow-hidden rounded-lg border border-border/30 bg-slate-950/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {preview ? (
          <Image
            src={preview}
            alt={title}
            width={420}
            height={420}
            unoptimized
            className="h-full w-full object-contain image-render-pixel"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            Preview unavailable
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-md bg-black/65 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
          {cat.level === 0 ? "Starter" : `E${cat.level}`}
        </span>
      </button>
      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
        {cat.archetype ? (
          <p className="text-xs text-muted-foreground">
            {formatValue(cat.archetype)}
          </p>
        ) : null}
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          {additionRows.length > 0 ? (
            additionRows.slice(0, 6).map((row) => (
              <span key={row.id} className="truncate">
                {row.label}: {row.value}
              </span>
            ))
          ) : (
            <span>Base form</span>
          )}
        </div>
        {cat.viewerUrl ? (
          <Link
            href={cat.viewerUrl}
            className="mt-auto inline-flex items-center gap-2 text-xs font-semibold text-primary"
          >
            View cat <ArrowUpRight className="size-3" />
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function CatNameEditor({
  cats,
  onSave,
}: {
  cats: EnrichedCat[];
  onSave: (cat: EnrichedCat, catName: string) => Promise<void>;
}) {
  const editable = cats.filter((cat) => cat.profileId);
  if (!editable.length) return null;

  return (
    <section className="rounded-2xl border border-border/40 bg-background/70 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Save className="size-4 text-primary" /> Cat names
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {editable.map((cat) => (
          <CatNameRow key={`${cat.index}-${cat.profileId}`} cat={cat} onSave={onSave} />
        ))}
      </div>
    </section>
  );
}

function CatNameRow({
  cat,
  onSave,
}: {
  cat: EnrichedCat;
  onSave: (cat: EnrichedCat, catName: string) => Promise<void>;
}) {
  const [name, setName] = useState(cat.catName ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dirty = name.trim() !== (cat.catName ?? "").trim();

  const submit = async () => {
    try {
      setSaving(true);
      setMessage(null);
      await onSave(cat, name);
      setMessage("Saved");
      window.setTimeout(() => setMessage(null), 1800);
    } finally {
      setSaving(false);
    }
  };

  return (
    <label className="flex flex-col gap-2 text-xs text-muted-foreground">
      {cat.label}
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Cat name"
          className="min-w-0 flex-1 rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!dirty || saving}
          className="inline-flex w-20 items-center justify-center rounded-lg border border-border/60 px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-3 animate-spin" /> : "Save"}
        </button>
      </div>
      {message ? <span className="text-emerald-300">{message}</span> : null}
    </label>
  );
}
