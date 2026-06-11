"use client";

import confetti from "canvas-confetti";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EvolutionAddition } from "@/lib/evolution/evolutionGenerator";
import { cn } from "@/lib/utils";
import {
  type ArchetypeTheme,
  archetypeGradient,
  getArchetypeTheme,
  STARTER_THEME,
  withAlpha,
} from "./archetypes";
import {
  buildAdditionChips,
  pixelFontClass,
  stageNumeral,
} from "./evolutionDisplay";

export type CeremonyCat = {
  key: string;
  label: string;
  level: number;
  branchLabel: string | null;
  archetype: string | null;
  additions: EvolutionAddition[];
  previewUrl: string | null;
};

type CeremonyStep =
  | { kind: "summon" }
  | { kind: "banner"; index: number }
  | { kind: "charge"; index: number }
  | { kind: "reveal"; index: number }
  | { kind: "waiting"; index: number }
  | { kind: "finale" };

type EvolutionCeremonyProps = {
  /** Ordered cats (starter first), filled progressively while rendering. */
  cats: CeremonyCat[];
  /** Total number of cats expected, including the starter. */
  totalCount: number;
  onFinish: () => void;
};

const STEP_DURATIONS: Record<CeremonyStep["kind"], number> = {
  summon: 1900,
  banner: 1400,
  charge: 1700,
  reveal: 2300,
  waiting: 0,
  finale: 0,
};

const AMBIENT_PARTICLES = Array.from({ length: 14 }, (_, index) => ({
  id: `particle-${index}`,
  left: `${(index * 37 + 11) % 96}%`,
  top: `${(index * 53 + 23) % 88}%`,
  size: 2 + ((index * 7) % 4),
  delay: (index % 7) * 0.6,
  duration: 4 + (index % 5),
}));

function enterIndex(
  index: number,
  cats: CeremonyCat[],
  totalCount: number,
): CeremonyStep {
  if (index >= totalCount) return { kind: "finale" };
  const cat = cats[index];
  if (!cat) return { kind: "waiting", index };
  const previous = cats[index - 1];
  if (!previous || cat.branchLabel !== previous.branchLabel) {
    return { kind: "banner", index };
  }
  return { kind: "charge", index };
}

function nextStep(
  current: CeremonyStep,
  cats: CeremonyCat[],
  totalCount: number,
): CeremonyStep {
  switch (current.kind) {
    case "summon":
      return enterIndex(1, cats, totalCount);
    case "banner":
      return { kind: "charge", index: current.index };
    case "charge":
      return { kind: "reveal", index: current.index };
    case "reveal":
      return enterIndex(current.index + 1, cats, totalCount);
    case "waiting":
      return enterIndex(current.index, cats, totalCount);
    case "finale":
      return current;
  }
}

export function EvolutionCeremony({
  cats,
  totalCount,
  onFinish,
}: EvolutionCeremonyProps) {
  const prefersReducedMotion = useReducedMotion();
  const [step, setStep] = useState<CeremonyStep>({ kind: "summon" });
  const [fast, setFast] = useState(false);
  const catsRef = useRef(cats);
  catsRef.current = cats;

  const advance = useCallback(() => {
    setStep((current) => nextStep(current, catsRef.current, totalCount));
  }, [totalCount]);

  // Timed auto-advance for every animated step.
  useEffect(() => {
    const duration = STEP_DURATIONS[step.kind];
    if (duration <= 0) return;
    const chipCount =
      step.kind === "reveal"
        ? (catsRef.current[step.index]?.additions.length ?? 0)
        : 0;
    const total = (duration + chipCount * 180) / (fast ? 2 : 1);
    const timer = window.setTimeout(advance, total);
    return () => window.clearTimeout(timer);
  }, [step, fast, advance]);

  // Resume from the waiting state as soon as the next cat is rendered.
  useEffect(() => {
    if (step.kind === "waiting" && cats[step.index]) {
      advance();
    }
  }, [step, cats, advance]);

  // Element-coloured confetti burst on each reveal.
  useEffect(() => {
    if (step.kind !== "reveal" || prefersReducedMotion) return;
    const cat = catsRef.current[step.index];
    const theme = getArchetypeTheme(cat?.archetype);
    confetti({
      particleCount: 48,
      spread: 75,
      startVelocity: 26,
      scalar: 0.9,
      colors: [theme.from, theme.to, "#ffffff"],
      origin: { y: 0.6 },
      disableForReducedMotion: true,
      zIndex: 40,
    });
  }, [step, prefersReducedMotion]);

  const activeCat =
    step.kind === "summon"
      ? cats[0]
      : "index" in step
        ? (cats[step.index] ?? null)
        : null;
  const theme = getArchetypeTheme(activeCat?.archetype ?? null);
  const revealedCount =
    step.kind === "finale"
      ? totalCount
      : step.kind === "summon"
        ? 1
        : "index" in step
          ? step.index + (step.kind === "reveal" ? 1 : 0)
          : 0;
  const progress = Math.min(1, revealedCount / Math.max(1, totalCount));

  const hudLabel = (() => {
    if (step.kind === "summon") return "ORIGIN";
    if (step.kind === "finale") return "COMPLETE";
    if (!activeCat) return "CHANNELLING";
    return `LINE ${activeCat.branchLabel ?? "?"} · STAGE ${stageNumeral(activeCat.level)}`;
  })();

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative isolate flex min-h-[520px] cursor-pointer select-none flex-col overflow-hidden rounded-3xl border border-border/40 bg-slate-950"
      onClick={step.kind === "finale" ? onFinish : advance}
      aria-live="polite"
    >
      {/* Atmosphere */}
      <div
        className="pointer-events-none absolute inset-0 transition-[background] duration-700"
        style={{
          background: `radial-gradient(ellipse 70% 55% at 50% 38%, ${withAlpha(theme.from, 0.16)}, transparent 70%), radial-gradient(ellipse 90% 60% at 50% 110%, ${withAlpha(theme.to, 0.22)}, transparent 65%)`,
        }}
      />
      {!prefersReducedMotion &&
        AMBIENT_PARTICLES.map((particle) => (
          <motion.span
            key={particle.id}
            className="pointer-events-none absolute rounded-full"
            style={{
              left: particle.left,
              top: particle.top,
              width: particle.size,
              height: particle.size,
              background: withAlpha(theme.from, 0.5),
            }}
            animate={{ y: [-6, 6, -6], opacity: [0.15, 0.7, 0.15] }}
            transition={{
              duration: particle.duration,
              delay: particle.delay,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
          />
        ))}

      {/* HUD */}
      <div className="relative z-10 flex items-center justify-between gap-3 px-5 pt-5">
        <span
          className={cn(
            pixelFontClass,
            "text-[10px] tracking-wider text-white/80",
          )}
        >
          {hudLabel}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setFast((value) => !value);
            }}
            className={cn(
              pixelFontClass,
              "rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-[9px] text-white/80 transition hover:border-white/40 hover:text-white",
            )}
          >
            {fast ? "2X" : "1X"}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onFinish();
            }}
            className={cn(
              pixelFontClass,
              "rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-[9px] text-white/80 transition hover:border-white/40 hover:text-white",
            )}
          >
            SKIP ▸▸
          </button>
        </div>
      </div>

      {/* Stage */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-6 py-4">
        <AnimatePresence mode="wait">
          {step.kind === "summon" ? (
            <SummonScene key="summon" cat={cats[0] ?? null} />
          ) : step.kind === "banner" ? (
            <BannerScene
              key={`banner-${step.index}`}
              branchLabel={cats[step.index]?.branchLabel ?? "?"}
              theme={theme}
            />
          ) : step.kind === "charge" ? (
            <ChargeScene
              key={`charge-${step.index}`}
              parent={
                (cats[step.index]?.level ?? 1) <= 1
                  ? (cats[0] ?? null)
                  : (cats[step.index - 1] ?? null)
              }
              theme={theme}
              reduced={Boolean(prefersReducedMotion)}
            />
          ) : step.kind === "reveal" ? (
            <RevealScene
              key={`reveal-${step.index}`}
              cat={cats[step.index] ?? null}
              theme={theme}
              reduced={Boolean(prefersReducedMotion)}
            />
          ) : step.kind === "waiting" ? (
            <WaitingScene key={`waiting-${step.index}`} />
          ) : (
            <FinaleScene
              key="finale"
              totalCount={totalCount}
              onFinish={onFinish}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Progress */}
      <div className="relative z-10 flex flex-col gap-2 px-5 pb-5">
        <div className="flex items-center justify-between">
          <span className={cn(pixelFontClass, "text-[9px] text-white/50")}>
            TAP TO ADVANCE
          </span>
          <span className={cn(pixelFontClass, "text-[9px] text-white/50")}>
            {revealedCount}/{totalCount}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full"
            style={{ background: archetypeGradient(theme) }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ ease: "easeOut", duration: 0.4 }}
          />
        </div>
      </div>
    </motion.section>
  );
}

function SpriteOnAura({
  url,
  alt,
  size = 240,
}: {
  url: string | null;
  alt: string;
  size?: number;
}) {
  if (!url) {
    return (
      <div
        className="flex items-center justify-center text-xs text-white/50"
        style={{ width: size, height: size }}
      >
        Rendering…
      </div>
    );
  }
  return (
    <Image
      src={url}
      alt={alt}
      width={size}
      height={size}
      unoptimized
      priority
      className="image-render-pixel object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.6)]"
      style={{ width: size, height: size }}
    />
  );
}

function SummonScene({ cat }: { cat: CeremonyCat | null }) {
  return (
    <motion.div
      className="flex flex-col items-center gap-5 text-center"
      initial={{ opacity: 0, y: 28, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.55, ease: "easeOut" }}
    >
      <div className="relative flex items-center justify-center">
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 280,
            height: 280,
            background: `radial-gradient(circle, ${withAlpha(STARTER_THEME.from, 0.3)}, transparent 70%)`,
          }}
          animate={{ scale: [0.9, 1.08, 0.9], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2.4, repeat: Number.POSITIVE_INFINITY }}
        />
        <SpriteOnAura url={cat?.previewUrl ?? null} alt="Starter cat" />
      </div>
      <div className="flex flex-col items-center gap-2">
        <span
          className={cn(pixelFontClass, "text-sm text-amber-200 sm:text-base")}
        >
          A STARTER APPEARS
        </span>
        <span className="text-xs text-white/60">
          Its descendants are stirring…
        </span>
      </div>
    </motion.div>
  );
}

function BannerScene({
  branchLabel,
  theme,
}: {
  branchLabel: string;
  theme: ArchetypeTheme;
}) {
  return (
    <motion.div
      className="flex flex-col items-center gap-4 text-center"
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.08 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <motion.span
        className="text-6xl sm:text-7xl"
        initial={{ rotate: -8 }}
        animate={{ rotate: [-8, 6, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 0.9 }}
        aria-hidden
      >
        {theme.glyph}
      </motion.span>
      <div className="flex flex-col items-center gap-3">
        <span className={cn(pixelFontClass, "text-lg text-white sm:text-2xl")}>
          LINE {branchLabel}
        </span>
        <span
          className={cn(
            pixelFontClass,
            "bg-clip-text text-sm text-transparent sm:text-base",
          )}
          style={{ backgroundImage: archetypeGradient(theme) }}
        >
          {theme.label.toUpperCase()}
        </span>
        <span className="text-xs text-white/60">{theme.blurb}</span>
      </div>
    </motion.div>
  );
}

function ChargeScene({
  parent,
  theme,
  reduced,
}: {
  parent: CeremonyCat | null;
  theme: ArchetypeTheme;
  reduced: boolean;
}) {
  return (
    <motion.div
      className="flex flex-col items-center gap-5 text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="relative flex items-center justify-center">
        {[0, 1].map((ring) => (
          <motion.div
            key={ring}
            className="absolute rounded-full border-2"
            style={{ borderColor: withAlpha(theme.from, 0.55) }}
            initial={{ width: 150, height: 150, opacity: 0 }}
            animate={{
              width: [150, 300],
              height: [150, 300],
              opacity: [0.8, 0],
            }}
            transition={{
              duration: 1.1,
              delay: ring * 0.45,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeOut",
            }}
          />
        ))}
        <motion.div
          animate={
            reduced
              ? { filter: ["brightness(1)", "brightness(2.4)"] }
              : {
                  x: [0, -3, 4, -5, 6, -6, 7, -7, 8, 0],
                  filter: [
                    "brightness(1) saturate(1)",
                    "brightness(1.4) saturate(0.7)",
                    "brightness(2.6) saturate(0.2)",
                  ],
                }
          }
          transition={{ duration: 1.6, ease: "easeIn" }}
        >
          <SpriteOnAura url={parent?.previewUrl ?? null} alt="Evolving cat" />
        </motion.div>
      </div>
      <motion.span
        className={cn(pixelFontClass, "text-xs text-white sm:text-sm")}
        animate={{ opacity: [1, 0.4, 1] }}
        transition={{ duration: 0.8, repeat: Number.POSITIVE_INFINITY }}
      >
        WHAT? IT&apos;S EVOLVING…
      </motion.span>
    </motion.div>
  );
}

const CHIP_KIND_STYLE: Record<EvolutionAddition["kind"], string> = {
  tortie: "border-fuchsia-300/40 bg-fuchsia-500/15 text-fuchsia-100",
  accessory: "border-sky-300/40 bg-sky-500/15 text-sky-100",
  scar: "border-red-300/40 bg-red-500/15 text-red-100",
};

function RevealScene({
  cat,
  theme,
  reduced,
}: {
  cat: CeremonyCat | null;
  theme: ArchetypeTheme;
  reduced: boolean;
}) {
  const chips = useMemo(
    () => buildAdditionChips(cat?.additions ?? [], cat?.key ?? "reveal"),
    [cat],
  );

  return (
    <motion.div
      className="relative flex w-full flex-col items-center gap-5 text-center"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Evolution flash */}
      {!reduced ? (
        <motion.div
          className="pointer-events-none fixed inset-0 z-20 bg-white"
          initial={{ opacity: 0.95 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      ) : null}
      <div className="relative flex items-center justify-center">
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 300,
            height: 300,
            background: `radial-gradient(circle, ${withAlpha(theme.from, 0.35)}, transparent 70%)`,
          }}
          initial={{ scale: 0.4, opacity: 1 }}
          animate={{ scale: 1.15, opacity: [1, 0.55] }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
        <motion.div
          initial={{ scale: reduced ? 1 : 1.25, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 180, damping: 16 }}
        >
          <SpriteOnAura
            url={cat?.previewUrl ?? null}
            alt={cat?.label ?? "Evolved cat"}
          />
        </motion.div>
      </div>
      <motion.div
        className="flex flex-col items-center gap-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <span
          className={cn(
            pixelFontClass,
            "bg-clip-text text-sm text-transparent sm:text-base",
          )}
          style={{ backgroundImage: archetypeGradient(theme) }}
        >
          {theme.glyph} STAGE {stageNumeral(cat?.level ?? 1)} REACHED
        </span>
        <div className="flex max-w-xl flex-wrap items-center justify-center gap-2">
          {chips.map((chip, index) => (
            <motion.span
              key={chip.id}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] font-semibold",
                CHIP_KIND_STYLE[chip.kind],
              )}
              initial={{ opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.45 + index * 0.18 }}
            >
              + {chip.text}
            </motion.span>
          ))}
          {chips.length === 0 ? (
            <span className="text-xs text-white/60">
              No new traits — a pure form
            </span>
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
}

function WaitingScene() {
  return (
    <motion.div
      className="flex flex-col items-center gap-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.span
        className={cn(pixelFontClass, "text-sm text-white/80")}
        animate={{ opacity: [1, 0.35, 1] }}
        transition={{ duration: 1.2, repeat: Number.POSITIVE_INFINITY }}
      >
        CHANNELLING…
      </motion.span>
      <span className="text-xs text-white/50">summoning the next form</span>
    </motion.div>
  );
}

function FinaleScene({
  totalCount,
  onFinish,
}: {
  totalCount: number;
  onFinish: () => void;
}) {
  return (
    <motion.div
      className="flex flex-col items-center gap-5 text-center"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <span className="text-5xl" aria-hidden>
        ✨
      </span>
      <span className={cn(pixelFontClass, "text-lg text-white sm:text-xl")}>
        EVOLUTION COMPLETE
      </span>
      <span className="text-sm text-white/60">{totalCount} forms revealed</span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onFinish();
        }}
        className={cn(
          pixelFontClass,
          "rounded-xl border border-amber-300/50 bg-amber-400/15 px-6 py-3 text-[11px] text-amber-100 transition hover:bg-amber-400/30",
        )}
      >
        VIEW THE EVOLUTION TREE ▸
      </button>
    </motion.div>
  );
}
