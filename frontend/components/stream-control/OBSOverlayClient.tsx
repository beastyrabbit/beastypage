"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useCatGenerator } from "@/components/cat-builder/hooks";
import { ADDITIONAL_PALETTES } from "@/lib/palettes";
import type { PaletteCategory } from "@/lib/palettes";
import { AFTERLIFE_OPTIONS } from "@/utils/catSettingsHelpers";
import type { CatGeneratorApi } from "@/components/cat-builder/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OverlayPhase = "idle" | "lobby" | "countdown" | "spinning" | "result";

interface FlyingCat {
  id: string;
  frames: string[]; // multiple renders to cycle through (simulates spinning)
  startX: number;
  startTime: number;
  duration: number;
  peakY: number;
  rotation: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RESULT_HOLD_MS = 10_000;
const FADE_MS = 500;
const LOBBY_FADE_MS = 400;
const CAT_FLIGHT_DURATION_MS = 4_500;
const CAT_SPAWN_INTERVAL_MS = 3_500;
const MAX_FLYING_CATS = 3;
const FLYING_CAT_FRAMES = 5; // how many random cats to pre-render per flying cat
const FRAME_CYCLE_MS = 150; // how fast frames cycle on a flying cat
const PALETTE_CYCLE_MS = 4_000;
const SPIN_FRAME_COUNT = 6; // number of variation frames during spin
const SPIN_CYCLE_MS = 120; // frame cycle speed during spin

// ---------------------------------------------------------------------------
// OBSOverlayClient
// ---------------------------------------------------------------------------

export function OBSOverlayClient({ apiKey }: { apiKey: string }) {
  const session = useQuery(api.catStream.getSessionByApiKey, { apiKey });
  const lastSeqRef = useRef(0);
  const [phase, setPhase] = useState<OverlayPhase>("idle");
  const [countdownValue, setCountdownValue] = useState(3);
  const [currentParams, setCurrentParams] = useState<Record<string, unknown> | null>(null);
  const [revealedParams, setRevealedParams] = useState<string[]>([]);
  const [catImageUrl, setCatImageUrl] = useState<string | null>(null);
  const [spinFrames, setSpinFrames] = useState<string[]>([]);
  const [spinFrameIndex, setSpinFrameIndex] = useState(0);
  const [fading, setFading] = useState(false);

  const { generator } = useCatGenerator();

  // Make background transparent for OBS and hide root layout chrome
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    const header = document.querySelector("header");
    const footer = document.querySelector("footer");
    if (header instanceof HTMLElement) header.style.display = "none";
    if (footer instanceof HTMLElement) footer.style.display = "none";
    return () => {
      document.documentElement.style.background = "";
      document.body.style.background = "";
      if (header instanceof HTMLElement) header.style.display = "";
      if (footer instanceof HTMLElement) footer.style.display = "";
    };
  }, []);

  // Process commands from Convex
  useEffect(() => {
    if (!session?.currentCommand) return;
    const cmd = session.currentCommand;
    if (cmd.seq <= lastSeqRef.current) return;
    lastSeqRef.current = cmd.seq;

    switch (cmd.type) {
      case "lobby":
        setFading(false);
        setPhase("lobby");
        break;
      case "spin": {
        const params = cmd.params as Record<string, unknown>;
        setCurrentParams(params);
        setRevealedParams([]);
        setCatImageUrl(null);
        setSpinFrames([]);
        setSpinFrameIndex(0);
        if (cmd.countdownSeconds && cmd.countdownSeconds > 0) {
          setCountdownValue(cmd.countdownSeconds);
          setPhase("countdown");
        } else {
          setPhase("spinning");
        }
        break;
      }
      case "clear":
        setFading(true);
        setTimeout(() => {
          setPhase("idle");
          setFading(false);
          setCurrentParams(null);
          setCatImageUrl(null);
          setSpinFrames([]);
        }, FADE_MS);
        break;
      case "test":
        setPhase("lobby");
        break;
    }
  }, [session?.currentCommand]);

  // Countdown → spinning transition
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdownValue <= 0) {
      setPhase("spinning");
      return;
    }
    const timer = setTimeout(() => setCountdownValue((v) => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, countdownValue]);

  // Pre-render spin variation frames when spinning starts
  useEffect(() => {
    if (phase !== "spinning" || !generator?.generateRandomCat) return;
    let cancelled = false;

    (async () => {
      const frames: string[] = [];
      for (let i = 0; i < SPIN_FRAME_COUNT; i++) {
        if (cancelled) return;
        try {
          const result = await generator.generateRandomCat!();
          const canvas = result.canvas;
          if (canvas instanceof HTMLCanvasElement) {
            frames.push(canvas.toDataURL("image/png"));
          }
        } catch {
          // skip failed frame
        }
      }
      if (!cancelled) setSpinFrames(frames);
    })();

    return () => { cancelled = true; };
  }, [phase, generator]);

  // Cycle through spin frames
  useEffect(() => {
    if (phase !== "spinning" || spinFrames.length === 0) return;
    const timer = setInterval(() => {
      setSpinFrameIndex((prev) => (prev + 1) % spinFrames.length);
    }, SPIN_CYCLE_MS);
    return () => clearInterval(timer);
  }, [phase, spinFrames.length]);

  // Spinning → result transition (sequential parameter reveal)
  useEffect(() => {
    if (phase !== "spinning" || !currentParams) return;
    const paramKeys = PARAM_ORDER.filter(
      (k) => currentParams[k] !== undefined && currentParams[k] !== null
    );
    let i = 0;

    const revealNext = () => {
      if (i >= paramKeys.length) {
        renderFinalCat();
        return;
      }
      setRevealedParams((prev) => [...prev, paramKeys[i]]);
      i++;
      setTimeout(revealNext, 400 + Math.random() * 300);
    };

    const timeout = setTimeout(revealNext, 800);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentParams]);

  // Render the final cat
  const renderFinalCat = useCallback(async () => {
    if (!generator || !currentParams) return;
    try {
      const result = await generator.generateCat(currentParams);
      if (result.imageDataUrl) {
        setCatImageUrl(result.imageDataUrl);
      } else if (result.canvas) {
        const canvas = result.canvas as HTMLCanvasElement;
        setCatImageUrl(canvas.toDataURL("image/png"));
      }
    } catch (err) {
      console.error("[OBS] Failed to render cat:", err);
    }
    setPhase("result");
    // Result stays visible until the streamer sends a new command
    // (lobby, clear, or another spin). No auto-fade.
  }, [generator, currentParams]);

  // Resolve palette data for lobby
  const sessionPalettes = useMemo(() => {
    if (!session?.settings) return [];
    const s = session.settings as { extendedModes?: string[] };
    if (!s.extendedModes) return [];
    return ADDITIONAL_PALETTES.filter((p) => s.extendedModes!.includes(p.id));
  }, [session?.settings]);

  const settings = session?.settings as {
    mode?: string;
    accessoryRange?: { min: number; max: number };
    scarRange?: { min: number; max: number };
    tortieRange?: { min: number; max: number };
    afterlifeMode?: string;
    includeBaseColours?: boolean;
  } | null;

  if (phase === "idle") return null;

  const currentSpinFrame =
    spinFrames.length > 0 ? spinFrames[spinFrameIndex] : null;

  return (
    <div
      className={cn(
        "fixed inset-0 overflow-hidden transition-opacity",
        fading ? "opacity-0" : "opacity-100"
      )}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      {/* Content area — left 2/3 */}
      <div
        className="absolute top-0 bottom-0 left-0"
        style={{ right: "var(--cam-zone-width, 33.33%)" }}
      >
        {phase === "lobby" && (
          <LobbyPhase
            settings={settings}
            palettes={sessionPalettes}
            generator={generator}
          />
        )}

        {phase === "countdown" && <CountdownPhase value={countdownValue} />}

        {(phase === "spinning" || phase === "result") && (
          <SpinPhase
            params={currentParams}
            revealedParams={revealedParams}
            catImageUrl={catImageUrl}
            spinFrame={currentSpinFrame}
            isResult={phase === "result"}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase: Lobby (pre-spin)
// ---------------------------------------------------------------------------

function LobbyPhase({
  settings,
  palettes,
  generator,
}: {
  settings: {
    mode?: string;
    accessoryRange?: { min: number; max: number };
    scarRange?: { min: number; max: number };
    tortieRange?: { min: number; max: number };
    afterlifeMode?: string;
    includeBaseColours?: boolean;
  } | null;
  palettes: PaletteCategory[];
  generator: CatGeneratorApi | null;
}) {
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [flyingCats, setFlyingCats] = useState<FlyingCat[]>([]);
  const catIdCounter = useRef(0);

  // Cycle palettes
  useEffect(() => {
    if (palettes.length <= 1) return;
    const timer = setInterval(() => {
      setPaletteIndex((prev) => (prev + 1) % palettes.length);
    }, PALETTE_CYCLE_MS);
    return () => clearInterval(timer);
  }, [palettes.length]);

  // Spawn flying cats — each with multiple frames to cycle through
  useEffect(() => {
    if (!generator?.generateRandomCat) return;
    let cancelled = false;

    const spawnCat = async () => {
      if (cancelled) return;
      try {
        // Generate multiple frames so the cat "spins" during flight
        const frames: string[] = [];
        for (let f = 0; f < FLYING_CAT_FRAMES; f++) {
          if (cancelled) return;
          const result = await generator.generateRandomCat!();
          if (result.canvas instanceof HTMLCanvasElement) {
            frames.push(result.canvas.toDataURL("image/png"));
          }
        }
        if (cancelled || frames.length === 0) return;

        const id = `cat-${catIdCounter.current++}`;
        const newCat: FlyingCat = {
          id,
          frames,
          startX: 5 + Math.random() * 50,
          startTime: Date.now(),
          duration: CAT_FLIGHT_DURATION_MS + Math.random() * 1500,
          peakY: 10 + Math.random() * 18,
          rotation: -20 + Math.random() * 40,
        };

        setFlyingCats((prev) => {
          const alive = prev.filter(
            (c) => Date.now() - c.startTime < c.duration
          );
          if (alive.length >= MAX_FLYING_CATS) return alive;
          return [...alive, newCat];
        });
      } catch (err) {
        console.error("[OBS] Failed to generate flying cat:", err);
      }
    };

    spawnCat();
    const timer = setInterval(spawnCat, CAT_SPAWN_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [generator]);

  // Clean up expired cats
  useEffect(() => {
    const cleanup = setInterval(() => {
      setFlyingCats((prev) =>
        prev.filter((c) => Date.now() - c.startTime < c.duration + 500)
      );
    }, 1000);
    return () => clearInterval(cleanup);
  }, []);

  const currentPalette = palettes[paletteIndex];
  const afterlifeLabel =
    AFTERLIFE_OPTIONS.find((o) => o.value === settings?.afterlifeMode)?.label ??
    "Off";
  const rangeStr = (r?: { min: number; max: number }) =>
    r ? `${r.min}–${r.max}` : "0–2";

  return (
    <div className="flex h-full flex-col">
      {/* Top 2/3: Settings overview */}
      <div
        className="flex flex-1 items-center justify-center"
        style={{ height: "66.67%" }}
      >
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 rounded-2xl border border-amber-500/20 bg-black/80 px-12 py-10 shadow-[0_0_60px_rgba(245,158,11,0.1)] max-w-[75%]">
          <h2 className="mb-8 text-center text-3xl font-bold text-white tracking-wide">
            Settings Overview
          </h2>
          <div className="grid grid-cols-2 gap-x-10 gap-y-4 text-xl">
            <SettingRow label="Mode" value={settings?.mode ?? "flashy"} />
            <SettingRow label="Afterlife" value={afterlifeLabel} />
            <SettingRow
              label="Accessories"
              value={rangeStr(settings?.accessoryRange)}
            />
            <SettingRow
              label="Scars"
              value={rangeStr(settings?.scarRange)}
            />
            <SettingRow
              label="Torties"
              value={rangeStr(settings?.tortieRange)}
            />
            <SettingRow
              label="Base colours"
              value={settings?.includeBaseColours !== false ? "Yes" : "No"}
            />
          </div>

          {/* Palette carousel */}
          {currentPalette && (
            <div
              key={currentPalette.id}
              className="mt-8 animate-in fade-in duration-500"
            >
              <p className="mb-3 text-center text-base font-semibold text-amber-400/80">
                {currentPalette.label}
                {palettes.length > 1 && (
                  <span className="ml-2 text-amber-400/40">
                    ({paletteIndex + 1}/{palettes.length})
                  </span>
                )}
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {Object.entries(currentPalette.colors)
                  .slice(0, 24)
                  .map(([name, def]) => {
                    const rgb = def.multiply ?? [128, 128, 128];
                    return (
                      <div
                        key={name}
                        className="size-7 rounded border border-white/15 shadow-sm"
                        style={{
                          backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
                        }}
                        title={name.replace(/_/g, " ")}
                      />
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom 1/3: Fruit-ninja cat zone */}
      <div className="relative overflow-hidden" style={{ height: "33.33%" }}>
        {flyingCats.map((cat) => (
          <FlyingCatSprite key={cat.id} cat={cat} />
        ))}
      </div>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-right text-white/40 font-medium">{label}</span>
      <span className="font-bold capitalize text-white">{value}</span>
    </>
  );
}

// ---------------------------------------------------------------------------
// Flying cat — fruit-ninja arc with frame cycling
// ---------------------------------------------------------------------------

function FlyingCatSprite({ cat }: { cat: FlyingCat }) {
  const ref = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    let raf: number;
    let lastFrameSwap = 0;

    const animate = () => {
      if (!ref.current) return;
      const now = Date.now();
      const elapsed = now - cat.startTime;
      const progress = Math.min(elapsed / cat.duration, 1);
      if (progress >= 1) return;

      // Parabolic arc
      const y = -4 * cat.peakY * progress * (progress - 1);
      const xDrift = progress * 12;
      // Fade in/out
      const opacity =
        progress < 0.12
          ? progress / 0.12
          : progress > 0.88
            ? (1 - progress) / 0.12
            : 1;

      ref.current.style.left = `${cat.startX + xDrift}%`;
      ref.current.style.transform = `translateY(${-y}vh) rotate(${cat.rotation * progress}deg) scale(${0.8 + progress * 0.4})`;
      ref.current.style.opacity = String(Math.max(0, Math.min(1, opacity)));

      // Cycle frames to simulate spinning
      if (cat.frames.length > 1 && now - lastFrameSwap > FRAME_CYCLE_MS) {
        frameRef.current = (frameRef.current + 1) % cat.frames.length;
        if (imgRef.current) {
          imgRef.current.src = cat.frames[frameRef.current];
        }
        lastFrameSwap = now;
      }

      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [cat]);

  return (
    <div ref={ref} className="absolute bottom-0" style={{ opacity: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={cat.frames[0]}
        alt=""
        className="h-24 w-auto drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]"
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase: Countdown
// ---------------------------------------------------------------------------

function CountdownPhase({ value }: { value: number }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div
        key={value}
        className="animate-in zoom-in-50 fade-in duration-500 text-[20vw] font-black text-white drop-shadow-[0_0_60px_rgba(245,158,11,0.6)]"
        style={{ textShadow: "0 0 80px rgba(245,158,11,0.4)" }}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase: Spinning / Result
// ---------------------------------------------------------------------------

const PARAM_ORDER = [
  "spriteNumber",
  "peltName",
  "colour",
  "eyeColour",
  "eyeColour2",
  "tint",
  "skinColour",
  "whitePatches",
  "points",
  "whitePatchesTint",
  "vitiligo",
  "isTortie",
  "tortieMask",
  "tortiePattern",
  "tortieColour",
  "shading",
  "reverse",
] as const;

const PARAM_LABELS: Record<string, string> = {
  spriteNumber: "Sprite",
  peltName: "Pelt",
  colour: "Colour",
  eyeColour: "Eyes",
  eyeColour2: "Heterochromia",
  tint: "Tint",
  skinColour: "Skin",
  whitePatches: "White Patches",
  points: "Points",
  whitePatchesTint: "White Tint",
  vitiligo: "Vitiligo",
  isTortie: "Tortie",
  tortieMask: "Tortie Mask",
  tortiePattern: "Tortie Pattern",
  tortieColour: "Tortie Colour",
  shading: "Shading",
  reverse: "Reverse",
};

function SpinPhase({
  params,
  revealedParams,
  catImageUrl,
  spinFrame,
  isResult,
}: {
  params: Record<string, unknown> | null;
  revealedParams: string[];
  catImageUrl: string | null;
  spinFrame: string | null;
  isResult: boolean;
}) {
  if (!params) return null;

  const visibleParams = PARAM_ORDER.filter(
    (k) => params[k] !== undefined && params[k] !== null
  );
  const revealed = new Set(revealedParams);

  // Show: final cat if result, spinning frame if available, or placeholder
  const displayImage = catImageUrl ?? spinFrame;

  return (
    <div className="flex h-full gap-4 p-6">
      {/* Cat canvas — BIG, dominates the space */}
      <div className="flex flex-1 items-center justify-center">
        {displayImage ? (
          <div
            className={cn(
              isResult
                ? "animate-in zoom-in-75 fade-in duration-700"
                : "transition-opacity duration-100"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayImage}
              alt="Cat"
              className="h-[55vh] w-auto drop-shadow-[0_0_40px_rgba(245,158,11,0.35)]"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
        ) : (
          <div className="flex size-[40vh] items-center justify-center rounded-2xl bg-white/5">
            <div className="size-16 animate-spin rounded-full border-4 border-amber-500/30 border-t-amber-500" />
          </div>
        )}
      </div>

      {/* Split-flap result table */}
      <div className="flex w-[40%] max-w-md flex-col justify-center">
        <div className="rounded-xl border border-amber-500/15 bg-black/85 p-5 shadow-[0_0_40px_rgba(0,0,0,0.5)] backdrop-blur-md">
          <div className="space-y-0.5">
            {visibleParams.map((key) => {
              const isRevealed = revealed.has(key) || isResult;
              const rawValue = params[key];
              const displayValue =
                typeof rawValue === "boolean"
                  ? rawValue
                    ? "Yes"
                    : "No"
                  : String(rawValue ?? "—");

              return (
                <div
                  key={key}
                  className={cn(
                    "flex items-center justify-between rounded-md px-3 py-1.5 transition-colors duration-300",
                    isRevealed ? "bg-amber-500/5" : ""
                  )}
                >
                  <span className="text-sm font-medium text-white/40">
                    {PARAM_LABELS[key] ?? key}
                  </span>
                  <div className="overflow-hidden" style={{ perspective: "200px" }}>
                    {isRevealed ? (
                      <SplitFlapText text={displayValue} />
                    ) : (
                      <CyclingText />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Split-flap text — each character flips down like an airport departure board
// ---------------------------------------------------------------------------

function SplitFlapText({ text }: { text: string }) {
  return (
    <span className="inline-flex gap-px">
      {text.split("").map((char, i) => (
        <span
          key={`${i}-${char}`}
          className="inline-block rounded-sm bg-amber-500/10 px-[3px] py-[1px] font-mono text-sm font-bold text-amber-400"
          style={{
            animation: `splitFlap 0.25s ease-out ${i * 40}ms both`,
          }}
        >
          {char}
        </span>
      ))}
      <style>{`
        @keyframes splitFlap {
          0% {
            transform: rotateX(90deg);
            opacity: 0;
          }
          60% {
            transform: rotateX(-10deg);
            opacity: 1;
          }
          100% {
            transform: rotateX(0deg);
            opacity: 1;
          }
        }
      `}</style>
    </span>
  );
}

function CyclingText() {
  const [text, setText] = useState("???");

  useEffect(() => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const timer = setInterval(() => {
      setText(
        Array.from({ length: 3 + Math.floor(Math.random() * 5) }, () =>
          chars[Math.floor(Math.random() * chars.length)]
        ).join("")
      );
    }, 70);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="inline-flex gap-px">
      {text.split("").map((char, i) => (
        <span
          key={i}
          className="inline-block rounded-sm bg-white/5 px-[3px] py-[1px] font-mono text-sm font-bold text-white/15"
        >
          {char}
        </span>
      ))}
    </span>
  );
}
