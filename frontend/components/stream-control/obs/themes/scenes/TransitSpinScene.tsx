"use client";

import { QRCodeSVG } from "qrcode.react";
import { useMemo } from "react";
import { LAYER_GROUPS, PARAM_SEQUENCE } from "../../spinSupport";
import { CatCanvas } from "../CatCanvas";
import { transitFamily } from "../format";
import type { SpinSceneProps } from "../SpinSceneProps";
import {
  BOARD_SLOTS,
  LoadingBadge,
  SceneFade,
  useBoardRows,
  useLayerSummary,
  WheelLayer,
} from "../sceneShared";
import {
  branchAnchorIndex,
  computeTransitLayout,
  type LabelTone,
  routePassed,
  TRANSIT_FAMILY_COLOR,
  TRANSIT_LIVE,
  type TransitBranchInput,
  type TransitSlotInput,
  type TransitSlotStatus,
} from "./transitLayout";

const CAT = { left: 38, top: 77, size: 720 };
const SEQUENCE_IDS = PARAM_SEQUENCE.map((def) => def.id);
const BOARD_IDS = BOARD_SLOTS.map((def) => def.id);

const TONE_FILL: Record<LabelTone, string> = {
  ink: "#ffffff",
  dim: "#9aa0ab",
  live: TRANSIT_LIVE,
  ...TRANSIT_FAMILY_COLOR,
};

const STYLES = `
@media (prefers-reduced-motion: reduce) {
  [data-obs-scene="transit"] * { animation: none !important; }
}

@keyframes obs-transit-dash { to { stroke-dashoffset: -32; } }
@keyframes obs-transit-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.35); opacity: 0.55; }
}
@keyframes obs-transit-land {
  0% { transform: scale(1.7); }
  60% { transform: scale(0.9); }
  100% { transform: scale(1); }
}
.obs-transit-svg text {
  font-family: var(--obs-font-sans);
  font-weight: 700;
  font-size: 26px;
  paint-order: stroke;
  stroke: #0a0b0e;
  stroke-width: 6px;
  stroke-linejoin: round;
}
.obs-transit-svg text.obs-transit-value { font-weight: 500; font-size: 24px; }
.obs-transit-svg text.obs-transit-dim { font-weight: 500; }
.obs-transit-svg text.obs-transit-tiny {
  font-size: 18px; font-weight: 600; letter-spacing: 0.04em; stroke-width: 5px;
}
.obs-transit-seg { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.obs-transit-seg-live {
  stroke-dasharray: 18 14;
  animation: obs-transit-dash 0.9s linear infinite;
}
.obs-transit-ring {
  fill: none; stroke: ${TRANSIT_LIVE}; stroke-width: 3;
  transform-box: fill-box; transform-origin: center;
  animation: obs-transit-pulse 1.4s ease-in-out infinite;
}
.obs-transit-land {
  transform-box: fill-box; transform-origin: center;
  animation: obs-transit-land 520ms ease-out;
}
`;

function Station({
  x,
  y,
  r,
  kind,
  flash,
}: Readonly<{
  x: number;
  y: number;
  r: number;
  kind: "served" | "closed" | "live" | "next";
  flash: boolean;
}>) {
  const cls = flash ? "obs-transit-land" : undefined;
  if (kind === "live") {
    return (
      <g>
        <circle className="obs-transit-ring" cx={x} cy={y} r={r + 11} />
        <circle
          cx={x}
          cy={y}
          r={r}
          fill="#ffffff"
          stroke={TRANSIT_LIVE}
          strokeWidth={6}
        />
      </g>
    );
  }
  if (kind === "closed") {
    const k = r * 0.5;
    return (
      <g className={cls}>
        <circle
          cx={x}
          cy={y}
          r={r}
          fill="#3a3e47"
          stroke="#8a8f99"
          strokeWidth={3}
        />
        <path
          d={`M${x - k},${y - k} L${x + k},${y + k} M${x + k},${y - k} L${x - k},${y + k}`}
          stroke="#8a8f99"
          strokeWidth={3}
          strokeLinecap="round"
        />
      </g>
    );
  }
  if (kind === "next") {
    return (
      <circle
        cx={x}
        cy={y}
        r={r}
        fill="#3a3e47"
        stroke="#8a8f99"
        strokeWidth={4}
      />
    );
  }
  return (
    <circle
      className={cls}
      cx={x}
      cy={y}
      r={r}
      fill="#ffffff"
      stroke="#111111"
      strokeWidth={r > 10 ? 4 : 3}
    />
  );
}

/** Transit line: the reveal order drawn as a metro route straight on the feed. */
export function TransitSpinScene(props: Readonly<SpinSceneProps>) {
  const {
    paramRows,
    layerRows,
    activeParamId,
    spinDone,
    flashParamId,
    viewUrl,
    spinSeq,
  } = props;
  const slots = useBoardRows(paramRows);
  const groups = useLayerSummary(layerRows);

  const layout = useMemo(() => {
    const slotInputs: TransitSlotInput[] = slots.map((slot) => {
      const status: TransitSlotStatus =
        slot.status !== "revealed" && activeParamId === slot.def.id
          ? "active"
          : slot.status;
      return {
        id: slot.def.id,
        name: slot.row?.label ?? slot.def.label,
        family: transitFamily(slot.def.id),
        status,
        value: slot.row?.value ?? null,
        isNone: slot.isNone,
      };
    });
    const statusById = new Map(slotInputs.map((s) => [s.id, s.status]));
    const branchInputs: TransitBranchInput[] = groups.map((group) => {
      const def = LAYER_GROUPS.find((d) => d.layerKey === group.key);
      const paramId = def?.id ?? group.key;
      const live = group.active || activeParamId === paramId;
      const passed = routePassed(SEQUENCE_IDS, statusById, paramId, spinDone);
      let state: TransitBranchInput["state"] = "next";
      if (live) state = "live";
      else if (group.values.length > 0) state = "served";
      else if (passed) state = "closed";
      return {
        key: group.key,
        label: def?.label ?? group.label,
        family: transitFamily(paramId),
        anchorIndex: branchAnchorIndex(SEQUENCE_IDS, BOARD_IDS, paramId),
        state,
        values: group.values,
      };
    });
    return computeTransitLayout(slotInputs, branchInputs, spinDone);
  }, [slots, groups, activeParamId, spinDone]);

  return (
    <SceneFade spinVisible={props.spinVisible} theme="transit">
      <style>{STYLES}</style>

      {/* Route badge */}
      <div
        className="absolute flex items-center"
        style={{ left: "46px", top: "27px", gap: "13px" }}
      >
        <b
          style={{
            background: TRANSIT_FAMILY_COLOR.coat,
            color: "#111111",
            fontWeight: 800,
            fontSize: "29px",
            lineHeight: 1.15,
            padding: "5px 15px",
            borderRadius: "8px",
            letterSpacing: "0.02em",
          }}
        >
          {spinSeq ?? "—"}
        </b>
        <span
          style={{
            fontFamily: "var(--obs-font-mono)",
            fontSize: "16px",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#ffffff",
            textShadow: "0 2px 6px rgba(0,0,0,0.8)",
          }}
        >
          Spin line · {slots.length} stops · {layout.served} served
        </span>
      </div>

      {/* Cat — free-floating, one canvas, always mounted */}
      <div
        className="absolute"
        style={{
          left: `${CAT.left}px`,
          top: `${CAT.top}px`,
          filter: "drop-shadow(0 27px 23px rgba(0,0,0,0.55))",
        }}
      >
        <CatCanvas canvasRef={props.canvasRef} cssSize={CAT.size} />
      </div>

      <svg
        className="obs-transit-svg absolute left-0 top-0"
        width={1920}
        height={1080}
        viewBox="0 0 1920 1080"
        aria-hidden="true"
      >
        {layout.segments.map((seg) => {
          const width = seg.branch ? 10 : 14;
          if (seg.state === "next") {
            return (
              <path
                key={seg.key}
                className="obs-transit-seg"
                d={seg.d}
                stroke="#555b66"
                strokeWidth={width}
                strokeDasharray={seg.branch ? "1 17" : "4 22"}
              />
            );
          }
          return (
            <path
              key={seg.key}
              className={
                seg.state === "live"
                  ? "obs-transit-seg obs-transit-seg-live"
                  : "obs-transit-seg"
              }
              d={seg.d}
              stroke={seg.color}
              strokeWidth={width}
            />
          );
        })}

        {layout.stations.map((st) => (
          <Station
            key={st.key}
            x={st.x}
            y={st.y}
            r={st.r}
            kind={st.kind}
            flash={st.slotId !== undefined && st.slotId === flashParamId}
          />
        ))}

        {/* Terminus: double ring */}
        <circle
          cx={layout.terminus.x}
          cy={layout.terminus.y}
          r={22}
          fill={layout.terminus.reached ? "#ffffff" : "#3a3e47"}
          stroke="#111111"
          strokeWidth={5}
        />
        <circle
          cx={layout.terminus.x}
          cy={layout.terminus.y}
          r={30}
          fill="none"
          stroke={layout.terminus.reached ? "#ffffff" : "#8a8f99"}
          strokeWidth={4}
        />

        {layout.labels.map((label) => {
          const classes = [
            label.size === "value" ? "obs-transit-value" : "",
            label.size === "tiny" ? "obs-transit-tiny" : "",
            label.tone === "dim" ? "obs-transit-dim" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <text
              key={label.key}
              className={classes || undefined}
              x={label.x}
              y={label.y}
              textAnchor={label.anchor}
              fill={TONE_FILL[label.tone]}
            >
              {label.full !== label.text && <title>{label.full}</title>}
              {label.text}
            </text>
          );
        })}
      </svg>

      {spinDone && viewUrl && (
        <div
          className="absolute"
          style={{
            left: "40px",
            top: "898px",
            padding: "8px",
            background: "#ffffff",
            borderRadius: "6px",
            boxShadow: "0 10px 28px rgba(0,0,0,0.5)",
            animation: "obs-transit-qr 400ms ease",
          }}
        >
          <style>{`@keyframes obs-transit-qr { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }`}</style>
          <QRCodeSVG
            value={viewUrl}
            size={150}
            bgColor="#ffffff"
            fgColor="#111111"
            level="M"
          />
        </div>
      )}

      <WheelLayer
        theme={props.theme}
        wheelRef={props.wheelRef}
        wheelReward={props.wheelReward}
        wheelBannerVisible={props.wheelBannerVisible}
        wheel={{
          left: CAT.left,
          top: CAT.top,
          width: CAT.size,
          height: CAT.size,
        }}
        banner={{ left: CAT.left, top: CAT.top + 650, width: CAT.size }}
      />
      <LoadingBadge show={props.initializing} />
    </SceneFade>
  );
}
