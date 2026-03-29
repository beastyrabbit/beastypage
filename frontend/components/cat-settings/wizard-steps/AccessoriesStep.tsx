"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LayerRangeSelector } from "@/components/common/LayerRangeSelector";
import { useSpriteMapperOptions, useCatGenerator } from "@/components/cat-builder/hooks";
import { formatName } from "@/components/cat-builder/utils";
import { WizardExampleCats } from "../WizardExampleCats";
import { ForceInitialRollInfo } from "./ForceInitialRollInfo";
import type { WizardStepProps } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AccessoryPreview {
  name: string;
  imageDataUrl: string | null;
}

const INITIAL_COUNT = 4;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pick `count` random items from an array (Fisher-Yates partial shuffle). */
function pickRandom<T>(arr: readonly T[], count: number): T[] {
  const copy = [...arr];
  const n = Math.min(count, copy.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// ---------------------------------------------------------------------------
// Gallery item
// ---------------------------------------------------------------------------

function GalleryItem({ item }: { item: AccessoryPreview }) {
  return (
    <div className="group relative flex flex-col items-center gap-1">
      <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-border/30 bg-background/50">
        {item.imageDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageDataUrl}
            alt={formatName(item.name)}
            className="size-full object-contain"
            style={{ imageRendering: "pixelated" }}
          />
        ) : (
          <div className="size-5 animate-pulse rounded-full bg-muted-foreground/20" />
        )}
      </div>
      <span className="truncate text-[10px] text-muted-foreground/70 group-hover:text-foreground">
        {formatName(item.name)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AccessoriesStep(props: WizardStepProps) {
  const { settings, setAccessoryRange, onNext, onBack } = props;
  const { mapper, options } = useSpriteMapperOptions();
  const { generator, ready } = useCatGenerator();

  const [gallery, setGallery] = useState<AccessoryPreview[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const generatedRef = useRef(false);
  // Track the full pool so "Show More" can pick from remaining items
  const poolRef = useRef<string[]>([]);
  const shownNamesRef = useRef<Set<string>>(new Set());

  const renderPreview = useCallback(
    async (
      gen: NonNullable<typeof generator>,
      accessoryName: string,
    ): Promise<AccessoryPreview> => {
      try {
        const result = await gen.generateCat({
          spriteNumber: 8,
          peltName: "SingleColour",
          colour: "WHITE",
          isTortie: false,
          eyeColour: "YELLOW",
          skinColour: "PINK",
          shading: false,
          reverse: false,
          accessories: [accessoryName],
          accessory: accessoryName,
        });
        return { name: accessoryName, imageDataUrl: result.imageDataUrl ?? null };
      } catch {
        return { name: accessoryName, imageDataUrl: null };
      }
    },
    [],
  );

  // Build + shuffle the full accessory pool once, render first 4
  useEffect(() => {
    if (!ready || !generator || !mapper || generatedRef.current) return;
    generatedRef.current = true;

    const all = Array.from(new Set(mapper.getAccessories?.() ?? [
      ...(options?.plantAccessories ?? []),
      ...(options?.wildAccessories ?? []),
      ...(options?.collarAccessories ?? []),
    ]));
    // Shuffle the entire pool once
    const shuffled = pickRandom(all, all.length);
    poolRef.current = shuffled;

    // Render first INITIAL_COUNT
    const initial = shuffled.slice(0, INITIAL_COUNT);
    initial.forEach((n) => shownNamesRef.current.add(n));
    setIsRendering(true);

    (async () => {
      const results: AccessoryPreview[] = [];
      for (const name of initial) {
        const preview = await renderPreview(generator, name);
        results.push(preview);
        setGallery([...results]);
      }
      setIsRendering(false);
    })();
  }, [ready, generator, mapper, options, renderPreview]);

  // "Show All" — render remaining items in the already-shuffled order
  const [expanded, setExpanded] = useState(false);
  const handleShowMore = useCallback(async () => {
    if (!generator || isRendering) return;
    // Pool is already shuffled; grab everything after INITIAL_COUNT
    const remaining = poolRef.current.filter((n) => !shownNamesRef.current.has(n));
    if (remaining.length === 0) return;

    remaining.forEach((n) => shownNamesRef.current.add(n));
    setExpanded(true);
    setIsRendering(true);

    for (const name of remaining) {
      const preview = await renderPreview(generator, name);
      setGallery((prev) => [...prev, preview]);
    }
    setIsRendering(false);
  }, [generator, isRendering, renderPreview]);

  const remainingCount = poolRef.current.length - shownNamesRef.current.size;

  return (
    <div className="space-y-6">
      {/* Explanation */}
      <section className="space-y-2 rounded-2xl border border-border/40 bg-card/60 p-5 backdrop-blur">
        <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
          Accessories
        </h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          Accessories are items your cat wears &mdash; plants, collars,
          feathers, and more. There are <strong>{poolRef.current.length || "360"}+</strong> options
          that get randomly selected. You control how many your cat can wear.
        </p>
      </section>

      {/* Controls */}
      <section className="rounded-2xl border border-border/40 bg-card/60 p-5 backdrop-blur">
        <h3 className="mb-4 text-[10px] uppercase tracking-widest text-muted-foreground/70">
          Accessory Count Range
        </h3>
        <p className="mb-4 text-xs text-muted-foreground/70">
          How many accessories can each generated cat have? Set a min and max.
        </p>
        <LayerRangeSelector
          label="Accessories"
          value={settings.accessoryRange}
          onChange={setAccessoryRange}
          compact
        />
        <ForceInitialRollInfo range={settings.accessoryRange} layerName="accessory" />
      </section>

      {/* Accessory gallery — below the selector */}
      <section className="rounded-2xl border border-border/40 bg-card/60 p-5 backdrop-blur">
        <h3 className="mb-4 text-[10px] uppercase tracking-widest text-muted-foreground/70">
          Example Accessories
          {isRendering && expanded && (
            <span className="text-amber-200/70"> &mdash; loading previews...</span>
          )}
        </h3>
        {/* 3 rows of 4 cols = ~420px, then scroll */}
        <div className={expanded ? "max-h-[420px] overflow-y-auto pr-1" : ""}>
          <div className="grid grid-cols-4 gap-3">
            {gallery.map((item) => (
              <GalleryItem key={item.name} item={item} />
            ))}
            {isRendering &&
              gallery.length < INITIAL_COUNT &&
              Array.from({ length: INITIAL_COUNT - gallery.length }).map((_, i) => (
                <div key={`ph-${i}`} className="flex aspect-square items-center justify-center rounded-xl border border-border/30 bg-background/50">
                  <div className="size-5 animate-pulse rounded-full bg-muted-foreground/20" />
                </div>
              ))}
          </div>
        </div>
        {!expanded && remainingCount > 0 && (
          <button
            type="button"
            onClick={handleShowMore}
            disabled={isRendering}
            className="mt-4 w-full rounded-lg border border-border/40 bg-background/50 py-2 text-xs font-medium text-muted-foreground transition hover:bg-primary/5 hover:text-foreground disabled:opacity-50"
          >
            {isRendering ? "Loading..." : `Show All (${remainingCount} more)`}
          </button>
        )}
      </section>

      {/* Live preview */}
      <WizardExampleCats
        settings={settings}
        overrides={{ scarCount: 0, tortieCount: 0 }}
      />

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-border/50 bg-background/70 px-6 py-2.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          &larr; Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-6 py-2.5 text-sm font-medium text-amber-200 transition hover:bg-amber-500/20"
        >
          Next: Scars &rarr;
        </button>
      </div>
    </div>
  );
}
