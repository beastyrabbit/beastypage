"use client";

import { cn } from "@/lib/utils";
import type { LayerRange } from "@/utils/singleCatVariants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ForceInitialRollInfoProps {
  range: LayerRange;
  layerName: string;
  exactLayerCounts: boolean;
}

type ForceState = "disabled" | "on" | "off";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pluralize(name: string): string {
  if (name.endsWith("y")) return `${name.slice(0, -1)}ies`;
  return `${name}s`;
}

/**
 * Derive badge state from both the range and the global exactLayerCounts toggle.
 * Disabled when range produces nothing; ON only when exactLayerCounts is true.
 */
function deriveForceState(range: LayerRange, exactLayerCounts: boolean): ForceState {
  if (range.min === 0 && range.max === 0) return "disabled";
  return exactLayerCounts ? "on" : "off";
}

const INACTIVE_BADGE = "border-border/40 bg-muted/20 text-muted-foreground/50";

const BADGE_STYLES: Record<ForceState, string> = {
  disabled: INACTIVE_BADGE,
  on: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  off: INACTIVE_BADGE,
};

const BADGE_LABELS: Record<ForceState, string> = {
  disabled: "OFF",
  on: "ON",
  off: "OFF",
};

function getMessage(state: ForceState, layerName: string, range: LayerRange): string {
  const plural = pluralize(layerName);
  switch (state) {
    case "disabled":
      return `No ${plural} will be generated.`;
    case "on":
      return `A random count is picked from ${range.min}–${range.max}. You are guaranteed to get exactly that many ${plural}.`;
    case "off":
      return `A random count is picked from ${range.min}–${range.max}. Each slot has a coin-flip chance of being filled, so you may get fewer.`;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ForceInitialRollInfo({ range, layerName, exactLayerCounts }: ForceInitialRollInfoProps) {
  const state = deriveForceState(range, exactLayerCounts);
  const plural = pluralize(layerName);

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border/30 bg-background/40 p-3">
      <p className="text-xs leading-relaxed text-muted-foreground/70">
        The system picks a random count from your range.{" "}
        With <strong className="text-muted-foreground/90">force initial roll</strong> on,
        you get exactly that many {plural}.
        With it off, each slot has a coin-flip chance of being filled, so you may end up with fewer.
      </p>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            BADGE_STYLES[state],
          )}
        >
          {BADGE_LABELS[state]}
        </span>
        <span className="text-xs text-muted-foreground/60">
          {getMessage(state, layerName, range)}
        </span>
      </div>
    </div>
  );
}
