"use client";

import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { type ReactNode, useState } from "react";

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
  label,
  disabled,
}: Readonly<{
  items: { id: T; label: string; hint?: string }[];
  value: T;
  onChange: (value: T) => void;
  id: string;
  label: string;
  disabled?: boolean;
}>) {
  return (
    <fieldset
      aria-label={label}
      className="flex rounded-full border border-white/10 bg-black/30 p-1"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          title={item.hint}
          disabled={disabled}
          aria-pressed={value === item.id}
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
    </fieldset>
  );
}

function ModePanel({
  children,
  reduced,
}: Readonly<{ children: ReactNode; reduced: boolean }>) {
  const present = useIsPresent();
  return (
    <motion.div
      inert={!present}
      style={{ pointerEvents: present ? undefined : "none" }}
      onClickCapture={(event) => {
        if (!present) event.stopPropagation();
      }}
      onKeyDownCapture={(event) => {
        if (!present) event.stopPropagation();
      }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{
        duration: reduced ? 0 : seconds(DURATION.snap),
        ease: EASE.out,
      }}
    >
      {children}
    </motion.div>
  );
}

export function ScenePlannerClient() {
  const planner = usePlannerState();
  const [mode, setMode] = useState<Mode>("board");
  const { rolling } = planner;

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
            label="Mode"
            items={MODES}
            value={mode}
            onChange={changeMode}
            disabled={rolling}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              id="view"
              label="View"
              items={VIEWS}
              value={planner.view}
              onChange={planner.setView}
            />
            <Segmented
              id="tempo"
              label="Tempo"
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
              <ModePanel key={mode} reduced={planner.reduced}>
                {mode === "board" && <BoardMode />}
                {mode === "gacha" && <GachaMode />}
                {mode === "atlas" && <AtlasMode />}
              </ModePanel>
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
