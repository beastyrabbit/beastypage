"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type LengthPreset = "quick" | "normal" | "long";
type SpeedPreset = "fast" | "normal" | "slow";
type TransformPreset = "hex" | "rgb" | "hsl";

const LENGTH_PRESETS: Record<LengthPreset, number> = {
  quick: 10,
  normal: 30,
  long: 60,
};

const SPEED_PRESETS: Record<SpeedPreset, number> = {
  fast: 650,
  normal: 1400,
  slow: 2600,
};

const MODE_OPTIONS = [
  { key: "monochrome", label: "Monochrome" },
  { key: "monochrome-dark", label: "Mono Dark" },
  { key: "monochrome-light", label: "Mono Light" },
  { key: "analogic", label: "Analogic", default: true },
  { key: "complement", label: "Complement", default: true },
  { key: "analogic-complement", label: "Analogic+Comp", default: true },
  { key: "triad", label: "Triad", default: true },
  { key: "quad", label: "Quad", default: true },
];

const FALLBACK_PALETTES = [
  ["#264653", "#2A9D8F", "#E9C46A", "#F4A261", "#E76F51"],
  ["#1F2041", "#4B3F72", "#FFC857", "#119DA4", "#19647E"],
  ["#2B193D", "#3E1F47", "#A49E8D", "#EFD9CE", "#F9F5E3"],
];

function randomHexSeed() {
  return Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0");
}

async function fetchPaletteFromAPI(mode: string, count: number) {
  const seed = randomHexSeed();
  const safeMode = mode === "tetrad" || mode === "square" ? "quad" : mode;
  const url = `https://www.thecolorapi.com/scheme?hex=${seed}&mode=${encodeURIComponent(safeMode)}&count=${count}`;
  const started = performance.now();
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Color API error ${res.status}`);
    const data: { colors?: { hex?: { value?: string } }[] } = await res.json();
    const colors: string[] = Array.isArray(data.colors)
      ? data.colors
          .map((entry) => entry.hex?.value)
          .filter((value): value is string => typeof value === "string" && value.length > 0)
      : [];
    if (!colors.length) throw new Error("No colors returned");
    return {
      seed,
      mode,
      colors: colors.slice(0, count),
      ms: Math.round(performance.now() - started),
      source: "colorapi" as const,
    };
  } catch (error) {
    console.warn("[PaletteSpinner] API fetch failed", error);
    const fallback = FALLBACK_PALETTES[Math.floor(Math.random() * FALLBACK_PALETTES.length)];
    return {
      seed,
      mode,
      colors: fallback.slice(0, count),
      ms: Math.round(performance.now() - started),
      source: "fallback" as const,
    };
  }
}

function hexToRgb(hex: string) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
      default:
        break;
    }
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function formatColor(hex: string, transform: TransformPreset) {
  if (transform === "hex") return hex.toUpperCase();
  const rgb = hexToRgb(hex);
  if (transform === "rgb") {
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  }
  const hsl = rgbToHsl(rgb);
  return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
}

function clampCount(min: number, max: number) {
  const a = Number.isFinite(min) ? Math.max(1, Math.min(12, Math.round(min))) : 5;
  const b = Number.isFinite(max) ? Math.max(1, Math.min(12, Math.round(max))) : a;
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

export function PaletteSpinnerClient() {
  const [length, setLength] = useState<LengthPreset>("normal");
  const [speed, setSpeed] = useState<SpeedPreset>("normal");
  const [transform, setTransform] = useState<TransformPreset>("hex");
  const [sizeMin, setSizeMin] = useState("5");
  const [sizeMax, setSizeMax] = useState("");
  const [selectedModes, setSelectedModes] = useState<Set<string>>(
    () =>
      new Set(
        MODE_OPTIONS.filter((option) => option.default).map((option) => option.key)
      )
  );
  const [currentPalette, setCurrentPalette] = useState<string[]>(FALLBACK_PALETTES[0]);
  const [meta, setMeta] = useState<{ seed: string; mode: string; ms: number; source: "colorapi" | "fallback" } | null>(null);
  const [spinCount, setSpinCount] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [targetSpins, setTargetSpins] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastResultRef = useRef<{ hexes: string[]; formattedHexes: string[] } | null>(null);
  const [hasCopyableResult, setHasCopyableResult] = useState(false);

  const paletteSize = useMemo(() => {
    const min = parseInt(sizeMin, 10);
    const max = parseInt(sizeMax, 10);
    const { min: resolvedMin, max: resolvedMax } = clampCount(min, max);
    if (resolvedMax <= resolvedMin) return { mode: "fixed" as const, fixed: resolvedMin };
    return { mode: "range" as const, min: resolvedMin, max: resolvedMax };
  }, [sizeMin, sizeMax]);

  const activeModes = useMemo(() => {
    const defaults = MODE_OPTIONS.filter((option) => option.default).map((option) => option.key);
    if (selectedModes.size === 0) return defaults;
    return Array.from(selectedModes);
  }, [selectedModes]);

  const speedMs = SPEED_PRESETS[speed];

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopTimer();
    };
  }, [stopTimer]);

  const pickCount = useCallback(() => {
    if (paletteSize.mode === "fixed") return paletteSize.fixed;
    const { min, max } = paletteSize;
    if (max <= min) return min;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }, [paletteSize]);

  const pickMode = useCallback(() => {
    const modes = activeModes.length ? activeModes : MODE_OPTIONS.filter((o) => o.default).map((o) => o.key);
    return modes[Math.floor(Math.random() * modes.length)];
  }, [activeModes]);

  const advance = useCallback(async () => {
    try {
      const desiredCount = pickCount();
      const mode = pickMode();
      const result = await fetchPaletteFromAPI(mode, desiredCount);
      setCurrentPalette(result.colors);
      setMeta({ seed: result.seed, mode: result.mode, ms: result.ms, source: result.source });
      lastResultRef.current = {
        hexes: result.colors,
        formattedHexes: result.colors.map((hex) => formatColor(hex, transform)),
      };
      setHasCopyableResult(true);
      setSpinCount((count) => count + 1);
      setError(null);
    } catch (err) {
      console.error("[PaletteSpinner] advance failed", err);
      setError("Failed to load palette. Retrying…");
    }
  }, [pickCount, pickMode, transform]);

  const scheduleNext = useCallback(() => {
    stopTimer();
    timerRef.current = window.setTimeout(async () => {
      if (!isSpinning) return;
      await advance();
    }, speedMs);
  }, [advance, isSpinning, speedMs, stopTimer]);

  useEffect(() => {
    if (!isSpinning) {
      stopTimer();
      return;
    }
    if (spinCount >= targetSpins && targetSpins > 0) {
      const timer = window.setTimeout(() => setIsSpinning(false), 0);
      return () => window.clearTimeout(timer);
    }
    scheduleNext();
    return () => {
      stopTimer();
    };
  }, [isSpinning, scheduleNext, spinCount, targetSpins, stopTimer]);

  const handleToggleMode = useCallback(
    (modeKey: string) => {
      setSelectedModes((prev) => {
        const next = new Set(prev);
        if (next.has(modeKey)) {
          next.delete(modeKey);
        } else {
          next.add(modeKey);
        }
        return next;
      });
    },
    [setSelectedModes]
  );

  const handleGo = useCallback(async () => {
    if (isSpinning) {
      setIsSpinning(false);
      return;
    }
    const target = LENGTH_PRESETS[length];
    setTargetSpins(target);
    setSpinCount(0);
    setIsSpinning(true);
    await advance();
  }, [advance, isSpinning, length]);

  const handleCopy = useCallback(async () => {
    const latest = lastResultRef.current;
    if (!latest) return;
    const text = latest.formattedHexes.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setError(null);
    } catch (err) {
      console.error("[PaletteSpinner] copy failed", err);
      setError("Clipboard unavailable");
    }
  }, []);

  useEffect(() => {
    if (lastResultRef.current) {
      lastResultRef.current = {
        hexes: lastResultRef.current.hexes,
        formattedHexes: lastResultRef.current.hexes.map((hex) => formatColor(hex, transform)),
      };
    }
  }, [transform]);

  const isCopyEnabled = !isSpinning && hasCopyableResult;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-slate-950 to-slate-950 p-8 text-balance shadow-[0_0_40px_rgba(245,158,11,0.15)]">
        <p className="text-xs uppercase tracking-widest text-amber-200/90">Palette Spinner</p>
        <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">Find your next base palette in seconds</h1>
      </section>

      <section className="rounded-3xl border border-border/40 bg-background/70 p-6 shadow-lg shadow-black/20">
        <div className="grid gap-6 md:grid-cols-3">
          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground/80">Length</span>
            <div className="flex flex-wrap gap-2 text-sm">
              {(["quick", "normal", "long"] as LengthPreset[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setLength(value)}
                  className={cn(
                    "rounded-full border px-3 py-1 capitalize transition",
                    length === value
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border/50 text-muted-foreground hover:border-primary/40 hover:text-primary"
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground/80">Speed</span>
            <div className="flex flex-wrap gap-2 text-sm">
              {(["fast", "normal", "slow"] as SpeedPreset[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSpeed(value)}
                  className={cn(
                    "rounded-full border px-3 py-1 capitalize transition",
                    speed === value
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border/50 text-muted-foreground hover:border-primary/40 hover:text-primary"
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground/80">Display</span>
            <div className="flex flex-wrap gap-2 text-sm">
              {(["hex", "rgb", "hsl"] as TransformPreset[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTransform(value)}
                  className={cn(
                    "rounded-full border px-3 py-1 uppercase transition",
                    transform === value
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border/50 text-muted-foreground hover:border-primary/40 hover:text-primary"
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6">
          <div>
            <span className="text-xs uppercase tracking-wide text-muted-foreground/80">Modes</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {MODE_OPTIONS.map((option) => {
                const active = selectedModes.has(option.key);
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => handleToggleMode(option.key)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs uppercase tracking-wide transition",
                      active
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border/50 text-muted-foreground hover:border-primary/40 hover:text-primary"
                    )}
                    aria-pressed={active}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[auto_auto] sm:items-end">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="text-xs uppercase tracking-wide text-muted-foreground/80">Palette size</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={sizeMin}
                  onChange={(event) => setSizeMin(event.target.value)}
                  className="h-10 w-20 rounded-lg border border-border/50 bg-background/80 px-3 text-foreground focus:border-primary focus:outline-none"
                  aria-label="Minimum colors"
                />
                <span className="text-muted-foreground/70">to</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={sizeMax}
                  onChange={(event) => setSizeMax(event.target.value)}
                  className="h-10 w-20 rounded-lg border border-border/50 bg-background/80 px-3 text-foreground focus:border-primary focus:outline-none"
                  aria-label="Maximum colors"
                  placeholder="same"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground/70">
              Leave the second box empty for a fixed palette size.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleGo}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-5 py-2 text-sm font-semibold transition",
                isSpinning
                  ? "border-orange-400/60 bg-orange-400/10 text-orange-200 hover:bg-orange-400/20"
                  : "border-primary/60 bg-primary/10 text-primary hover:bg-primary/20"
              )}
            >
              {isSpinning ? "Stop" : "Spin"}
            </button>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!isCopyEnabled}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-5 py-2 text-sm font-semibold transition",
                isCopyEnabled
                  ? "border-border/60 text-foreground hover:border-primary/50 hover:text-primary"
                  : "cursor-not-allowed border-border/40 text-muted-foreground"
              )}
            >
              Copy colours
            </button>
            {!isSpinning && (
              <span className="text-xs uppercase tracking-wide text-muted-foreground/70">
                {spinCount} / {targetSpins || "∞"} palettes
              </span>
            )}
          </div>

          {error && (
            <p className="rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-border/40 bg-background/80 shadow-lg shadow-black/30">
        <div className="grid h-48 w-full grid-cols-[repeat(auto-fit,minmax(80px,1fr))]">
          {currentPalette.map((hex, index) => (
            <div key={hex + index} className="transition-colors duration-700 ease-in-out" style={{ backgroundColor: hex }} />
          ))}
        </div>
        <div className="flex flex-col gap-2 px-6 py-4 text-xs uppercase tracking-wide text-muted-foreground/70 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Seed #{meta?.seed?.toUpperCase() ?? "------"} · {meta?.mode ?? "—"}
          </span>
          <span>
            {meta?.source === "fallback" ? "Fallback palette" : "The Color API"} · {meta ? `${meta.ms}ms` : "—"}
          </span>
        </div>
      </section>
    </div>
  );
}
