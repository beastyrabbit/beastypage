"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Wheel } from "spin-wheel";
import confetti from "canvas-confetti";
import RefreshIcon from "@/components/ui/refresh-icon";
import SparklesIcon from "@/components/ui/sparkles-icon";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

type Prize = {
  name: string;
  chance: number;
  color: string;
};

const PRIZES: Prize[] = [
  { name: "Moondust", chance: 40, color: "#8b8b7a" },
  { name: "Starborn", chance: 25, color: "#6b8e4e" },
  { name: "Lunara", chance: 15, color: "#9b7c5d" },
  { name: "Celestara", chance: 10, color: "#7a8ca5" },
  { name: "Divinara", chance: 6, color: "#c97743" },
  { name: "Holo Nova", chance: 3, color: "#f4e4c1" },
  { name: "Singularity", chance: 1, color: "#d4af37" },
];

type Selection = {
  prize: Prize;
  index: number;
  random?: number;
};

const DEFAULT_ITEMS = PRIZES.map((prize) => ({
  label: prize.name,
  weight: prize.chance,
  backgroundColor: prize.color,
  labelColor: "#ffffff",
}));

function getSecureRandomInt100() {
  const array = new Uint8Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(array);
    value = array[0];
  } while (value >= 200);
  return value % 100;
}

function selectPrize(forcedIndex?: number): Selection {
  if (typeof forcedIndex === "number") {
    return { prize: PRIZES[forcedIndex], index: forcedIndex };
  }
  const random = getSecureRandomInt100();
  if (random < 40) return { prize: PRIZES[0], index: 0, random };
  if (random < 65) return { prize: PRIZES[1], index: 1, random };
  if (random < 80) return { prize: PRIZES[2], index: 2, random };
  if (random < 90) return { prize: PRIZES[3], index: 3, random };
  if (random < 96) return { prize: PRIZES[4], index: 4, random };
  if (random < 99) return { prize: PRIZES[5], index: 5, random };
  return { prize: PRIZES[6], index: 6, random };
}

export function ClassicWheelClient() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wheelRef = useRef<Wheel | null>(null);
  const selectedRef = useRef<{ prize: Prize; forced: boolean; randomBucket?: number } | null>(null);
  const rafIdsRef = useRef<Set<number>>(new Set());
  const timeoutIdsRef = useRef<Set<number>>(new Set());
  const intervalIdsRef = useRef<Set<number>>(new Set());

  const [isSpinning, setIsSpinning] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [winningPrize, setWinningPrize] = useState<Prize | null>(null);
  const [wasForced, setWasForced] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const logSpin = useMutation(api.wheel.logSpin);
  const stats = useQuery(api.wheel.stats);

  const prizeStats = useMemo(() => {
    const map = new Map<string, { count: number }>();
    if (stats?.prizes) {
      for (const entry of stats.prizes) {
        map.set(entry.prizeName, {
          count: entry.count
        });
      }
    }
    return PRIZES.map((prize) => {
      const entry = map.get(prize.name);
      return {
        name: prize.name,
        chance: prize.chance,
        color: prize.color,
        count: entry?.count ?? 0
      };
    });
  }, [stats]);

  const totalSpins = stats?.totalSpins ?? 0;

  const wheelItems = DEFAULT_ITEMS;

  const clearTimers = useCallback(() => {
    rafIdsRef.current.forEach((id) => cancelAnimationFrame(id));
    timeoutIdsRef.current.forEach((id) => clearTimeout(id));
    intervalIdsRef.current.forEach((id) => clearInterval(id));
    rafIdsRef.current.clear();
    timeoutIdsRef.current.clear();
    intervalIdsRef.current.clear();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const createWheel = () => {
      if (!containerRef.current) return;
      wheelRef.current?.remove();

      const radius = Math.max(
        120,
        Math.floor(containerRef.current.clientWidth / 2) - 16
      );

      const wheel = new Wheel(containerRef.current, {
        items: wheelItems,
        radius,
        itemLabelRadius: 0.85,
        itemLabelRadiusMax: 0.3,
        itemLabelRotation: 0,
        itemLabelAlign: "right",
        itemLabelColors: ["#ffffff"],
        itemLabelBaselineOffset: -0.07,
        itemLabelFont: "Inter, Arial, sans-serif",
        itemLabelFontSizeMax: Math.min(30, Math.floor(radius / 14)),
        itemBackgroundColors: wheelItems.map((item) => item.backgroundColor),
        rotationSpeedMax: 300,
        rotationResistance: -50,
        lineWidth: 3,
        lineColor: "rgba(255,255,255,0.8)",
        borderWidth: 4,
        borderColor: "rgba(255,255,255,0.25)",
        isInteractive: false,
        pointerAngle: 0,
      });

      wheelRef.current = wheel;
      wheel.resize();
    };

    createWheel();

    const resizeObserver = new ResizeObserver(() => {
      if (!wheelRef.current || !containerRef.current) return;
      const radius = Math.max(
        120,
        Math.floor(containerRef.current.clientWidth / 2) - 16
      );
      wheelRef.current.radius = radius;
      wheelRef.current.itemLabelFontSizeMax = Math.min(30, Math.floor(radius / 14));
      wheelRef.current.resize();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      clearTimers();
      wheelRef.current?.remove();
      wheelRef.current = null;
    };
  }, [wheelItems, clearTimers]);

  const registerTimeout = useCallback(
    (fn: () => void, delay: number) => {
      const id = window.setTimeout(() => {
        timeoutIdsRef.current.delete(id);
        fn();
      }, delay);
      timeoutIdsRef.current.add(id);
      return id;
    },
    []
  );

  const registerInterval = useCallback((fn: () => void, delay: number) => {
    const id = window.setInterval(() => {
      fn();
    }, delay);
    intervalIdsRef.current.add(id);
    return id;
  }, []);

  const triggerDivinaraConfetti = useCallback(() => {
    const duration = 5000;
    const animationEnd = Date.now() + duration;
    const defaults = {
      startVelocity: 30,
      spread: 360,
      ticks: 60,
      zIndex: 10_000,
      colors: ["#c97743", "#b86e3c", "#e8d5b7", "#f2eadf"],
    };

    const intervalId = registerInterval(() => {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) {
        clearInterval(intervalId);
        intervalIdsRef.current.delete(intervalId);
        return;
      }
      const particleCount = Math.max(12, Math.floor(40 * (timeLeft / duration)));
      confetti({ ...defaults, particleCount, origin: { x: 0.25, y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount, origin: { x: 0.75, y: Math.random() - 0.2 } });
    }, 250);
  }, [registerInterval]);

  const triggerHoloNovaConfetti = useCallback(() => {
    const starBurst = () => {
      confetti({
        spread: 360,
        ticks: 60,
        startVelocity: 30,
        zIndex: 10_000,
        particleCount: 60,
        colors: ["#f4e4c1", "#ffd700", "#fff8e1"],
        shapes: ["star"],
      });
      confetti({
        spread: 70,
        startVelocity: 20,
        zIndex: 10_000,
        particleCount: 40,
        colors: ["#f4e4c1", "#fdf6d9"],
      });
    };

    starBurst();
    registerTimeout(starBurst, 120);
    registerTimeout(starBurst, 240);
  }, [registerTimeout]);

  const triggerSingularityConfetti = useCallback(() => {
    const bursts = 6;
    for (let i = 0; i < bursts; i += 1) {
      registerTimeout(() => {
        confetti({
          spread: 360,
          ticks: 90,
          gravity: 0.6,
          startVelocity: 40,
          zIndex: 10_000,
          particleCount: 120,
          colors: ["#d4af37", "#ffd700", "#fff7d6"],
        });
      }, i * 260);
    }
    registerTimeout(() => {
      confetti({
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        zIndex: 10_000,
        particleCount: 80,
        colors: ["#800020", "#d4af37", "#ffd700"],
      });
      confetti({
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        zIndex: 10_000,
        particleCount: 80,
        colors: ["#800020", "#d4af37", "#ffd700"],
      });
    }, bursts * 260);
  }, [registerTimeout]);

  const triggerCelebration = useCallback(
    (prize: Prize) => {
      clearTimers();
      if (prize.name === "Singularity") {
        triggerSingularityConfetti();
      } else if (prize.name === "Holo Nova") {
        triggerHoloNovaConfetti();
      } else if (prize.name === "Divinara") {
        triggerDivinaraConfetti();
      } else {
        confetti({
          spread: 70,
          particleCount: 80,
          zIndex: 10_000,
          colors: [prize.color, "#f5f5f5", "#ffd86e"],
        });
      }
    },
    [clearTimers, triggerDivinaraConfetti, triggerHoloNovaConfetti, triggerSingularityConfetti]
  );

  const handleSpin = useCallback(
    (forcedIndex?: number) => {
      if (!wheelRef.current || isSpinning) return;

      const selection = selectPrize(forcedIndex);
      selectedRef.current = {
        prize: selection.prize,
        forced: typeof forcedIndex === "number",
        randomBucket: selection.random
      };
      setWasForced(typeof forcedIndex === "number");
      setIsSpinning(true);
      track("wheel_spin_started", {});

      const duration = 4000 + Math.random() * 2000;
      const revolutions = 5 + Math.floor(Math.random() * 5);

      wheelRef.current.onRest = () => {
        const stored = selectedRef.current;
        if (!stored) return;
        if (!stored.forced) {
          void logSpin({
            prizeName: stored.prize.name,
            forced: false,
            randomBucket: stored.randomBucket
          }).catch((error) => {
            console.error("Failed to log wheel spin", error);
          });
        }
        setWinningPrize(stored.prize);
        setWasForced(stored.forced);
        setModalOpen(true);
        triggerCelebration(stored.prize);
        track("wheel_spin_completed", {
          prize_name: stored.prize.name,
          was_forced: stored.forced,
        });
      };

      wheelRef.current.spinToItem(selection.index, duration, false, revolutions, 1);
    },
    [isSpinning, logSpin, triggerCelebration]
  );

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setIsSpinning(false);
    setWinningPrize(null);
    setWasForced(false);
    selectedRef.current = null;
  }, []);

  return (
    <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-14 text-foreground lg:px-8">

      <div className="flex flex-col items-center gap-8">
        <div className="relative w-full max-w-3xl">
          <div className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2 -translate-y-full">
            <div className="h-0 w-0 -rotate-180 border-l-[18px] border-r-[18px] border-b-[28px] border-l-transparent border-r-transparent border-b-amber-300 drop-shadow-[0_8px_20px_rgba(253,230,138,0.6)]" />
          </div>
          <div className="relative w-full pb-[100%]">
            <div className="absolute inset-0 overflow-hidden rounded-full border border-amber-100/10 bg-[#0b0f1a] shadow-[inset_0_20px_60px_rgba(0,0,0,0.55)]">
              <div ref={containerRef} className="absolute inset-0" />
              <div className="pointer-events-none absolute inset-0 rounded-full border border-amber-200/10" />
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => handleSpin()}
            disabled={isSpinning}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border border-amber-400/60 bg-gradient-to-br from-amber-300/50 via-amber-200/30 to-amber-400/70 px-6 py-3 text-sm font-semibold text-[#1a1206] shadow-[0_10px_30px_rgba(253,230,138,0.35)] transition",
              isSpinning
                ? "cursor-not-allowed opacity-60"
                : "hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-[0_18px_40px_rgba(253,230,138,0.45)] hover:from-amber-300/70 hover:to-amber-400/90"
            )}
          >
            <SparklesIcon size={16} />
            {isSpinning ? "Spinning…" : "Spin the Wheel"}
          </button>
          <button
            type="button"
            onClick={() => setShowDebug((prev) => !prev)}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {showDebug ? "Hide debug controls" : "Show debug controls"}
          </button>
        </div>

        <div className="glass-card w-full max-w-3xl rounded-3xl border border-border/40 bg-background/70 p-6">
          <h2 className="text-lg font-semibold text-foreground">Wheel summary</h2>
          <div className="mt-4 overflow-hidden rounded-2xl border border-border/30 bg-background/80">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground/70">
                <tr className="border-b border-border/20">
                  <th className="px-4 py-2 text-left">Prize</th>
                  <th className="px-4 py-2 text-right">Chance</th>
                  <th className="px-4 py-2 text-right">Spins</th>
                </tr>
              </thead>
              <tbody>
                {prizeStats.map((entry) => {
                  const percent = totalSpins ? ((entry.count / totalSpins) * 100).toFixed(1) : "0.0";
                  return (
                    <tr key={entry.name} className="border-b border-border/10 last:border-b-0">
                      <td className="px-4 py-2 font-medium" style={{ color: entry.color }}>
                        {entry.name}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                        {entry.chance}%
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                        {entry.count} <span className="text-[10px] text-muted-foreground/70">({percent}%)</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {showDebug && (
          <div className="glass-card w-full max-w-3xl flex flex-col gap-3 rounded-3xl border border-border/50 bg-background/70 p-4 text-sm text-muted-foreground">
            <h3 className="font-semibold text-foreground">Force a prize</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {PRIZES.map((prize, index) => (
                <button
                  key={prize.name}
                  type="button"
                  onClick={() => handleSpin(index)}
                  disabled={isSpinning}
                  className={cn(
                    "flex items-center justify-between rounded-xl border border-border/40 bg-background/80 px-3 py-2 text-left transition",
                    "hover:border-amber-400/60 hover:text-foreground",
                    isSpinning ? "cursor-not-allowed opacity-50" : ""
                  )}
                >
                  <span>{prize.name}</span>
                  <RefreshIcon size={16} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {modalOpen && winningPrize && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="relative w-full max-w-md rounded-3xl border border-amber-300/30 bg-[#161920]/90 p-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
            <button
              type="button"
              onClick={closeModal}
              className="absolute right-4 top-4 text-sm text-muted-foreground transition hover:text-foreground"
            >
              Close
            </button>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-amber-300/50 bg-gradient-to-br from-amber-200/30 to-amber-500/40 shadow-[0_12px_30px_rgba(253,230,138,0.35)]">
              <SparklesIcon size={28} color={winningPrize.color} />
            </div>
            {wasForced && (
              <p className="mt-4 text-xs uppercase tracking-wide text-orange-300/80">Cheated spin</p>
            )}
            <p className="mt-4 text-3xl font-semibold tracking-wide" style={{ color: winningPrize.color }}>
              {winningPrize.name}
            </p>
            <button
              type="button"
              onClick={closeModal}
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-300/40 px-5 py-2 text-sm font-semibold text-foreground transition hover:bg-foreground hover:text-background"
            >
              Spin Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
