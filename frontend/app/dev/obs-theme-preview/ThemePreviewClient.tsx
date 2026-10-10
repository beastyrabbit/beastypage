"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OBSClassicWheelHandle } from "@/components/stream-control/OBSClassicWheel";
import {
  DISPLAY_SIZE,
  LAYER_GROUPS,
  type LayerGroup,
  type LayerRowState,
  PARAM_SEQUENCE,
  type ParamRow,
} from "@/components/stream-control/obs/spinSupport";
import { OVERLAY_THEMES } from "@/components/stream-control/obs/themes/registry";
import type { SpinSceneProps } from "@/components/stream-control/obs/themes/SpinSceneProps";
import { BOARD_SLOTS } from "@/components/stream-control/obs/themes/sceneShared";
import {
  isOverlayThemeId,
  OVERLAY_THEME_IDS,
  OVERLAY_THEME_META,
  themeTokensToCssVars,
} from "@/components/stream-control/obs/themes/themeMeta";
import { useSpriteAnchors } from "@/components/stream-control/obs/themes/useSpriteAnchors";
import {
  CLASSIC_WHEEL_PRIZES,
  type StreamWheelSpin,
} from "@/lib/wheel/classicWheel";
import type { ParamTimingKey } from "@/utils/spinTiming";

type PreviewState = "idle" | "rolling" | "done" | "play";

/** Play mode: one board slot lands every PLAY_STEP_MS; step 11 = all landed, 12 = done. */
const PLAY_STEP_MS = 1800;

/** Display values per board slot — the "Silver tabby" used in the mockups. */
const DEMO_VALUES: Record<string, { value: string; raw: unknown }> = {
  colour: { value: "Silver", raw: "SILVER" },
  pelt: { value: "Tabby", raw: "Tabby" },
  eyeColour: { value: "Green", raw: "GREEN" },
  eyeColour2: { value: "None", raw: null },
  tint: { value: "Pink", raw: "pink" },
  skinColour: { value: "Pink", raw: "PINK" },
  whitePatches: { value: "Little", raw: "LITTLE" },
  points: { value: "None", raw: null },
  whitePatchesTint: { value: "None", raw: null },
  vitiligo: { value: "None", raw: null },
  sprite: { value: "Adult Short2", raw: "adult_short2" },
};

const DEMO_LAYERS: Record<string, string[]> = {
  tortie: ["None"],
  accessories: ["Catmint", "Holly"],
  scars: ["Left Ear"],
};

const DEMO_DURATIONS: Partial<Record<ParamTimingKey, number>> = {
  colour: 4100,
  pelt: 6300,
  eyeColour: 5200,
  eyeColour2: 1900,
  tint: 3000,
  skinColour: 2800,
  whitePatches: 7100,
  points: 2200,
} as Partial<Record<ParamTimingKey, number>>;

/** Rolling state: everything up to this board index is revealed, this one is active. */
const ROLLING_INDEX = 8; // whitePatchesTint

function buildParamRows(state: PreviewState, step = 0): ParamRow[] {
  return PARAM_SEQUENCE.map((def) => {
    const demo = DEMO_VALUES[def.id] ?? { value: "???", raw: null };
    const boardIndex = BOARD_SLOTS.findIndex((s) => s.id === def.id);
    let status: ParamRow["status"] = "pending";
    if (state === "done") status = "revealed";
    else if (state === "rolling" && boardIndex >= 0) {
      if (boardIndex < ROLLING_INDEX) status = "revealed";
      else if (boardIndex === ROLLING_INDEX) status = "active";
    } else if (state === "play") {
      if (boardIndex < 0) status = step >= 11 ? "revealed" : "pending";
      else if (boardIndex < step) status = "revealed";
      else if (boardIndex === step) status = "active";
    }
    return {
      id: def.id,
      label: def.label,
      value: status === "revealed" ? demo.value : "???",
      raw: status === "revealed" ? demo.raw : undefined,
      status,
    };
  });
}

function buildLayerRows(
  state: PreviewState,
  step = 0,
): Record<LayerGroup, LayerRowState[]> {
  const hidden = state === "idle" || (state === "play" && step < 11);
  const out: Record<LayerGroup, LayerRowState[]> = {};
  for (const def of LAYER_GROUPS) {
    const values = DEMO_LAYERS[def.layerKey] ?? [];
    out[def.layerKey] = values.map((value, i) => ({
      label: `${def.groupLabel} ${i + 1}`,
      value: hidden ? "???" : value,
      status: hidden ? "idle" : "revealed",
    }));
  }
  return out;
}

const DEMO_PRIZE = {
  prizeName: "Golden collar",
  color: "#e3b95a",
} as unknown as StreamWheelSpin;

/** Draws a composite ClanGen cat (tabby + white + eyes + lineart) into the engine canvas. */
function useDemoCat(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  poseName: string,
  theme: string,
  state: PreviewState,
) {
  useEffect(() => {
    let cancelled = false;
    const load = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    (async () => {
      const poseData = (await fetch("/sprite-data/poseData.json").then((r) =>
        r.json(),
      )) as { poseNameToOffset: Record<string, { x: number; y: number }> };
      const off = poseData.poseNameToOffset[poseName] ??
        poseData.poseNameToOffset.adult_short2 ?? { x: 2, y: 4 };
      const [tabby, white, eyes, lineart] = await Promise.all([
        load("/sprites/colours_tabby.png"),
        load("/sprites/patches_white_mid.png"),
        load("/sprites/eyes.png"),
        load("/sprites/lineart.png"),
      ]);
      if (cancelled) return;
      const cell = document.createElement("canvas");
      cell.width = 50;
      cell.height = 50;
      const cctx = cell.getContext("2d");
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!cctx || !canvas || !ctx) return;
      const draw = (img: HTMLImageElement, bx: number, by: number) =>
        cctx.drawImage(
          img,
          bx * 150 + off.x * 50,
          by * 450 + off.y * 50,
          50,
          50,
          0,
          0,
          50,
          50,
        );
      draw(tabby, 2, 0);
      draw(white, 1, 0);
      draw(eyes, 3, 0);
      draw(lineart, 0, 0);
      ctx.clearRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(cell, 0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
    })().catch((err) => console.error("[theme-preview] cat draw failed", err));
    return () => {
      cancelled = true;
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: theme/state remount the scene canvas, so they are redraw triggers.
  }, [canvasRef, poseName, theme, state]);
}

export function ThemePreviewClient() {
  const params = useSearchParams();
  const themeParam = params.get("theme");
  const theme = isOverlayThemeId(themeParam) ? themeParam : "plate";
  const stateParam = params.get("state");
  const state: PreviewState =
    stateParam === "idle" || stateParam === "done" || stateParam === "play"
      ? stateParam
      : "rolling";
  const poseName = params.get("pose") ?? "adult_short2";
  const reverse = params.get("reverse") === "1";
  const wheelParam = params.get("wheel");
  // wheel=run<N> drives a real spin to prize N through the wheel handle.
  const runIndex = wheelParam?.startsWith("run")
    ? Number(wheelParam.slice(3) || "0")
    : null;
  const wheel =
    wheelParam === "1" || wheelParam === "spin" || runIndex !== null;
  const wheelSpinning = wheelParam === "spin" || runIndex !== null;
  const scale = Number(params.get("scale") ?? "0.6");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wheelRef = useRef<OBSClassicWheelHandle | null>(null);
  useEffect(() => {
    if (runIndex === null) return;
    const id = setTimeout(() => {
      const prize = CLASSIC_WHEEL_PRIZES[runIndex] ?? CLASSIC_WHEEL_PRIZES[0];
      void wheelRef.current?.spinTo({ prize, index: runIndex });
    }, 800);
    return () => clearTimeout(id);
  }, [runIndex]);
  const [startedAt] = useState(() => performance.now() - 2000);
  // Play mode: advance one slot per tick until done.
  const [step, setStep] = useState(0);
  const [stepStartedAt, setStepStartedAt] = useState(() => performance.now());
  useEffect(() => {
    if (state !== "play") return;
    setStep(0);
    const id = setInterval(() => {
      setStep((s) => (s >= 12 ? s : s + 1));
      setStepStartedAt(performance.now());
    }, PLAY_STEP_MS);
    return () => clearInterval(id);
  }, [state]);
  const anchors = useSpriteAnchors(poseName, reverse);
  useDemoCat(canvasRef, poseName, theme, state);

  const paramRows = useMemo(() => buildParamRows(state, step), [state, step]);
  const layerRows = useMemo(() => buildLayerRows(state, step), [state, step]);
  const playing = state === "play";
  const playDone = playing && step >= 12;
  const playActive = playing && step < 11 ? BOARD_SLOTS[step].id : null;
  let activeParamId: string | null = null;
  if (playing) activeParamId = playActive;
  else if (state === "rolling") activeParamId = BOARD_SLOTS[ROLLING_INDEX].id;
  const isDone = state === "done" || playDone;
  const playDurations = Object.fromEntries(
    BOARD_SLOTS.slice(0, Math.min(step, 11)).map((d, i) => [
      d.timingKey,
      1500 + ((i * 1370) % 4200),
    ]),
  ) as Partial<Record<ParamTimingKey, number>>;
  let staticDurations: Partial<Record<ParamTimingKey, number>> = {};
  if (state === "done") {
    staticDurations = {
      ...DEMO_DURATIONS,
      whitePatchesTint: 1500,
      vitiligo: 2400,
      sprite: 3900,
    } as Partial<Record<ParamTimingKey, number>>;
  } else if (state === "rolling") {
    staticDurations = DEMO_DURATIONS;
  }
  let staticTotal = 0;
  if (state === "done") staticTotal = 40400;
  else if (state === "rolling") staticTotal = 32600;
  let activeStartedAt: number | null = null;
  if (playing) activeStartedAt = playActive ? stepStartedAt : null;
  else if (state === "rolling") activeStartedAt = startedAt;

  const sceneProps: SpinSceneProps = {
    canvasRef,
    wheelRef,
    spinVisible: true,
    initializing: false,
    wheelReward: wheel
      ? { status: wheelSpinning ? "spinning" : "settled", prize: DEMO_PRIZE }
      : { status: "hidden", prize: null },
    wheelBannerVisible: wheel && !wheelSpinning,
    paramRows,
    layerRows,
    flashParamId: null,
    flashLayerKey: null,
    rollerLabel: state === "rolling" ? "White Patch Tint" : null,
    rollerActiveValue: state === "rolling" ? "Gold" : null,
    spinDone: isDone,
    viewUrl: isDone ? "https://beastyrabbit.com/view/demo427" : null,
    spread: false,
    theme,
    spinSeq: 427,
    activeParamId,
    activeParamStartedAt: activeStartedAt,
    paramDurations: playing ? playDurations : staticDurations,
    totalDurationMs: playing
      ? Object.values(playDurations).reduce<number>((a, b) => a + (b ?? 0), 0)
      : staticTotal,
    poseName,
    reverse,
    anchors,
    mapper: null,
    afterlife: "off",
  };

  const Scene = OVERLAY_THEMES[theme].SpinScene;
  const tokens = OVERLAY_THEME_META[theme].tokens;

  return (
    <div className="min-h-screen bg-[#141820] p-4 text-sm text-white">
      <div className="mb-3 flex flex-wrap items-center gap-3 font-mono text-xs">
        <span className="opacity-60">theme:</span>
        {OVERLAY_THEME_IDS.map((id) => (
          <a
            key={id}
            href={`?theme=${id}&state=${state}&pose=${poseName}${wheel ? "&wheel=1" : ""}&scale=${scale}`}
            className={id === theme ? "underline" : "opacity-60"}
          >
            {id}
          </a>
        ))}
        <span className="ml-4 opacity-60">state:</span>
        {(["idle", "rolling", "done", "play"] as const).map((s) => (
          <a
            key={s}
            href={`?theme=${theme}&state=${s}&pose=${poseName}${wheel ? "&wheel=1" : ""}&scale=${scale}`}
            className={s === state ? "underline" : "opacity-60"}
          >
            {s}
          </a>
        ))}
        <a
          href={`?theme=${theme}&state=${state}&pose=${poseName}${wheel ? "" : "&wheel=1"}&scale=${scale}`}
          className="ml-4 opacity-60"
        >
          wheel: {wheel ? "on" : "off"}
        </a>
        <span className="ml-4 opacity-60">pose={poseName}</span>
      </div>
      {/* Faux gameplay backdrop + camera zone so transparency reads honestly */}
      <div
        style={{
          width: `${1920 * scale}px`,
          height: `${1080 * scale}px`,
          overflow: "hidden",
          position: "relative",
          borderRadius: "6px",
          background:
            "radial-gradient(1150px 770px at 30% 70%, #2f4a3a 0%, transparent 60%), radial-gradient(960px 960px at 80% 20%, #3b2f4d 0%, transparent 60%), linear-gradient(180deg,#202633 0%,#141820 100%)",
        }}
      >
        <div
          data-overlay-theme={theme}
          style={{
            ...themeTokensToCssVars(tokens),
            width: "1920px",
            height: "1080px",
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            position: "absolute",
            left: 0,
            top: 0,
          }}
        >
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              width: "640px",
              height: "1080px",
              borderLeft: "2px dashed rgba(255,255,255,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.28)",
              fontFamily: "monospace",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              pointerEvents: "none",
            }}
          >
            camera 640 × 1080
          </div>
          <Scene key={`${theme}-${state}`} {...sceneProps} />
        </div>
      </div>
    </div>
  );
}
