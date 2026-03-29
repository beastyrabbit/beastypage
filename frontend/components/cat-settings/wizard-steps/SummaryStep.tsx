"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import CopyIcon from "@/components/ui/copy-icon";
import { AFTERLIFE_OPTIONS } from "@/utils/catSettingsHelpers";
import { WizardExampleCats } from "../WizardExampleCats";
import type { WizardStepProps } from "./types";

export function SummaryStep(props: WizardStepProps) {
  const { settings, liveCode, onBack } = props;

  const [copyFeedback, setCopyFeedback] = useState(false);
  const [copyUrlFeedback, setCopyUrlFeedback] = useState(false);

  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(liveCode);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    } catch (err) {
      console.warn("[SummaryStep] clipboard copy failed:", err);
    }
  }, [liveCode]);

  const handleCopyUrl = useCallback(async () => {
    try {
      const url = `${window.location.origin}/single-cat-plus/settings/guided?code=${encodeURIComponent(liveCode)}`;
      await navigator.clipboard.writeText(url);
      setCopyUrlFeedback(true);
      setTimeout(() => setCopyUrlFeedback(false), 1500);
    } catch (err) {
      console.warn("[SummaryStep] clipboard URL copy failed:", err);
    }
  }, [liveCode]);

  // Summarise current settings for display
  const afterlifeLabel =
    AFTERLIFE_OPTIONS.find((o) => o.value === settings.afterlifeMode)?.label ??
    "Off";
  const rangeStr = (r: { min: number; max: number }) =>
    r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">
          Your Settings Code
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Copy this code and submit it with your gacha order. That&apos;s it!
        </p>
      </div>

      {/* Code display */}
      <section className="rounded-2xl border border-primary/30 bg-primary/5 p-6 backdrop-blur">
        <code className="block rounded-lg border border-primary/30 bg-background/80 px-5 py-4 text-center font-mono text-xl tracking-wider text-foreground sm:text-2xl">
          {liveCode}
        </code>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleCopyCode}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-4 py-2.5 text-sm font-medium transition",
              copyFeedback
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-border/50 bg-background/70 text-muted-foreground hover:text-foreground",
            )}
          >
            <CopyIcon size={14} />
            {copyFeedback ? "Copied!" : "Copy Code"}
          </button>
          <button
            type="button"
            onClick={handleCopyUrl}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-4 py-2.5 text-sm font-medium transition",
              copyUrlFeedback
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-border/50 bg-background/70 text-muted-foreground hover:text-foreground",
            )}
          >
            {copyUrlFeedback ? "Copied!" : "Copy URL"}
          </button>
        </div>
      </section>

      {/* Settings summary */}
      <section className="rounded-2xl border border-border/40 bg-card/60 p-5 backdrop-blur">
        <h3 className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground/70">
          Settings Summary
        </h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground/60">Accessories</dt>
            <dd className="font-mono text-foreground">
              {rangeStr(settings.accessoryRange)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground/60">Scars</dt>
            <dd className="font-mono text-foreground">
              {rangeStr(settings.scarRange)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground/60">Tortie Layers</dt>
            <dd className="font-mono text-foreground">
              {rangeStr(settings.tortieRange)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground/60">Afterlife</dt>
            <dd className="font-mono text-foreground">{afterlifeLabel}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground/60">Classic</dt>
            <dd className="font-mono text-foreground">
              {settings.includeBaseColours ? "Yes" : "No"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground/60">Palettes</dt>
            <dd className="font-mono text-foreground">
              {settings.extendedModes.length}
            </dd>
          </div>
        </dl>
      </section>

      {/* Example cats */}
      <WizardExampleCats settings={settings} count={10} />

      {/* Disclaimer */}
      <p className="text-center text-xs text-muted-foreground/60">
        These example cats are randomly generated previews only. They are not
        saved or used for your actual commission &mdash; they just give a feel
        for how your settings look.
      </p>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-border/50 bg-background/70 px-6 py-2.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          &larr; Back
        </button>
        {/* No "next" on summary — the CTA is the copy button above */}
        <div />
      </div>
    </div>
  );
}
