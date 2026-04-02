"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useCatGenerator, useSpriteMapperOptions } from "@/components/cat-builder/hooks";
import { ADDITIONAL_PALETTES } from "@/lib/palettes";
import type { PaletteCategory } from "@/lib/palettes";
import { AFTERLIFE_OPTIONS } from "@/utils/catSettingsHelpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OverlayPhase = "idle" | "lobby" | "countdown" | "spinning" | "result";

interface FlyingCat {
  id: string;
  imageDataUrl: string;
  startX: number; // vw units
  startTime: number;
  duration: number; // ms
  peakY: number; // vh units (how high the arc peaks)
  rotation: number; // degrees
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RESULT_HOLD_MS = 10_000;
const FADE_MS = 500;
const CAT_FLIGHT_DURATION_MS = 3_500;
const CAT_SPAWN_INTERVAL_MS = 3_000;
const MAX_FLYING_CATS = 3;
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
  const [revealedParams, setRevealedParams] = useState<string[]>([]);
  const [catImageUrl, setCatImageUrl] = useState<string | null>(null);
  const [fading, setFading] = useState(false);

  const { generator } = useCatGenerator();

  // Make background transparent for OBS and hide root layout chrome
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";

    // Hide the site header and footer, but keep the content container visible
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

  // Spinning → result transition (simulate parameter reveal)
  useEffect(() => {
    if (phase !== "spinning" || !currentParams) return;

    const paramKeys = PARAM_ORDER.filter((k) => currentParams[k] !== undefined && currentParams[k] !== null);
    let i = 0;

    const revealNext = () => {
      if (i >= paramKeys.length) {
        // All revealed — render final cat
        renderFinalCat();
        return;
      }
      setRevealedParams((prev) => [...prev, paramKeys[i]]);
      i++;
      setTimeout(revealNext, 300 + Math.random() * 200);
    };

    const timeout = setTimeout(revealNext, 500);
    return () => clearTimeout(timeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentParams]);

  // Render the final cat image
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

    // Auto-fade after hold time
    setTimeout(() => {
      setFading(true);
      setTimeout(() => {
        setPhase("idle");
        setFading(false);
        setCurrentParams(null);
        setCatImageUrl(null);
      }, FADE_MS);
    }, RESULT_HOLD_MS);
  }, [generator, currentParams]);

  // Resolve palette data for lobby display
  const sessionPalettes = useMemo(() => {
    if (!session?.settings) return [];
    const settings = session.settings as { extendedModes?: string[] };
    if (!settings.extendedModes) return [];
    return ADDITIONAL_PALETTES.filter((p) =>
      settings.extendedModes!.includes(p.id)
    );
  }, [session?.settings]);

  const settings = session?.settings as {
    mode?: string;
    accessoryRange?: { min: number; max: number };
    scarRange?: { min: number; max: number };
    tortieRange?: { min: number; max: number };
    afterlifeMode?: string;
    includeBaseColours?: boolean;
    extendedModes?: string[];
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

        {phase === "countdown" && (
          <CountdownPhase value={countdownValue} />
        )}

        {(phase === "spinning" || phase === "result") && (
          <SpinPhase
            params={currentParams}
            revealedParams={revealedParams}
            catImageUrl={catImageUrl}
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
  generator: ReturnType<typeof useCatGenerator>["generator"];
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

  // Spawn flying cats
  useEffect(() => {
    if (!generator?.generateRandomCat) return;

    const spawnCat = async () => {
      try {
        const result = await generator.generateRandomCat!();
        let imageDataUrl: string;
        if (result.canvas instanceof HTMLCanvasElement) {
          imageDataUrl = result.canvas.toDataURL("image/png");
        } else {
          return; // OffscreenCanvas
        }

        const id = `cat-${catIdCounter.current++}`;
        const newCat: FlyingCat = {
          id,
          imageDataUrl,
          startX: 10 + Math.random() * 50, // 10-60vw
          startTime: Date.now(),
          duration: CAT_FLIGHT_DURATION_MS + Math.random() * 1000,
          peakY: 8 + Math.random() * 15, // 8-23vh peak height
          rotation: -15 + Math.random() * 30,
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
    return () => clearInterval(timer);
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
    AFTERLIFE_OPTIONS.find((o) => o.value === settings?.afterlifeMode)?.label ?? "Off";

  const rangeStr = (r?: { min: number; max: number }) =>
    r ? `${r.min}–${r.max}` : "—";

  return (
    <div className="flex h-full flex-col">
      {/* Top 2/3: Settings overview */}
      <div className="flex flex-1 items-center justify-center" style={{ height: "66.67%" }}>
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 rounded-2xl border border-white/10 bg-black/60 px-10 py-8 backdrop-blur-md shadow-2xl max-w-[70%]">
          <h2 className="mb-6 text-center text-2xl font-bold text-white tracking-wide">
            Settings Overview
          </h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-lg">
            <SettingRow label="Mode" value={settings?.mode ?? "flashy"} />
            <SettingRow label="Afterlife" value={afterlifeLabel} />
            <SettingRow label="Accessories" value={rangeStr(settings?.accessoryRange)} />
            <SettingRow label="Scars" value={rangeStr(settings?.scarRange)} />
            <SettingRow label="Torties" value={rangeStr(settings?.tortieRange)} />
            <SettingRow
              label="Base colours"
              value={settings?.includeBaseColours !== false ? "Yes" : "No"}
            />
          </div>

          {/* Palette carousel */}
          {currentPalette && (
            <div className="mt-6 animate-in fade-in duration-500">
              <p className="mb-2 text-center text-sm font-semibold text-white/70">
                {currentPalette.label}
                {palettes.length > 1 && (
                  <span className="ml-2 text-white/40">
                    ({paletteIndex + 1}/{palettes.length})
                  </span>
                )}
              </p>
              <div className="flex flex-wrap justify-center gap-1">
                {Object.entries(currentPalette.colors)
                  .slice(0, 20)
                  .map(([name, def]) => {
                    const rgb = def.multiply ?? [128, 128, 128];
                    return (
                      <div
                        key={name}
                        className="size-6 rounded-sm border border-white/10"
                        style={{
                          backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
                        }}
                        title={name}
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
      <span className="text-right text-white/50">{label}</span>
      <span className="font-semibold capitalize text-white">{value}</span>
    </>
  );
}

// ---------------------------------------------------------------------------
// Flying cat (fruit-ninja arc)
// ---------------------------------------------------------------------------

function FlyingCatSprite({ cat }: { cat: FlyingCat }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf: number;
    const animate = () => {
      if (!ref.current) return;
      const elapsed = Date.now() - cat.startTime;
      const progress = Math.min(elapsed / cat.duration, 1);
      if (progress >= 1) return;

      const y = -4 * cat.peakY * progress * (progress - 1);
      const xDrift = progress * 10;
      const opacity =
        progress < 0.15
          ? progress / 0.15
          : progress > 0.85
            ? (1 - progress) / 0.15
            : 1;

      ref.current.style.left = `${cat.startX + xDrift}%`;
      ref.current.style.transform = `translateY(${-y}vh) rotate(${cat.rotation * progress}deg)`;
      ref.current.style.opacity = String(Math.max(0, Math.min(1, opacity)));

      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [cat]);

  return (
    <div ref={ref} className="absolute bottom-0" style={{ opacity: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cat.imageDataUrl}
        alt=""
        className="size-16 object-contain drop-shadow-lg"
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
        className="animate-in zoom-in-50 fade-in duration-500 text-[20vw] font-black text-white drop-shadow-[0_0_40px_rgba(245,158,11,0.5)]"
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
  isResult,
}: {
  params: Record<string, unknown> | null;
  revealedParams: string[];
  catImageUrl: string | null;
  isResult: boolean;
}) {
  if (!params) return null;

  const visibleParams = PARAM_ORDER.filter(
    (k) => params[k] !== undefined && params[k] !== null
  );
  const revealed = new Set(revealedParams);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
      {/* Cat canvas area */}
      <div className="flex flex-1 items-center justify-center">
        {catImageUrl ? (
          <div className="animate-in zoom-in-75 fade-in duration-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={catImageUrl}
              alt="Generated cat"
              className="max-h-[45vh] w-auto drop-shadow-[0_0_30px_rgba(245,158,11,0.3)]"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
        ) : (
          <div className="size-32 animate-pulse rounded-xl bg-white/5" />
        )}
      </div>

      {/* Split-flap result table */}
      <div className="w-full max-w-lg rounded-xl border border-white/10 bg-black/70 p-4 backdrop-blur-md">
        <div className="space-y-1">
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
                className="flex items-center justify-between rounded-md px-3 py-1.5"
              >
                <span className="text-sm font-medium text-white/50">
                  {PARAM_LABELS[key] ?? key}
                </span>
                <span
                  className={cn(
                    "font-mono text-sm font-bold transition-all duration-300",
                    isRevealed
                      ? "text-amber-400"
                      : "text-white/20 blur-sm"
                  )}
                >
                  {isRevealed ? (
                    <SplitFlapText text={displayValue} />
                  ) : (
                    <CyclingText />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Split-flap text animation
// ---------------------------------------------------------------------------

function SplitFlapText({ text }: { text: string }) {
  return (
    <span className="inline-flex">
      {text.split("").map((char, i) => (
        <span
          key={`${i}-${char}`}
          className="inline-block animate-in fade-in slide-in-from-top-2 duration-200"
          style={{ animationDelay: `${i * 30}ms` }}
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
      setText(
        Array.from({ length: 3 + Math.floor(Math.random() * 4) }, () =>
          chars[Math.floor(Math.random() * chars.length)]
        ).join("")
      );
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return <span className="inline-block w-20 text-right">{text}</span>;
}
