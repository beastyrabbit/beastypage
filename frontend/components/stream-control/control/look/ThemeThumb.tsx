"use client";

import { type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";
import {
  OVERLAY_THEME_META,
  type OverlayThemeId,
  type OverlayThemeMeta,
} from "../../obs/themes/themeMeta";

/**
 * 16:9 miniature of an overlay theme, drawn as one 240×135 SVG so it scales
 * to any tile width. Every theme colour comes from OVERLAY_THEME_META (tokens
 * and palette) so the thumbs never drift from the real overlay. Only the
 * stage behind the overlay (standing in for the stream) is a local colour.
 */

const STAGE_TOP = "#1b1e25";
const STAGE_BOTTOM = "#0c0e12";

type SceneProps = { m: OverlayThemeMeta; p: string };

/** "#rrggbb" → "r g b" in 0–1, for the sRGB colour matrix. */
function hexToUnitRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.slice(0, 6);
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n)) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * The adult_short2 line-art cell (lineart.png, 50×50 at -100px -200px),
 * pixelated and recoloured to the theme ink — light on dark themes, dark on
 * paper themes.
 */
function PixelCat({
  p,
  x,
  y,
  size = 65,
  color,
  opacity,
}: Readonly<{
  p: string;
  x: number;
  y: number;
  size?: number;
  color: string;
  opacity?: number;
}>) {
  const [r, g, b] = hexToUnitRgb(color);
  const filterId = `${p}-cat`;
  return (
    <>
      <defs>
        <filter id={filterId} colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values={`0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 1 0`}
          />
        </filter>
      </defs>
      <svg
        x={x}
        y={y}
        width={size}
        height={size}
        viewBox="100 200 50 50"
        opacity={opacity}
        aria-hidden="true"
      >
        <image
          href="/sprites/lineart.png"
          width={150}
          height={450}
          filter={`url(#${filterId})`}
          style={{ imageRendering: "pixelated" }}
        />
      </svg>
    </>
  );
}

function Plate({ m, p }: SceneProps) {
  const t = m.tokens;
  const [, bone, graph, spec, olive] = m.palette;
  const rows = [30, 44, 58, 72];
  const widths = [30, 22, 34, 18];
  const leaders: Array<[number, number, number]> = [
    [40, 50, 0],
    [62, 66, 1],
    [32, 90, 2],
  ];
  return (
    <>
      <defs>
        <pattern
          id={`${p}-dots`}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="3" cy="3" r="0.5" fill={bone} opacity="0.25" />
        </pattern>
      </defs>
      <rect
        x="6"
        y="6"
        width="150"
        height="123"
        fill={t.panelBg}
        stroke={t.panelBorder}
        strokeWidth="0.6"
      />
      <rect x="6" y="6" width="150" height="123" fill={`url(#${p}-dots)`} />
      <rect x="11" y="10" width="36" height="3" fill={bone} opacity="0.85" />
      <rect x="124" y="10.5" width="27" height="2" fill={graph} />
      <line
        x1="11"
        x2="151"
        y1="16"
        y2="16"
        stroke={bone}
        strokeOpacity="0.35"
        strokeWidth="0.5"
      />
      <PixelCat p={p} x={14} y={34} color={bone} />
      {leaders.map(([x, y, row]) => (
        <g key={row}>
          <line
            x1={x}
            y1={y}
            x2="99"
            y2={rows[row] + 1.3}
            stroke={row === 1 ? spec : graph}
            strokeWidth="0.55"
          />
          <circle cx={x} cy={y} r="1.2" fill={row === 1 ? spec : bone} />
        </g>
      ))}
      {rows.map((y, i) => (
        <g key={y}>
          <text
            x="101"
            y={y + 2.6}
            fontSize="4"
            fontFamily={t.fontMono}
            fill={i === 1 ? spec : graph}
          >
            {i + 1}
          </text>
          <rect
            x="107"
            y={y}
            width={widths[i]}
            height="2.6"
            fill={i === 1 ? spec : bone}
            opacity={i === 3 ? 0.3 : 0.85}
          />
          <line
            x1="100"
            x2="151"
            y1={y + 7}
            y2={y + 7}
            stroke={bone}
            strokeOpacity="0.18"
            strokeWidth="0.4"
          />
        </g>
      ))}
      <rect x="101" y="96" width="12" height="1.6" fill={olive} />
      <rect x="101" y="100" width="20" height="2.2" fill={bone} opacity="0.7" />
      <rect x="127" y="96" width="12" height="1.6" fill={olive} />
      <rect x="127" y="100" width="15" height="2.2" fill={graph} />
      <path
        d="M11 120v2.4h18v-2.4M20 120v2.4"
        stroke={graph}
        strokeWidth="0.5"
        fill="none"
      />
      <circle cx="134" cy="122" r="1.3" fill={spec} />
      <rect x="137" y="121" width="14" height="2" fill={spec} />
    </>
  );
}

function Sampler({ m, p }: SceneProps) {
  const t = m.tokens;
  const [aida, wood, paper, red, pencil] = m.palette;
  const ink = t.ink;
  const cx = 54;
  const cy = 68;
  const rows = [28, 38, 48, 58];
  const swatches = [red, wood, ink, aida];
  const widths = [22, 27, 18, 24];
  return (
    <>
      <defs>
        <clipPath id={`${p}-hoop`}>
          <circle cx={cx} cy={cy} r="45" />
        </clipPath>
        <pattern
          id={`${p}-aida`}
          width="3"
          height="3"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M3 0V3H0"
            fill="none"
            stroke={pencil}
            strokeOpacity="0.28"
            strokeWidth="0.35"
          />
        </pattern>
      </defs>
      <circle cx={cx} cy={cy} r="47" fill={aida} filter={`url(#${p}-shadow)`} />
      <rect
        x={cx - 45}
        y={cy - 45}
        width="90"
        height="90"
        fill={`url(#${p}-aida)`}
        clipPath={`url(#${p}-hoop)`}
      />
      <PixelCat p={p} x={cx - 32.5} y={cy - 38} color={ink} />
      <rect x={cx - 15} y="99" width="30" height="2.6" fill={red} />
      <line
        x1={cx - 15}
        x2={cx + 15}
        y1="104"
        y2="104"
        stroke={red}
        strokeWidth="0.6"
        strokeDasharray="1.6 1"
      />
      <circle
        cx={cx}
        cy={cy}
        r="47"
        fill="none"
        stroke={wood}
        strokeWidth="4"
      />
      <circle
        cx={cx}
        cy={cy}
        r="45"
        fill="none"
        stroke={ink}
        strokeOpacity="0.35"
        strokeWidth="0.6"
      />
      <rect
        x={cx - 7}
        y="17"
        width="14"
        height="5"
        rx="1"
        fill={wood}
        stroke={ink}
        strokeOpacity="0.45"
        strokeWidth="0.4"
      />
      <circle cx={cx} cy="19.5" r="1.2" fill={paper} />
      <path
        d="M84 46 C 96 36, 104 44, 112 30"
        fill="none"
        stroke={red}
        strokeWidth="0.6"
      />
      <line
        x1="72"
        y1="58"
        x2="84"
        y2="46"
        stroke={pencil}
        strokeWidth="1"
        strokeLinecap="round"
      />
      <g filter={`url(#${p}-shadow)`}>
        <rect x="108" y="6" width="48" height="123" fill={paper} />
      </g>
      <rect x="112" y="11" width="28" height="3" fill={ink} opacity="0.85" />
      <rect x="112" y="17" width="34" height="1.6" fill={pencil} />
      <line
        x1="112"
        x2="152"
        y1="21.5"
        y2="21.5"
        stroke={ink}
        strokeWidth="0.4"
      />
      {rows.map((y, i) => (
        <g key={y}>
          <rect
            x="112"
            y={y}
            width="5"
            height="5"
            fill={i === 0 ? "none" : swatches[i]}
            stroke={i === 0 ? red : ink}
            strokeWidth="0.5"
            strokeDasharray={i === 0 ? "1 0.6" : undefined}
          />
          <rect
            x="120"
            y={y + 1.3}
            width={widths[i]}
            height="2.4"
            fill={i === 0 ? red : ink}
            opacity="0.85"
          />
          <line
            x1="112"
            x2="152"
            y1={y + 7.5}
            y2={y + 7.5}
            stroke={ink}
            strokeOpacity="0.4"
            strokeWidth="0.4"
            strokeDasharray="0.6 0.8"
          />
        </g>
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <rect
          // biome-ignore lint/suspicious/noArrayIndexKey: static decorative bar
          key={i}
          x={112 + i * 4.5}
          y="104"
          width="3.6"
          height="2"
          fill={i < 4 ? ink : i === 4 ? red : "none"}
          stroke={i > 4 ? pencil : undefined}
          strokeWidth="0.3"
        />
      ))}
    </>
  );
}

function Starchart({ m, p }: SceneProps) {
  const t = m.tokens;
  const [, ink, gold, cyan, grid] = m.palette;
  const dim = t.muted;
  const stars: Array<[number, number]> = [
    [28, 50],
    [46, 41],
    [64, 54],
    [60, 80],
    [38, 90],
    [74, 102],
  ];
  const greek = ["α", "β", "γ", "δ", "ε", "ζ"];
  const bgStars: Array<[number, number]> = [
    [20, 26],
    [72, 24],
    [90, 42],
    [12, 108],
    [86, 118],
    [58, 124],
    [22, 70],
    [94, 88],
    [140, 112],
  ];
  const rows = [28, 40, 52, 64];
  const widths = [28, 22, 32, 20];
  const line = stars
    .slice(0, 5)
    .map(([x, y]) => `${x},${y}`)
    .join(" ");
  return (
    <>
      <rect
        x="4"
        y="4"
        width="154"
        height="127"
        fill={t.panelBg}
        stroke={grid}
        strokeWidth="0.6"
      />
      <circle
        cx="50"
        cy="72"
        r="40"
        fill="none"
        stroke={grid}
        strokeWidth="0.5"
      />
      <circle
        cx="50"
        cy="72"
        r="24"
        fill="none"
        stroke={grid}
        strokeWidth="0.5"
      />
      {bgStars.map(([x, y]) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r="0.45"
          fill={ink}
          opacity="0.45"
        />
      ))}
      <rect x="9" y="9" width="32" height="3" fill={ink} opacity="0.85" />
      <rect x="126" y="9.5" width="27" height="2" fill={dim} />
      <line
        x1="9"
        x2="153"
        y1="15"
        y2="15"
        stroke={ink}
        strokeOpacity="0.3"
        strokeWidth="0.5"
      />
      <PixelCat p={p} x={17} y={38} color={ink} opacity={0.42} />
      <polyline
        points={line}
        fill="none"
        stroke={ink}
        strokeOpacity="0.75"
        strokeWidth="0.6"
      />
      <line
        x1={stars[4][0]}
        y1={stars[4][1]}
        x2={stars[5][0]}
        y2={stars[5][1]}
        stroke={cyan}
        strokeWidth="0.7"
        strokeDasharray="1.6 1.4"
      />
      {stars.map(([x, y], i) => (
        <g key={greek[i]}>
          <circle
            cx={x}
            cy={y}
            r={i === 5 ? 2 : 1.6}
            fill={i === 5 ? cyan : gold}
          />
          <text
            x={x + 2.6}
            y={y - 2.2}
            fontSize="5.5"
            fontFamily={t.fontSerif}
            fontStyle="italic"
            fill={i === 5 ? cyan : gold}
          >
            {greek[i]}
          </text>
        </g>
      ))}
      {rows.map((y, i) => (
        <g key={y}>
          <text
            x="101"
            y={y + 2.8}
            fontSize="5"
            fontFamily={t.fontSerif}
            fontStyle="italic"
            fill={i === 3 ? cyan : gold}
          >
            {greek[i]}
          </text>
          <rect
            x="108"
            y={y}
            width={widths[i]}
            height="2.6"
            fill={i === 3 ? cyan : ink}
            opacity="0.85"
          />
          <line
            x1="100"
            x2="153"
            y1={y + 7}
            y2={y + 7}
            stroke={ink}
            strokeOpacity="0.16"
            strokeWidth="0.4"
          />
        </g>
      ))}
      <rect x="101" y="96" width="12" height="1.6" fill={dim} />
      <rect x="101" y="100" width="20" height="2.2" fill={ink} opacity="0.7" />
      <circle
        cx="13"
        cy="122"
        r="3.5"
        fill="none"
        stroke={dim}
        strokeWidth="0.5"
      />
      <path
        d="M13 118.8v6.4M9.8 122h6.4"
        stroke={dim}
        strokeWidth="0.4"
        fill="none"
      />
      <circle cx="135" cy="122" r="1.3" fill={cyan} />
      <rect x="138" y="121" width="15" height="2" fill={cyan} />
    </>
  );
}

function Transit({ m, p }: SceneProps) {
  const t = m.tokens;
  const [coat, eyes, patch, extra, cyan] = m.palette;
  const values = [coat, eyes, patch, extra];
  const x = 112;
  const stops = [24, 42, 60, 78, 96, 114];
  const live = 3;
  const nameW = [26, 20, 30, 24, 18, 26];
  const valueW = [16, 14, 20, 12, 14, 10];
  return (
    <>
      <rect x="8" y="8" width="22" height="7" rx="1.2" fill={coat} />
      <rect x="33" y="10.5" width="26" height="2" fill={t.ink} opacity="0.8" />
      <g filter={`url(#${p}-shadow)`}>
        <PixelCat p={p} x={10} y={30} size={72} color={t.ink} />
      </g>
      <line
        x1={x}
        x2={x}
        y1={stops[0]}
        y2={stops[live - 1]}
        stroke={coat}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <line
        x1={x}
        x2={x}
        y1={stops[live - 1]}
        y2={stops[live]}
        stroke={cyan}
        strokeWidth="4"
        strokeDasharray="3 2.4"
      />
      <line
        x1={x}
        x2={x}
        y1={stops[live]}
        y2={stops[stops.length - 1]}
        stroke={t.muted}
        strokeOpacity="0.55"
        strokeWidth="4"
        strokeDasharray="0.8 4.2"
        strokeLinecap="round"
      />
      {stops.map((y, i) => {
        const next = i > live;
        return (
          <g key={y}>
            {i === live ? (
              <circle
                cx={x}
                cy={y}
                r="6"
                fill="none"
                stroke={cyan}
                strokeWidth="0.6"
                opacity="0.7"
              />
            ) : null}
            <circle
              cx={x}
              cy={y}
              r={i === 0 ? 4 : 3.2}
              fill={next ? STAGE_TOP : t.ink}
              stroke={i === live ? cyan : next ? t.muted : STAGE_BOTTOM}
              strokeWidth={i === live ? 1.8 : 1.3}
            />
            <rect
              x={x + 9}
              y={y - 3.2}
              width={nameW[i]}
              height="2.6"
              fill={next ? t.muted : t.ink}
              opacity={next ? 0.6 : 0.95}
            />
            {next ? null : (
              <rect
                x={x + 9}
                y={y + 0.8}
                width={valueW[i]}
                height="2.2"
                fill={i === live ? cyan : values[i % values.length]}
              />
            )}
          </g>
        );
      })}
    </>
  );
}

function Mixtape({ m, p }: SceneProps) {
  const t = m.tokens;
  const [card, ink, pen, tape, rec] = m.palette;
  const pencil = t.muted;
  const live = 2;
  const titleW = [18, 22, 14, 20, 16, 19, 12];
  return (
    <>
      <g transform="rotate(-1.2 50 50)">
        <g filter={`url(#${p}-shadow)`}>
          <rect x="8" y="8" width="84" height="84" fill={card} />
        </g>
        <PixelCat p={p} x={17.5} y={10} color={ink} />
        <line x1="13" x2="87" y1="77" y2="77" stroke={ink} strokeWidth="0.5" />
        <rect x="13" y="80" width="44" height="3" fill={ink} />
        <rect x="13" y="85.5" width="30" height="2" fill={pen} />
      </g>
      <rect
        x="35"
        y="4"
        width="30"
        height="7"
        fill={tape}
        opacity="0.85"
        transform="rotate(1.8 50 7.5)"
      />
      <g filter={`url(#${p}-shadow)`}>
        <rect x="99" y="6" width="58" height="123" fill={card} />
      </g>
      <line
        x1="99.5"
        x2="99.5"
        y1="6"
        y2="129"
        stroke={ink}
        strokeOpacity="0.4"
        strokeWidth="0.5"
        strokeDasharray="1.5 1.5"
      />
      <rect x="104" y="11" width="6" height="3" fill={ink} />
      <circle cx="140" cy="12.5" r="1.1" fill={rec} />
      <rect x="143" y="11.5" width="9" height="2" fill={rec} />
      <line x1="104" x2="152" y1="17" y2="17" stroke={ink} strokeWidth="0.6" />
      {titleW.map((w, i) => {
        const y = 22 + i * 9.5;
        const on = i === live;
        const colour = on ? rec : ink;
        return (
          <g key={y} opacity={i > 4 ? 0.4 : 1}>
            <rect
              x="104"
              y={y}
              width="3"
              height="2.2"
              fill={on ? rec : pencil}
            />
            <rect x="109" y={y} width={w} height="2.2" fill={colour} />
            <line
              x1={111 + w}
              x2="144"
              y1={y + 1.6}
              y2={y + 1.6}
              stroke={ink}
              strokeOpacity="0.5"
              strokeWidth="0.4"
              strokeDasharray="0.6 0.9"
            />
            <rect
              x="145.5"
              y={y}
              width="7"
              height="2.2"
              fill={on ? rec : pencil}
            />
          </g>
        );
      })}
      <line x1="104" x2="152" y1="91" y2="91" stroke={ink} strokeWidth="0.5" />
      <rect x="104" y="94" width="14" height="1.8" fill={pencil} />
      <rect x="140" y="94" width="12" height="1.8" fill={pencil} />
      <rect x="104" y="104" width="6" height="3" fill={ink} />
      <line
        x1="104"
        x2="152"
        y1="110"
        y2="110"
        stroke={ink}
        strokeWidth="0.6"
      />
      <rect x="104" y="114" width="40" height="1.8" fill={pen} />
      <rect x="104" y="118.5" width="32" height="1.8" fill={pen} />
      <rect x="8" y="101" width="40" height="26" rx="2" fill={ink} />
      <rect
        x="11"
        y="104"
        width="34"
        height="14"
        rx="1"
        fill={card}
        opacity="0.9"
      />
      <rect x="17" y="107" width="22" height="8" rx="4" fill={ink} />
      {[21.5, 34.5].map((cx) => (
        <circle
          key={cx}
          cx={cx}
          cy="111"
          r="2.6"
          fill={card}
          stroke={ink}
          strokeWidth="0.8"
          strokeDasharray="0.8 0.8"
        />
      ))}
    </>
  );
}

function Classic({ m, p }: SceneProps) {
  const t = m.tokens;
  const [black, amber, amberLight, zinc, slate] = m.palette;
  const border = `rgba(${t.accentRgb}, 0.4)`;
  const rows = [34, 51, 68, 85, 102];
  const live = 2;
  return (
    <>
      <rect
        x="8"
        y="8"
        width="86"
        height="86"
        rx="7"
        fill={black}
        fillOpacity="0.92"
        stroke={border}
        strokeWidth="0.8"
      />
      <PixelCat p={p} x={18.5} y={16} color={zinc} />
      <rect
        x="8"
        y="100"
        width="86"
        height="27"
        rx="6"
        fill={black}
        fillOpacity="0.92"
        stroke={border}
        strokeWidth="0.8"
      />
      <rect x="15" y="107" width="30" height="2.2" fill={t.muted} />
      <rect x="15" y="114" width="72" height="3" rx="1.5" fill={slate} />
      <rect x="15" y="114" width="46" height="3" rx="1.5" fill={amber} />
      <rect
        x="100"
        y="8"
        width="132"
        height="119"
        rx="7"
        fill={black}
        fillOpacity="0.92"
        stroke={border}
        strokeWidth="0.8"
      />
      <rect x="108" y="15" width="42" height="4" rx="1" fill={amberLight} />
      <rect x="108" y="22.5" width="26" height="2" fill={t.muted} />
      {rows.map((y, i) => (
        <g key={y} opacity={i > live ? 0.45 : 1}>
          <rect x="108" y={y + 3.4} width="20" height="2.2" fill={t.muted} />
          {Array.from({ length: 11 }, (_, j) => (
            <g
              // biome-ignore lint/suspicious/noArrayIndexKey: static decorative tiles
              key={j}
            >
              <rect
                x={133 + j * 8.4}
                y={y}
                width="7"
                height="9"
                rx="1"
                fill={slate}
                stroke={i === live ? amber : undefined}
                strokeWidth="0.5"
              />
              <line
                x1={133 + j * 8.4}
                x2={140 + j * 8.4}
                y1={y + 4.5}
                y2={y + 4.5}
                stroke={black}
                strokeWidth="0.4"
              />
              {j < 7 - (i % 3) ? (
                <rect
                  x={135 + j * 8.4}
                  y={y + 3.4}
                  width="3"
                  height="2.2"
                  fill={i === live ? amber : zinc}
                />
              ) : null}
            </g>
          ))}
        </g>
      ))}
    </>
  );
}

const SCENES: Record<OverlayThemeId, (props: SceneProps) => ReactNode> = {
  plate: Plate,
  sampler: Sampler,
  starchart: Starchart,
  transit: Transit,
  mixtape: Mixtape,
  classic: Classic,
};

export function ThemeThumb({
  theme,
  className,
}: Readonly<{ theme: OverlayThemeId; className?: string }>) {
  const p = `tt${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const Scene = SCENES[theme];
  return (
    <svg
      viewBox="0 0 240 135"
      className={cn("block aspect-video h-auto w-full", className)}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${p}-stage`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={STAGE_TOP} />
          <stop offset="1" stopColor={STAGE_BOTTOM} />
        </linearGradient>
        <filter id={`${p}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow
            dx="0"
            dy="2"
            stdDeviation="2.4"
            floodColor="#000"
            floodOpacity="0.55"
          />
        </filter>
      </defs>
      <rect width="240" height="135" fill={`url(#${p}-stage)`} />
      <Scene m={OVERLAY_THEME_META[theme]} p={p} />
    </svg>
  );
}
