"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useCatGenerator } from "@/components/cat-builder/hooks";
import type { AfterlifeOption, ExtendedMode } from "@/utils/singleCatVariants";
import { WizardExampleCats } from "../WizardExampleCats";
import type { WizardStepProps } from "./types";

// ---------------------------------------------------------------------------
// Afterlife option cards with descriptions
// ---------------------------------------------------------------------------

interface AfterlifeCardDef {
  value: AfterlifeOption;
  title: string;
  description: string;
}

const AFTERLIFE_CARDS: AfterlifeCardDef[] = [
  {
    value: "off",
    title: "Off",
    description: "No afterlife effects — standard living cats only.",
  },
  {
    value: "dark10",
    title: "Dark Forest 10%",
    description: "10% chance of shadowy ghost appearance.",
  },
  {
    value: "star10",
    title: "StarClan 10%",
    description: "10% chance of starry ethereal glow.",
  },
  {
    value: "both10",
    title: "Both 10%",
    description: "10% chance of each, independently — can get either effect.",
  },
  {
    value: "darkForce",
    title: "Always Dark Forest",
    description: "Every cat gets the shadowy Dark Forest look.",
  },
  {
    value: "starForce",
    title: "Always StarClan",
    description: "Every cat gets the starry StarClan glow.",
  },
];

// ---------------------------------------------------------------------------
// Inline comparison — renders Normal / StarClan / Dark Forest side by side
// ---------------------------------------------------------------------------

interface ComparisonCat {
  label: string;
  imageDataUrl: string;
}

const VARIANTS = [
  { label: "Normal", darkForest: false, dead: false },
  { label: "StarClan", darkForest: false, dead: true },
  { label: "Dark Forest", darkForest: true, dead: false },
] as const;

function AfterlifeComparison({ settings }: { settings: WizardStepProps["settings"] }) {
  const { generator, ready } = useCatGenerator();
  const [cats, setCats] = useState<(ComparisonCat | null)[]>([null, null, null]);
  const [isGenerating, setIsGenerating] = useState(false);
  const generatedRef = useRef(false);

  const generate = useCallback(async () => {
    if (!generator?.generateRandomCat || isGenerating) return;
    setIsGenerating(true);
    setCats([null, null, null]);

    const extModes = settings.extendedModes.filter(
      (m): m is ExtendedMode => m !== "base",
    );
    const experimentalColourMode = extModes.length > 0 ? extModes : undefined;

    // Generate one base cat, then re-render it with each afterlife variant
    try {
      const { params } = await generator.generateRandomCat({
        accessoryCount: 0,
        scarCount: 0,
        tortieCount: 0,
        experimentalColourMode,
        includeBaseColours: settings.includeBaseColours,
      });

      for (let i = 0; i < VARIANTS.length; i++) {
        const variant = VARIANTS[i];
        const variantParams = {
          ...params,
          darkForest: variant.darkForest,
          dead: variant.dead,
        };
        const result = await generator.generateCat(variantParams);
        const canvas = result.canvas;
        const imageDataUrl =
          result.imageDataUrl ??
          ("toDataURL" in canvas ? (canvas as HTMLCanvasElement).toDataURL("image/png") : "");
        setCats((prev) => {
          const next = [...prev];
          next[i] = { label: variant.label, imageDataUrl };
          return next;
        });
      }
    } catch {
      // leave nulls
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
          Comparison
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
      <div className="grid grid-cols-3 gap-3">
        {cats.map((cat, i) => (
          <div key={VARIANTS[i].label} className="space-y-1.5 text-center">
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-border/30 bg-background/50">
              {cat ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cat.imageDataUrl}
                  alt={VARIANTS[i].label}
                  className="size-full object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : (
                <div className="size-6 animate-pulse rounded-full bg-muted-foreground/20" />
              )}
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
              {VARIANTS[i].label}
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

export function AfterlifeStep(props: WizardStepProps) {
  const { settings, setAfterlifeMode, onNext, onBack } = props;

  return (
    <div className="space-y-6">
      {/* Explanation */}
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">
          Afterlife Effects
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          In Warriors lore, cats can join <strong>StarClan</strong> (a starry
          spirit) or the <strong>Dark Forest</strong> (a shadowy ghost). These
          are rare visual effects that change the overall appearance of your
          cat.
        </p>
      </div>

      {/* Visual comparison — dedicated inline render */}
      <section className="rounded-2xl border border-border/40 bg-card/60 p-5 backdrop-blur">
        <AfterlifeComparison settings={settings} />
      </section>

      {/* Radio cards */}
      <section className="rounded-2xl border border-border/40 bg-card/60 p-5 backdrop-blur">
        <h3 className="mb-4 text-[10px] uppercase tracking-widest text-muted-foreground/70">
          Choose Afterlife Mode
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {AFTERLIFE_CARDS.map((card) => {
            const isSelected = settings.afterlifeMode === card.value;
            return (
              <button
                key={card.value}
                type="button"
                onClick={() => setAfterlifeMode(card.value)}
                className={cn(
                  "rounded-xl border p-4 text-left transition",
                  isSelected
                    ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                    : "border-border/40 bg-background/50 hover:border-primary/30 hover:bg-primary/5",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-full border transition",
                      isSelected
                        ? "border-primary bg-primary"
                        : "border-border/60 bg-background/50",
                    )}
                  >
                    {isSelected && (
                      <div className="size-1.5 rounded-full bg-primary-foreground" />
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      isSelected ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {card.title}
                  </span>
                </div>
                <p className="mt-1.5 pl-6.5 text-xs text-muted-foreground/70">
                  {card.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Live preview */}
      <WizardExampleCats
        settings={settings}
        overrides={{ accessoryCount: 0, scarCount: 0, tortieCount: 0 }}
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
          Next: Palettes &rarr;
        </button>
      </div>
    </div>
  );
}
