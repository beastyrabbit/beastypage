"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";

import {
  ELEMENTS_BY_ID,
  elementLabel,
  SCENE_ELEMENTS,
  SHAPES,
  THEMES,
} from "@/lib/scene-planner/catalog";
import { sampleTile, selectTile, TICK_MS } from "@/lib/scene-planner/render";
import {
  atlasEntries,
  E,
  groupTiles,
  N,
  S,
  SHAPE_LABELS,
  transitions,
  W,
} from "@/lib/scene-planner/tiles";
import { cn } from "@/lib/utils";

import { DURATION, EASE, seconds } from "./motion";
import { usePlanner } from "./usePlanner";

const MAX_TILES = 60;

/** Glyph cells in reading order with the side bit each shows. */
const GLYPH = [
  ["nw", 0],
  ["n", N],
  ["ne", 0],
  ["w", W],
  ["centre", -1],
  ["e", E],
  ["sw", 0],
  ["s", S],
  ["se", 0],
] as const;

/** How to place the picked element in the current view. */
function placeHint(active: string | null, diorama: boolean) {
  if (diorama)
    return "In the diorama, place with the arrow keys and Enter, or switch to the flat grid to drag.";
  if (!active)
    return "Pick an element, then drag a box on the grid. Touching elements of the same kind merge.";
  const label = ELEMENTS_BY_ID.get(active)?.label.toLowerCase();
  return `Drag on the grid to place ${label}. Paths follow your pointer.`;
}

/** 3 × 3 glyph of a neighbour mask: centre plus the joined sides. */
function MaskGlyph({ mask }: Readonly<{ mask: number }>) {
  return (
    <span className="grid size-3 grid-cols-3 grid-rows-3 gap-px" aria-hidden>
      {GLYPH.map(([id, bit]) => {
        const lit = bit === -1 ? true : Boolean(mask & bit);
        return <span key={id} className={lit ? "bg-primary" : "bg-white/10"} />;
      })}
    </span>
  );
}

export function AtlasMode() {
  const planner = usePlanner();
  const { settings, placements, starts, atmosphere, tool, setTool, reduced } =
    planner;
  const { cols, rows } = settings;

  const groups = useMemo(
    () => groupTiles(placements, cols, rows),
    [placements, cols, rows],
  );
  const allEntries = useMemo(
    () =>
      atlasEntries(groups, cols, rows, (group, cell, gridCols, gridRows) =>
        selectTile(group, cell, gridCols, gridRows, atmosphere.time),
      ),
    [groups, cols, rows, atmosphere.time],
  );
  // Each atlas tile is a live sample of the board, so only the first few draw.
  const entries = allEntries.slice(0, MAX_TILES);
  const shown =
    entries.length < allEntries.length
      ? `${entries.length} of ${allEntries.length}`
      : String(entries.length);
  const seams = useMemo(
    () => transitions(groups, cols, rows, starts),
    [groups, cols, rows, starts],
  );

  // Atlas tiles are cut from the live board, so they animate with it.
  const canvases = useRef(new Map<string, HTMLCanvasElement>());
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  useEffect(() => {
    const timer = setInterval(() => {
      const source = planner.stage.current?.canvas();
      if (!source) return;
      for (const entry of entriesRef.current) {
        const target = canvases.current.get(entry.key);
        if (target)
          sampleTile(source, target, entry.cell, planner.settings.cols);
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [planner]);

  const fillRest = () => {
    for (let i = 0; i < 80; i++) {
      const { builder, rng } = planner.nextTurn();
      if (builder.full) break;
      const chain = builder.roll(rng);
      if (!chain) break;
      planner.addChain(chain);
    }
  };

  const active = tool.kind === "place" ? tool.elementId : null;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="section-eyebrow">Palette</h3>
          <div className="flex gap-1.5">
            {(["inspect", "erase"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={tool.kind === kind}
                onClick={() => setTool({ kind })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold",
                  tool.kind === kind
                    ? "border-primary bg-primary/25"
                    : "border-white/15 hover:bg-white/10",
                )}
              >
                {kind === "inspect" ? "Select" : "Erase"}
              </button>
            ))}
            <button
              type="button"
              onClick={fillRest}
              className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold hover:bg-white/10"
            >
              Roll the rest
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {THEMES.map((theme) => (
            <div key={theme.id} className="flex flex-wrap items-center gap-1">
              <span className="w-16 text-[11px] font-semibold text-muted-foreground">
                {theme.label}
              </span>
              {SCENE_ELEMENTS.filter((e) => e.theme === theme.id).map((e) => {
                const name = elementLabel(e, atmosphere.time);
                return (
                  <motion.button
                    key={e.id}
                    type="button"
                    aria-label={name.label}
                    aria-pressed={active === e.id}
                    title={`${name.label} · ${SHAPES[e.shape]} · ${e.zones.join(", ")}`}
                    onClick={() =>
                      setTool(
                        active === e.id
                          ? { kind: "inspect" }
                          : { kind: "place", elementId: e.id },
                      )
                    }
                    whileTap={{ scale: 0.9 }}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg border text-base transition-colors",
                      active === e.id
                        ? "border-primary bg-primary/30 shadow-[0_0_12px_oklch(0.77_0.12_300/0.5)]"
                        : "border-white/10 bg-white/[0.04] hover:bg-white/10",
                    )}
                    style={{ transitionDuration: `${DURATION.snap}ms` }}
                  >
                    {name.icon}
                  </motion.button>
                );
              })}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {placeHint(active, planner.view === "diorama")}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="section-eyebrow">
          Tile atlas{" "}
          <span className="font-mono normal-case tracking-normal text-muted-foreground/70">
            · {shown} tiles
          </span>
        </h3>
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Every tile variant the scene needs shows up here.
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2">
            <AnimatePresence initial={false}>
              {entries.map((entry) => {
                const element = ELEMENTS_BY_ID.get(entry.elementId);
                return (
                  <motion.div
                    key={entry.key}
                    layout
                    className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-black/30 p-1.5"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{
                      duration: reduced ? 0 : seconds(DURATION.place),
                      ease: EASE.spring,
                    }}
                    title={`${element?.label} · ${SHAPE_LABELS[entry.shape]} · ×${entry.count}`}
                  >
                    <canvas
                      ref={(node) => {
                        if (node) canvases.current.set(entry.key, node);
                        else canvases.current.delete(entry.key);
                      }}
                      width={48}
                      height={48}
                      className="size-12 rounded-sm"
                      style={{ imageRendering: "pixelated" }}
                    />
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <MaskGlyph mask={entry.mask} />
                      {SHAPE_LABELS[entry.shape]}
                    </span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="section-eyebrow">Transitions</h3>
        {seams.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Edges where two materials meet, such as water against ground.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {seams.map((seam) => (
              <span
                key={seam.key}
                className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px]"
              >
                {seam.a} ↔ {seam.b}{" "}
                <span className="text-muted-foreground">×{seam.count}</span>
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
