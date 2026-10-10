"use client";

import { QRCodeSVG } from "qrcode.react";
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { LAYER_GROUPS, PARAM_SEQUENCE } from "../../spinSupport";
import { CatCanvas } from "../CatCanvas";
import { legendNumber, truncateValue } from "../format";
import type { SpinSceneProps } from "../SpinSceneProps";
import {
  type BoardSlot,
  type LayerSummaryGroup,
  LoadingBadge,
  revealedCount,
  SceneFade,
  useBoardRows,
  useLayerSummary,
  WheelLayer,
} from "../sceneShared";
import {
  type AnchorId,
  type SpritePoint,
  scaleAnchors,
} from "../spriteAnchors";
import { anchorForParam } from "../traitAnchorMap";
import {
  assignCaptionSlots,
  type CaptionCandidate,
  occupiedCaptionSlots,
  PLATE_CAPTION_SLOTS,
} from "./plateCaptions";

// ── Geometry (px). Plate is stage-local, everything else plate-local. ──────
const PLATE = { left: 50, top: 50, width: 1181, height: 979 } as const;
/** 720px cat (1 sprite px = 14.4 screen px), nudged left so wide poses clear the legend. */
const CAT = { left: 20, top: 110, size: 720 } as const;
const PX_PER_UNIT = CAT.size / 50;
const LEGEND = { right: 27, top: 104, width: 422, rowHeight: 42 } as const;
const LEGEND_LEFT = PLATE.width - LEGEND.right - LEGEND.width;
const EXTRAS_TOP = 604;
const QR_SIZE = 156;

const OLIVE = "#7c8a4e";
const SLATE = "#1b1f24";
const LINE_INK = "rgba(233, 228, 216, 0.7)";
/** Keeps a caption legible if a pose's sprite edge sneaks under it. */
const CAPTION_HALO = "0 0 3px rgba(27,31,36,0.95), 0 0 8px rgba(27,31,36,0.85)";

const FEATURE_NAME: Record<AnchorId, string> = {
  eyes: "eyes",
  head: "crown",
  ear: "ear",
  chest: "chest",
  pelt: "pelt",
  back: "back",
  tail: "tail",
  paw: "paw",
};

const LAYER_LABEL: Record<string, string> = {
  tortie: "Tortie",
  accessories: "Accessory",
  scars: "Scar",
};

/** Final plate: the traits a viewer cares about most get the captions. */
const DONE_PRIORITY = [
  "coat",
  "eyeColour",
  "whitePatches",
  "accessory",
  "scar",
  "tortie",
  "points",
  "vitiligo",
  "tint",
  "eyeColour2",
  "skinColour",
  "whitePatchesTint",
  "sprite",
];

const SEQ_INDEX = new Map(PARAM_SEQUENCE.map((def, i) => [def.id, i]));
const LAYER_DEF_BY_ID = new Map(LAYER_GROUPS.map((def) => [def.id, def]));

function sentenceCase(label: string): string {
  if (!label) return label;
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}

function layerLabel(group: LayerSummaryGroup): string {
  return LAYER_LABEL[group.key] ?? sentenceCase(group.label);
}

/** Longest caption value line that still clears the legend column. */
const CAPTION_MAX = 22;

interface Caption extends CaptionCandidate {
  feature: string;
  /** Trait label; empty when the value names itself ("Silver · Tabby"). */
  label: string;
  value: string;
  rolling: boolean;
  /** Reveal recency (PARAM_SEQUENCE index) and final-plate priority. */
  order: number;
  priority: number;
}

export function PlateSpinScene(props: Readonly<SpinSceneProps>) {
  const {
    canvasRef,
    wheelRef,
    spinVisible,
    initializing,
    wheelReward,
    wheelBannerVisible,
    paramRows,
    layerRows,
    rollerLabel,
    spinDone,
    viewUrl,
    spinSeq,
    activeParamId,
    poseName,
    reverse,
    anchors,
  } = props;

  const slots = useBoardRows(paramRows);
  const layers = useLayerSummary(layerRows);
  const revealed = revealedCount(slots);

  const activeSlot = slots.find((s) => s.def.id === activeParamId) ?? null;
  const activeLayerKey = activeParamId
    ? (LAYER_DEF_BY_ID.get(activeParamId)?.layerKey ?? null)
    : null;
  const activeLayer =
    layers.find((g) => g.key === activeLayerKey) ??
    layers.find((g) => g.active) ??
    null;

  const rollingLabel = activeSlot
    ? sentenceCase(activeSlot.def.label)
    : activeLayer
      ? layerLabel(activeLayer)
      : rollerLabel
        ? sentenceCase(rollerLabel)
        : null;

  // Leader lines only when the anchors match the pose on the canvas and the
  // pose isn't flipping (sprite step) — otherwise they'd point at nothing.
  const spriteRolling = activeParamId === "sprite";
  const anchorsFresh =
    anchors && anchors.pose === poseName && anchors.reverse === reverse
      ? anchors
      : null;
  const linesVisible = !spriteRolling && anchorsFresh !== null;
  const points = useMemo(
    () =>
      anchorsFresh
        ? scaleAnchors(anchorsFresh, PX_PER_UNIT, { x: CAT.left, y: CAT.top })
        : null,
    [anchorsFresh],
  );
  const poseKey = anchorsFresh
    ? `${anchorsFresh.pose}-${anchorsFresh.reverse}`
    : "none";

  // ── Caption candidates: rolling trait + most recent (or, when done, most
  // important) revealed traits that aren't "None". ─────────────────────────
  const captions = useMemo(() => {
    const pointFor = (paramId: string): SpritePoint | null =>
      points ? points[anchorForParam(paramId)] : null;
    const featureFor = (paramId: string) =>
      FEATURE_NAME[anchorForParam(paramId)];
    const all: Caption[] = [];
    const bySlot = new Map(slots.map((s) => [s.def.id, s]));
    const colour = bySlot.get("colour");
    const pelt = bySlot.get("pelt");
    const mergeCoat =
      colour?.status === "revealed" &&
      pelt?.status === "revealed" &&
      !colour.isNone &&
      !pelt.isNone;
    if (mergeCoat && colour?.row && pelt?.row) {
      all.push({
        id: "coat",
        target: pointFor("colour"),
        feature: featureFor("colour"),
        label: "",
        value: `${colour.row.value} · ${pelt.row.value}`,
        rolling: false,
        order: SEQ_INDEX.get("pelt") ?? 0,
        priority: 0,
      });
    }
    for (const slot of slots) {
      const id = slot.def.id;
      if (mergeCoat && (id === "colour" || id === "pelt")) continue;
      const rolling = slot.status === "active" || id === activeParamId;
      if (!rolling && (slot.status !== "revealed" || slot.isNone)) continue;
      all.push({
        id,
        target: pointFor(id),
        feature: featureFor(id),
        label: sentenceCase(slot.def.label),
        value: rolling ? "rolling" : (slot.row?.value ?? ""),
        rolling,
        order: SEQ_INDEX.get(id) ?? 0,
        priority: DONE_PRIORITY.indexOf(id),
      });
    }
    for (const group of layers) {
      const def = LAYER_GROUPS.find((d) => d.layerKey === group.key);
      if (!def) continue;
      const rolling = group === activeLayer && !activeSlot && !spinDone;
      if (!rolling && group.values.length === 0) continue;
      const extra = group.values.length - 1;
      all.push({
        id: def.id,
        target: pointFor(def.id),
        feature: featureFor(def.id),
        label: layerLabel(group),
        value: rolling
          ? "rolling"
          : `${group.values[0]}${extra > 0 ? ` +${extra}` : ""}`,
        rolling,
        order: SEQ_INDEX.get(def.id) ?? 0,
        priority: DONE_PRIORITY.indexOf(def.id),
      });
    }
    const rank = (c: Caption) =>
      c.rolling
        ? -1
        : spinDone
          ? c.priority < 0
            ? 99
            : c.priority
          : 1000 - c.order;
    return all
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, PLATE_CAPTION_SLOTS.length);
  }, [slots, layers, points, activeParamId, activeLayer, activeSlot, spinDone]);

  // Skip caption slots the drawn sprite reaches into (raised tails, lying
  // poses). The silhouette only changes with the pose, so re-check when the
  // pose or the reveal count changes, after the engine has drawn the frame.
  const [occupied, setOccupied] = useState<readonly number[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: pose/reveal/done are re-sample triggers for the imperatively drawn canvas
  useEffect(() => {
    const sample = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const next = occupiedCaptionSlots(canvas, { x: CAT.left, y: CAT.top });
      setOccupied((prev) =>
        prev.length === next.length && prev.every((v, i) => v === next[i])
          ? prev
          : next,
      );
    };
    // Early sample for responsiveness, late one in case the frame wasn't drawn yet.
    const timers = [350, 1500].map((ms) => window.setTimeout(sample, ms));
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [canvasRef, poseName, reverse, revealed, spinDone]);
  const availableSlots = useMemo(
    () =>
      PLATE_CAPTION_SLOTS.map((_, i) => i).filter((i) => !occupied.includes(i)),
    [occupied],
  );
  const previousSlots = useRef<Map<string, number>>(new Map());
  const assignment = useMemo(
    () => assignCaptionSlots(captions, previousSlots.current, availableSlots),
    [captions, availableSlots],
  );
  useEffect(() => {
    previousSlots.current = assignment;
  }, [assignment]);

  const header = (() => {
    const bySlot = new Map(slots.map((s) => [s.def.id, s]));
    const colour = bySlot.get("colour");
    const pelt = bySlot.get("pelt");
    const parts: string[] = [];
    if (colour?.status === "revealed" && colour.row && !colour.isNone)
      parts.push(colour.row.value);
    if (pelt?.status === "revealed" && pelt.row && !pelt.isNone)
      parts.push(pelt.row.value.toLowerCase());
    const name = parts.length ? parts.join(" ") : "specimen pending";
    return `Plate${spinSeq != null ? ` ${spinSeq}` : ""} · ${truncateValue(name, 34)}`;
  })();

  const status = spinDone
    ? "Plate complete"
    : rollingLabel
      ? `Rolling · ${rollingLabel}`
      : revealed > 0
        ? "Rolling"
        : "Awaiting specimen";

  const mono: CSSProperties = {
    fontFamily: "var(--obs-font-mono)",
    textTransform: "uppercase",
  };

  return (
    <SceneFade spinVisible={spinVisible}>
      <style>{`
        @keyframes obs-plate-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        @keyframes obs-plate-dot { 0% { opacity: 0; r: 0; } 60% { opacity: 1; r: 8; } 100% { opacity: 1; r: 5; } }
        @keyframes obs-plate-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        @keyframes obs-plate-blink { 50% { opacity: 0; } }
        @keyframes obs-plate-fill { from { background: rgba(var(--obs-accent-rgb), 0.22); } to { background: transparent; } }
        @media (prefers-reduced-motion: reduce) {
          [data-obs-plate] * { animation: none !important; }
        }
      `}</style>
      <div
        data-obs-plate
        className="absolute overflow-hidden"
        style={{
          left: PLATE.left,
          top: PLATE.top,
          width: PLATE.width,
          height: PLATE.height,
          background: "var(--obs-panel-bg)",
          border: "1.5px solid var(--obs-panel-border)",
          backgroundImage:
            "radial-gradient(rgba(233,228,216,0.22) 1.7px, transparent 1.9px)",
          backgroundSize: "38.4px 38.4px",
          backgroundPosition: "19.2px 19.2px",
          color: "var(--obs-ink)",
        }}
      >
        {/* Header */}
        <div
          className="absolute flex items-baseline justify-between"
          style={{
            left: 27,
            right: 27,
            top: 19,
            paddingBottom: 10,
            borderBottom: "1.5px solid rgba(233,228,216,0.35)",
          }}
        >
          <b
            style={{
              fontFamily: "var(--obs-font-serif)",
              fontStyle: "italic",
              fontWeight: 400,
              fontSize: 31,
              whiteSpace: "nowrap",
            }}
          >
            {header}
          </b>
          <span
            style={{
              ...mono,
              fontSize: 16,
              letterSpacing: "0.2em",
              color: "var(--obs-muted)",
              whiteSpace: "nowrap",
            }}
          >
            Spin · {revealed} of {slots.length}
          </span>
        </div>

        {/* The cat — mounted for the whole scene; the engine draws into it. */}
        <div
          className="absolute"
          style={{ left: CAT.left, top: CAT.top, width: CAT.size }}
        >
          <CatCanvas canvasRef={canvasRef} cssSize={CAT.size} />
        </div>

        {/* Leader lines */}
        <svg
          aria-hidden
          className="absolute"
          width={PLATE.width}
          height={PLATE.height}
          style={{
            left: 0,
            top: 0,
            overflow: "visible",
            pointerEvents: "none",
            opacity: linesVisible ? 1 : 0,
            transition: "opacity 240ms ease",
          }}
        >
          {points &&
            captions.map((c) => {
              const si = assignment.get(c.id);
              if (si === undefined || !c.target) return null;
              const from = PLATE_CAPTION_SLOTS[si].attach;
              const color = c.rolling ? "var(--obs-accent)" : LINE_INK;
              return (
                <g key={`${c.id}-${si}-${poseKey}-${c.rolling}`}>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={c.target.x}
                    y2={c.target.y}
                    pathLength={1}
                    stroke={color}
                    strokeWidth={1.6}
                    strokeDasharray="1"
                    style={{ animation: "obs-plate-draw 650ms ease-out both" }}
                  />
                  <circle
                    cx={c.target.x}
                    cy={c.target.y}
                    r={5}
                    fill={c.rolling ? "var(--obs-accent)" : "#e9e4d8"}
                    style={{
                      animation: "obs-plate-dot 420ms ease-out 560ms both",
                    }}
                  />
                </g>
              );
            })}
        </svg>

        {/* Captions in fixed slots */}
        {captions.map((c) => {
          const si = assignment.get(c.id);
          if (si === undefined) return null;
          const s = PLATE_CAPTION_SLOTS[si];
          const color = c.rolling ? "var(--obs-accent)" : undefined;
          const combined = c.label ? `${c.label} · ${c.value}` : c.value;
          const fits = combined.length <= CAPTION_MAX;
          const small = fits ? c.feature : `${c.feature} · ${c.label}`;
          const big = fits ? combined : truncateValue(c.value, CAPTION_MAX);
          return (
            <div
              key={`${c.id}-${si}`}
              className="absolute"
              style={{
                left: s.left,
                top: s.top,
                lineHeight: 1.25,
                whiteSpace: "nowrap",
                textShadow: CAPTION_HALO,
                animation: "obs-plate-in 360ms ease-out both",
              }}
            >
              <small
                className="block"
                style={{
                  fontFamily: "var(--obs-font-serif)",
                  fontStyle: "italic",
                  fontSize: 16,
                  color: color ?? "var(--obs-muted)",
                }}
              >
                {small}
              </small>
              <b style={{ fontWeight: 600, fontSize: 22, color }}>{big}</b>
            </div>
          );
        })}

        {/* Numbered legend */}
        <div
          className="absolute"
          style={{ left: LEGEND_LEFT, top: LEGEND.top, width: LEGEND.width }}
        >
          {slots.map((slot, i) => (
            <LegendRow
              key={slot.def.id}
              index={i}
              slot={slot}
              rolling={
                slot.status === "active" || slot.def.id === activeParamId
              }
            />
          ))}
        </div>

        {/* Extras: tortie / accessory / scar */}
        <div
          className="absolute flex"
          style={{ left: LEGEND_LEFT, top: EXTRAS_TOP, gap: 36 }}
        >
          {layers.map((group) => (
            <ExtrasColumn
              key={group.key}
              group={group}
              rolling={group === activeLayer && !activeSlot && !spinDone}
              mono={mono}
            />
          ))}
        </div>

        {/* Scale bar */}
        <div
          className="absolute flex items-center"
          style={{
            ...mono,
            left: 27,
            bottom: 21,
            gap: 11,
            fontSize: 14,
            letterSpacing: "0.15em",
            color: "var(--obs-muted)",
          }}
        >
          <i
            className="relative block"
            style={{
              width: 115,
              height: 10,
              border: "1.5px solid var(--obs-muted)",
              borderTop: "none",
            }}
          >
            <span
              className="absolute"
              style={{
                left: "50%",
                top: 0,
                bottom: 0,
                borderLeft: "1.5px solid var(--obs-muted)",
              }}
            />
          </i>
          50 px · 1 : 14.4
        </div>

        {/* QR */}
        {spinDone && viewUrl && (
          <div
            className="absolute"
            style={{
              right: 27,
              bottom: 52,
              background: "#fff",
              padding: 8,
              animation: "obs-plate-in 400ms ease-out both",
            }}
          >
            <QRCodeSVG
              value={viewUrl}
              size={QR_SIZE}
              bgColor="#ffffff"
              fgColor={SLATE}
              level="M"
            />
            <small
              className="block text-center"
              style={{
                ...mono,
                color: SLATE,
                fontSize: 12,
                letterSpacing: "0.2em",
                marginTop: 4,
              }}
            >
              Scan
            </small>
          </div>
        )}

        {/* Status */}
        <div
          className="absolute"
          style={{
            ...mono,
            right: 27,
            bottom: 19,
            fontSize: 16,
            letterSpacing: "0.2em",
            color:
              rollingLabel && !spinDone
                ? "var(--obs-accent)"
                : "var(--obs-muted)",
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              animation: spinDone
                ? undefined
                : "obs-plate-blink 1.4s steps(1) infinite",
            }}
          >
            ●
          </span>{" "}
          {truncateValue(status, 30)}
        </div>
      </div>

      <WheelLayer
        theme={props.theme}
        wheelRef={wheelRef}
        wheelReward={wheelReward}
        wheelBannerVisible={wheelBannerVisible}
        wheel={{
          left: PLATE.left + CAT.left,
          top: PLATE.top + CAT.top,
          width: CAT.size,
          height: CAT.size,
        }}
        banner={{
          left: PLATE.left + CAT.left,
          top: PLATE.top + CAT.top + CAT.size - 140,
          width: CAT.size,
        }}
      />
      <LoadingBadge show={initializing} />
    </SceneFade>
  );
}

function LegendRow({
  index,
  slot,
  rolling,
}: Readonly<{ index: number; slot: BoardSlot; rolling: boolean }>) {
  const pending = !rolling && slot.status !== "revealed";
  const accent = rolling ? "var(--obs-accent)" : undefined;
  let value: string;
  if (rolling) value = "rolling";
  else if (pending) value = "—";
  else value = truncateValue(slot.row?.value ?? "", 20);
  return (
    <div
      className="grid items-baseline"
      style={{
        gridTemplateColumns: "31px 1fr auto",
        gap: 10,
        height: LEGEND.rowHeight,
        paddingTop: 8,
        borderBottom: "1.2px solid rgba(233,228,216,0.18)",
        fontSize: 19,
      }}
    >
      <i
        style={{
          fontFamily: "var(--obs-font-mono)",
          fontStyle: "normal",
          fontSize: 15,
          color: accent ?? "var(--obs-muted)",
        }}
      >
        {legendNumber(index)}
      </i>
      <span
        style={{
          fontFamily: "var(--obs-font-serif)",
          fontStyle: "italic",
          color: accent ?? "var(--obs-muted)",
          whiteSpace: "nowrap",
        }}
      >
        {sentenceCase(slot.def.label)}
      </span>
      <b
        key={`${slot.status}-${rolling}`}
        style={{
          fontWeight: slot.isNone || pending ? 400 : 600,
          color:
            accent ?? (slot.isNone || pending ? "var(--obs-muted)" : undefined),
          opacity: pending ? 0.5 : 1,
          whiteSpace: "nowrap",
          padding: "0 2px",
          animation:
            slot.status === "revealed"
              ? "obs-plate-in 320ms ease-out both, obs-plate-fill 900ms ease-out both"
              : undefined,
        }}
      >
        {value}
      </b>
    </div>
  );
}

function ExtrasColumn({
  group,
  rolling,
  mono,
}: Readonly<{
  group: LayerSummaryGroup;
  rolling: boolean;
  mono: CSSProperties;
}>) {
  const anyRevealed = group.rows.some((r) => r.status === "revealed");
  const shown =
    group.values.length > 3 ? group.values.slice(0, 2) : group.values;
  const more = group.values.length - shown.length;
  const valueStyle: CSSProperties = {
    display: "block",
    fontWeight: 500,
    fontSize: 19,
    lineHeight: 1.5,
    whiteSpace: "nowrap",
  };
  return (
    <div style={{ maxWidth: 140 }}>
      <small
        className="block"
        style={{
          ...mono,
          fontSize: 14,
          letterSpacing: "0.2em",
          color: rolling ? "var(--obs-accent)" : OLIVE,
          marginBottom: 4,
        }}
      >
        {layerLabel(group)}
      </small>
      {rolling ? (
        <b style={{ ...valueStyle, color: "var(--obs-accent)" }}>rolling</b>
      ) : shown.length > 0 ? (
        <>
          {shown.map((v, i) => (
            <b
              // biome-ignore lint/suspicious/noArrayIndexKey: values can repeat
              key={`${v}-${i}`}
              style={valueStyle}
            >
              {truncateValue(v, 12)}
            </b>
          ))}
          {more > 0 && (
            <b
              style={{
                ...valueStyle,
                fontWeight: 400,
                color: "var(--obs-muted)",
              }}
            >
              +{more} more
            </b>
          )}
        </>
      ) : (
        <b
          style={{ ...valueStyle, fontWeight: 400, color: "var(--obs-muted)" }}
        >
          {anyRevealed ? "none" : "—"}
        </b>
      )}
    </div>
  );
}
