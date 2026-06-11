"use client";

import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import XIcon from "@/components/ui/x-icon";
import type {
  EvolutionAddition,
  EvolutionRoll,
} from "@/lib/evolution/evolutionGenerator";
import { cn } from "@/lib/utils";
import {
  type ArchetypeTheme,
  archetypeGradient,
  getArchetypeTheme,
  STARTER_THEME,
  withAlpha,
} from "./archetypes";
import {
  buildAdditionChips,
  buildRollDisplayRows,
  pixelFontClass,
  stageRank,
} from "./evolutionDisplay";

export type EvolutionTreeCat = {
  key: string;
  label: string;
  /** Display name (saved cat name, falling back to the generated label). */
  name: string;
  level: number;
  branchLabel: string | null;
  archetype: string | null;
  additions: EvolutionAddition[];
  rolls: EvolutionRoll[];
  previewUrl: string | null;
  href: string | null;
};

type EvolutionTreeProps = {
  cats: EvolutionTreeCat[];
  /** Staggered entrance animation (used right after the ceremony). */
  animateIn?: boolean;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapDialogFocus(event: KeyboardEvent, container: HTMLElement | null) {
  if (event.key !== "Tab" || !container) return;
  const focusable = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function EvolutionTree({ cats, animateIn = false }: EvolutionTreeProps) {
  const [focused, setFocused] = useState<EvolutionTreeCat | null>(null);

  const grouped = useMemo(() => {
    const starter = cats.find((cat) => cat.level === 0) ?? null;
    const branches = new Map<string, EvolutionTreeCat[]>();
    for (const cat of cats) {
      if (cat.level === 0 || !cat.branchLabel) continue;
      const list = branches.get(cat.branchLabel) ?? [];
      list.push(cat);
      branches.set(cat.branchLabel, list);
    }
    return {
      starter,
      branches: Array.from(branches.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([branch, list]) => ({
          branch,
          cats: list.sort((a, b) => a.level - b.level),
        })),
    };
  }, [cats]);

  const entranceClass = animateIn
    ? "animate-in fade-in slide-in-from-bottom-6 duration-700 fill-mode-backwards"
    : undefined;

  return (
    <div className="flex flex-col items-stretch">
      {grouped.starter ? (
        <div className={cn("flex flex-col items-center", entranceClass)}>
          <StarterCard
            cat={grouped.starter}
            onPreview={() => setFocused(grouped.starter)}
          />
          {grouped.branches.length > 0 ? (
            <div
              className="h-10 w-px"
              style={{
                background: `linear-gradient(180deg, ${withAlpha(STARTER_THEME.from, 0.7)}, transparent)`,
              }}
              aria-hidden
            />
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-5">
        {grouped.branches.map((branch, branchIndex) => {
          const theme = getArchetypeTheme(branch.cats[0]?.archetype);
          return (
            <section
              key={branch.branch}
              className={cn("rounded-2xl border p-4 sm:p-5", entranceClass)}
              style={{
                borderColor: withAlpha(theme.to, 0.45),
                background: `linear-gradient(120deg, ${withAlpha(theme.from, 0.08)}, rgba(2, 6, 23, 0.4) 55%)`,
                animationDelay: animateIn
                  ? `${150 + branchIndex * 120}ms`
                  : undefined,
              }}
            >
              <header className="mb-4 flex flex-wrap items-center gap-3">
                <span
                  className="flex size-9 items-center justify-center rounded-lg text-lg"
                  style={{ background: withAlpha(theme.from, 0.15) }}
                  aria-hidden
                >
                  {theme.glyph}
                </span>
                <div className="flex flex-col">
                  <span
                    className={cn(
                      pixelFontClass,
                      "text-[10px] text-foreground",
                    )}
                  >
                    LINE {branch.branch}
                  </span>
                  <span
                    className="bg-clip-text text-sm font-bold text-transparent"
                    style={{ backgroundImage: archetypeGradient(theme) }}
                  >
                    {theme.label}Clan
                  </span>
                </div>
                <span className="ml-auto text-xs text-muted-foreground">
                  {theme.blurb}
                </span>
              </header>
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-stretch">
                {branch.cats.map((cat, catIndex) => (
                  <div key={cat.key} className="contents">
                    {catIndex > 0 ? <Connector theme={theme} /> : null}
                    <TreeCard
                      cat={cat}
                      theme={theme}
                      onPreview={() => setFocused(cat)}
                    />
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {focused ? (
        <CatDetailModal cat={focused} onClose={() => setFocused(null)} />
      ) : null}
    </div>
  );
}

function Connector({ theme }: { theme: ArchetypeTheme }) {
  return (
    <div
      className="flex items-center justify-center self-center py-0.5 sm:py-0"
      aria-hidden
    >
      <span className="sm:hidden text-xs" style={{ color: theme.from }}>
        ▼
      </span>
      <span className="hidden items-center sm:flex">
        <span
          className="h-px w-3 lg:w-5"
          style={{
            background: `linear-gradient(90deg, ${withAlpha(theme.from, 0.2)}, ${theme.from})`,
          }}
        />
        <span className="text-[10px]" style={{ color: theme.from }}>
          ▶
        </span>
      </span>
    </div>
  );
}

function StarterCard({
  cat,
  onPreview,
}: {
  cat: EvolutionTreeCat;
  onPreview: () => void;
}) {
  return (
    <div
      className="flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl border p-4"
      style={{
        borderColor: withAlpha(STARTER_THEME.from, 0.45),
        background: `radial-gradient(circle at 50% 30%, ${withAlpha(STARTER_THEME.from, 0.12)}, rgba(2, 6, 23, 0.5) 75%)`,
      }}
    >
      <span className={cn(pixelFontClass, "text-[10px] text-amber-200")}>
        ★ THE KIT ★
      </span>
      <button
        type="button"
        onClick={onPreview}
        disabled={!cat.previewUrl}
        className="relative size-36 transition hover:scale-105 disabled:cursor-default"
        aria-label={`Preview ${cat.name}`}
      >
        {cat.previewUrl ? (
          <Image
            src={cat.previewUrl}
            alt={cat.name}
            width={288}
            height={288}
            unoptimized
            className="image-render-pixel h-full w-full object-contain"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            Preview unavailable
          </span>
        )}
      </button>
      <div className="flex flex-col items-center gap-1">
        <span className="max-w-full truncate text-sm font-semibold text-foreground">
          {cat.name}
        </span>
        {cat.href ? (
          <Link
            href={cat.href}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
          >
            View cat <ArrowUpRight className="size-3" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

const CHIP_KIND_STYLE: Record<EvolutionAddition["kind"], string> = {
  tortie: "border-fuchsia-300/30 bg-fuchsia-500/10 text-fuchsia-200",
  accessory: "border-sky-300/30 bg-sky-500/10 text-sky-200",
  scar: "border-red-300/30 bg-red-500/10 text-red-200",
  coat: "border-amber-300/30 bg-amber-500/10 text-amber-200",
  replacement: "border-violet-300/30 bg-violet-500/10 text-violet-200",
};

const MAX_VISIBLE_CHIPS = 3;

/** Custom name when set, otherwise the warrior rank instead of the raw label. */
function displayTitle(cat: EvolutionTreeCat) {
  if (cat.name !== cat.label || cat.level === 0) return cat.name;
  return stageRank(cat.level);
}

function TreeCard({
  cat,
  theme,
  onPreview,
}: {
  cat: EvolutionTreeCat;
  theme: ArchetypeTheme;
  onPreview: () => void;
}) {
  const chips = buildAdditionChips(cat.additions, cat.key);
  const visibleChips = chips.slice(0, MAX_VISIBLE_CHIPS);
  const hiddenCount = chips.length - visibleChips.length;

  return (
    <article className="group flex min-w-0 flex-1 flex-col gap-2 rounded-xl border border-border/40 bg-slate-950/60 p-3 transition duration-300 hover:-translate-y-1 hover:border-transparent hover:shadow-lg">
      <button
        type="button"
        onClick={onPreview}
        disabled={!cat.previewUrl}
        className="relative aspect-square overflow-hidden rounded-lg disabled:cursor-default"
        style={{
          background: `radial-gradient(circle at 50% 62%, ${withAlpha(theme.from, 0.18)}, rgba(2, 6, 23, 0.7) 75%)`,
        }}
        aria-label={`Preview ${cat.name}`}
      >
        {cat.previewUrl ? (
          <Image
            src={cat.previewUrl}
            alt={cat.name}
            width={420}
            height={420}
            unoptimized
            className="image-render-pixel h-full w-full object-contain transition duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            Preview unavailable
          </span>
        )}
        <span
          className={cn(
            pixelFontClass,
            "absolute left-2 top-2 rounded-md px-2 py-1 text-[8px] uppercase text-white",
          )}
          style={{ background: withAlpha(theme.to, 0.75) }}
        >
          {stageRank(cat.level)}
        </span>
      </button>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="truncate text-sm font-semibold text-foreground">
          {displayTitle(cat)}
        </span>
        <div className="flex flex-wrap gap-1">
          {visibleChips.map((chip) => (
            <span
              key={chip.id}
              className={cn(
                "max-w-full truncate rounded-full border px-2 py-0.5 text-[10px]",
                CHIP_KIND_STYLE[chip.kind],
              )}
            >
              {chip.text}
            </span>
          ))}
          {hiddenCount > 0 ? (
            <button
              type="button"
              onClick={onPreview}
              className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground transition hover:text-foreground"
            >
              +{hiddenCount} more
            </button>
          ) : null}
          {chips.length === 0 ? (
            <span className="text-[10px] text-muted-foreground">Base form</span>
          ) : null}
        </div>
        {cat.href ? (
          <Link
            href={cat.href}
            className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-primary"
          >
            View cat <ArrowUpRight className="size-3" />
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function CatDetailModal({
  cat,
  onClose,
}: {
  cat: EvolutionTreeCat;
  onClose: () => void;
}) {
  const theme = getArchetypeTheme(cat.archetype);
  const rows = buildRollDisplayRows(
    cat.rolls,
    cat.additions,
    `${cat.key}-modal`,
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = `${cat.key}-preview-title`;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      trapDialogFocus(event, dialogRef.current);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-8 sm:px-6">
      <button
        type="button"
        aria-label="Close preview"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-full w-full max-w-3xl flex-col gap-5 overflow-y-auto rounded-2xl border bg-slate-950/95 p-6 shadow-2xl sm:p-8"
        style={{ borderColor: withAlpha(theme.from, 0.4) }}
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="absolute right-4 top-4 rounded-full border border-border/60 bg-background/80 p-1.5 text-muted-foreground transition hover:bg-foreground hover:text-background"
        >
          <XIcon size={16} />
        </button>
        <header className="flex flex-col items-center gap-1 text-center">
          <span
            className={cn(pixelFontClass, "text-[10px]")}
            style={{ color: theme.from }}
          >
            {cat.level === 0
              ? "★ THE KIT ★"
              : `${theme.glyph} LINE ${cat.branchLabel ?? "?"} · ${stageRank(cat.level).toUpperCase()}`}
          </span>
          <h2 id={titleId} className="text-xl font-semibold text-foreground">
            {displayTitle(cat)}
          </h2>
        </header>
        {cat.previewUrl ? (
          <div
            className="mx-auto w-full max-w-md overflow-hidden rounded-xl"
            style={{
              background: `radial-gradient(circle at 50% 60%, ${withAlpha(theme.from, 0.15)}, rgba(2, 6, 23, 0.8) 75%)`,
            }}
          >
            <Image
              src={cat.previewUrl}
              alt={cat.name}
              width={840}
              height={840}
              unoptimized
              className="image-render-pixel h-auto w-full"
            />
          </div>
        ) : null}
        {rows.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/40 px-3 py-2 text-xs"
              >
                <span className="font-semibold text-muted-foreground">
                  {row.label}
                </span>
                <span className="truncate text-foreground">{row.value}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Base form — no rolled traits.
          </p>
        )}
        {cat.href ? (
          <Link
            href={cat.href}
            className="mx-auto inline-flex items-center gap-2 rounded-xl border border-border/60 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-foreground hover:text-background"
          >
            Open cat page <ArrowUpRight className="size-4" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
