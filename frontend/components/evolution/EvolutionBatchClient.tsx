"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowUpRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  type AdoptionMetadata,
  AdoptionMetadataPanel,
} from "@/components/adoption/AdoptionMetadataPanel";
import ArrowBackIcon from "@/components/ui/arrow-back-icon";
import TriangleAlertIcon from "@/components/ui/triangle-alert-icon";
import { api } from "@/convex/_generated/api";
import { toId } from "@/convex/utils";
import { encodeCatShare } from "@/lib/catShare";
import { generateLineageNames } from "@/lib/evolution/clanNames";
import {
  getEvolutionMeta,
  isEvolutionBatchSettings,
} from "@/lib/evolution/evolutionGenerator";
import { cn } from "@/lib/utils";
import { getArchetypeTheme, STARTER_THEME, withAlpha } from "./archetypes";
import { EvolutionTree, type EvolutionTreeCat } from "./EvolutionTree";
import { pixelFontClass, stageRank } from "./evolutionDisplay";
import { NameField } from "./NameField";

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
  const updateBatchMeta = useMutation(api.adoption.updateBatchMeta);
  const updateProfileMeta = useMutation(api.mapper.updateMeta);
  const record = useQuery(api.adoption.getBySlug, { slugOrId: slug }) as
    | EvolutionBatchRecord
    | null
    | undefined;
  const [metadataMessage, setMetadataMessage] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataSaving, setMetadataSaving] = useState(false);

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

  const handleCatNameSave = async (cat: EvolutionTreeCat, catName: string) => {
    const source = record.cats.find(
      (item) => `${item.index}-${item.label}` === cat.key,
    );
    if (!source?.profileId) {
      throw new Error("This cat has no saved profile.");
    }
    await updateProfileMeta({
      id: toId("cat_profile", source.profileId),
      catName,
      editToken: source.editToken ?? undefined,
    });
  };

  const handleAutoname = async () => {
    const names = generateLineageNames(
      treeCats.map((cat) => ({
        key: cat.key,
        level: cat.level,
        branchLabel: cat.branchLabel,
        archetype: cat.archetype,
      })),
    );
    const updates = treeCats.flatMap((cat) => {
      const name = names.get(cat.key);
      if (!name) return [];
      const source = record.cats.find(
        (item) => `${item.index}-${item.label}` === cat.key,
      );
      if (!source?.profileId) {
        throw new Error("One or more cats have no saved profile.");
      }
      return [
        {
          profileId: source.profileId,
          name,
          editToken: source.editToken ?? undefined,
        },
      ];
    });
    for (const update of updates) {
      await updateProfileMeta({
        id: toId("cat_profile", update.profileId),
        catName: update.name,
        editToken: update.editToken,
      });
    }
  };

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

      <AdoptionMetadataPanel
        savedValue={metadataValue}
        onSave={handleMetadataSave}
        busy={metadataSaving}
        message={metadataMessage}
        error={metadataError}
        canSave
      />

      <CatNameEditor
        cats={treeCats}
        onSave={handleCatNameSave}
        onAutoname={handleAutoname}
      />
    </div>
  );
}

function storedName(cat: EvolutionTreeCat) {
  return cat.name === cat.label ? "" : cat.name;
}

function CatNameEditor({
  cats,
  onSave,
  onAutoname,
}: {
  cats: EvolutionTreeCat[];
  onSave: (cat: EvolutionTreeCat, catName: string) => Promise<void>;
  onAutoname?: () => Promise<void>;
}) {
  const [autonaming, setAutonaming] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [nameError, setNameError] = useState<string | null>(null);
  if (!cats.length) return null;

  const draftFor = (cat: EvolutionTreeCat) =>
    drafts[cat.key] ?? storedName(cat);
  const isDirty = (cat: EvolutionTreeCat) =>
    draftFor(cat).trim() !== storedName(cat).trim();
  const dirtyCats = cats.filter(isDirty);

  const starter = cats.find((cat) => cat.level === 0) ?? null;
  const lines: Array<{
    branchLabel: string;
    archetype: string | null;
    cats: EvolutionTreeCat[];
  }> = [];
  for (const cat of cats) {
    if (cat.level === 0 || !cat.branchLabel) continue;
    let line = lines.find((entry) => entry.branchLabel === cat.branchLabel);
    if (!line) {
      line = {
        branchLabel: cat.branchLabel,
        archetype: cat.archetype,
        cats: [],
      };
      lines.push(line);
    }
    line.cats.push(cat);
  }
  for (const line of lines) {
    line.cats.sort((a, b) => a.level - b.level);
  }

  const runAutoname = async () => {
    if (!onAutoname) return;
    setNameError(null);
    try {
      setAutonaming(true);
      await onAutoname();
      setDrafts({});
    } catch (error) {
      console.error("Failed to autoname lineage", error);
      setNameError("Failed to autoname lineage. Drafts were kept.");
    } finally {
      setAutonaming(false);
    }
  };

  const saveAll = async () => {
    setNameError(null);
    setSavingAll(true);
    try {
      for (const cat of dirtyCats) {
        await onSave(cat, draftFor(cat));
      }
      setDrafts({});
    } catch (error) {
      console.error("Failed to save all names", error);
      setNameError("Failed to save names. Drafts were kept.");
    } finally {
      setSavingAll(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border/40 bg-background/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">
          Name the lineage
        </span>
        <div className="flex items-center gap-2">
          {onAutoname ? (
            <button
              type="button"
              onClick={runAutoname}
              disabled={autonaming || savingAll}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-300/50 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-400/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {autonaming ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <span aria-hidden>✨</span>
              )}
              Autoname
            </button>
          ) : null}
          <button
            type="button"
            onClick={saveAll}
            disabled={dirtyCats.length === 0 || savingAll || autonaming}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-300/50 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/25 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingAll ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Save all
            {dirtyCats.length > 0 ? ` (${dirtyCats.length})` : ""}
          </button>
        </div>
      </div>
      {nameError ? (
        <p
          role="alert"
          className="mb-3 flex items-center gap-2 text-xs text-red-300"
        >
          <TriangleAlertIcon size={14} /> {nameError}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        {starter ? (
          <div className="flex items-center gap-2">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border text-base"
              style={{
                borderColor: withAlpha(STARTER_THEME.from, 0.5),
                background: withAlpha(STARTER_THEME.to, 0.15),
              }}
              title="The Kit"
              aria-hidden
            >
              {STARTER_THEME.glyph}
            </span>
            <NameField
              value={draftFor(starter)}
              label="Name the kit"
              placeholder="Kit"
              previewUrl={starter.previewUrl}
              onChange={(value) => {
                setNameError(null);
                setDrafts((previous) => ({
                  ...previous,
                  [starter.key]: value,
                }));
              }}
            />
          </div>
        ) : null}
        {lines.map((line) => {
          const theme = getArchetypeTheme(line.archetype);
          return (
            <div key={line.branchLabel} className="flex items-center gap-2">
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-lg border text-base"
                style={{
                  borderColor: withAlpha(theme.from, 0.5),
                  background: withAlpha(theme.to, 0.15),
                }}
                title={`${theme.label}Clan — Line ${line.branchLabel}`}
                aria-hidden
              >
                {theme.glyph}
              </span>
              {line.cats.map((cat) => (
                <NameField
                  key={cat.key}
                  value={draftFor(cat)}
                  label={`Name ${getArchetypeTheme(cat.archetype).label}Clan ${stageRank(cat.level)} in line ${line.branchLabel}`}
                  placeholder={stageRank(cat.level)}
                  previewUrl={cat.previewUrl}
                  onChange={(value) => {
                    setNameError(null);
                    setDrafts((previous) => ({
                      ...previous,
                      [cat.key]: value,
                    }));
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
