"use client";

import { QRCodeSVG } from "qrcode.react";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { LAYER_GROUPS } from "../../spinSupport";
import { CatCanvas } from "../CatCanvas";
import { formatTrackTime, truncateValue } from "../format";
import type { SpinSceneProps } from "../SpinSceneProps";
import {
  type BoardSlot,
  type LayerSummaryGroup,
  LoadingBadge,
  SceneFade,
  useBoardRows,
  useLayerSummary,
  WheelLayer,
} from "../sceneShared";

// ── Palette (mockup I) ───────────────────────────────────────────────────
const CARD = "#f1ece0";
const INK = "#1f1c18";
const PEN = "#2f6fde";
const TAPE = "rgba(232, 215, 154, 0.85)";
const SHELL = "#2b2b2e";
const PENCIL = "#6e6a63";
const REC = "#d9583b";
const TYPE = "var(--obs-font-mono)";

// ── Geometry (stage px; camera zone x ≥ 1280 stays empty) ───────────────
const COVER_LEFT = 50;
const COVER_TOP = 50;
const COVER = 691;
const COVER_CAT = 540;

const CARD_LEFT = 787;
const CARD_TOP = 50;
const CARD_W = 472;
const CARD_H = 979;
const CARD_PAD = { top: 21, right: 23, bottom: 21, left: 31 };
const TRACK_H = 38;
const QR_SIZE = 140;

const SEASON = "leaf-fall '26";
const TITLE_MAX = 30;
/** "Label — Value" budget for one 18px Courier line in the card. */
const TRACK_TEXT_MAX = 30;

const KEYFRAMES = `
@media (prefers-reduced-motion: reduce) {
  [data-obs-scene="mixtape"] * { animation: none !important; }
}

@keyframes obs-mixtape-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
@keyframes obs-mixtape-spin { to { transform: rotate(360deg); } }
@keyframes obs-mixtape-fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
`;

/** Live ms since `startedAt` (performance.now() clock), ticking every 250ms. */
function useElapsed(startedAt: number | null): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (startedAt === null) return;
    const tick = () => setNow(performance.now());
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [startedAt]);
  if (startedAt === null || now === null) return null;
  return Math.max(0, now - startedAt);
}

function coverTitle(slots: BoardSlot[], spinSeq: number | null): string {
  const pick = (id: string) => {
    const slot = slots.find((s) => s.def.id === id);
    return slot?.status === "revealed" && !slot.isNone
      ? (slot.row?.value ?? null)
      : null;
  };
  const name = [pick("colour"), pick("pelt")].filter(Boolean).join(" ");
  return `${truncateValue(name || "Untitled", TITLE_MAX)} · spin ${spinSeq ?? "—"}`;
}

export function MixtapeSpinScene(props: Readonly<SpinSceneProps>) {
  const {
    activeParamId,
    activeParamStartedAt,
    canvasRef,
    initializing,
    layerRows,
    paramDurations,
    paramRows,
    spinSeq,
    spinDone,
    spinVisible,
    totalDurationMs,
    viewUrl,
    wheelBannerVisible,
    wheelRef,
    wheelReward,
  } = props;
  const slots = useBoardRows(paramRows);
  const layers = useLayerSummary(layerRows);
  const rolling = activeParamId !== null;
  const elapsed = useElapsed(rolling ? activeParamStartedAt : null);
  const activeLayerKey =
    LAYER_GROUPS.find((def) => def.id === activeParamId)?.layerKey ?? null;
  const runningTime = formatTrackTime(totalDurationMs);

  return (
    <SceneFade spinVisible={spinVisible} theme="mixtape">
      <style>{KEYFRAMES}</style>

      {/* Cover */}
      <div
        className="absolute"
        style={{
          left: COVER_LEFT,
          top: COVER_TOP,
          width: COVER,
          height: COVER,
          background: CARD,
          transform: "rotate(-1.2deg)",
          boxShadow: "0 19px 46px rgba(0,0,0,0.55)",
          color: INK,
        }}
      >
        <div
          className="absolute"
          style={{
            left: 211,
            top: -13,
            width: 269,
            height: 38,
            background: TAPE,
            transform: "rotate(1.8deg)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          }}
        />
        <div
          className="absolute"
          style={{ left: (COVER - COVER_CAT) / 2, top: 38 }}
        >
          <CatCanvas canvasRef={canvasRef} cssSize={COVER_CAT} />
        </div>
        <div
          className="absolute"
          style={{
            left: 31,
            right: 31,
            bottom: 27,
            fontFamily: TYPE,
            fontWeight: 700,
            fontSize: 27,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            lineHeight: 1.3,
            borderTop: `2px solid ${INK}`,
            paddingTop: 10,
          }}
        >
          <div
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {coverTitle(slots, spinSeq)}
          </div>
          <small
            style={{
              display: "block",
              fontWeight: 400,
              fontSize: 17,
              color: PEN,
              letterSpacing: "0.1em",
              textTransform: "none",
            }}
          >
            recorded live · {SEASON} · side a
          </small>
        </div>
      </div>

      {/* J-card inside flap */}
      <div
        className="absolute"
        style={{
          left: CARD_LEFT,
          top: CARD_TOP,
          width: CARD_W,
          height: CARD_H,
          boxSizing: "border-box",
          padding: `${CARD_PAD.top}px ${CARD_PAD.right}px ${CARD_PAD.bottom}px ${CARD_PAD.left}px`,
          background: CARD,
          borderLeft: "2px dashed rgba(31,28,24,0.4)",
          boxShadow: "0 19px 46px rgba(0,0,0,0.55)",
          fontFamily: TYPE,
          color: INK,
        }}
      >
        <SideHeader
          label="Side A"
          right={
            <span
              style={{
                color: REC,
                fontSize: 16,
                letterSpacing: "0.14em",
                opacity: rolling ? 1 : 0.25,
              }}
            >
              <span
                style={{
                  animation: rolling
                    ? "obs-mixtape-blink 1s steps(1) infinite"
                    : "none",
                }}
              >
                ●
              </span>{" "}
              REC
            </span>
          }
        />
        {slots.map((slot, index) => (
          <BoardTrack
            key={slot.def.id}
            index={index}
            slot={slot}
            durationMs={paramDurations[slot.def.timingKey]}
            elapsedMs={slot.status === "active" ? elapsed : null}
          />
        ))}
        <div
          className="flex justify-between"
          style={{
            fontSize: 16,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: PENCIL,
            borderTop: `2px solid ${INK}`,
            marginTop: 8,
            paddingTop: 8,
          }}
        >
          <span>Running time</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {runningTime}
          </span>
        </div>

        <div style={{ marginTop: 21 }}>
          <SideHeader label="Side B · layers" />
        </div>
        {layers.map((group, index) => (
          <LayerTrack
            key={group.key}
            index={index}
            group={group}
            rolling={group.active || activeLayerKey === group.key}
            elapsedMs={activeLayerKey === group.key ? elapsed : null}
            spinDone={spinDone}
          />
        ))}
        <div
          style={{ fontSize: 16, color: PEN, lineHeight: 1.45, marginTop: 15 }}
        >
          dubbed for chat · do not rewind
        </div>

        <Cassette
          rolling={rolling}
          runningTime={runningTime}
          spinSeq={spinSeq}
        />

        {spinDone && viewUrl && (
          <div
            className="absolute"
            style={{
              right: CARD_PAD.right,
              bottom: CARD_PAD.bottom,
              width: QR_SIZE,
              animation: "obs-mixtape-fade-in 400ms ease",
            }}
          >
            <div
              style={{
                border: `1.2px solid ${INK}`,
                background: CARD,
                padding: 6,
                lineHeight: 0,
              }}
            >
              <QRCodeSVG
                value={viewUrl}
                size={QR_SIZE - 14}
                bgColor={CARD}
                fgColor={INK}
                level="M"
              />
            </div>
            <small
              style={{
                display: "block",
                fontSize: 11.5,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: PENCIL,
                textAlign: "center",
                marginTop: 5,
              }}
            >
              Dub to phone
            </small>
          </div>
        )}
      </div>

      <WheelLayer
        theme={props.theme}
        wheelRef={wheelRef}
        wheelReward={wheelReward}
        wheelBannerVisible={wheelBannerVisible}
        wheel={{
          left: COVER_LEFT,
          top: COVER_TOP,
          width: COVER,
          height: COVER,
        }}
        banner={{ left: COVER_LEFT, top: COVER_TOP + COVER + 26, width: COVER }}
      />
      <LoadingBadge show={initializing} />
    </SceneFade>
  );
}

function SideHeader({
  label,
  right,
}: Readonly<{ label: string; right?: ReactNode }>) {
  return (
    <div
      className="flex items-baseline justify-between"
      style={{
        fontWeight: 700,
        fontSize: 21,
        letterSpacing: "0.2em",
        borderBottom: `2px solid ${INK}`,
        paddingBottom: 7,
        marginBottom: 8,
      }}
    >
      <span>{label}</span>
      {right}
    </div>
  );
}

function Track({
  number,
  title,
  detail,
  time,
  state,
}: Readonly<{
  number: number;
  title: string;
  detail: string | null;
  time: ReactNode;
  state: "on" | "dim" | "plain";
}>) {
  const on = state === "on";
  const accent: CSSProperties = on ? { color: REC, fontWeight: 700 } : {};
  const text = detail
    ? truncateValue(`${title} — ${detail}`, TRACK_TEXT_MAX)
    : title;
  const [head, ...rest] = text.split(" — ");
  return (
    <div
      className="flex items-baseline"
      style={{
        gap: 8,
        height: TRACK_H,
        paddingTop: 10,
        boxSizing: "border-box",
        fontSize: 18,
        lineHeight: 1,
        opacity: state === "dim" ? 0.4 : 1,
      }}
    >
      <span style={{ width: 27, flexShrink: 0, color: PENCIL, ...accent }}>
        {number}
      </span>
      <span
        style={{
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          minWidth: 0,
          ...accent,
        }}
      >
        {head}
        {rest.length > 0 && (
          <em style={{ fontStyle: "normal", color: PENCIL }}>
            {" "}
            — {rest.join(" — ")}
          </em>
        )}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 14,
          borderBottom: "2px dotted rgba(31,28,24,0.5)",
          transform: "translateY(-5px)",
        }}
      />
      <span
        style={{
          flexShrink: 0,
          color: PENCIL,
          fontVariantNumeric: "tabular-nums",
          ...accent,
        }}
      >
        {time}
        {on && (
          <span
            style={{ animation: "obs-mixtape-blink 0.8s steps(1) infinite" }}
          >
            ▌
          </span>
        )}
      </span>
    </div>
  );
}

function BoardTrack({
  index,
  slot,
  durationMs,
  elapsedMs,
}: Readonly<{
  index: number;
  slot: BoardSlot;
  durationMs: number | undefined;
  elapsedMs: number | null;
}>) {
  const { def, row, status } = slot;
  if (status === "active") {
    return (
      <Track
        number={index + 1}
        title={def.label}
        detail={null}
        time={formatTrackTime(elapsedMs ?? 0)}
        state="on"
      />
    );
  }
  if (status !== "revealed") {
    return (
      <Track
        number={index + 1}
        title={def.label}
        detail={null}
        time="–:––"
        state="dim"
      />
    );
  }
  return (
    <Track
      number={index + 1}
      title={def.label}
      detail={row?.value ?? "None"}
      time={formatTrackTime(durationMs)}
      state="plain"
    />
  );
}

function LayerTrack({
  index,
  group,
  rolling,
  elapsedMs,
  spinDone,
}: Readonly<{
  index: number;
  group: LayerSummaryGroup;
  rolling: boolean;
  elapsedMs: number | null;
  spinDone: boolean;
}>) {
  if (rolling) {
    return (
      <Track
        number={index + 1}
        title={group.label}
        detail={null}
        time={formatTrackTime(elapsedMs ?? 0)}
        state="on"
      />
    );
  }
  const anyRevealed = group.rows.some((r) => r.status === "revealed");
  if (!anyRevealed && !spinDone) {
    return (
      <Track
        number={index + 1}
        title={group.label}
        detail={null}
        time="–:––"
        state="dim"
      />
    );
  }
  const count = group.values.length;
  return (
    <Track
      number={index + 1}
      title={group.label}
      detail={count > 0 ? group.values.join(", ") : "none"}
      time={count > 0 ? `×${count}` : "—"}
      state="plain"
    />
  );
}

function Cassette({
  rolling,
  runningTime,
  spinSeq,
}: Readonly<{
  rolling: boolean;
  runningTime: string;
  spinSeq: number | null;
}>) {
  const spool = (side: "left" | "right", seconds: number): CSSProperties => ({
    position: "absolute",
    top: 33,
    [side]: 52,
    width: 46,
    height: 46,
    boxSizing: "border-box",
    borderRadius: "50%",
    background: "#d9d4c6",
    border: `7px dotted ${SHELL}`,
    animation: `obs-mixtape-spin ${seconds}s linear infinite`,
    animationPlayState: rolling ? "running" : "paused",
  });
  return (
    <div
      className="absolute"
      style={{
        left: CARD_PAD.left,
        bottom: CARD_PAD.bottom,
        width: 238,
        height: 146,
        background: SHELL,
        borderRadius: 10,
        boxShadow:
          "inset 0 2px 0 rgba(255,255,255,0.1), 0 6px 14px rgba(0,0,0,0.3)",
      }}
    >
      <div
        className="absolute"
        style={{
          left: 13,
          right: 13,
          top: 12,
          height: 84,
          background: "#e9e2cf",
          borderRadius: 5,
        }}
      >
        <span
          className="absolute"
          style={{
            left: 8,
            top: 2,
            fontSize: 11,
            letterSpacing: "0.12em",
            color: PEN,
          }}
        >
          spin {spinSeq ?? "—"} · a
        </span>
        <div
          className="absolute"
          style={{
            left: 42,
            right: 42,
            top: 17,
            height: 50,
            background: SHELL,
            borderRadius: 25,
          }}
        />
      </div>
      <div style={spool("left", 2.4)} />
      <div style={spool("right", 1.6)} />
      <small
        className="absolute"
        style={{
          left: 15,
          bottom: 9,
          fontSize: 11.5,
          letterSpacing: "0.2em",
          color: "#9a9a9e",
        }}
      >
        REC · {runningTime}
      </small>
    </div>
  );
}
