"use client";

import { AnimatePresence, motion, useAnimate } from "motion/react";
import { useEffect, useRef, useState } from "react";

import {
  ELEMENTS_BY_ID,
  elementLabel,
  SCENE_ELEMENTS,
  THEMES,
  type Theme,
} from "@/lib/scene-planner/catalog";
import {
  pick,
  type RollChain,
  rollAtmosphere,
} from "@/lib/scene-planner/generate";
import { cn } from "@/lib/utils";

import { chainLocation, DRIFT_ARROW, revealOnStage } from "./choreography";
import { DURATION, EASE, seconds } from "./motion";
import { usePlanner } from "./usePlanner";

type SquareKind = Theme | "start" | "storm" | "bloom" | "free" | "weather";

const EVENTS: Record<
  Exclude<SquareKind, Theme>,
  { icon: string; label: string; hint: string }
> = {
  start: { icon: "🏁", label: "Wild", hint: "Roll any open category" },
  storm: { icon: "🌪️", label: "Storm", hint: "Blows one unlocked element away" },
  bloom: { icon: "🌱", label: "Bloom", hint: "Two rolls this turn" },
  free: { icon: "✏️", label: "Free draw", hint: "Place anything by hand, 15 s" },
  weather: { icon: "🌦️", label: "Weather", hint: "Re-roll the atmosphere" },
};

// 24 squares clockwise around an 8 × 6 board. Woods and fields get three
// squares each so nature leads the picture.
const SQUARES: SquareKind[] = [
  "start",
  "sky",
  "nature",
  "fields",
  "storm",
  "wildlife",
  "water",
  "free",
  "village",
  "nature",
  "urban",
  "bloom",
  "fields",
  "coast",
  "wildlife",
  "weather",
  "nature",
  "water",
  "village",
  "bloom",
  "fields",
  "sky",
  "coast",
  "urban",
];
const BOARD_COLS = 8;
const BOARD_ROWS = 6;
const FREE_DRAW_MS = 15000;

function squarePosition(index: number) {
  const top = BOARD_COLS;
  const right = top + BOARD_ROWS - 2;
  const bottom = right + BOARD_COLS;
  if (index < top) return { col: index, row: 0 };
  if (index < right) return { col: BOARD_COLS - 1, row: index - top + 1 };
  if (index < bottom)
    return { col: BOARD_COLS - 1 - (index - right), row: BOARD_ROWS - 1 };
  return { col: 0, row: BOARD_ROWS - 2 - (index - bottom) };
}

function squareInfo(kind: SquareKind) {
  const theme = THEMES.find((t) => t.id === kind);
  if (theme)
    return {
      icon: theme.icon,
      label: theme.label,
      hint: `Roll a ${theme.label.toLowerCase()} element`,
    };
  return EVENTS[kind as Exclude<SquareKind, Theme>];
}

// Rotation that shows each face of the die to the viewer.
const FACE_ROTATION: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: -90 },
  3: { x: -90, y: 0 },
  4: { x: 90, y: 0 },
  5: { x: 0, y: 90 },
  6: { x: 0, y: 180 },
};
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ],
  5: [
    [0, 0],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 2],
  ],
  6: [
    [0, 0],
    [0, 2],
    [1, 0],
    [1, 2],
    [2, 0],
    [2, 2],
  ],
};
const FACE_TRANSFORM: Record<number, string> = {
  1: "rotateY(0deg)",
  2: "rotateY(90deg)",
  3: "rotateX(90deg)",
  4: "rotateX(-90deg)",
  5: "rotateY(-90deg)",
  6: "rotateY(180deg)",
};

function Die({
  scope,
}: Readonly<{ scope: React.RefObject<HTMLDivElement | null> }>) {
  return (
    <div className="size-11" style={{ perspective: 400 }}>
      <div
        ref={scope}
        className="relative size-11"
        style={{ transformStyle: "preserve-3d" }}
      >
        {[1, 2, 3, 4, 5, 6].map((face) => (
          <div
            key={face}
            className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-0.5 rounded-lg border border-white/30 bg-gradient-to-br from-white to-violet-100 p-1.5 shadow-inner"
            style={{
              transform: `${FACE_TRANSFORM[face]} translateZ(22px)`,
              backfaceVisibility: "hidden",
            }}
          >
            {PIPS[face].map(([r, c]) => (
              <span
                key={`${r}${c}`}
                className="size-1.5 place-self-center rounded-full bg-violet-950"
                style={{ gridRow: r + 1, gridColumn: c + 1 }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface Readout {
  title: string;
  icon?: string;
  detail?: string;
  tone?: "event" | "empty" | "element";
}

export function BoardMode() {
  const planner = usePlanner();
  const { director, settings, rolling, setRolling, reduced } = planner;
  const [position, setPosition] = useState(0);
  const [flash, setFlash] = useState<number | null>(null);
  const [flipped, setFlipped] = useState<{
    index: number;
    icon: string;
  } | null>(null);
  const [readout, setReadout] = useState<Readout | null>(null);
  const [log, setLog] = useState<{ id: number; text: string }[]>([]);
  const logId = useRef(0);
  const [freeDraw, setFreeDraw] = useState<{ until: number } | null>(null);
  const [auto, setAuto] = useState(false);
  const autoRef = useRef(false);
  const freeDone = useRef<(() => void) | null>(null);
  /** Themes whose roll found no room since the board last changed. */
  const stuck = useRef(new Set<Theme>());

  const [tokenScope, animateToken] = useAnimate<HTMLDivElement>();
  const [dieA, animateA] = useAnimate<HTMLDivElement>();
  const [dieB, animateB] = useAnimate<HTMLDivElement>();
  const positionRef = useRef(0);
  const { placements } = planner;

  // Free draw ends when the artist places something new; removals in the
  // meantime do not count against it.
  const placedAtStart = useRef(new Set<string>());
  useEffect(() => {
    if (freeDraw && placements.some((p) => !placedAtStart.current.has(p.key)))
      freeDone.current?.();
  }, [freeDraw, placements]);

  const note = (text: string) => {
    const id = logId.current++;
    setLog((current) => [{ id, text }, ...current].slice(0, 6));
  };

  async function tumble(a: number, b: number) {
    const turns = (value: number) => {
      const face = FACE_ROTATION[value];
      return { rotateX: face.x - 720, rotateY: face.y + 720 };
    };
    const options = {
      duration: seconds(director.scale(DURATION.tumble)),
      ease: EASE.out,
    };
    await Promise.all([
      animateA(
        dieA.current,
        { rotateX: [0, turns(a).rotateX], rotateY: [0, turns(a).rotateY] },
        options,
      ),
      animateB(
        dieB.current,
        { rotateX: [0, turns(b).rotateX], rotateY: [0, turns(b).rotateY] },
        options,
      ),
    ]);
  }

  async function walkTo(steps: number) {
    for (let i = 1; i <= steps; i++) {
      const index = (positionRef.current + 1) % SQUARES.length;
      positionRef.current = index;
      const { col, row } = squarePosition(index);
      setFlash(index);
      const duration = seconds(director.scale(DURATION.walk * 2));
      await animateToken(
        tokenScope.current,
        {
          left: `${(col / BOARD_COLS) * 100}%`,
          top: `${(row / BOARD_ROWS) * 100}%`,
          y: duration > 0 ? [0, -16, 0] : 0,
        },
        { duration, ease: EASE.inout },
      );
    }
    setPosition(positionRef.current);
    setFlash(null);
  }

  async function rollElement(theme: Theme | undefined, label: string) {
    const { builder, rng } = planner.nextTurn();
    const open = builder.openThemes();
    const category = theme ?? (open.length > 0 ? pick(rng, open) : undefined);
    const chain: RollChain | null =
      category && open.includes(category)
        ? builder.roll(rng, { theme: category })
        : null;
    if (!chain) {
      if (category) stuck.current.add(category);
      setReadout({
        title: "Nothing fits",
        detail: `No ${label.toLowerCase()} element has room left`,
        tone: "empty",
      });
      note(`${label}: no room`);
      await director.wait(DURATION.step);
      return;
    }
    stuck.current.clear();
    // A Weather square earlier in this run may have changed the time.
    const { time } = planner.latest.current.atmosphere;
    const name = elementLabel(chain.element, time);
    setFlipped({ index: positionRef.current, icon: name.icon });
    setReadout({
      title: name.label,
      icon: name.icon,
      detail: `${squareInfo(chain.theme).label} · variant`,
      tone: "element",
    });
    await director.wait(DURATION.flip + DURATION.step);
    const where = chainLocation(chain, settings.cols);
    setReadout({
      title: name.label,
      icon: name.icon,
      detail: chain.path
        ? `${where} · ${chain.path.length} cells ${DRIFT_ARROW[chain.path.drift]}`
        : `Location ${where}`,
      tone: "element",
    });
    await revealOnStage(planner, chain);
    note(
      `${name.icon} ${name.label} at ${where}${chain.fed ? " + stream" : ""}`,
    );
  }

  async function playSquare(kind: SquareKind, autoplay: boolean) {
    const info = squareInfo(kind);
    if (THEMES.some((t) => t.id === kind)) {
      const theme = kind as Theme;
      // Themes can be switched on or off while autoplay runs.
      if (!planner.latest.current.settings.themes.includes(theme)) {
        setReadout({
          title: "Closed",
          detail: `${info.label} is switched off`,
          tone: "empty",
        });
        note(`${info.label}: closed`);
        await director.wait(DURATION.step);
        return;
      }
      setReadout({
        title: info.label,
        icon: info.icon,
        detail: "Category",
        tone: "element",
      });
      await director.wait(DURATION.step);
      await rollElement(theme, info.label);
      return;
    }

    setReadout({
      title: info.label,
      icon: info.icon,
      detail: info.hint,
      tone: "event",
    });
    await director.wait(DURATION.step * 1.5);

    if (kind === "start") {
      await rollElement(undefined, "Wild");
    } else if (kind === "bloom") {
      await rollElement(undefined, "Bloom");
      await rollElement(undefined, "Bloom");
    } else if (kind === "weather") {
      const { rng } = planner.nextTurn();
      const next = rollAtmosphere(rng);
      planner.latest.current.atmosphere = next;
      planner.setAtmosphere(next);
      note(`🌦️ ${next.time} · ${next.season} · ${next.weather}`);
    } else if (kind === "storm") {
      const { rng } = planner.nextTurn();
      const loose = planner.latest.current.placements.filter((p) => !p.locked);
      if (loose.length === 0) {
        note("🌪️ Storm passed, nothing loose");
        return;
      }
      const victim = pick(rng, loose);
      const element = ELEMENTS_BY_ID.get(victim.elementId);
      planner.remove([victim.key]);
      // The storm made room again.
      stuck.current.clear();
      note(`🌪️ Storm took ${element?.label ?? victim.elementId}`);
      await director.wait(DURATION.place);
    } else if (kind === "free") {
      if (autoplay) {
        await rollElement(undefined, "Free draw");
        return;
      }
      // Skip pressed earlier in this turn also skips the drawing time.
      if (director.skipped) {
        note("✏️ Free draw skipped");
        return;
      }
      placedAtStart.current = new Set(
        planner.latest.current.placements.map((p) => p.key),
      );
      setFreeDraw({ until: Date.now() + FREE_DRAW_MS });
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, FREE_DRAW_MS);
        freeDone.current = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      freeDone.current = null;
      setFreeDraw(null);
      planner.setTool({ kind: "inspect" });
      note("✏️ Free draw done");
    }
  }

  async function takeTurn(autoplay = false) {
    const { rng } = planner.nextTurn();
    const a = 1 + Math.floor(rng() * 6);
    const b = 1 + Math.floor(rng() * 6);
    setReadout({ title: "Rolling…" });
    setFlipped(null);
    await tumble(a, b);
    setReadout({ title: `${a} + ${b} = ${a + b}`, detail: "squares to walk" });
    await walkTo(a + b);
    await playSquare(SQUARES[positionRef.current], autoplay);
    setFlipped(null);
  }

  async function run(autoplay: boolean) {
    if (rolling) return;
    director.reset();
    setRolling(true);
    autoRef.current = autoplay;
    setAuto(autoplay);
    stuck.current.clear();
    try {
      let turns = 0;
      do {
        await takeTurn(autoplay);
        turns++;
        const status = planner.boardStatus();
        // Themes can stay open by count while none of their elements fits.
        const open = status.open.filter((t) => !stuck.current.has(t));
        if (status.full || open.length === 0) break;
      } while (autoRef.current && turns < 60);
    } finally {
      planner.setCue(null);
      setRolling(false);
      setAuto(false);
      autoRef.current = false;
      director.reset();
    }
  }

  const tokenPos = squarePosition(position);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative mx-auto aspect-[8/6] w-full max-w-[520px]">
        <div className="absolute inset-0 grid grid-cols-8 grid-rows-6 gap-1">
          {SQUARES.map((kind, index) => {
            const { col, row } = squarePosition(index);
            const info = squareInfo(kind);
            const isTheme = THEMES.some((t) => t.id === kind);
            const closed = isTheme && !settings.themes.includes(kind as Theme);
            const turned = flipped?.index === index;
            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: squares are fixed
                key={index}
                className="relative"
                style={{
                  gridColumn: col + 1,
                  gridRow: row + 1,
                  perspective: 300,
                }}
                title={`${info.label}: ${info.hint}`}
              >
                <motion.div
                  className="relative size-full"
                  style={{ transformStyle: "preserve-3d" }}
                  animate={{ rotateY: closed || turned ? 180 : 0 }}
                  transition={{
                    duration: reduced ? 0 : seconds(DURATION.flip),
                    ease: EASE.inout,
                  }}
                >
                  <div
                    className={cn(
                      "absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-lg border text-center transition-colors",
                      isTheme
                        ? "border-white/15 bg-white/[0.06]"
                        : "border-amber-200/30 bg-amber-300/10",
                      flash === index && "border-primary bg-primary/30",
                    )}
                    style={{
                      backfaceVisibility: "hidden",
                      transitionDuration: `${DURATION.snap}ms`,
                    }}
                  >
                    <span className="text-lg leading-none">{info.icon}</span>
                    <span className="hidden text-[9px] font-semibold uppercase tracking-wider text-white/60 sm:block">
                      {info.label}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "absolute inset-0 flex items-center justify-center rounded-lg border",
                      closed
                        ? "border-white/5 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.04)_0_4px,transparent_4px_8px)]"
                        : "border-primary bg-primary/25 text-2xl shadow-[0_0_20px_oklch(0.77_0.12_300/0.5)]",
                    )}
                    style={{
                      backfaceVisibility: "hidden",
                      transform: "rotateY(180deg)",
                    }}
                  >
                    {!closed && flipped?.icon}
                  </div>
                </motion.div>
              </div>
            );
          })}
        </div>

        {/* Centre: dice and the current step */}
        <div className="absolute inset-[18%_14%] flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-black/30 p-3 text-center">
          <div className="flex gap-4">
            <Die scope={dieA} />
            <Die scope={dieB} />
          </div>
          <AnimatePresence mode="wait">
            {freeDraw ? (
              <FreeDrawPicker key="free" until={freeDraw.until} />
            ) : (
              readout && (
                <motion.div
                  key={`${readout.title}-${readout.detail}`}
                  className="flex flex-col items-center gap-0.5"
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{
                    duration: reduced ? 0 : seconds(DURATION.snap),
                    ease: EASE.spring,
                  }}
                >
                  <span
                    className={cn(
                      "flex items-center gap-2 text-base font-bold",
                      readout.tone === "event" && "text-amber-200",
                      readout.tone === "empty" && "text-muted-foreground",
                    )}
                  >
                    {readout.icon && (
                      <span className="text-xl">{readout.icon}</span>
                    )}
                    {readout.title}
                  </span>
                  {readout.detail && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {readout.detail}
                    </span>
                  )}
                </motion.div>
              )
            )}
          </AnimatePresence>
        </div>

        {/* The pawn */}
        <div
          ref={tokenScope}
          className="pointer-events-none absolute flex items-center justify-center"
          style={{
            left: `${(tokenPos.col / BOARD_COLS) * 100}%`,
            top: `${(tokenPos.row / BOARD_ROWS) * 100}%`,
            width: `${100 / BOARD_COLS}%`,
            height: `${100 / BOARD_ROWS}%`,
          }}
        >
          <svg
            viewBox="0 0 24 28"
            className="h-[70%] drop-shadow-[0_6px_6px_rgba(0,0,0,0.6)]"
            aria-hidden
          >
            <defs>
              <linearGradient id="pawn" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="#f5d0fe" />
                <stop offset="0.5" stopColor="#c084fc" />
                <stop offset="1" stopColor="#7e22ce" />
              </linearGradient>
            </defs>
            <circle
              cx="12"
              cy="7"
              r="5.5"
              fill="url(#pawn)"
              stroke="#2e1065"
              strokeWidth="1"
            />
            <path
              d="M6 26 C6 18 9 14 12 13 C15 14 18 18 18 26 Z"
              fill="url(#pawn)"
              stroke="#2e1065"
              strokeWidth="1"
            />
            <rect
              x="4"
              y="25"
              width="16"
              height="2.5"
              rx="1.2"
              fill="#2e1065"
            />
          </svg>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          disabled={rolling}
          onClick={() => run(false)}
          className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
        >
          Roll dice
        </button>
        <button
          type="button"
          disabled={rolling}
          onClick={() => run(true)}
          className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
        >
          Play until full
        </button>
        {rolling && (
          <>
            <button
              type="button"
              onClick={() => {
                director.skip();
                // Free draw waits on its own countdown; Skip ends it too.
                freeDone.current?.();
              }}
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/10"
            >
              Skip
            </button>
            {auto && (
              <button
                type="button"
                onClick={() => {
                  autoRef.current = false;
                  setAuto(false);
                }}
                className="rounded-full border border-rose-300/30 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-300/10"
              >
                Stop after this turn
              </button>
            )}
          </>
        )}
      </div>

      {log.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          <AnimatePresence initial={false}>
            {log.map((line, i) => (
              <motion.li
                key={line.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: i === 0 ? 1 : 0.6, x: 0 }}
                transition={{
                  duration: reduced ? 0 : seconds(DURATION.snap),
                  ease: EASE.out,
                }}
              >
                {line.text}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

/** Element picker with a countdown ring for free-draw squares. */
function FreeDrawPicker({ until }: Readonly<{ until: number }>) {
  const planner = usePlanner();
  const [left, setLeft] = useState(FREE_DRAW_MS);
  useEffect(() => {
    const timer = setInterval(
      () => setLeft(Math.max(0, until - Date.now())),
      200,
    );
    return () => clearInterval(timer);
  }, [until]);
  const elements = SCENE_ELEMENTS.filter((e) =>
    planner.settings.themes.includes(e.theme),
  );
  const active = planner.tool.kind === "place" ? planner.tool.elementId : null;
  const share = left / FREE_DRAW_MS;

  return (
    <motion.div
      className="flex w-full flex-col items-center gap-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="flex items-center gap-2 text-sm font-bold text-amber-200">
        <svg viewBox="0 0 20 20" className="size-5 -rotate-90" aria-hidden>
          <circle
            cx="10"
            cy="10"
            r="8"
            fill="none"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="3"
          />
          <circle
            cx="10"
            cy="10"
            r="8"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray={`${share * 50.3} 50.3`}
          />
        </svg>
        Free draw · {Math.ceil(left / 1000)} s
      </div>
      <div className="flex max-h-20 flex-wrap justify-center gap-1 overflow-y-auto">
        {elements.map((e) => (
          <button
            key={e.id}
            type="button"
            title={e.label}
            onClick={() => planner.setTool({ kind: "place", elementId: e.id })}
            className={cn(
              "rounded-md border px-1 text-base",
              active === e.id
                ? "border-primary bg-primary/30"
                : "border-white/10 hover:bg-white/10",
            )}
          >
            {e.icon}
          </button>
        ))}
      </div>
      <span className="text-[10px] text-muted-foreground">
        Pick one, then drag on the grid
      </span>
    </motion.div>
  );
}
