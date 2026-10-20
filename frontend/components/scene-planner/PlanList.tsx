"use client";

import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";

import CopyIcon from "@/components/ui/copy-icon";
import LockIcon from "@/components/ui/lock-icon";
import XIcon from "@/components/ui/x-icon";
import {
  ELEMENTS_BY_ID,
  elementLabel,
  TIMES_OF_DAY,
} from "@/lib/scene-planner/catalog";
import {
  describeCells,
  type Placement,
  randomSeed,
} from "@/lib/scene-planner/generate";
import { exportCanvas } from "@/lib/scene-planner/render";
import { cn } from "@/lib/utils";

import { DURATION, EASE, seconds } from "./motion";
import { type Planner, usePlanner } from "./usePlanner";

function sortKey(p: Placement) {
  return Math.min(...p.cells);
}

/**
 * The element a placement feeds, such as the stream the generator started
 * below a waterfall; undefined when there is none. A stream drawn by hand
 * near a waterfall is not fed by it.
 */
function feedsInto(p: Placement, placements: Placement[]) {
  return placements.find((q) => q.fedBy === p.key)?.elementId;
}

function planText(planner: Planner) {
  const { settings, atmosphere, placements, ignored } = planner;
  const time = TIMES_OF_DAY.find((t) => t.id === atmosphere.time)?.label;
  const lines = [
    `Scene plan · ${settings.cols}×${settings.rows} · seed ${settings.seed}`,
    `${time} · ${atmosphere.season} · ${atmosphere.weather}`,
    "",
  ];
  for (const p of [...placements].sort((a, b) => sortKey(a) - sortKey(b))) {
    const element = ELEMENTS_BY_ID.get(p.elementId);
    if (!element) continue;
    const fed = feedsInto(p, placements);
    const feeds = fed
      ? ` (feeds a ${ELEMENTS_BY_ID.get(fed)?.label.toLowerCase()})`
      : "";
    lines.push(
      `${describeCells(p, settings.cols).padEnd(9)} ${elementLabel(element, atmosphere.time).label}${feeds}`,
    );
  }
  const hidden = ignored.filter(Boolean).length;
  if (hidden > 0) lines.push("", `Ignored cells: ${hidden}`);
  return lines.join("\n");
}

export function PlanList() {
  const planner = usePlanner();
  const {
    placements,
    settings,
    atmosphere,
    misplaced,
    selected,
    setSelected,
    rolling,
    reduced,
  } = planner;
  const sorted = [...placements].sort((a, b) => sortKey(a) - sortKey(b));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(planText(planner));
      toast.success("Plan copied");
    } catch {
      toast.error("Could not copy the plan");
    }
  };

  const exportPng = () => {
    const scale = Math.max(2, Math.floor(1280 / (settings.cols * 16)));
    const canvas = exportCanvas(
      {
        cols: settings.cols,
        rows: settings.rows,
        starts: planner.starts,
        placements,
        atmosphere,
        appearing: new Map(),
        ghosts: [],
        now: 0,
        tick: 0,
      },
      scale,
      true,
      planner.overlay,
    );
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `scene-plan-${settings.seed}.png`;
      link.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="section-eyebrow">
          Plan{" "}
          <span className="font-mono normal-case tracking-normal text-muted-foreground/70">
            · {placements.length}
          </span>
        </h3>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={copy}
            disabled={placements.length === 0}
            className="flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
          >
            <CopyIcon size={12} /> Copy text
          </button>
          <button
            type="button"
            onClick={exportPng}
            disabled={placements.length === 0}
            className="rounded-full border border-white/10 px-2.5 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
          >
            Export PNG
          </button>
          <button
            type="button"
            onClick={() => planner.rollScene(randomSeed())}
            disabled={rolling}
            className="rounded-full border border-white/10 px-2.5 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
            title="Roll everything that is not locked again"
          >
            Re-roll unlocked
          </button>
          <button
            type="button"
            onClick={planner.clearUnlocked}
            disabled={rolling || placements.every((p) => p.locked)}
            className="rounded-full border border-white/10 px-2.5 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
          >
            Clear unlocked
          </button>
        </div>
      </div>

      {placements.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing planned yet. Roll the dice, pull the reels, or place tiles by
          hand.
        </p>
      ) : (
        <ul className="flex max-h-[420px] flex-col gap-1 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {sorted.map((p) => {
              const element = ELEMENTS_BY_ID.get(p.elementId);
              if (!element) return null;
              const name = elementLabel(element, atmosphere.time);
              return (
                <motion.li
                  key={p.key}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{
                    duration: reduced ? 0 : seconds(DURATION.snap),
                    ease: EASE.out,
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-sm transition-colors",
                    p.key === selected
                      ? "border-white/40 bg-white/10"
                      : "border-transparent hover:bg-white/5",
                    p.locked && "bg-amber-300/[0.07]",
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() =>
                      setSelected(p.key === selected ? null : p.key)
                    }
                  >
                    <span className="text-base">{name.icon}</span>
                    <span className="truncate">{name.label}</span>
                    <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                      {describeCells(p, settings.cols)}
                    </span>
                  </button>
                  {misplaced.has(p.key) && (
                    <span
                      className="text-xs text-rose-300"
                      title="The horizon moved; this element is outside its zone now"
                    >
                      zone
                    </span>
                  )}
                  <button
                    type="button"
                    title={
                      p.locked ? "Unlock" : "Lock: keep it when re-rolling"
                    }
                    onClick={() => planner.toggleLock(p.key)}
                    className={cn(
                      "rounded-md p-1 transition-colors",
                      p.locked
                        ? "text-amber-200"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <LockIcon size={14} />
                  </button>
                  <button
                    type="button"
                    title="Remove"
                    disabled={p.locked || rolling}
                    onClick={() => planner.remove([p.key])}
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <XIcon size={14} />
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
