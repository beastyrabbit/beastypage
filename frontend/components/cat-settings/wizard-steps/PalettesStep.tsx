"use client";

import { PaletteGroupPicker } from "../PaletteGroupPicker";
import { WizardExampleCats } from "../WizardExampleCats";
import type { WizardStepProps } from "./types";

export function PalettesStep(props: WizardStepProps) {
  const { settings, setIncludeBaseColours, setExtendedModes, onNext, onBack } =
    props;

  const paletteCount = settings.extendedModes.length;
  const showWarning = paletteCount > 5;

  const nav = (
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
        Next: Summary &rarr;
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Explanation */}
      <section className="space-y-2 rounded-2xl border border-border/40 bg-card/60 p-5 backdrop-blur">
        <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
          Colour Palettes
        </h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          Colour palettes define the pool of colours for your cat. We
          recommend <strong>3 palettes</strong> (most people pick 3). Each
          palette adds its set of colours to the random selection pool.
        </p>
      </section>

      {showWarning && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-5 py-3 text-sm text-amber-200">
          You&apos;ve selected <strong>{paletteCount}</strong> palettes. We
          recommend no more than 5 &mdash; too many dilutes the colour
          cohesion of each cat.
        </div>
      )}

      {/* Live preview at top */}
      <WizardExampleCats settings={settings} />

      {/* Classic colours toggle */}
      <section className="rounded-2xl border border-border/40 bg-card/60 p-5 backdrop-blur">
        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={settings.includeBaseColours}
            onChange={(e) => setIncludeBaseColours(e.target.checked)}
            className="size-4 rounded border-border accent-primary"
          />
          <span className="text-sm text-foreground">Classic colours</span>
          <span className="text-xs text-muted-foreground">
            (19 base ClanGen colours)
          </span>
        </label>
      </section>

      {/* Navigation — top (above the long palette list) */}
      {nav}

      {/* Palette picker */}
      <section className="rounded-2xl border border-border/40 bg-card/60 p-5 backdrop-blur">
        <h3 className="mb-4 text-[10px] uppercase tracking-widest text-muted-foreground/70">
          Extended Palettes
        </h3>
        <PaletteGroupPicker
          selected={settings.extendedModes}
          onChange={setExtendedModes}
        />
      </section>

      {/* Navigation */}
      {nav}
    </div>
  );
}
