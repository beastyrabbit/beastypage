"use client";

import type { WizardStepProps } from "./types";

export function WelcomeStep({ onNext, hasInitialCode }: WizardStepProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-8 py-8 text-center">
      {/* Hero illustration area */}
      <div className="flex size-24 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-5xl">
        🐱
      </div>

      <section className="max-w-lg space-y-4 rounded-2xl border border-border/40 bg-card/60 p-6 backdrop-blur">
        <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
          Configure Your Cat Settings
        </h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          You&apos;ve purchased a Single Cat Plus gacha &mdash; nice! This
          wizard will walk you through each generation setting step-by-step so
          you can customise exactly how your cat looks.
        </p>
        <p className="text-sm text-muted-foreground/70">
          At the end you&apos;ll get a settings code to copy and submit with your
          order. You can always come back and tweak it later.
        </p>
      </section>

      {hasInitialCode && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 text-sm text-emerald-300">
          Settings pre-loaded from your code &mdash; feel free to adjust
          anything.
        </div>
      )}

      <button
        type="button"
        onClick={onNext}
        className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-8 py-3 text-base font-semibold text-amber-200 transition hover:bg-amber-500/20"
      >
        Let&apos;s Get Started &rarr;
      </button>
    </div>
  );
}
