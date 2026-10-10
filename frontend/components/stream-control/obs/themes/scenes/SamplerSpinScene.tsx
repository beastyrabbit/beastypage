"use client";

import { QRCodeSVG } from "qrcode.react";
import {
  type CSSProperties,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { LAYER_GROUPS } from "../../spinSupport";
import { CatCanvas } from "../CatCanvas";
import { truncateValue } from "../format";
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
import { dmcCode, swatchForParam } from "../swatches";
import { samplerGlyphInk } from "./samplerInk";

// ── Palette (mockup F) ───────────────────────────────────────────────────
const AIDA = "#efe6d3";
const WOOD = "#b07a3f";
const WOOD_DARK = "#6f4a22";
const PAPER = "#f8f4ea";
const PENCIL = "#6e6a63";
const RED = "#c43b3b";
const INK = "#2a2622";
const OLIVE = "#7c8a4e";

// ── Geometry (stage px; camera zone x ≥ 1280 stays empty) ───────────────
/** Drawn cat size; a little under the hoop so long poses stay on the cloth. */
const CAT = 660;
/** One aida cell per sprite pixel: CAT / 50. */
const STITCH = CAT / 50;
const HOOP_LEFT = 30;
const HOOP_TOP = 48;
const HOOP_D = 828;
const RIM = 25;
/** Cat (and grid origin) inside the hoop's padding box. */
const CAT_INSET = (HOOP_D - 2 * RIM - CAT) / 2;
const CAT_LEFT = HOOP_LEFT + RIM + CAT_INSET;
const CAT_TOP = HOOP_TOP + RIM + CAT_INSET;
const HOOP_CX = HOOP_LEFT + HOOP_D / 2;

const SHEET_LEFT = 872;
const SHEET_TOP = 48;
const SHEET_W = 392;
const SHEET_H = 979;
const SHEET_PAD_X = 22;
const ROW_H = 41;
const SWATCH = 25;
const QR_SIZE = 150;
const TAB_W = 252;
const TAB_H = 74;

// Needle point sits in the cloth at the sprite's upper-right; the eye end
// is where the thread leaves.
const NEEDLE_LEN = 134;
const NEEDLE_ANGLE = -38;
const NEEDLE_X = CAT_LEFT + 46 * STITCH;
const NEEDLE_Y = CAT_TOP + 17 * STITCH;
const NEEDLE_EYE = {
  x: NEEDLE_X + (NEEDLE_LEN - 10) * Math.cos((NEEDLE_ANGLE * Math.PI) / 180),
  y: NEEDLE_Y + (NEEDLE_LEN - 10) * Math.sin((NEEDLE_ANGLE * Math.PI) / 180),
};

const TITLE_MAX = 40;
const VALUE_MAX = 16;

const KEYFRAMES = `
@media (prefers-reduced-motion: reduce) {
  [data-obs-scene="sampler"] * { animation: none !important; }
}

@keyframes obs-sampler-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0.15; } }
@keyframes obs-sampler-run { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -34; } }
@keyframes obs-sampler-fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
`;

type SwatchState = "filled" | "none" | "rolling" | "pending";

const LAYER_TONE: Record<string, string> = {
  accessories: OLIVE,
  scars: RED,
  tortie: WOOD,
};

function threadPath(end: { x: number; y: number }): string {
  const s = NEEDLE_EYE;
  const c1 = { x: s.x + 60, y: s.y - 110 };
  const c2 = { x: end.x - 90, y: end.y - 150 };
  const r = (n: number) => Math.round(n);
  return `M${r(s.x)},${r(s.y)} C${r(c1.x)},${r(c1.y)} ${r(c2.x)},${r(c2.y)} ${r(end.x)},${r(end.y)}`;
}

/** "Silver tabby" from the revealed colour + pelt rows. */
function patternName(slots: BoardSlot[]): string | null {
  const pick = (id: string) => {
    const slot = slots.find((s) => s.def.id === id);
    return slot?.status === "revealed" && !slot.isNone
      ? (slot.row?.value ?? null)
      : null;
  };
  const colour = pick("colour");
  const pelt = pick("pelt");
  if (!colour && !pelt) return null;
  if (!colour) return pelt;
  return pelt ? `${colour} ${pelt.toLowerCase()}` : colour;
}

export function SamplerSpinScene(props: Readonly<SpinSceneProps>) {
  const {
    activeParamId,
    anchors,
    canvasRef,
    initializing,
    layerRows,
    mapper,
    paramRows,
    poseName,
    reverse,
    spinDone,
    spinSeq,
    spinVisible,
    viewUrl,
    wheelBannerVisible,
    wheelRef,
    wheelReward,
  } = props;

  // Centre the sprite's actual silhouette in the hoop (sprites sit off-centre
  // in their 50px cell). Falls back to the geometric centre while the pose is
  // flipping or the anchors are still loading.
  const bounds =
    anchors &&
    anchors.pose === poseName &&
    anchors.reverse === reverse &&
    activeParamId !== "sprite"
      ? anchors.bounds
      : undefined;
  const innerCentre = (HOOP_D - 2 * RIM) / 2;
  const catX = bounds
    ? innerCentre - ((bounds.minX + bounds.maxX + 1) / 2) * STITCH
    : CAT_INSET;
  const catY = bounds
    ? innerCentre - ((bounds.minY + bounds.maxY + 1) / 2) * STITCH
    : CAT_INSET;
  const slots = useBoardRows(paramRows);
  const layers = useLayerSummary(layerRows);
  const revealed = revealedCount(slots);
  const activeLayerKey =
    LAYER_GROUPS.find((def) => def.id === activeParamId)?.layerKey ?? null;
  const targetKey = activeLayerKey ? `layer:${activeLayerKey}` : activeParamId;

  // The thread follows the rolling row; keep the last target between params.
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [threadEnd, setThreadEnd] = useState<{ x: number; y: number } | null>(
    null,
  );
  useLayoutEffect(() => {
    if (!targetKey) return;
    const row = sheetRef.current?.querySelector<HTMLElement>(
      `[data-sampler-row="${CSS.escape(targetKey)}"]`,
    );
    if (!row) return;
    setThreadEnd({
      x: SHEET_LEFT + row.offsetLeft + SWATCH / 2,
      y: SHEET_TOP + row.offsetTop + row.offsetHeight / 2,
    });
  }, [targetKey]);
  const showThread = threadEnd !== null && !spinDone;

  const name = patternName(slots);
  const title = `Pattern ${spinSeq ?? "—"}${name ? ` · ${name}` : ""}`;

  return (
    <SceneFade spinVisible={spinVisible} theme="sampler">
      <style>{KEYFRAMES}</style>

      {/* Hoop with aida cloth; the grid origin is the cat's top-left pixel. */}
      <div
        className="absolute"
        style={{
          left: HOOP_LEFT,
          top: HOOP_TOP,
          width: HOOP_D,
          height: HOOP_D,
          boxSizing: "border-box",
          borderRadius: "50%",
          border: `${RIM}px solid ${WOOD}`,
          boxShadow: `inset 0 0 0 7px ${WOOD_DARK}, inset 0 0 22px rgba(80,50,20,0.35), 0 15px 38px rgba(0,0,0,0.55)`,
          overflow: "hidden",
          backgroundColor: AIDA,
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.09) 1.3px, transparent 1.3px), linear-gradient(90deg, rgba(0,0,0,0.09) 1.3px, transparent 1.3px)",
          backgroundSize: `${STITCH}px ${STITCH}px`,
          backgroundPosition: `${catX}px ${catY}px`,
          transition: "background-position 600ms ease",
          zIndex: 1,
        }}
      >
        <div
          className="absolute"
          style={{
            left: catX,
            top: catY,
            transition: "left 600ms ease, top 600ms ease",
          }}
        >
          <CatCanvas canvasRef={canvasRef} cssSize={CAT} />
        </div>
      </div>

      {/* The spare aida hanging under the rim carries the stitched caption;
          inside the circle any pose can reach the text. */}
      <div
        className="absolute flex items-center justify-center"
        style={{
          left: HOOP_CX - TAB_W / 2,
          top: HOOP_TOP + HOOP_D - 14,
          width: TAB_W,
          height: TAB_H,
          backgroundColor: AIDA,
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.09) 1.3px, transparent 1.3px), linear-gradient(90deg, rgba(0,0,0,0.09) 1.3px, transparent 1.3px)",
          backgroundSize: `${STITCH}px ${STITCH}px`,
          clipPath:
            "polygon(0 0, 100% 0, 100% 86%, 92% 100%, 81% 88%, 68% 100%, 50% 90%, 34% 100%, 20% 88%, 9% 100%, 0 88%)",
          filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.45))",
          paddingTop: 10,
          fontFamily: "var(--obs-font-mono)",
          fontWeight: 700,
          fontSize: 24,
          letterSpacing: "0.35em",
          color: RED,
          zIndex: 0,
        }}
      >
        <span
          style={{
            display: "inline-block",
            borderBottom: `3.5px dashed ${RED}`,
            paddingBottom: 5,
            paddingLeft: "0.35em",
          }}
        >
          SPIN {spinSeq ?? "—"}
        </span>
      </div>

      {/* Tension screw on top of the hoop */}
      <div
        className="absolute"
        style={{
          left: HOOP_CX - 54,
          top: HOOP_TOP - 27,
          width: 108,
          height: 33,
          background: WOOD_DARK,
          borderRadius: 6,
          boxShadow: "0 4px 10px rgba(0,0,0,0.5)",
          zIndex: 2,
        }}
      >
        <div
          className="absolute"
          style={{
            left: 46,
            top: 9,
            width: 16,
            height: 14,
            borderRadius: "50%",
            background: "#d8c7a7",
            boxShadow: "inset 0 3px 0 #8c7b5b",
          }}
        />
      </div>

      <Needle />

      {/* Pattern sheet */}
      <div
        ref={sheetRef}
        className="absolute"
        style={{
          left: SHEET_LEFT,
          top: SHEET_TOP,
          width: SHEET_W,
          height: SHEET_H,
          boxSizing: "border-box",
          padding: `21px ${SHEET_PAD_X}px`,
          background: PAPER,
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.05) 1.2px, transparent 1.2px), linear-gradient(90deg, rgba(0,0,0,0.05) 1.2px, transparent 1.2px)",
          backgroundSize: "19.2px 19.2px",
          boxShadow: "0 15px 38px rgba(0,0,0,0.5)",
          color: INK,
          zIndex: 3,
        }}
      >
        <div
          style={{
            fontFamily: "var(--obs-font-serif)",
            fontStyle: "italic",
            fontSize: 26,
            lineHeight: 1.15,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {truncateValue(title, TITLE_MAX)}
        </div>
        <div
          style={{
            fontFamily: "var(--obs-font-mono)",
            fontSize: 14,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: PENCIL,
            margin: "6px 0 15px",
            paddingBottom: 10,
            borderBottom: `1.5px solid ${INK}`,
          }}
        >
          50 × 50 st · 14 ct · {slots.length} colours
        </div>

        {slots.map((slot) => (
          <BoardLegendRow key={slot.def.id} slot={slot} mapper={mapper} />
        ))}

        <div style={{ display: "flex", gap: 3.5, marginTop: 17 }}>
          {slots.map((slot) => (
            <i
              key={slot.def.id}
              style={{
                flex: 1,
                height: 12,
                boxSizing: "border-box",
                ...(slot.status === "revealed"
                  ? { background: INK, opacity: 0.9 }
                  : slot.status === "active"
                    ? {
                        background: RED,
                        animation: "obs-sampler-blink 1s steps(1) infinite",
                      }
                    : {
                        background: "transparent",
                        border: `1.2px solid ${PENCIL}`,
                        opacity: 0.5,
                      }),
              }}
            />
          ))}
        </div>
        <div
          className="flex justify-between"
          style={{
            fontFamily: "var(--obs-font-mono)",
            fontSize: 13,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: PENCIL,
            marginTop: 6,
          }}
        >
          <span>
            {revealed} of {slots.length} colours
          </span>
          <span>{spinDone ? "finished" : "stitching"}</span>
        </div>

        <div
          style={{
            fontFamily: "var(--obs-font-mono)",
            fontSize: 14,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: PENCIL,
            margin: "17px 0 6px",
          }}
        >
          Backstitch
        </div>
        {layers.map((group) => (
          <BackstitchRow
            key={group.key}
            group={group}
            rolling={group.active || activeLayerKey === group.key}
            spinDone={spinDone}
          />
        ))}

        {spinDone && viewUrl && (
          <div
            className="absolute"
            style={{
              right: SHEET_PAD_X,
              bottom: 21,
              width: QR_SIZE,
              animation: "obs-sampler-fade-in 400ms ease",
            }}
          >
            <div
              style={{
                border: `1.2px solid ${INK}`,
                background: PAPER,
                padding: 6,
                lineHeight: 0,
              }}
            >
              <QRCodeSVG
                value={viewUrl}
                size={QR_SIZE - 14}
                bgColor={PAPER}
                fgColor={INK}
                level="M"
              />
            </div>
            <small
              style={{
                display: "block",
                fontFamily: "var(--obs-font-mono)",
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: PENCIL,
                textAlign: "center",
                marginTop: 5,
              }}
            >
              Full chart
            </small>
          </div>
        )}
      </div>

      {/* Red thread from the needle's eye to the row on the needle */}
      <svg
        className="pointer-events-none absolute"
        width={1920}
        height={1080}
        viewBox="0 0 1920 1080"
        fill="none"
        style={{
          left: 0,
          top: 0,
          zIndex: 4,
          overflow: "visible",
          opacity: showThread ? 1 : 0,
          transition: "opacity 400ms ease",
        }}
        aria-hidden="true"
      >
        {threadEnd && (
          <path
            d={threadPath(threadEnd)}
            stroke={RED}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray="10 7"
            style={
              {
                d: `path("${threadPath(threadEnd)}")`,
                transition: "d 650ms cubic-bezier(0.4, 0, 0.2, 1)",
                animation: "obs-sampler-run 1.1s linear infinite",
                animationPlayState: activeParamId ? "running" : "paused",
                filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.35))",
              } as CSSProperties
            }
          />
        )}
      </svg>

      <WheelLayer
        theme={props.theme}
        wheelRef={wheelRef}
        wheelReward={wheelReward}
        wheelBannerVisible={wheelBannerVisible}
        wheel={{
          left: HOOP_LEFT,
          top: HOOP_TOP,
          width: HOOP_D,
          height: HOOP_D,
        }}
        banner={{
          left: HOOP_LEFT,
          top: HOOP_TOP + HOOP_D + TAB_H - 4,
          width: HOOP_D,
        }}
      />
      <LoadingBadge show={initializing} />
    </SceneFade>
  );
}

function Needle() {
  return (
    <div
      className="absolute"
      style={{
        left: NEEDLE_X,
        top: NEEDLE_Y - 3,
        width: NEEDLE_LEN,
        height: 6,
        background: "linear-gradient(90deg, #8b8f96, #e6e8ec 60%, #8b8f96)",
        borderRadius: "1px 4px 4px 1px",
        clipPath: "polygon(0 50%, 12px 0, 100% 0, 100% 100%, 12px 100%)",
        transform: `rotate(${NEEDLE_ANGLE}deg)`,
        transformOrigin: "left center",
        boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
        zIndex: 3,
      }}
    >
      <div
        className="absolute"
        style={{
          right: 4,
          top: 1.5,
          width: 13,
          height: 3,
          borderRadius: 2,
          background: "#5b5f66",
        }}
      />
    </div>
  );
}

function Swatch({
  state,
  colour,
  glyph,
}: Readonly<{ state: SwatchState; colour: string | null; glyph: string }>) {
  const base: CSSProperties = {
    width: SWATCH,
    height: SWATCH,
    boxSizing: "border-box",
    display: "grid",
    placeItems: "center",
    fontStyle: "normal",
    fontFamily: "var(--obs-font-mono)",
    fontSize: 17,
    fontWeight: 700,
    lineHeight: 1,
  };
  if (state === "rolling") {
    return (
      <i style={{ ...base, border: `2px dashed ${RED}`, color: RED }}>
        {glyph}
      </i>
    );
  }
  if (state === "filled" && colour) {
    return (
      <i
        style={{
          ...base,
          border: `1.5px solid ${INK}`,
          background: colour,
          color: samplerGlyphInk(colour),
        }}
      >
        {glyph}
      </i>
    );
  }
  // No colour known (yet): an empty dashed square, ink glyph if revealed.
  return (
    <i
      style={{
        ...base,
        border: `1.5px dashed ${INK}`,
        opacity: state === "pending" ? 0.4 : 0.7,
        color: INK,
      }}
    >
      {state === "filled" ? glyph : ""}
    </i>
  );
}

function LegendRow({
  rowKey,
  swatch,
  code,
  label,
  value,
  tone,
  dim,
}: Readonly<{
  rowKey: string;
  swatch: ReactNode;
  code: string;
  label: string;
  value: ReactNode;
  tone?: string;
  dim?: boolean;
}>) {
  const fade = dim ? 0.4 : 1;
  return (
    <div
      data-sampler-row={rowKey}
      style={{
        display: "grid",
        gridTemplateColumns: `${SWATCH}px 46px minmax(0, 1fr) auto`,
        alignItems: "center",
        columnGap: 8,
        height: ROW_H,
        borderBottom: "1.2px dotted rgba(42,38,34,0.4)",
        fontSize: 18,
      }}
    >
      {swatch}
      <code
        style={{
          fontFamily: "var(--obs-font-mono)",
          fontSize: 15,
          color: tone ?? PENCIL,
          opacity: fade,
        }}
      >
        {code}
      </code>
      <span
        style={{
          fontFamily: "var(--obs-font-serif)",
          fontStyle: "italic",
          color: tone ?? "#5a554d",
          opacity: fade,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </span>
      <b
        style={{
          fontWeight: 600,
          color: tone ?? INK,
          opacity: fade,
          whiteSpace: "nowrap",
          maxWidth: 170,
          overflow: "hidden",
          textOverflow: "ellipsis",
          textAlign: "right",
        }}
      >
        {value}
      </b>
    </div>
  );
}

function BoardLegendRow({
  slot,
  mapper,
}: Readonly<{ slot: BoardSlot; mapper: SpinSceneProps["mapper"] }>) {
  const { def, row, status, isNone } = slot;
  if (status === "active") {
    return (
      <LegendRow
        rowKey={def.id}
        swatch={<Swatch state="rolling" colour={null} glyph="×" />}
        code="…"
        label={def.label}
        value="on the needle"
        tone={RED}
      />
    );
  }
  if (status !== "revealed") {
    return (
      <LegendRow
        rowKey={def.id}
        swatch={<Swatch state="pending" colour={null} glyph="" />}
        code="—"
        label={def.label}
        value="—"
        dim
      />
    );
  }
  if (isNone) {
    return (
      <LegendRow
        rowKey={def.id}
        swatch={<Swatch state="none" colour={null} glyph="" />}
        code="—"
        label={def.label}
        value={<span style={{ opacity: 0.5, fontWeight: 400 }}>None</span>}
      />
    );
  }
  const colour = swatchForParam(def.id, row?.raw, mapper);
  return (
    <LegendRow
      rowKey={def.id}
      swatch={<Swatch state="filled" colour={colour} glyph="×" />}
      code={dmcCode(def.id, row?.raw)}
      label={def.label}
      value={truncateValue(row?.value ?? "", VALUE_MAX)}
    />
  );
}

function BackstitchRow({
  group,
  rolling,
  spinDone,
}: Readonly<{
  group: LayerSummaryGroup;
  rolling: boolean;
  spinDone: boolean;
}>) {
  const rowKey = `layer:${group.key}`;
  if (rolling) {
    return (
      <LegendRow
        rowKey={rowKey}
        swatch={<Swatch state="rolling" colour={null} glyph="/" />}
        code="…"
        label={group.label}
        value="on the needle"
        tone={RED}
      />
    );
  }
  const anyRevealed = group.rows.some((r) => r.status === "revealed");
  if (!anyRevealed && !spinDone) {
    return (
      <LegendRow
        rowKey={rowKey}
        swatch={<Swatch state="pending" colour={null} glyph="" />}
        code="—"
        label={group.label}
        value="—"
        dim
      />
    );
  }
  if (group.values.length === 0) {
    return (
      <LegendRow
        rowKey={rowKey}
        swatch={<Swatch state="none" colour={null} glyph="" />}
        code="—"
        label={group.label}
        value={<span style={{ opacity: 0.45, fontWeight: 400 }}>none</span>}
      />
    );
  }
  const tone = LAYER_TONE[group.key] ?? INK;
  return (
    <LegendRow
      rowKey={rowKey}
      swatch={<Swatch state="filled" colour={tone} glyph="/" />}
      code={dmcCode(group.key, group.values.join(","))}
      label={group.label}
      value={truncateValue(group.values.join(", "), VALUE_MAX + 2)}
    />
  );
}
