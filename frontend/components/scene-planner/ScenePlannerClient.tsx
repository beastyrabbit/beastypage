"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import { cellCoverage, hasTransparency } from "@/lib/scene-planner/coverage";
import { cn } from "@/lib/utils";

import { AtlasMode } from "./AtlasMode";
import { BoardMode } from "./BoardMode";
import { Controls } from "./Controls";
import { GachaMode } from "./GachaMode";
import { DURATION, EASE, seconds, TEMPOS } from "./motion";
import { PlanList } from "./PlanList";
import { Stage } from "./Stage";
import { PlannerContext, usePlannerState, type ViewMode } from "./usePlanner";

type Mode = "board" | "gacha" | "atlas";

const MODES: { id: Mode; label: string; hint: string }[] = [
  {
    id: "board",
    label: "Board game",
    hint: "Roll the dice and walk the board",
  },
  { id: "gacha", label: "Gacha", hint: "Pull five reels at once" },
  { id: "atlas", label: "Tile atlas", hint: "Place tiles by hand" },
];

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: "flat", label: "Flat grid" },
  { id: "diorama", label: "Diorama" },
];

function Segmented<T extends string>({
  items,
  value,
  onChange,
  id,
  disabled,
}: {
  items: { id: T; label: string; hint?: string }[];
  value: T;
  onChange: (value: T) => void;
  id: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex rounded-full border border-white/10 bg-black/30 p-1">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          title={item.hint}
          disabled={disabled}
          onClick={() => onChange(item.id)}
          className={cn(
            "relative rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed",
            value === item.id
              ? "text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {value === item.id && (
            <motion.span
              layoutId={`${id}-pill`}
              className="absolute inset-0 rounded-full bg-primary"
              transition={{ duration: seconds(DURATION.snap), ease: EASE.out }}
            />
          )}
          <span className="relative">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

export function ScenePlannerClient() {
  const planner = usePlannerState();
  const [mode, setMode] = useState<Mode>("board");
  const { overlay, setOverlay, settings, rolling } = planner;

  // Measure how much of each cell the foreground covers.
  const overlaySrc = overlay?.src;
  useEffect(() => {
    if (!overlaySrc) return;
    const image = new Image();
    image.onload = () => {
      const width = settings.cols * 8;
      const height = settings.rows * 8;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(image, 0, 0, width, height);
      const { data } = ctx.getImageData(0, 0, width, height);
      const coverage = hasTransparency(data)
        ? cellCoverage(data, width, height, settings.cols, settings.rows)
        : null;
      setOverlay((current) =>
        current && current.src === overlaySrc
          ? { ...current, coverage }
          : current,
      );
    };
    image.src = overlaySrc;
  }, [overlaySrc, settings.cols, settings.rows, setOverlay]);

  const changeMode = (next: Mode) => {
    setMode(next);
    planner.setTool({ kind: "inspect" });
    planner.setCue(null);
  };

  return (
    <PlannerContext.Provider value={planner}>
      <div className="flex flex-col gap-6">
        <div className="glass-card flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:translate-none">
          <Segmented
            id="mode"
            items={MODES}
            value={mode}
            onChange={changeMode}
            disabled={rolling}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              id="view"
              items={VIEWS}
              value={planner.view}
              onChange={planner.setView}
            />
            <Segmented
              id="tempo"
              items={TEMPOS}
              value={planner.tempo}
              onChange={planner.setTempo}
            />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="glass-card p-4 hover:translate-none sm:p-6">
            <Stage />
          </div>
          <div className="glass-card overflow-hidden p-4 hover:translate-none sm:p-6">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{
                  duration: planner.reduced ? 0 : seconds(DURATION.snap),
                  ease: EASE.out,
                }}
              >
                {mode === "board" && <BoardMode />}
                {mode === "gacha" && <GachaMode />}
                {mode === "atlas" && <AtlasMode />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="glass-card p-4 hover:translate-none sm:p-6">
            <Controls />
          </div>
          <div className="glass-card p-4 hover:translate-none sm:p-6">
            <PlanList />
          </div>
        </div>
      </div>
    </PlannerContext.Provider>
  );
}
