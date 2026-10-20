"use client";

import { AnimatePresence, motion, useAnimate } from "motion/react";
import { useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";

import SparklesIcon from "@/components/ui/sparkles-icon";
import {
  elementLabel,
  SCENE_ELEMENTS,
  THEMES,
} from "@/lib/scene-planner/catalog";
import { columnName, type RollChain } from "@/lib/scene-planner/generate";
import { cn } from "@/lib/utils";

import { DRIFT_ARROW } from "./choreography";
import { DURATION, EASE, seconds } from "./motion";
import { usePlanner } from "./usePlanner";

const ITEM_H = 52;
const WINDOW_H = ITEM_H * 1.7;
const FILLERS = 14;

interface ReelHandle {
  spin: (result: string, pool: string[], ms: number) => Promise<void>;
}

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Any reel face; the filler only has to look random while it spins. */
const filler = (pool: string[]) =>
  pool[Math.floor(Math.random() * pool.length)]; // NOSONAR: visual filler, not security

function Reel({
  label,
  idle,
  rare,
  ref,
}: Readonly<{
  label: string;
  idle?: boolean;
  rare?: boolean;
  ref: React.Ref<ReelHandle>;
}>) {
  const [items, setItems] = useState([{ key: "idle", label: "?" }]);
  const [locked, setLocked] = useState(false);
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const offset = (WINDOW_H - ITEM_H) / 2;
  const current = useRef("?");
  /** Each spin builds a fresh strip; its faces are keyed by spin and slot. */
  const spins = useRef(0);

  useImperativeHandle(ref, () => ({
    async spin(result, pool, ms) {
      const strip = [current.current];
      for (let i = 0; i < FILLERS; i++) strip.push(filler(pool));
      strip.push(result, filler(pool));
      const spin = ++spins.current;
      setLocked(false);
      setItems(strip.map((label, slot) => ({ key: `${spin}:${slot}`, label })));
      await nextFrame();
      await nextFrame();
      const el = scope.current;
      const target = offset - (strip.length - 2) * ITEM_H;
      if (ms <= 0) {
        animate(el, { y: target }, { duration: 0 });
      } else {
        animate(el, { y: offset }, { duration: 0 });
        // Run past the result by a third of a row, then spring back.
        await animate(
          el,
          { y: target - ITEM_H * 0.35 },
          { duration: seconds(ms), ease: EASE.reel },
        );
        await animate(
          el,
          { y: target },
          { duration: seconds(DURATION.tick * 2), ease: EASE.spring },
        );
      }
      current.current = result;
      setLocked(true);
    },
  }));

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-xl border bg-black/50 transition-[border-color,box-shadow,opacity]",
          locked
            ? "border-primary/70 shadow-[0_0_16px_oklch(0.77_0.12_300/0.45)]"
            : "border-white/10",
          idle && "opacity-40",
        )}
        style={{
          height: WINDOW_H,
          transitionDuration: `${DURATION.tick}ms`,
          maskImage:
            "linear-gradient(to bottom, transparent, black 25%, black 75%, transparent)",
        }}
      >
        {rare && locked && (
          <motion.div
            className="pointer-events-none absolute inset-0 rounded-xl"
            style={{
              background:
                "conic-gradient(from 0deg, #f472b6, #facc15, #4ade80, #60a5fa, #a78bfa, #f472b6)",
              mask: "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)",
              padding: 2,
            }}
            animate={{ rotate: 360 }}
            transition={{
              duration: seconds(DURATION.scene * 4),
              repeat: Number.POSITIVE_INFINITY,
              ease: "linear",
            }}
          />
        )}
        <div
          ref={scope}
          className="absolute inset-x-0 top-0"
          style={{ transform: `translateY(${offset}px)` }}
        >
          {items.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-center truncate px-1 text-center text-xl font-bold"
              style={{ height: ITEM_H }}
            >
              {item.label}
            </div>
          ))}
        </div>
        <motion.div
          className="pointer-events-none absolute inset-x-0 border-y border-white/20"
          style={{ top: (WINDOW_H - ITEM_H) / 2, height: ITEM_H }}
          animate={locked ? { x: [0, 2, 0] } : { x: 0 }}
          transition={{ duration: seconds(DURATION.tick * 2), ease: EASE.out }}
        />
      </div>
    </div>
  );
}

interface Card {
  id: number;
  icon: string;
  label: string;
  where: string;
  rare: boolean;
  bonus?: string;
}

interface Flight {
  id: number;
  icon: string;
  from: DOMRect;
  to: DOMRect;
}

export function GachaMode() {
  const planner = usePlanner();
  const { director, settings, atmosphere, rolling, setRolling, reduced } =
    planner;
  const reels = [
    useRef<ReelHandle>(null),
    useRef<ReelHandle>(null),
    useRef<ReelHandle>(null),
    useRef<ReelHandle>(null),
    useRef<ReelHandle>(null),
  ];
  const [pathReel, setPathReel] = useState(true);
  const [rare, setRare] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [history, setHistory] = useState<Card[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const multi = useRef(false);
  const serial = useRef(0);

  async function fly(icon: string, chain: RollChain) {
    const from = cardRef.current?.getBoundingClientRect();
    const rect = chain.placement.rect ?? {
      col: chain.placement.cells[0] % settings.cols,
      row: Math.floor(chain.placement.cells[0] / settings.cols),
      w: 1,
      h: 1,
    };
    const to = planner.stage.current?.cellRect(rect);
    const ms = director.scale(DURATION.fly);
    if (!from || !to || ms <= 0) return;
    setFlight({ id: serial.current++, icon, from, to });
    await director.wait(DURATION.fly);
    setFlight(null);
  }

  async function pull() {
    const { builder, rng } = planner.nextTurn();
    const chain = builder.roll(rng);
    if (!chain) {
      setMessage("The machine is empty: nothing has room left.");
      return false;
    }
    const name = elementLabel(chain.element, atmosphere.time);
    const theme = THEMES.find((t) => t.id === chain.theme);
    const first = chain.placement.rect
      ? chain.placement.rect.row * settings.cols + chain.placement.rect.col
      : chain.placement.cells[0];
    const col = first % settings.cols;
    const row = Math.floor(first / settings.cols);
    const isRare = chain.element.weight <= 1;
    setPathReel(Boolean(chain.path));
    setRare(isRare);
    setCard(null);

    const themePool = THEMES.filter((t) => settings.themes.includes(t.id)).map(
      (t) => t.icon,
    );
    const variantPool = SCENE_ELEMENTS.filter(
      (e) => e.theme === chain.theme,
    ).map((e) => e.icon);
    const colPool = Array.from({ length: settings.cols }, (_, c) =>
      columnName(c),
    );
    const rowPool = Array.from({ length: settings.rows }, (_, r) =>
      String(r + 1),
    );
    const lengthPool = ["2↓", "3↘", "4↙", "5↓", "6↘", "7↙"];
    const lengthResult = chain.path
      ? `${chain.path.length}${DRIFT_ARROW[chain.path.drift]}`
      : "—";

    const spins = [
      [theme?.icon ?? "?", themePool],
      [name.icon, variantPool],
      [columnName(col), colPool],
      [String(row + 1), rowPool],
      [lengthResult, chain.path ? lengthPool : ["—"]],
    ] as const;
    await Promise.all(
      spins.map(([result, pool], i) =>
        reels[i].current?.spin(
          result,
          [...pool],
          director.scale(DURATION.reel + i * DURATION.stagger),
        ),
      ),
    );

    const where = chain.path
      ? `${columnName(col)}${row + 1} · ${chain.path.length} cells ${DRIFT_ARROW[chain.path.drift]}`
      : `${columnName(col)}${row + 1}`;
    const next: Card = {
      id: serial.current++,
      icon: name.icon,
      label: name.label,
      where,
      rare: isRare,
      bonus: chain.fed ? `+ ${chain.fed.element.label}` : undefined,
    };
    setCard(next);
    await director.wait(DURATION.place);
    planner.setCue({ zones: chain.element.zones });
    await fly(name.icon, chain);
    planner.setCue(null);
    planner.addChain(chain);
    setHistory((current) => [next, ...current].slice(0, 12));
    await director.wait(DURATION.place);
    return true;
  }

  async function run(untilFull: boolean) {
    if (rolling) return;
    director.reset();
    setRolling(true);
    setMessage(null);
    multi.current = untilFull;
    try {
      for (let i = 0; i < 60; i++) {
        if (!(await pull())) break;
        if (!multi.current) break;
        if (planner.boardStatus().full) break;
      }
    } finally {
      planner.setCue(null);
      setRolling(false);
      multi.current = false;
      director.reset();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 rounded-2xl border border-white/10 bg-gradient-to-b from-violet-500/10 to-transparent p-3">
        <Reel ref={reels[0]} label="Category" />
        <Reel ref={reels[1]} label="Variant" rare={rare} />
        <Reel ref={reels[2]} label="Column" />
        <Reel ref={reels[3]} label="Row" />
        <Reel ref={reels[4]} label="Length" idle={!pathReel} />
      </div>

      <div className="relative flex min-h-[92px] items-center justify-center">
        <AnimatePresence mode="popLayout">
          {card ? (
            <motion.div
              key={card.id}
              ref={cardRef}
              className={cn(
                "relative flex items-center gap-3 rounded-2xl border px-4 py-3",
                card.rare
                  ? "border-amber-200/60 bg-gradient-to-br from-amber-300/20 via-pink-400/15 to-violet-500/20"
                  : "border-white/15 bg-white/[0.06]",
              )}
              initial={{ opacity: 0, scale: 0.6, y: 12 }}
              animate={{ opacity: flight ? 0.35 : 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{
                duration: reduced ? 0 : seconds(DURATION.place),
                ease: EASE.spring,
              }}
            >
              <span className="text-3xl">{card.icon}</span>
              <span className="flex flex-col">
                <span className="flex items-center gap-1.5 font-bold">
                  {card.label}
                  {card.rare && (
                    <SparklesIcon size={16} className="text-amber-200" />
                  )}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {card.where}
                </span>
                {card.bonus && (
                  <span className="text-xs text-sky-200">{card.bonus}</span>
                )}
              </span>
            </motion.div>
          ) : (
            <motion.span
              key="empty"
              className="text-sm text-muted-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {message ??
                "Pull to roll category, variant, column, row and length at once."}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          disabled={rolling}
          onClick={() => run(false)}
          className="rounded-full bg-gradient-to-r from-pink-400 to-violet-500 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-pink-500/25 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
        >
          Pull ×1
        </button>
        <button
          type="button"
          disabled={rolling}
          onClick={() => run(true)}
          className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
        >
          Pull until full
        </button>
        {rolling && (
          <button
            type="button"
            onClick={() => {
              director.skip();
            }}
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/10"
          >
            Skip
          </button>
        )}
        {rolling && multi.current && (
          <button
            type="button"
            onClick={() => {
              multi.current = false;
            }}
            className="rounded-full border border-rose-300/30 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-300/10"
          >
            Stop
          </button>
        )}
      </div>

      {history.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5">
          <AnimatePresence initial={false}>
            {history.map((item) => (
              <motion.span
                key={item.id}
                layout
                title={`${item.label} · ${item.where}`}
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg border text-base",
                  item.rare
                    ? "border-amber-200/60 bg-amber-300/10"
                    : "border-white/10 bg-white/5",
                )}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: reduced ? 0 : seconds(DURATION.snap),
                  ease: EASE.spring,
                }}
              >
                {item.icon}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Card flight from the tray into its cells; portalled because the
          glass card's backdrop filter would trap a fixed element. */}
      {flight &&
        createPortal(
          <motion.div
            key={flight.id}
            className="pointer-events-none fixed z-50 flex items-center justify-center rounded-xl border-2 border-amber-200 bg-violet-500/40 text-3xl shadow-[0_0_30px_rgba(253,230,138,0.6)]"
            initial={{
              left: flight.from.left,
              top: flight.from.top,
              width: flight.from.width,
              height: flight.from.height,
              rotate: -4,
            }}
            animate={{
              left: flight.to.left,
              top: flight.to.top,
              width: flight.to.width,
              height: flight.to.height,
              rotate: 0,
              opacity: [1, 1, 0.2],
            }}
            transition={{
              duration: seconds(director.scale(DURATION.fly)),
              ease: EASE.inout,
            }}
          >
            {flight.icon}
          </motion.div>,
          document.body,
        )}
    </div>
  );
}
