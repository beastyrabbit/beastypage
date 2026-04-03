"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CatGeneratorApi } from "@/components/cat-builder/types";
import { ADDITIONAL_PALETTES, patternToCssBackground } from "@/lib/palettes";
import type { PaletteCategory, PaletteColorDef } from "@/lib/palettes/types";
import { encodePortableSettings } from "@/lib/portable-settings";
import { AFTERLIFE_OPTIONS } from "@/utils/catSettingsHelpers";
import type {
  AfterlifeOption,
  ExtendedMode,
  LayerRange,
} from "@/utils/singleCatVariants";

/** Build CSS style for a palette swatch — uses pattern rendering for pattern palettes. */
function swatchStyle(def: PaletteColorDef, size: number): React.CSSProperties {
  const base: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "2px",
    border: "1px solid rgba(255,255,255,0.1)",
  };
  if (def.pattern) {
    return { ...base, ...patternToCssBackground(def.pattern) };
  }
  const rgb = def.multiply ?? [128, 128, 128];
  return { ...base, backgroundColor: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LobbySettings {
  mode: string;
  accessoryRange: LayerRange;
  scarRange: LayerRange;
  tortieRange: LayerRange;
  afterlifeMode: string;
  includeBaseColours: boolean;
  extendedModes: string[];
  exactLayerCounts?: boolean;
  lobbyMode?: string;
  lobbyCatCount?: number;
  lobbyMoveSpeed?: number;
  lobbySwapSpeed?: number;
  lobbyClearSeq?: number;
  paletteDisplayMode?: "cycle" | "all";
}

interface FlyingCat {
  id: number;
  frames: string[];
  x: number;
  startTime: number;
  duration: number;
  peakY: number;
  rotation: number;
  size: number; // 1.0 to 2.0
  mode: "fruit-ninja" | "matrix" | "dvd"; // locked at spawn time
}

// ---------------------------------------------------------------------------
// OBS Lobby — settings overview + flying cats
// ---------------------------------------------------------------------------

export function OBSLobby({
  settings,
  generator,
}: {
  settings: LobbySettings;
  generator: CatGeneratorApi | null;
}) {
  const lobbyMode = (settings.lobbyMode ?? "fruit-ninja") as
    | "fruit-ninja"
    | "matrix"
    | "dvd";
  const maxCats = settings.lobbyCatCount ?? 4;
  const moveSpeed = settings.lobbyMoveSpeed ?? 1.0;
  const swapSpeed = settings.lobbySwapSpeed ?? 1.0;
  const paletteDisplayMode = settings.paletteDisplayMode ?? "cycle";
  const [flyingCats, setFlyingCats] = useState<FlyingCat[]>([]);
  const [paletteIdx, setPaletteIdx] = useState(0);
  const catIdRef = useRef(0);

  // Lobby entrance — fade in over 5s, cats start spawning after 8s
  const [lobbyVisible, setLobbyVisible] = useState(false);
  const [spawnReady, setSpawnReady] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setLobbyVisible(true));
    const spawnTimer = setTimeout(() => setSpawnReady(true), 8000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(spawnTimer);
    };
  }, []);

  // Refs for animation-only settings — changing these should NOT restart the spawn loop
  const lobbyModeRef = useRef(lobbyMode);
  lobbyModeRef.current = lobbyMode;
  const maxCatsRef = useRef(maxCats);
  maxCatsRef.current = maxCats;
  const moveSpeedRef = useRef(moveSpeed);
  moveSpeedRef.current = moveSpeed;

  // Generation-relevant settings — only these should restart the spawn loop
  const genSettings = useMemo(
    () => ({
      accessoryMax: settings.accessoryRange.max,
      scarMax: settings.scarRange.max,
      tortieMax: settings.tortieRange.max,
      exactLayerCounts: settings.exactLayerCounts ?? true,
      extendedModes: settings.extendedModes,
      includeBaseColours: settings.includeBaseColours,
    }),
    [
      settings.accessoryRange.max,
      settings.scarRange.max,
      settings.tortieRange.max,
      settings.exactLayerCounts,
      settings.extendedModes,
      settings.includeBaseColours,
    ],
  );

  const afterlifeLabel =
    AFTERLIFE_OPTIONS.find((o) => o.value === settings.afterlifeMode)?.label ??
    "Off";
  const rangeStr = (r: LayerRange) => `${r.min}–${r.max}`;

  // Resolve palette data
  const selectedPalettes = useMemo(
    () =>
      ADDITIONAL_PALETTES.filter((p) => settings.extendedModes.includes(p.id)),
    [settings.extendedModes],
  );

  // Cycle palettes
  useEffect(() => {
    if (selectedPalettes.length <= 1) return;
    const timer = setInterval(
      () => setPaletteIdx((i) => (i + 1) % selectedPalettes.length),
      4000,
    );
    return () => clearInterval(timer);
  }, [selectedPalettes.length]);

  // Spawn flying cats — waits for spawnReady (8s delay), then restarts only when
  // generator or generation-relevant settings change.
  useEffect(() => {
    if (!spawnReady || !generator?.generateRandomCat) return;
    let cancelled = false;

    const spawn = async () => {
      if (cancelled) return;
      const gs = genSettings;
      // biome-ignore lint/style/noNonNullAssertion: generator is guaranteed available here
      const firstResult = await generator.generateRandomCat!({
        accessoryCount: gs.accessoryMax,
        scarCount: gs.scarMax,
        tortieCount: gs.tortieMax,
        exactLayerCounts: gs.exactLayerCounts,
        experimentalColourMode:
          gs.extendedModes.length > 0 ? gs.extendedModes : undefined,
        includeBaseColours: gs.includeBaseColours,
      }).catch(() => null);
      if (cancelled || !firstResult) return;

      const fixedSprite = firstResult.params.spriteNumber ?? 8;
      const frames: string[] = [];

      if (firstResult.canvas instanceof HTMLCanvasElement) {
        frames.push(firstResult.canvas.toDataURL("image/png"));
      }

      // Generate 5 more frames — same sprite, no reverse, different params each time
      for (let i = 0; i < 5; i++) {
        if (cancelled) return;
        try {
          const r = await generator.generateRandomCat?.({
            accessoryCount: gs.accessoryMax,
            scarCount: gs.scarMax,
            tortieCount: gs.tortieMax,
            exactLayerCounts: gs.exactLayerCounts,
            experimentalColourMode:
              gs.extendedModes.length > 0 ? gs.extendedModes : undefined,
            includeBaseColours: gs.includeBaseColours,
          });
          if (r && r.canvas instanceof HTMLCanvasElement) {
            const overrideParams = {
              ...r.params,
              spriteNumber: fixedSprite,
              reverse: false,
            };
            const rendered = await generator.generateCat(overrideParams);
            if (rendered.canvas instanceof HTMLCanvasElement) {
              frames.push(rendered.canvas.toDataURL("image/png"));
            }
          }
        } catch {
          /* skip */
        }
      }
      if (cancelled || frames.length === 0) return;

      // Read animation settings from refs — no effect restart needed
      const curMode = lobbyModeRef.current;
      const curMaxCats = maxCatsRef.current;
      const curMoveSpeed = moveSpeedRef.current;

      setFlyingCats((prev) => {
        const alive = prev.filter((c) => Date.now() - c.startTime < c.duration);
        if (alive.length >= curMaxCats) return alive;
        const baseDuration =
          curMode === "dvd"
            ? 999999
            : (10000 + Math.random() * 20000) / curMoveSpeed;
        return [
          ...alive,
          {
            id: catIdRef.current++,
            frames,
            x: Math.random() * 95,
            startTime: Date.now(),
            duration: baseDuration,
            peakY: 250 + Math.random() * 500,
            rotation: -60 + Math.random() * 120,
            size: 1 + Math.random(),
            mode: curMode,
          },
        ];
      });
    };

    spawn();
    const timer = setInterval(spawn, 500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [spawnReady, generator, genSettings]);

  // Cleanup expired cats
  useEffect(() => {
    const timer = setInterval(() => {
      setFlyingCats((prev) =>
        prev.filter((c) => Date.now() - c.startTime < c.duration + 500),
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Clear all cats when reset button is pressed
  const clearSeqRef = useRef(settings.lobbyClearSeq ?? 0);
  useEffect(() => {
    const seq = settings.lobbyClearSeq ?? 0;
    if (seq > clearSeqRef.current) {
      clearSeqRef.current = seq;
      setFlyingCats([]);
    }
  }, [settings.lobbyClearSeq]);

  const chips = [
    // Top row: toggles/modes
    { label: "Afterlife", value: afterlifeLabel },
    { label: "Exact Count", value: settings.exactLayerCounts ? "Yes" : "No" },
    {
      label: "Base Colours",
      value: settings.includeBaseColours ? "On" : "Off",
    },
    // Bottom row: range values
    { label: "Accessories", value: rangeStr(settings.accessoryRange) },
    { label: "Scars", value: rangeStr(settings.scarRange) },
    { label: "Torties", value: rangeStr(settings.tortieRange) },
  ];

  const settingsCode = useMemo(
    () =>
      encodePortableSettings({
        accessoryRange: settings.accessoryRange,
        scarRange: settings.scarRange,
        tortieRange: settings.tortieRange,
        exactLayerCounts: settings.exactLayerCounts ?? true,
        afterlifeMode: settings.afterlifeMode as AfterlifeOption,
        includeBaseColours: settings.includeBaseColours,
        extendedModes: settings.extendedModes as ExtendedMode[],
      }),
    [settings],
  );

  const currentPalette = selectedPalettes[paletteIdx];

  return (
    <div
      className="relative"
      style={{
        width: "1920px",
        height: "1080px",
        opacity: lobbyVisible ? 1 : 0,
        transition: "opacity 5s ease-in",
      }}
    >
      {/* Settings display — stays in the left 2/3 */}
      <div
        className="absolute"
        style={{
          left: "40px",
          top: "40px",
          width: "900px",
          background: "rgba(0,0,0,0.85)",
          borderRadius: "20px",
          border: "1px solid rgba(245, 158, 11, 0.2)",
          boxShadow: "0 0 40px rgba(245, 158, 11, 0.05)",
          padding: "28px 32px",
        }}
      >
        <div className="mb-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
          <span className="text-xs font-bold uppercase tracking-[0.4em] text-amber-500/60">
            Spin Settings
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {chips.map((chip) => (
            <div
              key={chip.label}
              className="flex flex-col items-center rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2.5"
            >
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                {chip.label}
              </span>
              <span className="mt-1 text-base font-bold capitalize text-white">
                {chip.value}
              </span>
            </div>
          ))}
        </div>

        {/* Settings Code */}
        <div className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            Code
          </span>
          <code className="font-mono text-sm font-semibold tracking-wide text-amber-500/80">
            {settingsCode}
          </code>
        </div>

        {/* Palettes — cycle (carousel) or all (expanded) */}
        {selectedPalettes.length > 0 && (
          <div className="mt-5 border-t border-zinc-800 pt-4">
            {paletteDisplayMode === "all" ? (
              // Under 10: show fixed list. 10+: infinite scrolling marquee.
              selectedPalettes.length < 10 ? (
                <div className="space-y-2.5">
                  {selectedPalettes.map((palette) => (
                    <div key={palette.id}>
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-amber-500/70">
                        {palette.label}
                      </span>
                      <div className="flex flex-wrap gap-0.5">
                        {Object.entries(palette.colors)
                          .slice(0, 24)
                          .map(([name, def]) => (
                            <div
                              key={name}
                              style={swatchStyle(def, 22)}
                              title={name.replace(/_/g, " ")}
                            />
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <PaletteMarquee palettes={selectedPalettes} />
              )
            ) : (
              // Cycle through palettes one at a time (carousel)
              <>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-500/70">
                    {currentPalette?.label ?? "Palettes"}
                  </span>
                  <div className="flex gap-1">
                    {selectedPalettes.map((p, i) => (
                      <div
                        key={p.id}
                        className="rounded-full transition-all"
                        style={{
                          width: i === paletteIdx ? "16px" : "6px",
                          height: "6px",
                          background: i === paletteIdx ? "#f59e0b" : "#3f3f46",
                        }}
                      />
                    ))}
                  </div>
                </div>
                {currentPalette && (
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(currentPalette.colors)
                      .slice(0, 32)
                      .map(([name, def]) => (
                        <div
                          key={name}
                          style={swatchStyle(def, 28)}
                          title={name.replace(/_/g, " ")}
                        />
                      ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Flying cats — full screen, above everything */}
      <div className="absolute inset-0 z-50 overflow-hidden">
        {flyingCats.map((cat) => (
          <FlyingCatSprite
            key={cat.id}
            cat={cat}
            swapSpeed={swapSpeed}
            moveSpeed={moveSpeed}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FlyingCatSprite — animates a single lobby cat
// ---------------------------------------------------------------------------

function FlyingCatSprite({
  cat,
  swapSpeed = 1,
  moveSpeed = 1,
}: {
  cat: FlyingCat;
  swapSpeed?: number;
  moveSpeed?: number;
}) {
  const mode = cat.mode;
  const ref = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const frameRef = useRef(0);
  // DVD mode: bounce direction stored in ref
  const dvdRef = useRef({
    vx: (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random()),
    vy: (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random()),
    px: cat.x * 12.8,
    py: Math.random() * 900,
  });

  // Store speed props in refs so the animation loop always reads the latest values
  const swapSpeedRef = useRef(swapSpeed);
  useEffect(() => {
    swapSpeedRef.current = swapSpeed;
  }, [swapSpeed]);
  const moveSpeedRef = useRef(moveSpeed);
  useEffect(() => {
    moveSpeedRef.current = moveSpeed;
  }, [moveSpeed]);

  useEffect(() => {
    let raf: number;
    let lastSwap = 0;
    const animate = () => {
      if (!ref.current) return;
      const now = Date.now();
      const elapsed = now - cat.startTime;
      const t = Math.min(elapsed / cat.duration, 1);

      // Frame cycling — speed controlled by swapSpeed
      const swapInterval = Math.max(300, 3000 / swapSpeedRef.current);
      if (cat.frames.length > 1 && now - lastSwap > swapInterval) {
        frameRef.current = (frameRef.current + 1) % cat.frames.length;
        if (imgRef.current) imgRef.current.src = cat.frames[frameRef.current];
        lastSwap = now;
      }

      if (mode === "matrix") {
        // Fall from top to bottom
        if (t >= 1) return;
        const yPos = t * 1200 - 120;
        const opacity = t < 0.05 ? t / 0.05 : t > 0.9 ? (1 - t) / 0.1 : 1;
        ref.current.style.left = `${cat.x}%`;
        ref.current.style.top = `${yPos}px`;
        ref.current.style.bottom = "auto";
        ref.current.style.transform = `scale(${0.9 * cat.size})`;
        ref.current.style.opacity = String(Math.max(0, Math.min(1, opacity)));
      } else if (mode === "dvd") {
        // Bounce around — never expires. Bounds account for sprite size so
        // the image bounces off the corners, not the top-left origin.
        const spriteW = Math.round(120 * cat.size);
        const spriteH = Math.round(120 * cat.size);
        const d = dvdRef.current;
        d.px += d.vx * 2 * moveSpeedRef.current;
        d.py += d.vy * 2 * moveSpeedRef.current;
        if (d.px <= 0 || d.px >= 1920 - spriteW) d.vx *= -1;
        if (d.py <= 0 || d.py >= 1080 - spriteH) d.vy *= -1;
        d.px = Math.max(0, Math.min(1920 - spriteW, d.px));
        d.py = Math.max(0, Math.min(1080 - spriteH, d.py));
        ref.current.style.left = `${d.px}px`;
        ref.current.style.top = `${d.py}px`;
        ref.current.style.bottom = "auto";
        ref.current.style.transform = `scale(${0.85 * cat.size})`;
        ref.current.style.opacity = "1";
      } else {
        // Fruit ninja — arc from bottom
        if (t >= 1) return;
        const y = -4 * cat.peakY * t * (t - 1);
        const xDrift = t * 30 * (cat.rotation > 0 ? 1 : -1);
        const opacity = t < 0.1 ? t / 0.1 : t > 0.9 ? (1 - t) / 0.1 : 1;
        ref.current.style.left = `${cat.x + xDrift}%`;
        ref.current.style.transform = `translateY(${-y}px) rotate(${cat.rotation * t}deg) scale(${0.7 + t * 0.5})`;
        ref.current.style.opacity = String(Math.max(0, Math.min(1, opacity)));
      }

      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [cat, mode]);

  return (
    <div ref={ref} className="absolute bottom-0" style={{ opacity: 0 }}>
      {/* biome-ignore lint/performance/noImgElement: renders base64/dynamic src */}
      <img
        ref={imgRef}
        src={cat.frames[0]}
        alt=""
        style={{
          width: `${Math.round(120 * cat.size)}px`,
          height: `${Math.round(120 * cat.size)}px`,
          imageRendering: "pixelated",
          filter: [
            "drop-shadow(2px 0 0 white)",
            "drop-shadow(-2px 0 0 white)",
            "drop-shadow(0 2px 0 white)",
            "drop-shadow(0 -2px 0 white)",
          ].join(" "),
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// PaletteMarquee — infinite vertical scroll of palette swatches
// ---------------------------------------------------------------------------
// Renders the palette list twice in a column. A CSS animation translates
// upward by exactly one copy's height, then jumps back — creating a seamless
// infinite scroll with no scrollbar.

const SCROLL_SPEED_MS = 1500; // ms per palette row

function PaletteMarquee({ palettes }: { palettes: PaletteCategory[] }) {
  const count = palettes.length;
  // Total duration = scroll through one full copy
  const durationS = (count * SCROLL_SPEED_MS) / 1000;

  const renderList = (keyPrefix: string) =>
    palettes.map((palette) => (
      <div key={`${keyPrefix}-${palette.id}`} className="pb-2">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-amber-500/70">
          {palette.label}
        </span>
        <div className="flex flex-wrap gap-0.5">
          {Object.entries(palette.colors)
            .slice(0, 24)
            .map(([name, def]) => (
              <div
                key={name}
                style={swatchStyle(def, 22)}
                title={name.replace(/_/g, " ")}
              />
            ))}
        </div>
      </div>
    ));

  return (
    <div
      style={{
        maxHeight: "500px",
        overflow: "hidden",
        maskImage:
          "linear-gradient(to bottom, transparent 0%, black 5%, black 95%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0%, black 5%, black 95%, transparent 100%)",
      }}
    >
      <style>{`
        @keyframes palette-marquee {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
      `}</style>
      <div
        style={{
          animation: `palette-marquee ${durationS}s linear infinite`,
        }}
      >
        {/* Two copies — when first scrolls out, second is in view, then it loops */}
        {renderList("a")}
        {renderList("b")}
      </div>
    </div>
  );
}
