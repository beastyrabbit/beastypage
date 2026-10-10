"use client";

import { QRCodeSVG } from "qrcode.react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { LAYER_GROUPS } from "../../spinSupport";
import { CatCanvas } from "../CatCanvas";
import { bayerLetter, truncateValue } from "../format";
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
  type SpriteAnchors,
  type SpritePoint,
  scaleAnchors,
} from "../spriteAnchors";
import { anchorForParam } from "../traitAnchorMap";
import {
  magnitudeRadius,
  projectSky,
  STARCHART_AMBIENT_METEORS,
  STARCHART_BG_STARS,
  STARCHART_CONSTELLATION_NAMES,
  STARCHART_FINALE_METEORS,
  STARCHART_GRID_PATHS,
  STARCHART_REAL_LINES,
  STARCHART_REAL_STARS,
  separateStars,
  starJitter,
  starRadius,
} from "./starchartSky";

// ── Geometry (stage px) ───────────────────────────────────────────────────
const SKY = { left: 29, top: 29, width: 1223, height: 1022 } as const;
/** 720px cat (14.4 px per sprite px), nudged left so wide poses clear the catalogue. */
const CAT = { left: 40, top: 140, size: 720 } as const;
const PX_PER_UNIT = CAT.size / 50;
const TABLE = { left: 768, top: 104, width: 461, rowHeight: 42 } as const;
const ATTENDANTS_TOP = 618;
const QR_SIZE = 156;

interface SkyPalette {
  night: string;
  grid: string;
  gold: string;
  ink: string;
  dim: string;
  qrInk: string;
}

const STARCLAN: SkyPalette = {
  night: "rgba(7, 11, 22, 0.88)",
  grid: "#27324d",
  gold: "#f2d27a",
  ink: "#c9d3e6",
  dim: "#5b6a8a",
  qrInk: "#070b16",
};

/** Dark Forest spins: a dull red sky and ember stars. */
const DARK_FOREST: SkyPalette = {
  night: "rgba(26, 9, 10, 0.9)",
  grid: "#4a2427",
  gold: "#e47a42",
  ink: "#e2cdc6",
  dim: "#8c5b57",
  qrInk: "#1a090a",
};

const CYAN = "var(--obs-accent)";

const LAYER_LABEL: Record<string, string> = {
  tortie: "Tortie",
  accessories: "Attendants",
  scars: "Scar",
};

const LAYER_DEF_BY_ID = new Map(LAYER_GROUPS.map((def) => [def.id, def]));

function sentenceCase(label: string): string {
  if (!label) return label;
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}

function layerLabel(group: LayerSummaryGroup): string {
  return LAYER_LABEL[group.key] ?? sentenceCase(group.label);
}

const REAL_STARS = STARCHART_REAL_STARS.map((star) => ({
  ...star,
  ...projectSky(star.ra, star.dec),
}));
const REAL_STAR_BY_KEY = new Map(
  REAL_STARS.map((star) => [`${star.con}:${star.id}`, star]),
);
/** Constellation names sit at the centroid of their stars, nudged clear of the figures. */
const CONSTELLATION_LABELS = (
  Object.keys(
    STARCHART_CONSTELLATION_NAMES,
  ) as (keyof typeof STARCHART_CONSTELLATION_NAMES)[]
).map((con) => {
  const members = REAL_STARS.filter((star) => star.con === con);
  const x = members.reduce((a, s) => a + s.x, 0) / members.length;
  const y = members.reduce((a, s) => a + s.y, 0) / members.length;
  return { con, text: STARCHART_CONSTELLATION_NAMES[con], x, y: y + 40 };
});

interface Star {
  slot: BoardSlot;
  index: number;
  pos: SpritePoint;
  /** Unit vector away from the body centre — where the Greek letter goes. */
  out: SpritePoint;
  state: "risen" | "rising" | "below";
}

export function StarchartSpinScene(props: Readonly<SpinSceneProps>) {
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
    afterlife,
  } = props;

  const sky =
    afterlife === "darkForce" || afterlife === "dark10"
      ? DARK_FOREST
      : STARCLAN;

  const slots = useBoardRows(paramRows);
  const layers = useLayerSummary(layerRows);
  const risen = revealedCount(slots);

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

  // Stars sit on the cat's features. While the pose is flipping (sprite step)
  // or the new pose's anchors are still loading, keep the last settled sky.
  const spriteRolling = activeParamId === "sprite";
  const fresh =
    anchors && anchors.pose === poseName && anchors.reverse === reverse
      ? anchors
      : null;
  const [settled, setSettled] = useState<SpriteAnchors | null>(fresh);
  useEffect(() => {
    if (fresh && !spriteRolling) setSettled(fresh);
  }, [fresh, spriteRolling]);
  const shown = !spriteRolling && fresh ? fresh : settled;
  const poseKey = shown ? `${shown.pose}-${shown.reverse}` : "none";

  const stars = useMemo<Star[] | null>(() => {
    if (!shown) return null;
    const pts = scaleAnchors(shown, PX_PER_UNIT, { x: CAT.left, y: CAT.top });
    const centre = pts.pelt;
    const flip = shown.reverse ? -1 : 1;
    const positions = separateStars(
      slots.map((slot) => {
        const id = slot.def.id;
        const base = pts[anchorForParam(id)];
        const j = starJitter(id);
        return {
          x: base.x + j.x * flip * PX_PER_UNIT,
          y: base.y + j.y * PX_PER_UNIT,
        };
      }),
    );
    return slots.map((slot, index) => {
      const id = slot.def.id;
      const pos = positions[index];
      const dx = pos.x - centre.x;
      const dy = pos.y - centre.y;
      const len = Math.hypot(dx, dy);
      const out = len > 4 ? { x: dx / len, y: dy / len } : { x: 0.6, y: -0.8 };
      const rising = slot.status === "active" || id === activeParamId;
      return {
        slot,
        index,
        pos,
        out,
        state: rising
          ? "rising"
          : slot.status === "revealed"
            ? "risen"
            : "below",
      };
    });
  }, [shown, slots, activeParamId]);

  const risenStars = stars?.filter((s) => s.state === "risen") ?? [];
  const risingStar = stars?.find((s) => s.state === "rising") ?? null;
  const belowStars = stars?.filter((s) => s.state === "below") ?? [];
  const lastRisen = risenStars[risenStars.length - 1] ?? null;
  const nextChain = [
    ...(risingStar ? [risingStar] : lastRisen ? [lastRisen] : []),
    ...belowStars,
  ];

  // Landings: a meteor streaks in and bursts when a trait rises. Stars that
  // were already risen when the scene mounted (overlay reload) don't replay.
  const risenKey = risenStars.map((s) => s.slot.def.id).join(",");
  const seenRef = useRef<Set<string> | null>(null);
  const [landings, setLandings] = useState<Record<string, number>>({});
  useEffect(() => {
    const ids = risenKey ? risenKey.split(",") : [];
    if (seenRef.current === null) {
      seenRef.current = new Set(ids);
      return;
    }
    const seen = seenRef.current;
    const fresh = ids.filter((id) => !seen.has(id));
    for (const id of ids) seen.add(id);
    if (fresh.length === 0) return;
    const at = Date.now();
    setLandings((prev) => {
      const next = { ...prev };
      for (const id of fresh) next[id] = at;
      return next;
    });
    setTimeout(() => {
      setLandings((prev) => {
        const next = { ...prev };
        for (const id of fresh) if (next[id] === at) delete next[id];
        return next;
      });
    }, 1800);
  }, [risenKey]);

  // Finale: plays once each time the chart completes.
  const [finaleAt, setFinaleAt] = useState<number | null>(null);
  useEffect(() => {
    setFinaleAt(spinDone ? Date.now() : null);
  }, [spinDone]);

  const header = (() => {
    const bySlot = new Map(slots.map((s) => [s.def.id, s]));
    const colour = bySlot.get("colour");
    const pelt = bySlot.get("pelt");
    const parts: string[] = [];
    if (colour?.status === "revealed" && colour.row && !colour.isNone)
      parts.push(colour.row.value);
    if (pelt?.status === "revealed" && pelt.row && !pelt.isNone)
      parts.push(pelt.row.value.toLowerCase());
    const name = parts.length ? parts.join(" ") : "uncharted";
    return `StarClan chart${spinSeq != null ? ` ${spinSeq}` : ""} · ${truncateValue(name, 30)}`;
  })();

  const status = spinDone
    ? "Chart complete"
    : rollingLabel
      ? `Rising · ${rollingLabel}`
      : risen > 0
        ? "Rising"
        : "Awaiting moonrise";

  const mono: CSSProperties = {
    fontFamily: "var(--obs-font-mono)",
    textTransform: "uppercase",
  };
  const lineWidth = spinDone ? 1.1 : 1.5;
  const lineOpacity = spinDone ? 0.45 : 0.75;

  return (
    <SceneFade spinVisible={spinVisible}>
      <style>{`
        @keyframes obs-starchart-dash { to { stroke-dashoffset: -40; } }
        @keyframes obs-starchart-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.35); opacity: 0.55; } }
        @keyframes obs-starchart-flare { 0% { transform: scale(2.6); opacity: 0; } 40% { opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes obs-starchart-twinkle { 0%, 100% { transform: scale(1); } 45% { transform: scale(2.3); filter: brightness(1.8); } }
        @keyframes obs-starchart-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        @keyframes obs-starchart-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        @keyframes obs-starchart-blink { 50% { opacity: 0; } }
        @keyframes obs-starchart-meteor { 0% { transform: translate(0, 0); opacity: 0; } 12% { opacity: 1; } 88% { opacity: 1; } 100% { transform: translate(var(--mdx), var(--mdy)); opacity: 0; } }
        @keyframes obs-starchart-ring { from { transform: scale(0.2); opacity: 1; } to { transform: scale(7); opacity: 0; } }
        @keyframes obs-starchart-spark { 0% { transform: scale(0) rotate(0deg); opacity: 0; } 35% { opacity: 1; } 100% { transform: scale(1.7) rotate(45deg); opacity: 0; } }
        @keyframes obs-starchart-ripple { from { transform: scale(1); opacity: 0.9; } to { transform: scale(4.5); opacity: 0; } }
        @keyframes obs-starchart-glint { 0%, 100% { opacity: 0.25; transform: scale(1); } 50% { opacity: 0.85; transform: scale(1.7); } }
        @keyframes obs-starchart-drift { from { transform: translate(0, 0); } to { transform: translate(18px, -11px); } }
        @keyframes obs-starchart-moonrise { from { transform: translateY(260px) scale(0.75); opacity: 0; } 60% { opacity: 1; } to { transform: translateY(0) scale(1); opacity: 0.85; } }
        @keyframes obs-starchart-glowline { 0% { opacity: 0; } 30% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes obs-starchart-reveal { 0% { filter: brightness(2.6) saturate(1.4) drop-shadow(0 0 48px rgba(242, 210, 122, 0.95)); } 100% { filter: brightness(1) saturate(1) drop-shadow(0 0 0 rgba(242, 210, 122, 0)); } }
        @keyframes obs-starchart-ambient { 0%, 100% { transform: translate(0, 0); opacity: 0; } 2% { opacity: 0.6; } 9% { transform: translate(var(--mdx), var(--mdy)); opacity: 0; } 9.1% { transform: translate(0, 0); } }
        @media (prefers-reduced-motion: reduce) {
          [data-obs-starchart] * { animation: none !important; }
        }
      `}</style>
      <div data-obs-starchart className="absolute inset-0">
        {/* Sky panel + header */}
        <div
          className="absolute"
          style={{
            left: SKY.left,
            top: SKY.top,
            width: SKY.width,
            height: SKY.height,
            background: sky.night,
            border: `1.5px solid ${sky.grid}`,
            color: sky.ink,
            transition: "background 1.2s ease, border-color 1.2s ease",
          }}
        >
          <div
            className="absolute flex items-baseline justify-between"
            style={{
              left: 27,
              right: 27,
              top: 19,
              paddingBottom: 10,
              borderBottom: `1.5px solid ${sky.ink}4d`,
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
                color: sky.dim,
                whiteSpace: "nowrap",
              }}
            >
              Moonhigh · {risen} of {slots.length} risen
            </span>
          </div>
        </div>

        {/* Moonrise: a soft glow climbs up behind the cat when the chart completes. */}
        {finaleAt !== null && (
          <div
            key={finaleAt}
            className="pointer-events-none absolute"
            style={{
              left: CAT.left + CAT.size / 2 - 470,
              top: CAT.top + CAT.size / 2 - 470,
              width: 940,
              height: 940,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${sky.gold}55 0%, ${sky.gold}22 28%, transparent 62%)`,
              animation: "obs-starchart-moonrise 2.6s ease-out both",
            }}
          />
        )}

        {/* The cat — always mounted; faint until the constellation completes. */}
        <div
          className="absolute"
          style={{
            left: CAT.left,
            top: CAT.top,
            width: CAT.size,
            opacity: spinDone ? 1 : 0.42,
            filter: spinDone ? "none" : "saturate(0.6) brightness(0.95)",
            transition: "opacity 1.4s ease, filter 1.4s ease",
            animation:
              finaleAt !== null
                ? "obs-starchart-reveal 1.8s ease-out both"
                : undefined,
          }}
        >
          <CatCanvas canvasRef={canvasRef} cssSize={CAT.size} />
        </div>

        {/* Chart: grid, background stars, constellation */}
        <svg
          aria-hidden
          className="absolute"
          width={1920}
          height={1080}
          viewBox="0 0 1920 1080"
          style={{ left: 0, top: 0, pointerEvents: "none" }}
        >
          <defs>
            <filter
              id="obs-sc-glow"
              x="-200%"
              y="-200%"
              width="500%"
              height="500%"
            >
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient
              id="obs-sc-trail"
              gradientUnits="userSpaceOnUse"
              x1="-160"
              y1="0"
              x2="0"
              y2="0"
            >
              <stop offset="0" stopColor="currentColor" stopOpacity="0" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0.9" />
            </linearGradient>
          </defs>
          {/* The sky turns, very slowly. */}
          <g
            style={{
              animation:
                "obs-starchart-drift 90s ease-in-out infinite alternate",
            }}
          >
            <g stroke={sky.grid} strokeWidth={1} fill="none">
              {STARCHART_GRID_PATHS.map((d) => (
                <path key={d} d={d} />
              ))}
            </g>
            {/* Real sky: Leo, Leo Minor and Lynx at their true positions. */}
            <g
              stroke={sky.ink}
              strokeWidth={1}
              strokeOpacity={0.22}
              fill="none"
            >
              {STARCHART_REAL_LINES.map(([con, a, b]) => {
                const from = REAL_STAR_BY_KEY.get(`${con}:${a}`);
                const to = REAL_STAR_BY_KEY.get(`${con}:${b}`);
                if (!from || !to) return null;
                return (
                  <line
                    key={`${con}-${a}-${b}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                  />
                );
              })}
            </g>
            <g fill={sky.ink}>
              {REAL_STARS.map((star) => (
                <circle
                  key={`${star.con}:${star.id}`}
                  cx={star.x}
                  cy={star.y}
                  r={magnitudeRadius(star.mag)}
                  opacity={star.mag < 2.5 ? 0.55 : 0.38}
                />
              ))}
            </g>
            <g
              fill={sky.dim}
              style={{
                fontFamily: "var(--obs-font-serif)",
                fontStyle: "italic",
                fontSize: 14,
              }}
              opacity={0.75}
            >
              {REAL_STARS.filter((star) => star.name).map((star) => (
                <text
                  key={`n-${star.con}:${star.id}`}
                  x={star.x + 8}
                  y={star.y - 6}
                >
                  {star.name}
                </text>
              ))}
              {CONSTELLATION_LABELS.map((label) => (
                <text
                  key={label.con}
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  style={{ fontSize: 20, letterSpacing: "0.18em" }}
                  opacity={0.7}
                >
                  {label.text}
                </text>
              ))}
            </g>
            <g fill="#fff">
              {STARCHART_BG_STARS.map(([cx, cy, r], i) => (
                <circle
                  key={`${cx}-${cy}`}
                  cx={cx}
                  cy={cy}
                  r={r}
                  style={{
                    transformBox: "fill-box",
                    transformOrigin: "center",
                    animation: `obs-starchart-glint ${3.2 + (i % 5) * 0.7}s ease-in-out ${(i * 0.37) % 3}s infinite`,
                  }}
                />
              ))}
            </g>
          </g>
          {/* Faint meteors drift through now and then. */}
          {STARCHART_AMBIENT_METEORS.map(([x, y, dx, dy, period, delay], i) => (
            <g
              // biome-ignore lint/suspicious/noArrayIndexKey: static table
              key={i}
              style={{ transform: `translate(${x}px, ${y}px)` }}
            >
              <g
                style={
                  {
                    "--mdx": `${dx}px`,
                    "--mdy": `${dy}px`,
                    animation: `obs-starchart-ambient ${period}s linear ${delay}s infinite`,
                  } as CSSProperties
                }
              >
                <g
                  style={{
                    transform: `rotate(${(Math.atan2(dy, dx) * 180) / Math.PI}deg)`,
                    color: sky.ink,
                  }}
                >
                  <line
                    x1={-90}
                    y1={0}
                    x2={0}
                    y2={0}
                    stroke="url(#obs-sc-trail)"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                  />
                  <circle r={1.8} fill={sky.ink} />
                </g>
              </g>
            </g>
          ))}

          {stars && (
            <g key={poseKey}>
              {/* Upcoming route, faint dotted */}
              {nextChain.length > 1 && (
                <polyline
                  points={nextChain
                    .map((s) => `${s.pos.x},${s.pos.y}`)
                    .join(" ")}
                  fill="none"
                  stroke={sky.dim}
                  strokeWidth={1.5}
                  strokeOpacity={0.6}
                  strokeDasharray="3 10"
                />
              )}
              {/* Risen segments in reveal order, each drawing in as it lands */}
              {risenStars.slice(1).map((s, i) => {
                const from = risenStars[i].pos;
                return (
                  <line
                    key={`seg-${s.slot.def.id}`}
                    x1={from.x}
                    y1={from.y}
                    x2={s.pos.x}
                    y2={s.pos.y}
                    pathLength={1}
                    strokeDasharray="1"
                    stroke={sky.ink}
                    strokeWidth={lineWidth}
                    strokeOpacity={lineOpacity}
                    style={{
                      animation: "obs-starchart-draw 700ms ease-out both",
                      transition:
                        "stroke-opacity 1.2s ease, stroke-width 1.2s ease",
                    }}
                  />
                );
              })}
              {/* Live segment to the rising star */}
              {risingStar && lastRisen && (
                <line
                  x1={lastRisen.pos.x}
                  y1={lastRisen.pos.y}
                  x2={risingStar.pos.x}
                  y2={risingStar.pos.y}
                  stroke={CYAN}
                  strokeWidth={1.5}
                  strokeDasharray="8 8"
                  style={{
                    animation: "obs-starchart-dash 1.2s linear infinite",
                  }}
                />
              )}
              {/* Finale: the whole constellation flares gold, then settles. */}
              {finaleAt !== null && risenStars.length > 1 && (
                <polyline
                  key={`glow-${finaleAt}`}
                  points={risenStars
                    .map((s) => `${s.pos.x},${s.pos.y}`)
                    .join(" ")}
                  fill="none"
                  stroke={sky.gold}
                  strokeWidth={3}
                  strokeLinejoin="round"
                  filter="url(#obs-sc-glow)"
                  style={{
                    animation: "obs-starchart-glowline 2.6s ease-out both",
                  }}
                />
              )}
              {stars.map((s) => (
                <StarMark
                  key={s.slot.def.id}
                  star={s}
                  sky={sky}
                  done={spinDone}
                />
              ))}
              {/* A meteor streaks in and bursts where each new star rises. */}
              {stars
                .filter((s) => landings[s.slot.def.id] !== undefined)
                .map((s) => (
                  <Meteor
                    key={`land-${s.slot.def.id}-${landings[s.slot.def.id]}`}
                    from={{
                      x: Math.min(s.pos.x + 380, 1210),
                      y: Math.max(s.pos.y - 300, 70),
                    }}
                    to={s.pos}
                    color={sky.gold}
                  />
                ))}
              {/* Finale volley across the sky. */}
              {finaleAt !== null &&
                STARCHART_FINALE_METEORS.map(([x1, y1, x2, y2, delay], i) => (
                  <Meteor
                    // biome-ignore lint/suspicious/noArrayIndexKey: static table
                    key={`finale-${finaleAt}-${i}`}
                    from={{ x: x1, y: y1 }}
                    to={{ x: x2, y: y2 }}
                    color={sky.gold}
                    delay={delay}
                    duration={950}
                    size={1.5}
                    burst={false}
                  />
                ))}
            </g>
          )}
        </svg>

        {/* Star catalogue */}
        <div
          className="absolute"
          style={{ left: TABLE.left, top: TABLE.top, width: TABLE.width }}
        >
          {slots.map((slot, i) => (
            <CatalogueRow
              key={slot.def.id}
              index={i}
              slot={slot}
              rising={slot.status === "active" || slot.def.id === activeParamId}
              sky={sky}
            />
          ))}
        </div>

        {/* Attendants (layer summary) */}
        <div
          className="absolute flex"
          style={{
            left: TABLE.left,
            top: ATTENDANTS_TOP,
            gap: 36,
            color: sky.ink,
          }}
        >
          {layers.map((group) => (
            <AttendantColumn
              key={group.key}
              group={group}
              rising={group === activeLayer && !activeSlot && !spinDone}
              sky={sky}
              mono={mono}
            />
          ))}
        </div>

        {/* Sky furniture: compass, QR, status */}
        <div
          className="pointer-events-none absolute"
          style={{
            left: SKY.left,
            top: SKY.top,
            width: SKY.width,
            height: SKY.height,
          }}
        >
          <div
            className="absolute flex items-center"
            style={{
              ...mono,
              textTransform: "none",
              left: 27,
              bottom: 21,
              gap: 11,
              fontSize: 15,
              letterSpacing: "0.2em",
              color: sky.dim,
            }}
          >
            <svg width={38} height={38} viewBox="0 0 38 38" aria-hidden>
              <circle
                cx={19}
                cy={19}
                r={18}
                fill="none"
                stroke={sky.dim}
                strokeWidth={1.5}
              />
              <path d="M19 3V35M3 19H35" stroke={sky.dim} strokeWidth={1.5} />
            </svg>
            N · up
          </div>

          {spinDone && viewUrl && (
            <div
              className="absolute"
              style={{
                right: 27,
                bottom: 52,
                background: "#fff",
                padding: 8,
                animation: "obs-starchart-in 400ms ease-out both",
              }}
            >
              <QRCodeSVG
                value={viewUrl}
                size={QR_SIZE}
                bgColor="#ffffff"
                fgColor={sky.qrInk}
                level="M"
              />
              <small
                className="block text-center"
                style={{
                  ...mono,
                  color: sky.qrInk,
                  fontSize: 12,
                  letterSpacing: "0.2em",
                  marginTop: 4,
                }}
              >
                Chart
              </small>
            </div>
          )}

          <div
            className="absolute"
            style={{
              ...mono,
              right: 27,
              bottom: 19,
              fontSize: 16,
              letterSpacing: "0.2em",
              color: rollingLabel && !spinDone ? CYAN : sky.dim,
              whiteSpace: "nowrap",
            }}
          >
            <span
              style={{
                animation: spinDone
                  ? undefined
                  : "obs-starchart-blink 1.4s steps(1) infinite",
              }}
            >
              ●
            </span>{" "}
            {truncateValue(status, 30)}
          </div>
        </div>
      </div>

      <WheelLayer
        theme={props.theme}
        wheelRef={wheelRef}
        wheelReward={wheelReward}
        wheelBannerVisible={wheelBannerVisible}
        wheel={{
          left: CAT.left,
          top: CAT.top,
          width: CAT.size,
          height: CAT.size,
        }}
        banner={{
          left: CAT.left,
          top: CAT.top + CAT.size - 140,
          width: CAT.size,
        }}
      />
      <LoadingBadge show={initializing} />
    </SceneFade>
  );
}

function StarMark({
  star,
  sky,
  done,
}: Readonly<{ star: Star; sky: SkyPalette; done: boolean }>) {
  const { pos, out, state, slot, index } = star;
  const r = starRadius(slot.def.id) * (slot.isNone ? 0.7 : 1);
  const letterColor =
    state === "rising" ? CYAN : state === "below" ? sky.dim : sky.gold;
  let animation: string | undefined;
  if (state === "rising") {
    animation = "obs-starchart-pulse 1.4s ease-in-out infinite";
  } else if (state === "risen" && done) {
    animation = `obs-starchart-twinkle 1.3s ease-in-out ${400 + index * 130}ms 1 both`;
  } else if (state === "risen") {
    animation = "obs-starchart-flare 700ms ease-out both";
  }
  return (
    <g
      style={{
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        transition: "transform 700ms ease",
      }}
    >
      {state === "rising" &&
        [0, 900].map((delay) => (
          <circle
            key={delay}
            r={9}
            fill="none"
            stroke={CYAN}
            strokeWidth={1.5}
            style={{
              transformBox: "fill-box",
              transformOrigin: "center",
              animation: `obs-starchart-ripple 1.8s ease-out ${delay}ms infinite`,
            }}
          />
        ))}
      <circle
        key={`${state}-${done}`}
        r={state === "rising" ? 9 : r}
        fill={state === "risen" ? sky.gold : state === "rising" ? CYAN : "none"}
        fillOpacity={state === "risen" && slot.isNone ? 0.55 : 1}
        stroke={state === "below" ? sky.dim : sky.qrInk}
        strokeOpacity={state === "below" ? 1 : 0.7}
        strokeWidth={state === "below" ? 1.5 : 2}
        style={{
          transformBox: "fill-box",
          transformOrigin: "center",
          animation,
        }}
      />
      <text
        x={out.x * 22}
        y={out.y * 22 + 9}
        textAnchor="middle"
        fill={letterColor}
        stroke={sky.qrInk}
        strokeOpacity={0.75}
        strokeWidth={4}
        strokeLinejoin="round"
        paintOrder="stroke"
        style={{
          fontFamily: "var(--obs-font-serif)",
          fontStyle: "italic",
          fontSize: 26,
        }}
      >
        {bayerLetter(index)}
      </text>
    </g>
  );
}

/**
 * A shooting star: a glowing head with a fading trail flies from `from` to
 * `to`, then (optionally) bursts into a ring and a four-point spark.
 */
function Meteor({
  from,
  to,
  color,
  delay = 0,
  duration = 650,
  size = 1,
  burst = true,
}: Readonly<{
  from: SpritePoint;
  to: SpritePoint;
  color: string;
  delay?: number;
  duration?: number;
  size?: number;
  burst?: boolean;
}>) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const arrive = delay + duration;
  return (
    <g style={{ transform: `translate(${from.x}px, ${from.y}px)` }}>
      <g
        style={
          {
            "--mdx": `${dx}px`,
            "--mdy": `${dy}px`,
            animation: `obs-starchart-meteor ${duration}ms cubic-bezier(0.2, 0.7, 0.3, 1) ${delay}ms both`,
          } as CSSProperties
        }
      >
        <g style={{ transform: `rotate(${angle}deg) scale(${size})`, color }}>
          <line
            x1={-160}
            y1={0}
            x2={0}
            y2={0}
            stroke="url(#obs-sc-trail)"
            strokeWidth={3}
            strokeLinecap="round"
          />
          <circle r={4.5} fill={color} filter="url(#obs-sc-glow)" />
        </g>
      </g>
      {burst && (
        <g style={{ transform: `translate(${dx}px, ${dy}px)` }}>
          <circle
            r={6}
            fill="none"
            stroke={color}
            strokeWidth={2}
            style={{
              transformBox: "fill-box",
              transformOrigin: "center",
              animation: `obs-starchart-ring 800ms ease-out ${arrive}ms both`,
            }}
          />
          <path
            d="M0,-28 L0,28 M-28,0 L28,0"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            filter="url(#obs-sc-glow)"
            style={{
              transformBox: "fill-box",
              transformOrigin: "center",
              animation: `obs-starchart-spark 650ms ease-out ${arrive}ms both`,
            }}
          />
        </g>
      )}
    </g>
  );
}

function CatalogueRow({
  index,
  slot,
  rising,
  sky,
}: Readonly<{
  index: number;
  slot: BoardSlot;
  rising: boolean;
  sky: SkyPalette;
}>) {
  const below = !rising && slot.status !== "revealed";
  const soft = below || slot.isNone;
  let value: string;
  if (rising) value = "rising";
  else if (below) value = "below horizon";
  else value = truncateValue(slot.row?.value ?? "", 20);
  return (
    <div
      className="grid items-baseline"
      style={{
        gridTemplateColumns: "31px 1fr auto",
        gap: 10,
        height: TABLE.rowHeight,
        paddingTop: 8,
        borderBottom: `1.2px solid ${sky.ink}29`,
        fontSize: 19,
        color: sky.ink,
      }}
    >
      <i
        style={{
          fontFamily: "var(--obs-font-serif)",
          fontStyle: "italic",
          fontSize: 21,
          color: rising ? CYAN : below ? sky.dim : sky.gold,
        }}
      >
        {bayerLetter(index)}
      </i>
      <span
        style={{
          fontFamily: "var(--obs-font-serif)",
          fontStyle: "italic",
          color: rising ? CYAN : sky.dim,
          whiteSpace: "nowrap",
        }}
      >
        {sentenceCase(slot.def.label)}
      </span>
      <b
        key={`${slot.status}-${rising}`}
        style={{
          fontWeight: soft ? 400 : 600,
          fontFamily: below ? "var(--obs-font-serif)" : undefined,
          fontStyle: below ? "italic" : undefined,
          color: rising ? CYAN : soft ? sky.dim : undefined,
          whiteSpace: "nowrap",
          animation:
            slot.status === "revealed"
              ? "obs-starchart-in 360ms ease-out both"
              : undefined,
        }}
      >
        {value}
      </b>
    </div>
  );
}

function AttendantColumn({
  group,
  rising,
  sky,
  mono,
}: Readonly<{
  group: LayerSummaryGroup;
  rising: boolean;
  sky: SkyPalette;
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
  const softStyle: CSSProperties = {
    ...valueStyle,
    fontWeight: 400,
    color: sky.dim,
  };
  let body: ReactNode;
  if (rising) {
    body = <b style={{ ...valueStyle, color: CYAN }}>rising</b>;
  } else if (shown.length > 0) {
    body = (
      <>
        {shown.map((v, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: values can repeat
          <b key={`${v}-${i}`} style={valueStyle}>
            {truncateValue(v, 12)}
          </b>
        ))}
        {more > 0 && <b style={softStyle}>+{more} more</b>}
      </>
    );
  } else {
    body = <b style={softStyle}>{anyRevealed ? "none" : "—"}</b>;
  }
  return (
    <div style={{ maxWidth: 150 }}>
      <small
        className="block"
        style={{
          ...mono,
          fontSize: 14,
          letterSpacing: "0.2em",
          color: rising ? CYAN : sky.dim,
          marginBottom: 4,
        }}
      >
        {layerLabel(group)}
      </small>
      {body}
    </div>
  );
}
