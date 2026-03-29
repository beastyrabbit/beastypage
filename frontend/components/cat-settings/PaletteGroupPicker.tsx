"use client";

import { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ADDITIONAL_PALETTES, patternToCssBackground } from "@/lib/palettes";
import type { PaletteGroup, PaletteCategory, PatternDefinition } from "@/lib/palettes/types";
import type { ExtendedMode } from "@/utils/singleCatVariants";
import PaintIcon from "@/components/ui/paint-icon";

// ---------------------------------------------------------------------------
// Filter groups — mirrors the cat-color-palettes page
// ---------------------------------------------------------------------------

type FilterValue = "all" | PaletteGroup;

const FILTER_PILLS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "solid", label: "Solid Colors" },
  { value: "anime", label: "Anime & Film" },
  { value: "textile", label: "Textile" },
  { value: "ornate", label: "Ornate" },
  { value: "heritage", label: "World Heritage" },
  { value: "flags", label: "Flags" },
];

// ---------------------------------------------------------------------------
// Mini color card — 1/4 size of the cat-color-palettes reference, with
// hover pop-up to full size.
// ---------------------------------------------------------------------------

function MiniColorCard({
  name,
  rgb,
  screen,
  pattern,
}: {
  name: string;
  rgb: [number, number, number];
  screen?: [number, number, number, number];
  pattern?: PatternDefinition;
}) {
  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  const textColor = luminance > 0.5 ? "text-black/80" : "text-white/90";

  const bgStyle: React.CSSProperties = pattern
    ? patternToCssBackground(pattern)
    : { backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` };

  return (
    <div
      className="group/card relative aspect-square overflow-hidden rounded border border-border/30 transition-transform duration-200 hover:z-30 hover:scale-[4] hover:shadow-xl hover:rounded-lg"
      style={bgStyle}
      title={`${name.replace(/_/g, " ")}${pattern ? ` (${pattern.type})` : ""}`}
    >
      {/* Detail overlay — only visible on hover (when scaled up) */}
      <div className={cn("absolute inset-0 flex flex-col items-center justify-center opacity-0 transition-opacity group-hover/card:opacity-100", textColor)}>
        <div className="text-[3px] font-bold uppercase leading-tight tracking-wide">
          {name.replace(/_/g, " ")}
        </div>
        {pattern && (
          <div className="mt-[1px] text-[2.5px] font-mono opacity-60">
            {pattern.type}
          </div>
        )}
      </div>

      {/* Screen overlay dot */}
      {screen && (
        <div className="absolute bottom-[1px] right-[1px]">
          <div
            className="size-[2px] rounded-full border border-white/30"
            style={{ backgroundColor: `rgba(${screen[0]}, ${screen[1]}, ${screen[2]}, ${screen[3]})` }}
          />
        </div>
      )}

      {/* Pattern type badge */}
      {pattern && (
        <div className="absolute top-[1px] left-[1px]">
          <div className="rounded-[1px] bg-black/40 px-[1px] text-[2px] font-bold uppercase text-white/80">
            {pattern.type.charAt(0)}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Palette section card — glass-card matching reference page style
// ---------------------------------------------------------------------------

function PaletteCard({
  palette,
  isSelected,
  onToggle,
}: {
  palette: PaletteCategory;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const colors = Object.entries(palette.colors);

  return (
    <div
      className={cn(
        "glass-card relative overflow-visible transition [&:has(:hover)]:z-10",
        isSelected && "ring-2 ring-primary/50",
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded border transition",
              isSelected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/60 bg-background/50 hover:border-primary/50",
            )}
          >
            {isSelected && (
              <svg className="size-3.5" viewBox="0 0 12 12" fill="none">
                <path d="M3 6l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>

          <h3 className="flex items-center gap-2 text-sm font-bold">
            <PaintIcon size={16} className="text-primary" />
            {palette.label}
            <span className="text-xs font-normal text-muted-foreground">
              ({colors.length} colors)
            </span>
          </h3>
        </div>
      </div>

      {/* Color grid — 1/4 size of reference (double the columns) */}
      <div className="overflow-visible border-t border-border/30 px-6 py-4">
        <div className="grid grid-cols-8 gap-1 overflow-visible sm:grid-cols-12 md:grid-cols-[repeat(16,_1fr)] lg:grid-cols-[repeat(20,_1fr)]">
          {colors.map(([name, def]) => (
            <MiniColorCard
              key={name}
              name={name}
              rgb={def.multiply ?? def.pattern?.background ?? [128, 128, 128]}
              screen={def.screen}
              pattern={def.pattern}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface PaletteGroupPickerProps {
  selected: ExtendedMode[];
  onChange: (next: ExtendedMode[]) => void;
}

export function PaletteGroupPicker({ selected, onChange }: PaletteGroupPickerProps) {
  const [activeFilter, setActiveFilter] = useState<FilterValue>("all");
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // Filtered palettes based on active group
  const filteredPalettes = useMemo(() => {
    if (activeFilter === "all") return ADDITIONAL_PALETTES;
    return ADDITIONAL_PALETTES.filter((p) => p.group === activeFilter);
  }, [activeFilter]);

  const togglePalette = useCallback(
    (id: ExtendedMode) => {
      const next = new Set(selectedSet);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onChange(Array.from(next));
    },
    [selectedSet, onChange],
  );

  const selectAllVisible = useCallback(() => {
    const next = new Set(selectedSet);
    for (const p of filteredPalettes) next.add(p.id as ExtendedMode);
    onChange(Array.from(next));
  }, [filteredPalettes, selectedSet, onChange]);

  const clearVisible = useCallback(() => {
    const visibleIds = new Set<string>(filteredPalettes.map((p) => p.id));
    onChange(selected.filter((id) => !visibleIds.has(id)));
  }, [filteredPalettes, selected, onChange]);

  // Counts
  const visibleCount = filteredPalettes.length;
  const visibleSelectedCount = filteredPalettes.filter((p) => selectedSet.has(p.id as ExtendedMode)).length;

  return (
    <div className="space-y-4">
      {/* Filter pills + bulk actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-border/30 bg-muted/30 p-1">
          {FILTER_PILLS.map((pill) => (
            <button
              key={pill.value}
              type="button"
              onClick={() => setActiveFilter(pill.value)}
              className={cn(
                "whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold tracking-wide transition",
                activeFilter === pill.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {pill.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={selectAllVisible}
            disabled={visibleSelectedCount === visibleCount}
            className="text-[10px] uppercase tracking-wide text-primary/70 transition hover:text-primary disabled:opacity-40"
          >
            Select All
          </button>
          <span className="text-muted-foreground/30">|</span>
          <button
            type="button"
            onClick={clearVisible}
            disabled={visibleSelectedCount === 0}
            className="text-[10px] uppercase tracking-wide text-muted-foreground/70 transition hover:text-foreground disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Palette sections — each one is a glass-card just like the reference page */}
      {filteredPalettes.map((palette) => (
        <PaletteCard
          key={palette.id}
          palette={palette}
          isSelected={selectedSet.has(palette.id as ExtendedMode)}
          onToggle={() => togglePalette(palette.id as ExtendedMode)}
        />
      ))}

      {/* Selected summary */}
      <div className="rounded-lg border border-border/30 bg-background/40 px-3 py-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
          Selected: {selected.length} / {ADDITIONAL_PALETTES.length}
        </span>
        {selected.length > 0 ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {selected.map((id) => {
              const p = ADDITIONAL_PALETTES.find((pal) => pal.id === id);
              return p?.label ?? id;
            }).join(", ")}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground/50">
            No additional palettes selected
          </p>
        )}
      </div>
    </div>
  );
}
