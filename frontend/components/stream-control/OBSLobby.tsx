"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CatGeneratorApi } from "@/components/cat-builder/types";
import {
  getArchetypeTheme,
  withAlpha,
} from "@/components/evolution/archetypes";
import {
  estimateCeremonySeconds,
  formatDuration,
} from "@/lib/evolution/ceremonyEstimate";
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

export type LobbyAnimationMode =
  | "fruit-ninja"
  | "matrix"
  | "dvd"
  | "parade"
  | "orbit"
  | "bubbles";

export interface LobbySettings {
  mode: string;
  accessoryRange: LayerRange;
  scarRange: LayerRange;
  tortieRange: LayerRange;
  afterlifeMode: string;
  includeBaseColours: boolean;
  includeNewSprites?: boolean;
  extendedModes: string[];
  exactLayerCounts?: boolean;
  lobbyMode?: LobbyAnimationMode;
  lobbyCatCount?: number;
  lobbyMoveSpeed?: number;
  lobbySwapSpeed?: number;
  lobbyClearSeq?: number;
  paletteDisplayMode?: "cycle" | "all";
  lobbyCatMinSize?: number;
  lobbyCatMaxSize?: number;
  lobbyAutoClearSeconds?: number;
  /** Which mode's info the settings card shows (follows the control tab). */
  lobbyInfoMode?: "spin" | "evolution" | "batch";
  evolutionInfo?: {
    clans: string[];
    targetLevel: number;
    spinSeconds: number;
    starterMode?: "random" | "history";
  };
  batchInfo?: {
    accessoryCount: number;
    scarCount: number;
    tortieCount: number;
    startCount: number;
    finalCount: number;
    /** Batch palettes — shown instead of the spin palettes in batch mode. */
    extendedModes?: string[];
    includeBaseColours?: boolean;
  };
}

interface FlyingCat {
  id: number;
  frames: string[];
  x: number;
  startTime: number;
  duration: number;
  peakY: number;
  rotation: number;
  size: number; // lobbyCatMinSize..lobbyCatMaxSize (default 1–2)
}

// ---------------------------------------------------------------------------
// OBS Lobby — settings overview + flying cats
// ---------------------------------------------------------------------------

export function OBSLobby({
  settings,
  generator,
  hideSettings = false,
}: {
  settings: LobbySettings;
  generator: CatGeneratorApi | null;
  hideSettings?: boolean;
}) {
  const lobbyMode = settings.lobbyMode ?? "fruit-ninja";
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
  const catMinSize = settings.lobbyCatMinSize ?? 1;
  const catMaxSize = settings.lobbyCatMaxSize ?? 2;
  const lobbyAutoClearSeconds = settings.lobbyAutoClearSeconds ?? 20;
  const catMinSizeRef = useRef(catMinSize);
  catMinSizeRef.current = catMinSize;
  const catMaxSizeRef = useRef(catMaxSize);
  catMaxSizeRef.current = catMaxSize;
  const lobbyAutoClearSecondsRef = useRef(lobbyAutoClearSeconds);
  lobbyAutoClearSecondsRef.current = lobbyAutoClearSeconds;

  // Generation-relevant settings — only these should restart the spawn loop
  const genSettings = useMemo(
    () => ({
      accessoryMax: settings.accessoryRange.max,
      scarMax: settings.scarRange.max,
      tortieMax: settings.tortieRange.max,
      exactLayerCounts: settings.exactLayerCounts ?? true,
      extendedModes: settings.extendedModes,
      includeBaseColours: settings.includeBaseColours,
      includeNewSprites: settings.includeNewSprites === true,
    }),
    [
      settings.accessoryRange.max,
      settings.scarRange.max,
      settings.tortieRange.max,
      settings.exactLayerCounts,
      settings.extendedModes,
      settings.includeBaseColours,
      settings.includeNewSprites,
    ],
  );

  const afterlifeLabel =
    AFTERLIFE_OPTIONS.find((o) => o.value === settings.afterlifeMode)?.label ??
    "Off";
  const rangeStr = (r: LayerRange) => `${r.min}–${r.max}`;

  // The card follows the mode selected on the control page.
  const infoMode = settings.lobbyInfoMode ?? "spin";
  const evolutionInfo = settings.evolutionInfo;
  const batchInfo = settings.batchInfo;

  // Resolve palette data — batch mode shows the batch tab's own palettes.
  const paletteModes =
    infoMode === "batch" && batchInfo?.extendedModes
      ? batchInfo.extendedModes
      : settings.extendedModes;
  const selectedPalettes = useMemo(
    () => ADDITIONAL_PALETTES.filter((p) => paletteModes.includes(p.id)),
    [paletteModes],
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
        includeNewSprites: gs.includeNewSprites,
      }).catch(() => null);
      if (cancelled || !firstResult) return;

      const fixedPose = firstResult.params.poseName;
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
            includeNewSprites: gs.includeNewSprites,
          });
          if (r && r.canvas instanceof HTMLCanvasElement) {
            const overrideParams = {
              ...r.params,
              poseName: fixedPose ?? r.params.poseName,
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
      const curMaxCats = maxCatsRef.current;
      const curMinSize = catMinSizeRef.current;
      const curMaxSize = catMaxSizeRef.current;

      setFlyingCats((prev) => {
        const alive = prev.filter((c) => Date.now() - c.startTime < c.duration);
        if (alive.length >= curMaxCats) return alive;
        const baseDuration = lobbyAutoClearSecondsRef.current * 1000;
        const sizeRange = Math.max(0, curMaxSize - curMinSize);
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
            size: curMinSize + Math.random() * sizeRange,
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

  const cardTitle =
    infoMode === "evolution"
      ? "Evolution Ceremony"
      : infoMode === "batch"
        ? "Adoption Elimination"
        : "Spin Settings";

  let chips: Array<{ label: string; value: string }>;
  if (infoMode === "evolution" && evolutionInfo) {
    chips = [
      { label: "Clans", value: String(evolutionInfo.clans.length) },
      { label: "Target Level", value: String(evolutionInfo.targetLevel) },
      { label: "Spin Time", value: `${evolutionInfo.spinSeconds}s` },
      {
        label: "Evolutions",
        value: String(evolutionInfo.clans.length * evolutionInfo.targetLevel),
      },
      {
        label: "Starter",
        value:
          evolutionInfo.starterMode === "history" ? "Saved cat" : "Mystery egg",
      },
      {
        label: "Est. Length",
        value: formatDuration(
          estimateCeremonySeconds(
            evolutionInfo.clans.length,
            evolutionInfo.targetLevel,
            evolutionInfo.spinSeconds,
          ),
        ),
      },
    ];
  } else if (infoMode === "batch" && batchInfo) {
    chips = [
      { label: "Starting Pool", value: String(batchInfo.startCount) },
      { label: "Finalists", value: String(batchInfo.finalCount) },
      {
        label: "Culls",
        value: String(batchInfo.startCount - batchInfo.finalCount),
      },
      { label: "Accessories", value: String(batchInfo.accessoryCount) },
      { label: "Scars", value: String(batchInfo.scarCount) },
      { label: "Torties", value: String(batchInfo.tortieCount) },
    ];
  } else {
    chips = [
      // Top row: toggles/modes
      { label: "Afterlife", value: afterlifeLabel },
      {
        label: "Exact Count",
        value: settings.exactLayerCounts ? "Yes" : "No",
      },
      {
        label: "Base Colours",
        value: settings.includeBaseColours ? "On" : "Off",
      },
      // Bottom row: range values
      { label: "Accessories", value: rangeStr(settings.accessoryRange) },
      { label: "Scars", value: rangeStr(settings.scarRange) },
      { label: "Torties", value: rangeStr(settings.tortieRange) },
    ];
  }

  const settingsCode = useMemo(
    () =>
      encodePortableSettings({
        accessoryRange: settings.accessoryRange,
        scarRange: settings.scarRange,
        tortieRange: settings.tortieRange,
        exactLayerCounts: settings.exactLayerCounts ?? true,
        afterlifeMode: settings.afterlifeMode as AfterlifeOption,
        includeBaseColours: settings.includeBaseColours,
        includeNewSprites: settings.includeNewSprites === true,
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
      {/* Settings display — stays in the left 2/3 (hidden in BRB mode) */}
      {!hideSettings && (
        <div
          className="absolute"
          style={{
            left: "40px",
            top: "40px",
            width: "900px",
            // Same card treatment as the spin board and reveal scenes.
            background:
              "linear-gradient(180deg, rgba(10,10,10,0.92) 0%, rgba(15,12,5,0.90) 100%)",
            borderRadius: "20px",
            border: "2px solid rgba(245, 158, 11, 0.2)",
            boxShadow:
              "0 0 60px rgba(245, 158, 11, 0.06), inset 0 1px 0 rgba(245, 158, 11, 0.08)",
            padding: "28px 32px",
          }}
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
            <span className="text-xs font-bold uppercase tracking-[0.4em] text-amber-500/60">
              {cardTitle}
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

          {/* Settings Code — spin mode only */}
          {infoMode === "spin" && (
            <div className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-2">
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                Code
              </span>
              <code className="font-mono text-sm font-semibold tracking-wide text-amber-500/80">
                {settingsCode}
              </code>
            </div>
          )}

          {/* Evolution mode lists the competing clans instead of palettes */}
          {infoMode === "evolution" && evolutionInfo && (
            <div className="mt-5 border-t border-zinc-800 pt-4">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-amber-500/70">
                Clans
              </span>
              <div className="flex flex-wrap gap-2">
                {evolutionInfo.clans.map((clan) => {
                  const theme = getArchetypeTheme(clan);
                  return (
                    <span
                      key={clan}
                      className="rounded-lg border px-2.5 py-1 text-sm font-semibold capitalize text-white"
                      style={{
                        borderColor: withAlpha(theme.from, 0.45),
                        background: withAlpha(theme.from, 0.12),
                      }}
                    >
                      {theme.glyph} {clan}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Palettes — cycle (carousel) or all (expanded) */}
          {infoMode !== "evolution" && selectedPalettes.length > 0 && (
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
                            background:
                              i === paletteIdx ? "#f59e0b" : "#3f3f46",
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
      )}

      {/* Flying cats — full screen, above everything */}
      <div className="absolute inset-0 z-50 overflow-hidden">
        {flyingCats.map((cat) => (
          <FlyingCatSprite
            key={cat.id}
            cat={cat}
            mode={lobbyMode}
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
// Every mode resolves to a normalized pose (px coordinates on the 1920×1080
// stage). The active mode is a live prop: when the streamer switches the
// animation style, existing cats glide from their current pose into the new
// pattern instead of fading out and respawning.

type CatPose = {
  x: number;
  y: number;
  scale: number;
  rotate: number;
  flip: boolean;
  opacity: number;
};

/** How long a cat takes to glide into a newly selected animation. */
const MODE_BLEND_MS = 1100;

function lerp(a: number, b: number, k: number) {
  return a + (b - a) * k;
}

function easeInOut(k: number) {
  return k < 0.5 ? 2 * k * k : 1 - (1 - k) * (1 - k) * 2;
}

function FlyingCatSprite({
  cat,
  mode,
  swapSpeed = 1,
  moveSpeed = 1,
}: {
  cat: FlyingCat;
  /** Live animation mode — switching it moves the cat, no respawn. */
  mode: LobbyAnimationMode;
  swapSpeed?: number;
  moveSpeed?: number;
}) {
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

  // Store live props in refs so the animation loop always reads the latest
  // values without restarting.
  const modeRef = useRef(mode);
  modeRef.current = mode;
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
    const appliedMode = { current: modeRef.current };
    const lastPose = { current: null as CatPose | null };
    const blendFrom = { current: null as CatPose | null };
    let blendStart = 0;
    const spriteW = Math.round(120 * cat.size);

    const computePose = (
      curMode: LobbyAnimationMode,
      t: number,
    ): CatPose | null => {
      const moveK = moveSpeedRef.current;
      if (curMode === "matrix") {
        // Fall from top to bottom
        const yPos = t * 1200 - 120;
        const opacity = t < 0.05 ? t / 0.05 : t > 0.9 ? (1 - t) / 0.1 : 1;
        return {
          x: (cat.x / 100) * 1920,
          y: yPos,
          scale: 0.9 * cat.size,
          rotate: 0,
          flip: false,
          opacity,
        };
      }
      if (curMode === "dvd") {
        // Bounce around — position advances incrementally so the cat keeps
        // its course across mode switches.
        const d = dvdRef.current;
        d.px += d.vx * 2 * moveK;
        d.py += d.vy * 2 * moveK;
        if (d.px <= 0 || d.px >= 1920 - spriteW) d.vx *= -1;
        if (d.py <= 0 || d.py >= 1080 - spriteW) d.vy *= -1;
        d.px = Math.max(0, Math.min(1920 - spriteW, d.px));
        d.py = Math.max(0, Math.min(1080 - spriteW, d.py));
        const fadeStart = 1 - 2000 / cat.duration;
        const opacity = t > fadeStart ? (1 - t) / (1 - fadeStart) : 1;
        return {
          x: d.px,
          y: d.py,
          scale: 0.85 * cat.size,
          rotate: 0,
          flip: false,
          opacity,
        };
      }
      if (curMode === "parade") {
        // March across the screen — every cat in its own lane, with its own
        // pace and starting offset, so the line stays spread out.
        const dir = cat.rotation > 0 ? 1 : -1;
        const pace = 0.8 + (Math.abs(cat.rotation) / 120) * 0.4;
        const phase = cat.x / 95;
        const progress = (phase + t * moveK * pace) % 1;
        const x =
          dir > 0
            ? progress * (1920 + spriteW) - spriteW
            : 1920 - progress * (1920 + spriteW);
        const lane = ((cat.peakY - 250) / 500) * 110;
        const bob = Math.sin(progress * Math.PI * 14) * 7;
        const opacity = t < 0.05 ? t / 0.05 : t > 0.92 ? (1 - t) / 0.08 : 1;
        return {
          x,
          y: 1080 - spriteW - 24 - lane + bob,
          scale: 0.9 * cat.size,
          rotate: 0,
          flip: dir < 0,
          opacity,
        };
      }
      if (curMode === "orbit") {
        // Circle around the centre of the screen
        const startAngle = (cat.x / 95) * Math.PI * 2;
        const direction = cat.rotation > 0 ? 1 : -1;
        const angle = startAngle + t * Math.PI * 2 * 1.25 * moveK * direction;
        const radiusX = 520 + cat.peakY * 0.6;
        const radiusY = 280 + cat.peakY * 0.35;
        const opacity = t < 0.08 ? t / 0.08 : t > 0.92 ? (1 - t) / 0.08 : 1;
        return {
          x: 960 + Math.cos(angle) * radiusX - spriteW / 2,
          y: 540 + Math.sin(angle) * radiusY - spriteW / 2,
          scale: 0.85 * cat.size,
          rotate: 0,
          flip: false,
          opacity,
        };
      }
      if (curMode === "bubbles") {
        // Drift up from the bottom with a gentle sway
        const tm = Math.min(t * moveK, 1);
        const yPos = 1080 - tm * (1080 + 280);
        const sway = Math.sin(tm * Math.PI * 5 + cat.id) * 4;
        const pulse = 1 + Math.sin(tm * Math.PI * 8) * 0.04;
        const opacity = tm < 0.08 ? tm / 0.08 : tm > 0.88 ? (1 - tm) / 0.12 : 1;
        return {
          x: ((cat.x + sway) / 100) * 1920,
          y: yPos,
          scale: 0.85 * cat.size * pulse,
          rotate: 0,
          flip: false,
          opacity,
        };
      }
      // Fruit ninja — arc from the bottom
      const arcY = -4 * cat.peakY * t * (t - 1);
      const xDrift = t * 30 * (cat.rotation > 0 ? 1 : -1);
      const opacity = t < 0.1 ? t / 0.1 : t > 0.9 ? (1 - t) / 0.1 : 1;
      return {
        x: ((cat.x + xDrift) / 100) * 1920,
        y: 1080 - spriteW - arcY,
        scale: 0.7 + t * 0.5,
        rotate: cat.rotation * t,
        flip: false,
        opacity,
      };
    };

    const animate = () => {
      if (!ref.current) return;
      const now = Date.now();
      const t = Math.min((now - cat.startTime) / cat.duration, 1);

      // Frame cycling — speed controlled by swapSpeed
      const swapInterval = Math.max(300, 3000 / swapSpeedRef.current);
      if (cat.frames.length > 1 && now - lastSwap > swapInterval) {
        frameRef.current = (frameRef.current + 1) % cat.frames.length;
        if (imgRef.current) imgRef.current.src = cat.frames[frameRef.current];
        lastSwap = now;
      }

      if (t >= 1) {
        ref.current.style.opacity = "0";
        return;
      }

      // A mode switch glides the cat from where it is into the new pattern.
      const curMode = modeRef.current;
      if (curMode !== appliedMode.current) {
        appliedMode.current = curMode;
        blendFrom.current = lastPose.current;
        blendStart = now;
      }

      let pose = computePose(curMode, t);
      if (!pose) return;
      if (blendFrom.current) {
        const k = (now - blendStart) / MODE_BLEND_MS;
        if (k >= 1) {
          blendFrom.current = null;
        } else {
          const eased = easeInOut(Math.max(0, k));
          const from = blendFrom.current;
          pose = {
            x: lerp(from.x, pose.x, eased),
            y: lerp(from.y, pose.y, eased),
            scale: lerp(from.scale, pose.scale, eased),
            rotate: lerp(from.rotate, pose.rotate, eased),
            flip: pose.flip,
            opacity: lerp(from.opacity, pose.opacity, eased),
          };
        }
      }
      lastPose.current = pose;

      ref.current.style.left = `${pose.x}px`;
      ref.current.style.top = `${pose.y}px`;
      ref.current.style.bottom = "auto";
      ref.current.style.transform = `rotate(${pose.rotate}deg) scale(${pose.scale}) scaleX(${pose.flip ? -1 : 1})`;
      ref.current.style.opacity = String(
        Math.max(0, Math.min(1, pose.opacity)),
      );

      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [cat]);

  return (
    <div ref={ref} className="absolute" style={{ opacity: 0 }}>
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
