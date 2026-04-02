"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useCatGenerator, useSpriteMapperOptions } from "@/components/cat-builder/hooks";
import { ADDITIONAL_PALETTES } from "@/lib/palettes";
import type { PaletteCategory } from "@/lib/palettes";
import { AFTERLIFE_OPTIONS } from "@/utils/catSettingsHelpers";
import type { CatGeneratorApi } from "@/components/cat-builder/types";
import type { CatParams } from "@/lib/cat-v3/types";
import {
  runProgressiveSpin,
  type ParameterOptions,
} from "@/utils/spinEngine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OverlayPhase = "idle" | "lobby" | "countdown" | "spinning" | "result";

interface FlyingCat {
  id: string;
  frames: string[];
  startX: number;
  startTime: number;
  duration: number;
  peakY: number;
  rotation: number;
}

interface RevealedParam {
  id: string;
  label: string;
  value: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FADE_MS = 500;
const CAT_FLIGHT_DURATION_MS = 4_500;
const CAT_SPAWN_INTERVAL_MS = 3_500;
const MAX_FLYING_CATS = 3;
const FLYING_CAT_FRAMES = 5;
const FRAME_CYCLE_MS = 150;
const PALETTE_CYCLE_MS = 4_000;

// ---------------------------------------------------------------------------
// OBSOverlayClient
// ---------------------------------------------------------------------------

export function OBSOverlayClient({ apiKey }: { apiKey: string }) {
  const session = useQuery(api.catStream.getSessionByApiKey, { apiKey });
  const lastSeqRef = useRef(0);
  const [phase, setPhase] = useState<OverlayPhase>("idle");
  const [countdownValue, setCountdownValue] = useState(3);
  const [currentParams, setCurrentParams] = useState<Record<string, unknown> | null>(null);
  const [revealedParams, setRevealedParams] = useState<RevealedParam[]>([]);
  const [activeParam, setActiveParam] = useState<{ label: string; value: string } | null>(null);
  const [catImageUrl, setCatImageUrl] = useState<string | null>(null);
  const [fading, setFading] = useState(false);
  const spinTokenRef = useRef(0);

  const { generator } = useCatGenerator();
  const { options: mapperOptions } = useSpriteMapperOptions();

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
        setActiveParam(null);
        setCatImageUrl(null);
        if (cmd.countdownSeconds && cmd.countdownSeconds > 0) {
          setCountdownValue(cmd.countdownSeconds);
          setPhase("countdown");
        } else {
          setPhase("spinning");
        }
        break;
      }
      case "clear":
        spinTokenRef.current++;
        setFading(true);
        setTimeout(() => {
          setPhase("idle");
          setFading(false);
          setCurrentParams(null);
          setCatImageUrl(null);
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

  // =====================================================================
  // PROGRESSIVE SPIN — uses the shared spinEngine (same as SingleCatPlusClient)
  // =====================================================================

  // Build ParameterOptions from the mapper's BuilderOptions
  const parameterOptions = useMemo((): ParameterOptions | null => {
    if (!mapperOptions) return null;
    return {
      sprite: mapperOptions.sprites ?? [],
      pelt: mapperOptions.pelts ?? [],
      colour: mapperOptions.pelts ?? [], // colours come from pelts in the mapper
      tortie: [true, false],
      tortieMask: mapperOptions.tortieMasks ?? [],
      tortiePattern: mapperOptions.pelts ?? [],
      tortieColour: mapperOptions.pelts ?? [],
      tint: mapperOptions.tints ?? [],
      eyeColour: mapperOptions.eyeColours ?? [],
      eyeColour2: ["none", ...(mapperOptions.eyeColours ?? [])],
      skinColour: mapperOptions.skinColours ?? [],
      whitePatches: ["none", ...(mapperOptions.whitePatches ?? [])],
      points: ["none", ...(mapperOptions.points ?? [])],
      whitePatchesTint: ["none", ...(mapperOptions.whiteTints ?? [])],
      vitiligo: ["none", ...(mapperOptions.vitiligo ?? [])],
      accessory: [
        "none",
        ...(mapperOptions.plantAccessories ?? []),
        ...(mapperOptions.wildAccessories ?? []),
        ...(mapperOptions.collarAccessories ?? []),
      ],
      scar: [
        "none",
        ...(mapperOptions.scarBattle ?? []),
        ...(mapperOptions.scarMissing ?? []),
        ...(mapperOptions.scarEnvironmental ?? []),
      ],
      shading: [true, false],
      reverse: [true, false],
    };
  }, [mapperOptions]);

  useEffect(() => {
    if (phase !== "spinning" || !currentParams || !generator) return;

    const token = ++spinTokenRef.current;

    runProgressiveSpin(
      generator,
      currentParams as Partial<CatParams>,
      parameterOptions,
      {
        onParamStart: (paramId, label) => {
          setActiveParam({ label, value: "..." });
        },
        onFrame: (canvas, paramLabel, valueDisplay, _isFinal) => {
          setCatImageUrl(canvas.toDataURL("image/png"));
          setActiveParam({ label: paramLabel, value: valueDisplay });
        },
        onParamRevealed: (paramId, label, value) => {
          setRevealedParams((prev) => [
            ...prev,
            { id: paramId, label, value },
          ]);
          setActiveParam(null);
        },
        onComplete: (finalCanvas) => {
          if (finalCanvas) {
            setCatImageUrl(finalCanvas.toDataURL("image/png"));
          }
          setPhase("result");
        },
        isCancelled: () => spinTokenRef.current !== token,
      }
    );

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentParams, generator, parameterOptions]);

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

  return (
    <div
      className={cn(
        "fixed inset-0 overflow-hidden transition-opacity",
        fading ? "opacity-0" : "opacity-100"
      )}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
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
            catImageUrl={catImageUrl}
            revealedParams={revealedParams}
            activeParam={activeParam}
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

  useEffect(() => {
    if (palettes.length <= 1) return;
    const timer = setInterval(() => {
      setPaletteIndex((prev) => (prev + 1) % palettes.length);
    }, PALETTE_CYCLE_MS);
    return () => clearInterval(timer);
  }, [palettes.length]);

  // Spawn flying cats with multiple frames
  useEffect(() => {
    if (!generator?.generateRandomCat) return;
    let cancelled = false;

    const spawnCat = async () => {
      if (cancelled) return;
      try {
        const frames: string[] = [];
        for (let f = 0; f < FLYING_CAT_FRAMES; f++) {
          if (cancelled) return;
          const result = await generator.generateRandomCat!();
          if (result.canvas instanceof HTMLCanvasElement) {
            frames.push(result.canvas.toDataURL("image/png"));
          }
        }
        if (cancelled || frames.length === 0) return;

        setFlyingCats((prev) => {
          const alive = prev.filter((c) => Date.now() - c.startTime < c.duration);
          if (alive.length >= MAX_FLYING_CATS) return alive;
          return [
            ...alive,
            {
              id: `cat-${catIdCounter.current++}`,
              frames,
              startX: 5 + Math.random() * 50,
              startTime: Date.now(),
              duration: CAT_FLIGHT_DURATION_MS + Math.random() * 1500,
              peakY: 10 + Math.random() * 18,
              rotation: -20 + Math.random() * 40,
            },
          ];
        });
      } catch (err) {
        console.error("[OBS] Flying cat failed:", err);
      }
    };

    spawnCat();
    const timer = setInterval(spawnCat, CAT_SPAWN_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [generator]);

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
    AFTERLIFE_OPTIONS.find((o) => o.value === settings?.afterlifeMode)?.label ?? "Off";
  const rangeStr = (r?: { min: number; max: number }) =>
    r ? `${r.min}–${r.max}` : "0–2";

  const settingChips = [
    { label: "Mode", value: settings?.mode ?? "flashy" },
    { label: "Afterlife", value: afterlifeLabel },
    { label: "Accessories", value: rangeStr(settings?.accessoryRange) },
    { label: "Scars", value: rangeStr(settings?.scarRange) },
    { label: "Torties", value: rangeStr(settings?.tortieRange) },
    { label: "Base", value: settings?.includeBaseColours !== false ? "On" : "Off" },
  ];

  return (
    <div className="flex h-full flex-col">
      <style>{`
        @keyframes lobby-glow { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.7; } }
        @keyframes lobby-chip-in { 0% { opacity: 0; transform: translateY(12px) scale(0.9); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes lobby-swatch-pop { 0% { opacity: 0; transform: scale(0.5); } 60% { transform: scale(1.1); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes lobby-pulse-ring { 0% { transform: scale(0.98); opacity: 0.5; } 50% { transform: scale(1); opacity: 1; } 100% { transform: scale(0.98); opacity: 0.5; } }
      `}</style>

      <div className="relative flex items-center justify-center" style={{ height: "66.67%" }}>
        {/* Ambient glow */}
        <div
          className="pointer-events-none absolute rounded-full blur-[100px]"
          style={{
            width: "60%", height: "50%",
            background: "radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 70%)",
            animation: "lobby-glow 4s ease-in-out infinite",
          }}
        />

        <div className="relative z-10 w-[85%] max-w-[640px]">
          {/* Pulsing border */}
          <div
            className="absolute -inset-[2px] rounded-2xl"
            style={{
              background: "linear-gradient(135deg, rgba(245,158,11,0.4), rgba(217,119,6,0.1), rgba(245,158,11,0.3))",
              animation: "lobby-pulse-ring 3s ease-in-out infinite",
            }}
          />

          <div className="relative rounded-2xl bg-black/85 px-8 py-7 backdrop-blur-xl">
            <div className="mb-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
              <span className="text-xs font-bold uppercase tracking-[0.35em] text-amber-400/70">
                Spin Settings
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {settingChips.map((chip, i) => (
                <div
                  key={chip.label}
                  className="flex flex-col items-center rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3"
                  style={{ animation: `lobby-chip-in 0.5s ease-out ${i * 80}ms both` }}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
                    {chip.label}
                  </span>
                  <span className="mt-1 text-lg font-bold capitalize text-white">
                    {chip.value}
                  </span>
                </div>
              ))}
            </div>

            {currentPalette && (
              <div key={currentPalette.id} className="mt-5 border-t border-white/5 pt-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-amber-400/90">{currentPalette.label}</span>
                  {palettes.length > 1 && (
                    <span className="text-[10px] font-medium tabular-nums text-white/25">
                      {paletteIndex + 1} / {palettes.length}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(currentPalette.colors).slice(0, 28).map(([name, def], i) => {
                    const rgb = def.multiply ?? [128, 128, 128];
                    return (
                      <div
                        key={name}
                        className="size-6 rounded-[4px] border border-white/10 shadow-sm shadow-black/30"
                        style={{
                          backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
                          animation: `lobby-swatch-pop 0.3s ease-out ${i * 20}ms both`,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden" style={{ height: "33.33%" }}>
        {flyingCats.map((cat) => (
          <FlyingCatSprite key={cat.id} cat={cat} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flying cat (fruit-ninja arc with frame cycling)
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

      const y = -4 * cat.peakY * progress * (progress - 1);
      const xDrift = progress * 12;
      const opacity = progress < 0.12 ? progress / 0.12 : progress > 0.88 ? (1 - progress) / 0.12 : 1;

      ref.current.style.left = `${cat.startX + xDrift}%`;
      ref.current.style.transform = `translateY(${-y}vh) rotate(${cat.rotation * progress}deg) scale(${0.8 + progress * 0.4})`;
      ref.current.style.opacity = String(Math.max(0, Math.min(1, opacity)));

      if (cat.frames.length > 1 && now - lastFrameSwap > FRAME_CYCLE_MS) {
        frameRef.current = (frameRef.current + 1) % cat.frames.length;
        if (imgRef.current) imgRef.current.src = cat.frames[frameRef.current];
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
// Phase: Spinning / Result — progressive reveal with live cat updates
// ---------------------------------------------------------------------------

function SpinPhase({
  catImageUrl,
  revealedParams,
  activeParam,
  isResult,
}: {
  catImageUrl: string | null;
  revealedParams: RevealedParam[];
  activeParam: { label: string; value: string } | null;
  isResult: boolean;
}) {
  return (
    <div className="flex h-full gap-4 p-6">
      {/* Cat canvas — BIG, dominates */}
      <div className="flex flex-1 items-center justify-center">
        {catImageUrl ? (
          <div className={isResult ? "animate-in zoom-in-75 fade-in duration-700" : ""}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={catImageUrl}
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
          <style>{`
            @keyframes splitFlap {
              0% { transform: rotateX(90deg); opacity: 0; }
              60% { transform: rotateX(-10deg); opacity: 1; }
              100% { transform: rotateX(0deg); opacity: 1; }
            }
          `}</style>

          <div className="space-y-0.5">
            {/* Revealed params */}
            {revealedParams.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-md bg-amber-500/5 px-3 py-1.5"
              >
                <span className="text-sm font-medium text-white/40">{p.label}</span>
                <SplitFlapText text={p.value} />
              </div>
            ))}

            {/* Currently active param (being revealed) */}
            {activeParam && (
              <div className="flex items-center justify-between rounded-md bg-amber-500/10 px-3 py-1.5 border border-amber-500/20">
                <span className="text-sm font-bold text-amber-400">{activeParam.label}</span>
                <span className="font-mono text-sm font-bold text-amber-300">
                  {activeParam.value}
                </span>
              </div>
            )}

            {/* Unrevealed placeholder rows */}
            {!isResult &&
              Array.from({ length: Math.max(0, 6 - revealedParams.length - (activeParam ? 1 : 0)) }).map((_, i) => (
                <div key={`placeholder-${i}`} className="flex items-center justify-between rounded-md px-3 py-1.5">
                  <span className="text-sm text-white/10">???</span>
                  <CyclingText />
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Split-flap text — each character flips down
// ---------------------------------------------------------------------------

function SplitFlapText({ text }: { text: string }) {
  return (
    <span className="inline-flex gap-px">
      {text.split("").map((char, i) => (
        <span
          key={`${i}-${char}`}
          className="inline-block rounded-sm bg-amber-500/10 px-[3px] py-[1px] font-mono text-sm font-bold text-amber-400"
          style={{ animation: `splitFlap 0.25s ease-out ${i * 40}ms both` }}
        >
          {char}
        </span>
      ))}
    </span>
  );
}

function CyclingText() {
  const [text, setText] = useState("???");
  useEffect(() => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const timer = setInterval(() => {
      setText(Array.from({ length: 3 + Math.floor(Math.random() * 5) }, () =>
        chars[Math.floor(Math.random() * chars.length)]
      ).join(""));
    }, 70);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="inline-flex gap-px">
      {text.split("").map((char, i) => (
        <span key={i} className="inline-block rounded-sm bg-white/5 px-[3px] py-[1px] font-mono text-sm font-bold text-white/15">
          {char}
        </span>
      ))}
    </span>
  );
}
