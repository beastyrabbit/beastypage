"use client";

import { useCallback, useRef, useState } from "react";
import type { SingleCatPortableSettings } from "@/lib/portable-settings";
import {
  computeLayerCount,
  resolveAfterlife,
} from "@/utils/catSettingsHelpers";
import type { ExtendedMode } from "@/utils/singleCatVariants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExampleCat {
  id: number;
  imageDataUrl: string;
}

interface ExampleCatGridProps {
  settings: SingleCatPortableSettings;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CAT_COUNT = 5;

export function ExampleCatGrid({ settings }: ExampleCatGridProps) {
  const [cats, setCats] = useState<(ExampleCat | null)[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const handleGenerate = useCallback(async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setError(null);
    setCats(Array.from({ length: CAT_COUNT }, () => null)); // placeholders
    abortRef.current = false;

    try {
      // Lazy-import the cat generator to keep initial bundle small
      const { default: catGenerator } = await import(
        "@/lib/single-cat/catGeneratorV3"
      );

      // Build generation options from current portable settings
      const extModes = settings.extendedModes.filter(
        (m): m is ExtendedMode => m !== "base",
      );
      const experimentalColourMode = extModes.length > 0 ? extModes : undefined;

      for (let i = 0; i < CAT_COUNT; i++) {
        if (abortRef.current) break;

        const accessoryCount = computeLayerCount(settings.accessoryRange);
        const scarCount = computeLayerCount(settings.scarRange);
        const tortieCount = computeLayerCount(settings.tortieRange);

        const { params, canvas } = await catGenerator.generateRandomCat({
          accessoryCount,
          scarCount,
          tortieCount,
          exactLayerCounts: settings.exactLayerCounts,
          experimentalColourMode,
          includeBaseColours: settings.includeBaseColours,
        });

        // Apply afterlife effects
        const afterlife = resolveAfterlife(settings.afterlifeMode);
        let imageDataUrl: string;

        if (afterlife.darkForest || afterlife.dead) {
          params.darkForest = afterlife.darkForest;
          params.dead = afterlife.dead;
          const rerendered = await catGenerator.generateCat(params);
          imageDataUrl = rerendered.imageDataUrl;
        } else {
          imageDataUrl = canvas.toDataURL("image/png");
        }

        setCats((prev) => {
          const next = [...prev];
          next[i] = { id: i, imageDataUrl };
          return next;
        });
      }
    } catch (err) {
      console.error("[ExampleCatGrid] generation failed", err);
      setError("Failed to generate preview cats. Try refreshing the page.");
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, settings]);

  return (
    <section className="rounded-2xl border border-border/40 bg-card/60 p-5 backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
          Example Cats
        </h2>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50"
        >
          {isGenerating ? "Generating..." : "Generate 5 Cats"}
        </button>
      </div>

      {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

      {/* Cat grid */}
      {cats.length > 0 ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {cats.map((cat, i) => (
            <div
              key={cat?.id ?? `placeholder-${i}`}
              className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-border/30 bg-background/50"
            >
              {cat ? (
                // biome-ignore lint/performance/noImgElement: renders base64/dynamic src
                <img
                  src={cat.imageDataUrl}
                  alt={`Example cat ${i + 1}`}
                  className="size-full object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <div className="size-6 animate-pulse rounded-full bg-muted-foreground/20" />
                  <span className="text-[10px] text-muted-foreground/40">
                    {isGenerating ? "Rendering..." : ""}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-dashed border-border/30 text-sm text-muted-foreground/50">
          Click &ldquo;Generate 5 Cats&rdquo; to preview
        </div>
      )}
    </section>
  );
}
