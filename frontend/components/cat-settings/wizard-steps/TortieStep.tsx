"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCatGenerator } from "@/components/cat-builder/hooks";
import { LayerRangeSelector } from "@/components/common/LayerRangeSelector";
import type { ExtendedMode } from "@/utils/singleCatVariants";
import { WizardExampleCats } from "../WizardExampleCats";
import { ForceInitialRollInfo } from "./ForceInitialRollInfo";
import type { WizardStepProps } from "./types";

// ---------------------------------------------------------------------------
// Comparison — same base cat rendered with 1, 2, 3, 4 tortie layers
// ---------------------------------------------------------------------------

interface ComparisonCat {
  count: number;
  imageDataUrl: string;
}

function TortieComparison({
  settings,
}: {
  settings: WizardStepProps["settings"];
}) {
  const { generator, ready } = useCatGenerator();
  const [cats, setCats] = useState<(ComparisonCat | null)[]>([
    null,
    null,
    null,
    null,
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const generatedRef = useRef(false);

  const generate = useCallback(async () => {
    if (!generator?.generateRandomCat || isGenerating) return;
    setIsGenerating(true);
    setCats([null, null, null, null]);

    const extModes = settings.extendedModes.filter(
      (m): m is ExtendedMode => m !== "base",
    );
    const experimentalColourMode = extModes.length > 0 ? extModes : undefined;

    try {
      // Generate one base cat with max (4) tortie layers
      const { params } = await generator.generateRandomCat({
        accessoryCount: 0,
        scarCount: 0,
        tortieCount: 4,
        exactLayerCounts: settings.exactLayerCounts,
        experimentalColourMode,
        includeBaseColours: settings.includeBaseColours,
      });

      // Force tortie on
      params.isTortie = true;
      const fullLayers = params.tortie ?? [];

      // Render the same cat with progressively more layers
      for (let i = 0; i < 4; i++) {
        const count = i + 1;
        const slicedParams = {
          ...params,
          tortie: fullLayers.slice(0, count),
        };
        const result = await generator.generateCat(slicedParams);
        const imageDataUrl =
          result.imageDataUrl ??
          (result.canvas && "toDataURL" in result.canvas
            ? result.canvas.toDataURL("image/png")
            : "");
        setCats((prev) => {
          const next = [...prev];
          next[i] = { count, imageDataUrl };
          return next;
        });
      }
    } catch (err) {
      console.error("[TortieComparison] generation failed:", err);
    }
    setIsGenerating(false);
  }, [generator, isGenerating, settings]);

  useEffect(() => {
    if (ready && generator && !generatedRef.current) {
      generatedRef.current = true;
      generate();
    }
  }, [ready, generator, generate]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
          Same Cat &mdash; Progressive Layers
        </span>
        <button
          type="button"
          onClick={generate}
          disabled={isGenerating}
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50"
        >
          {isGenerating ? "Generating..." : "Regenerate"}
        </button>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {cats.map((cat, i) => (
          <div key={i} className="space-y-1.5 text-center">
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-border/30 bg-background/50">
              {cat ? (
                // biome-ignore lint/performance/noImgElement: renders base64/dynamic src
                <img
                  src={cat.imageDataUrl}
                  alt={`${i + 1} tortie layer${i > 0 ? "s" : ""}`}
                  className="size-full object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : (
                <div className="size-6 animate-pulse rounded-full bg-muted-foreground/20" />
              )}
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
              {i + 1} layer{i > 0 ? "s" : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TortieStep(props: WizardStepProps) {
  const { settings, setTortieRange, onNext, onBack } = props;

  return (
    <div className="space-y-6">
      {/* Explanation */}
      <section className="space-y-2 rounded-2xl border border-border/40 bg-card/60 p-5 backdrop-blur">
        <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
          Tortie Layers
        </h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          Tortie layers add additional coat colours stacked on top of the base.
          More layers = more complex multi-coloured cats. A cat with 0 tortie
          layers is a solid-coat cat; 4 layers creates rich, multi-coloured
          patterns.
        </p>
      </section>

      {/* Demo comparison — same cat with progressive layers */}
      <section className="rounded-2xl border border-border/40 bg-card/60 p-5 backdrop-blur">
        <TortieComparison settings={settings} />
      </section>

      {/* Controls */}
      <section className="rounded-2xl border border-border/40 bg-card/60 p-5 backdrop-blur">
        <h3 className="mb-4 text-[10px] uppercase tracking-widest text-muted-foreground/70">
          Tortie Layer Count Range
        </h3>
        <p className="mb-4 text-xs text-muted-foreground/70">
          How many tortie layers can each generated cat have? Set a min and max.
        </p>
        <LayerRangeSelector
          label="Tortie Layers"
          value={settings.tortieRange}
          onChange={setTortieRange}
          compact
        />
        <ForceInitialRollInfo
          range={settings.tortieRange}
          layerName="tortie layer"
          exactLayerCounts={settings.exactLayerCounts}
        />
      </section>

      {/* Live preview */}
      <WizardExampleCats
        settings={settings}
        overrides={{ accessoryCount: 0, scarCount: 0 }}
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
          Next: Afterlife &rarr;
        </button>
      </div>
    </div>
  );
}
