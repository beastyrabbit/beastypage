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

/**
 * Overrides let each step isolate the feature it's demonstrating.
 * e.g. on the Accessories step, pass `{ scarCount: 0, tortieCount: 0 }`
 * so only accessories are visible.
 */
export interface GenerationOverrides {
  accessoryCount?: number;
  scarCount?: number;
  tortieCount?: number;
  /** Force afterlife flags instead of using settings.afterlifeMode */
  darkForest?: boolean;
  dead?: boolean;
}

interface WizardExampleCatsProps {
  settings: SingleCatPortableSettings;
  /** Number of cats to generate (default 5) */
  count?: number;
  /** Override layer counts for step isolation */
  overrides?: GenerationOverrides;
  /** Custom button label */
  buttonLabel?: string;
  /** Hide the section wrapper (useful when embedding inside a step) */
  bare?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WizardExampleCats({
  settings,
  count = 5,
  overrides,
  buttonLabel,
  bare = false,
}: WizardExampleCatsProps) {
  const [cats, setCats] = useState<(ExampleCat | null)[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const handleGenerate = useCallback(async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setError(null);
    setCats(Array.from({ length: count }, () => null));
    abortRef.current = false;

    try {
      const { default: catGenerator } = await import(
        "@/lib/single-cat/catGeneratorV3"
      );

      const extModes = settings.extendedModes.filter(
        (m): m is ExtendedMode => m !== "base",
      );
      const experimentalColourMode = extModes.length > 0 ? extModes : undefined;

      for (let i = 0; i < count; i++) {
        if (abortRef.current) break;

        const accessoryCount =
          overrides?.accessoryCount ??
          computeLayerCount(settings.accessoryRange);
        const scarCount =
          overrides?.scarCount ?? computeLayerCount(settings.scarRange);
        const tortieCount =
          overrides?.tortieCount ?? computeLayerCount(settings.tortieRange);

        const { params, canvas } = await catGenerator.generateRandomCat({
          accessoryCount,
          scarCount,
          tortieCount,
          exactLayerCounts: settings.exactLayerCounts,
          experimentalColourMode,
          includeBaseColours: settings.includeBaseColours,
        });

        // Resolve afterlife — use overrides if provided, else settings
        const useOverrideAfterlife =
          overrides?.darkForest !== undefined || overrides?.dead !== undefined;
        const afterlife = useOverrideAfterlife
          ? {
              darkForest: overrides?.darkForest ?? false,
              dead: overrides?.dead ?? false,
            }
          : resolveAfterlife(settings.afterlifeMode);

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
      console.error("[WizardExampleCats] generation failed", err);
      setError("Failed to generate cats. Try again?");
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, settings, count, overrides]);

  const label =
    buttonLabel ?? (isGenerating ? "Generating..." : `Generate ${count} Cats`);

  const content = (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
          Live Preview
        </h2>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50"
        >
          {isGenerating ? "Generating..." : label}
        </button>
      </div>

      {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

      {cats.length > 0 ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {cats.map((cat, i) => (
            <div
              key={cat?.id ?? `placeholder-${i}`}
              className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-border/30 bg-background/50"
            >
              {cat ? (
                // eslint-disable-next-line @next/next/no-img-element
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
        <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-border/30 text-sm text-muted-foreground/50">
          Click &ldquo;{label}&rdquo; to preview
        </div>
      )}
    </>
  );

  if (bare) return content;

  return (
    <section className="rounded-2xl border border-border/40 bg-card/60 p-5 backdrop-blur">
      {content}
    </section>
  );
}
