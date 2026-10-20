"use client";

import { AnimatePresence, motion, useSpring } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import LockIcon from "@/components/ui/lock-icon";
import {
  ELEMENTS_BY_ID,
  elementLabel,
  ZONES,
  type Zone,
} from "@/lib/scene-planner/catalog";
import {
  canPlace,
  cellName,
  columnName,
  type Rect,
  rectCells,
  zoneBands,
  zoneOfRow,
} from "@/lib/scene-planner/generate";
import {
  CELL,
  PLACE_MS,
  renderScene,
  TICK_MS,
} from "@/lib/scene-planner/render";
import { loadTileSet } from "@/lib/scene-planner/tile-sheets";
import { cn } from "@/lib/utils";

import { DURATION, EASE, seconds } from "./motion";
import { usePlanner } from "./usePlanner";

/** Perspective distance of the diorama and each zone's depth in px. */
const PERSPECTIVE = 1400;
const DEPTH: Record<Zone, number> = { sky: -180, far: -90, mid: 0, front: 90 };
const PLAN_DEPTH = 92;
const SUBJECT_DEPTH = 150;

/** Translate and counter-scale so a layer lines up with the flat plan at rest. */
function depthTransform(z: number, on: boolean) {
  if (!on) return "translateZ(0px) scale(1)";
  return `translateZ(${z}px) scale(${(PERSPECTIVE - z) / PERSPECTIVE})`;
}

function pct(value: number, total: number) {
  return `${(value / total) * 100}%`;
}

function boxStyle(rect: Rect, cols: number, rows: number) {
  return {
    left: pct(rect.col, cols),
    top: pct(rect.row, rows),
    width: pct(rect.w, cols),
    height: pct(rect.h, rows),
  };
}

/** Cells on a straight 4-connected walk from `a` to `b`. */
function walk(a: number, b: number, cols: number) {
  const cells: number[] = [];
  let col = a % cols;
  let row = Math.floor(a / cols);
  const toCol = b % cols;
  const toRow = Math.floor(b / cols);
  while (col !== toCol || row !== toRow) {
    if (col !== toCol) col += Math.sign(toCol - col);
    else row += Math.sign(toRow - row);
    cells.push(row * cols + col);
  }
  return cells;
}

export function Stage() {
  const planner = usePlanner();
  const {
    settings,
    starts,
    placements,
    atmosphere,
    ignored,
    overlay,
    cue,
    tool,
    view,
    reduced,
    selected,
    setSelected,
    misplaced,
  } = planner;
  const { cols, rows } = settings;
  const diorama = view === "diorama";

  const baseRef = useRef<HTMLCanvasElement>(null);
  const bandRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const hitRef = useRef<HTMLDivElement>(null);
  const bands = useMemo(() => zoneBands(rows, starts), [rows, starts]);

  // Everything the render loop needs, refreshed on every render.
  const frameRef = useRef({
    cols,
    rows,
    starts,
    placements,
    atmosphere,
    reduced,
    bands,
  });
  frameRef.current = {
    cols,
    rows,
    starts,
    placements,
    atmosphere,
    reduced,
    bands,
  };

  useEffect(() => {
    // The loop picks the Blender tiles up as soon as they arrive.
    void loadTileSet();
    const off = document.createElement("canvas");
    offRef.current = off;
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    let raf = 0;
    let last = 0;
    let tick = 0;
    const { anim } = planner;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < TICK_MS) return;
      last = now;
      const f = frameRef.current;
      if (!f.reduced) tick++;
      const { appearing } = anim.current;
      if (f.reduced) {
        appearing.clear();
        anim.current.ghosts = [];
      }
      for (const [key, start] of appearing)
        if (now - start > PLACE_MS) appearing.delete(key);
      anim.current.ghosts = anim.current.ghosts.filter(
        (g) => now - g.start < PLACE_MS,
      );

      const width = f.cols * CELL;
      const height = f.rows * CELL;
      if (off.width !== width || off.height !== height) {
        off.width = width;
        off.height = height;
      }
      renderScene(offCtx, {
        cols: f.cols,
        rows: f.rows,
        starts: f.starts,
        placements: f.placements,
        atmosphere: f.atmosphere,
        appearing,
        ghosts: anim.current.ghosts,
        now,
        tick,
      });

      const base = baseRef.current;
      if (base) {
        if (base.width !== width || base.height !== height) {
          base.width = width;
          base.height = height;
        }
        base.getContext("2d")?.drawImage(off, 0, 0);
      }
      f.bands.forEach((band, i) => {
        const canvas = bandRefs.current[i];
        if (!canvas || band.rows <= 0) return;
        const h = band.rows * CELL;
        if (canvas.width !== width || canvas.height !== h) {
          canvas.width = width;
          canvas.height = h;
        }
        canvas
          .getContext("2d")
          ?.drawImage(off, 0, band.start * CELL, width, h, 0, 0, width, h);
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [planner]);

  useEffect(() => {
    planner.stage.current = {
      cellRect: (rect) => {
        const hit = hitRef.current;
        if (!hit) return null;
        const box = hit.getBoundingClientRect();
        return new DOMRect(
          box.left + (rect.col / cols) * box.width,
          box.top + (rect.row / rows) * box.height,
          (rect.w / cols) * box.width,
          (rect.h / rows) * box.height,
        );
      },
      canvas: () => offRef.current,
    };
  }, [planner.stage, cols, rows]);

  // ---------------------------------------------------------------------
  // Diorama tilt
  // ---------------------------------------------------------------------

  const spring = { stiffness: 80, damping: 18, mass: 0.6 };
  const rotateX = useSpring(0, spring);
  const rotateY = useSpring(0, spring);
  useEffect(() => {
    rotateX.set(diorama ? (reduced ? 8 : 6) : 0);
    rotateY.set(diorama && reduced ? -8 : 0);
  }, [diorama, reduced, rotateX, rotateY]);

  const onTilt = (event: React.PointerEvent) => {
    if (!diorama || reduced) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    rotateY.set(x * 14);
    rotateX.set(6 - y * 10);
  };

  // ---------------------------------------------------------------------
  // Pointer tools
  // ---------------------------------------------------------------------

  const [hover, setHover] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ start: number; cells: number[] } | null>(
    null,
  );
  const paintValue = useRef(true);
  const occupied = useMemo(() => {
    // Riders such as ducks win over their host: they are what you point at.
    const map = new Map<number, string>();
    const rides = (id: string) => Boolean(ELEMENTS_BY_ID.get(id)?.on);
    for (const p of placements)
      if (!rides(p.elementId)) for (const cell of p.cells) map.set(cell, p.key);
    for (const p of placements)
      if (rides(p.elementId)) for (const cell of p.cells) map.set(cell, p.key);
    return map;
  }, [placements]);

  const cellAt = useCallback(
    (event: React.PointerEvent) => {
      const hit = hitRef.current;
      if (!hit) return null;
      const box = hit.getBoundingClientRect();
      const col = Math.floor(((event.clientX - box.left) / box.width) * cols);
      const row = Math.floor(((event.clientY - box.top) / box.height) * rows);
      if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
      return row * cols + col;
    },
    [cols, rows],
  );

  const placeElement =
    tool.kind === "place" ? ELEMENTS_BY_ID.get(tool.elementId) : undefined;

  const draftCells = useCallback(
    (start: number, end: number, trail: number[]) => {
      if (!placeElement) return [];
      if (placeElement.shape === "point") return [end];
      if (placeElement.shape === "path") return trail;
      const rect = {
        col: Math.min(start % cols, end % cols),
        row: Math.min(Math.floor(start / cols), Math.floor(end / cols)),
        w: Math.abs((start % cols) - (end % cols)) + 1,
        h: Math.abs(Math.floor(start / cols) - Math.floor(end / cols)) + 1,
      };
      return rectCells(rect, cols);
    },
    [placeElement, cols],
  );

  const onPointerDown = (event: React.PointerEvent) => {
    const cell = cellAt(event);
    if (cell === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool.kind === "paint") {
      paintValue.current = !ignored[cell];
      planner.paintCell(cell, paintValue.current);
    } else if (tool.kind === "place") {
      setDraft({ start: cell, cells: draftCells(cell, cell, [cell]) });
    } else if (tool.kind === "erase") {
      const key = occupied.get(cell);
      const target = planner.placements.find((p) => p.key === key);
      if (target && !target.locked) planner.remove([target.key]);
    } else {
      const key = occupied.get(cell) ?? null;
      setSelected(key === selected ? null : key);
    }
  };

  const onPointerMove = (event: React.PointerEvent) => {
    onTilt(event);
    const cell = cellAt(event);
    setHover(cell);
    if (
      cell === null ||
      !event.currentTarget.hasPointerCapture(event.pointerId)
    )
      return;
    if (tool.kind === "paint") planner.paintCell(cell, paintValue.current);
    if (tool.kind === "place" && draft) {
      const last = draft.cells[draft.cells.length - 1];
      const trail =
        placeElement?.shape === "path" && cell !== last
          ? [
              ...draft.cells,
              ...walk(last, cell, cols).filter((c) => !draft.cells.includes(c)),
            ]
          : draft.cells;
      setDraft({
        start: draft.start,
        cells:
          placeElement?.shape === "path"
            ? trail
            : draftCells(draft.start, cell, trail),
      });
    }
  };

  const onPointerUp = () => {
    if (tool.kind === "place" && draft && placeElement) {
      const colsOf = draft.cells.map((c) => c % cols);
      const rowsOf = draft.cells.map((c) => Math.floor(c / cols));
      const rect =
        placeElement.shape === "path"
          ? undefined
          : {
              col: Math.min(...colsOf),
              row: Math.min(...rowsOf),
              w: Math.max(...colsOf) - Math.min(...colsOf) + 1,
              h: Math.max(...rowsOf) - Math.min(...rowsOf) + 1,
            };
      planner.placeManual(placeElement.id, draft.cells, rect);
    }
    setDraft(null);
  };

  const draftValid =
    draft && placeElement
      ? canPlace(placements, placeElement.id, draft.cells)
      : true;

  // ---------------------------------------------------------------------
  // Overlay content
  // ---------------------------------------------------------------------

  const ratio = overlay?.aspect ?? cols / rows;
  const selectedPlacement = placements.find((p) => p.key === selected);
  const hoverElement =
    hover !== null
      ? ELEMENTS_BY_ID.get(
          placements.find((p) => p.key === occupied.get(hover))?.elementId ??
            "",
        )
      : undefined;
  const transition = (ms: number, ease: readonly number[]) => ({
    duration: reduced ? 0 : seconds(ms),
    ease: ease as [number, number, number, number],
  });
  const sceneTransition = `transform ${reduced ? 0 : DURATION.scene}ms cubic-bezier(${EASE.inout.join(",")})`;

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative mx-auto"
        style={{
          width: `min(100%, calc(72vh * ${ratio}))`,
          paddingLeft: 22,
          paddingTop: 18,
        }}
      >
        {/* Coordinates, flat view only */}
        <div
          className="pointer-events-none absolute top-0 right-0 left-[22px] flex font-mono text-[10px] text-muted-foreground/70 transition-opacity"
          style={{
            opacity: diorama ? 0 : 1,
            transitionDuration: `${DURATION.snap}ms`,
          }}
        >
          {Array.from({ length: cols }, (_, c) => columnName(c)).map((name) => (
            <span key={name} className="flex-1 text-center">
              {name}
            </span>
          ))}
        </div>
        <div
          className="pointer-events-none absolute top-[18px] bottom-0 left-0 flex w-[22px] flex-col font-mono text-[10px] text-muted-foreground/70 transition-opacity"
          style={{
            opacity: diorama ? 0 : 1,
            transitionDuration: `${DURATION.snap}ms`,
          }}
        >
          {Array.from({ length: rows }, (_, r) => String(r + 1)).map(
            (label) => (
              <span
                key={label}
                className="flex flex-1 items-center justify-center"
              >
                {label}
              </span>
            ),
          )}
        </div>

        <div
          className="relative w-full select-none"
          style={{ aspectRatio: ratio, perspective: PERSPECTIVE }}
          onPointerLeave={() => {
            setHover(null);
            if (diorama && !reduced) {
              rotateX.set(6);
              rotateY.set(0);
            }
          }}
        >
          <motion.div
            className="absolute inset-0"
            style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
          >
            {/* Flat picture underneath; the zone layers sit on top of it. */}
            <canvas
              ref={baseRef}
              className="absolute inset-0 h-full w-full overflow-hidden rounded-xl transition-opacity"
              style={{
                imageRendering: "pixelated",
                opacity: diorama ? 0 : 1,
                transitionDuration: `${DURATION.scene}ms`,
              }}
            />
            {bands.map((band, i) => (
              <div
                key={band.zone}
                className="pointer-events-none absolute inset-0"
                style={{
                  transform: depthTransform(DEPTH[band.zone], diorama),
                  transition: sceneTransition,
                }}
              >
                <canvas
                  ref={(node) => {
                    bandRefs.current[i] = node;
                  }}
                  className={cn(
                    "absolute w-full",
                    diorama &&
                      "rounded-sm shadow-[0_18px_30px_-12px_rgba(0,0,0,0.7)]",
                  )}
                  style={{
                    imageRendering: "pixelated",
                    top: pct(band.start, rows),
                    height: pct(band.rows, rows),
                    opacity: diorama ? 1 : 0,
                  }}
                />
                {diorama && (
                  <span
                    className="absolute left-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/70"
                    style={{ top: `calc(${pct(band.start, rows)} + 4px)` }}
                  >
                    {ZONES.find((z) => z.id === band.zone)?.label}
                  </span>
                )}
              </div>
            ))}

            {/* Plan layer: grid, ignored cells, cues, pins */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                transform: depthTransform(PLAN_DEPTH, diorama),
                transition: sceneTransition,
              }}
            >
              <div
                className="absolute inset-0 transition-opacity"
                style={{
                  opacity: diorama ? 0 : 1,
                  transitionDuration: `${DURATION.snap}ms`,
                  backgroundImage:
                    "linear-gradient(to right, rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.12) 1px, transparent 1px)",
                  backgroundSize: `${100 / cols}% ${100 / rows}%`,
                }}
              />
              {ignored.map((on, cell) =>
                on ? (
                  <motion.div
                    // biome-ignore lint/suspicious/noArrayIndexKey: cells are fixed positions
                    key={cell}
                    className="absolute bg-[repeating-linear-gradient(135deg,rgba(9,11,19,0.55)_0_3px,rgba(9,11,19,0.15)_3px_6px)] outline outline-1 outline-white/10"
                    style={boxStyle(
                      {
                        col: cell % cols,
                        row: Math.floor(cell / cols),
                        w: 1,
                        h: 1,
                      },
                      cols,
                      rows,
                    )}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={transition(DURATION.snap, EASE.out)}
                  />
                ) : null,
              )}

              <AnimatePresence>
                {cue?.zones &&
                  bands.map((band) => {
                    const allowed = cue.zones?.includes(band.zone);
                    return (
                      <motion.div
                        key={`zone-${band.zone}`}
                        className={cn(
                          "absolute inset-x-0",
                          allowed
                            ? "bg-primary/10 shadow-[inset_0_0_0_2px_oklch(0.77_0.12_300/0.7)]"
                            : "bg-[#090b13]/55",
                        )}
                        style={{
                          top: pct(band.start, rows),
                          height: pct(band.rows, rows),
                        }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={transition(DURATION.snap, EASE.out)}
                      />
                    );
                  })}
              </AnimatePresence>

              {cue?.trail?.map((cell, i) => (
                <motion.div
                  key={`trail-${cell}`}
                  className="absolute rounded-sm bg-sky-300/35 outline outline-1 outline-sky-200/80"
                  style={boxStyle(
                    {
                      col: cell % cols,
                      row: Math.floor(cell / cols),
                      w: 1,
                      h: 1,
                    },
                    cols,
                    rows,
                  )}
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    ...transition(DURATION.snap, EASE.spring),
                    delay: reduced ? 0 : i * 0.03,
                  }}
                />
              ))}

              <AnimatePresence>
                {cue?.box && (
                  <motion.div
                    key="locator"
                    className={cn(
                      "absolute rounded-md border-2",
                      cue.box.locked
                        ? "border-amber-200 bg-amber-200/20 shadow-[0_0_24px_rgba(253,230,138,0.6)]"
                        : "border-primary bg-primary/15 shadow-[0_0_18px_oklch(0.77_0.12_300/0.6)]",
                    )}
                    initial={{ opacity: 0, ...boxStyle(cue.box, cols, rows) }}
                    animate={{
                      opacity: 1,
                      ...boxStyle(cue.box, cols, rows),
                      scale: cue.box.locked ? [1.18, 1] : 1,
                    }}
                    exit={{ opacity: 0 }}
                    transition={transition(
                      DURATION.snap,
                      cue.box.locked ? EASE.spring : EASE.out,
                    )}
                  >
                    <span className="absolute -top-6 left-0 whitespace-nowrap rounded-full bg-black/70 px-2 py-0.5 font-mono text-[11px] text-white">
                      {cellName(cue.box.row * cols + cue.box.col, cols)}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              {placements.map((p) => {
                if (!p.locked && p.key !== selected && !misplaced.has(p.key))
                  return null;
                const first = p.rect ?? {
                  col: p.cells[0] % cols,
                  row: Math.floor(p.cells[0] / cols),
                  w: 1,
                  h: 1,
                };
                return (
                  <div
                    key={`pin-${p.key}`}
                    className="absolute"
                    style={boxStyle(first, cols, rows)}
                  >
                    {p.key === selected && (
                      <motion.div
                        className="absolute inset-0 rounded-md outline outline-2 outline-white/90"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{
                          duration: reduced ? 0 : seconds(DURATION.scan * 2),
                          repeat: reduced ? 0 : Number.POSITIVE_INFINITY,
                        }}
                      />
                    )}
                    {p.locked && (
                      <motion.span
                        className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-amber-300 text-amber-950 shadow"
                        initial={{ scale: 1.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={transition(DURATION.snap, EASE.spring)}
                      >
                        <LockIcon size={12} strokeWidth={2.5} />
                      </motion.span>
                    )}
                    {misplaced.has(p.key) && (
                      <span
                        className="absolute -top-2 -left-2 flex size-5 items-center justify-center rounded-full bg-rose-400 text-[11px] font-bold text-rose-950"
                        title="Outside its zone"
                      >
                        !
                      </span>
                    )}
                  </div>
                );
              })}

              {draft?.cells.map((cell) => (
                <div
                  key={`draft-${cell}`}
                  className={cn(
                    "absolute outline outline-2 -outline-offset-2",
                    draftValid
                      ? "bg-emerald-300/25 outline-emerald-200"
                      : "bg-rose-400/25 outline-rose-300",
                  )}
                  style={boxStyle(
                    {
                      col: cell % cols,
                      row: Math.floor(cell / cols),
                      w: 1,
                      h: 1,
                    },
                    cols,
                    rows,
                  )}
                />
              ))}
            </div>

            {/* Foreground subject floats in front of every layer. */}
            <AnimatePresence>
              {overlay?.visible && (
                // biome-ignore lint/performance/noImgElement: local data URL, stretched over the grid
                <motion.img
                  key="subject"
                  src={overlay.src}
                  alt="Foreground overlay"
                  className="pointer-events-none absolute inset-0 h-full w-full object-fill"
                  style={{
                    transform: depthTransform(SUBJECT_DEPTH, diorama),
                    transition: sceneTransition,
                  }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: overlay.opacity, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={transition(DURATION.place, EASE.out)}
                />
              )}
            </AnimatePresence>
          </motion.div>

          {/* Flat hit area for pointer tools. */}
          <div
            ref={hitRef}
            className={cn(
              "absolute inset-0 touch-none",
              tool.kind === "paint" && "cursor-cell",
              tool.kind === "place" && "cursor-crosshair",
              tool.kind === "erase" && "cursor-not-allowed",
              tool.kind === "inspect" && "cursor-pointer",
            )}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDraft(null)}
          />
        </div>
      </div>

      <div className="flex min-h-6 flex-wrap items-center justify-between gap-2 px-1 font-mono text-xs text-muted-foreground">
        <span>
          {hover !== null
            ? `${cellName(hover, cols)} · ${ZONES.find((z) => z.id === zoneOfRow(Math.floor(hover / cols), starts))?.label}${
                ignored[hover] ? " · ignored" : ""
              }${hoverElement ? ` · ${elementLabel(hoverElement, atmosphere.time).label}` : ""}`
            : `${cols} × ${rows} cells`}
        </span>
        {selectedPlacement && (
          <span className="flex items-center gap-2">
            {(() => {
              const element = ELEMENTS_BY_ID.get(selectedPlacement.elementId);
              return element
                ? `${element.icon} ${elementLabel(element, atmosphere.time).label}`
                : "";
            })()}
            <button
              type="button"
              className="rounded-full border border-white/15 px-2 py-0.5 hover:bg-white/10"
              onClick={() => planner.toggleLock(selectedPlacement.key)}
            >
              {selectedPlacement.locked ? "Unlock" : "Lock"}
            </button>
            {!selectedPlacement.locked && (
              <button
                type="button"
                className="rounded-full border border-white/15 px-2 py-0.5 hover:bg-white/10"
                onClick={() => {
                  planner.remove([selectedPlacement.key]);
                  setSelected(null);
                }}
              >
                Remove
              </button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
