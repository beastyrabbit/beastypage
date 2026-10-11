"use client";

import type { CSSProperties, ReactNode } from "react";
import { LOOK_FONT_DISPLAY, LOOK_FONT_MONO } from "../fonts";
import { LOOK_KEYFRAMES, LookQr } from "../shared";

export const MAP_INK = "#3b2f22";
export const MAP_PAPER = "#e6d6b4";
export const MAP_MUTED = "#6a5a44";
export const MAP_RED = "#9a3a2b";

/** Aged parchment with the double ink border. */
export function Parchment({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div
      data-look="territory"
      style={{
        position: "relative",
        width: 1280,
        height: 1080,
        overflow: "hidden",
        fontFamily: LOOK_FONT_DISPLAY,
        color: MAP_INK,
        background: `radial-gradient(ellipse at 50% 50%, rgba(255,255,255,.18), transparent 60%),
          radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(90,60,30,.35) 100%),
          repeating-linear-gradient(97deg, rgba(0,0,0,.02) 0 3px, transparent 3px 7px),
          ${MAP_PAPER}`,
      }}
    >
      <style>{LOOK_KEYFRAMES}</style>
      <svg
        viewBox="0 0 1280 1080"
        width={1280}
        height={1080}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        aria-hidden="true"
      >
        <rect
          x="22"
          y="22"
          width="1236"
          height="1036"
          fill="none"
          stroke={MAP_INK}
          strokeWidth="2"
        />
        <rect
          x="30"
          y="30"
          width="1220"
          height="1020"
          fill="none"
          stroke={MAP_INK}
          strokeWidth=".8"
        />
      </svg>
      {children}
    </div>
  );
}

const BOX: CSSProperties = {
  position: "absolute",
  border: `2px solid ${MAP_INK}`,
  boxShadow: `inset 0 0 0 4px ${MAP_PAPER}, inset 0 0 0 5px ${MAP_INK}`,
  background: "rgba(230,214,180,.9)",
};

/** Title box in the corner. */
export function Cartouche({
  title,
  subtitle,
  code,
  style,
}: Readonly<{
  title: string;
  subtitle: ReactNode;
  code: ReactNode;
  style?: CSSProperties;
}>) {
  return (
    <div
      style={{
        ...BOX,
        left: 44,
        top: 40,
        width: 470,
        padding: "16px 20px 14px",
        ...style,
      }}
    >
      <h1
        style={{
          fontSize: 38,
          fontWeight: 700,
          fontVariant: "small-caps",
          letterSpacing: ".06em",
          lineHeight: 1,
          margin: 0,
        }}
      >
        {title}
      </h1>
      <p
        style={{
          fontStyle: "italic",
          fontSize: 20,
          margin: "6px 0 0",
          color: "#5a4a36",
        }}
      >
        {subtitle}
      </p>
      <div
        style={{
          fontFamily: LOOK_FONT_MONO,
          fontSize: 10,
          letterSpacing: ".26em",
          marginTop: 8,
          color: MAP_MUTED,
          textTransform: "uppercase",
        }}
      >
        {code}
      </div>
    </div>
  );
}

/** Map key with the QR, bottom-right. */
export function MapKey({
  url,
  line,
  children,
  width = 300,
}: Readonly<{
  url: string;
  line: string;
  children?: ReactNode;
  width?: number;
}>) {
  const qr = Math.round(width * 0.35);
  return (
    <div
      style={{
        ...BOX,
        right: 44,
        bottom: 36,
        width,
        padding: "12px 14px",
        display: "grid",
        gridTemplateColumns: `${qr}px 1fr`,
        gap: 12,
        alignItems: "center",
        animation: "look-pop 500ms ease both",
      }}
    >
      <LookQr url={url} size={qr} fg="#2a2016" />
      <div style={{ fontSize: 15, lineHeight: 1.3 }}>
        <b
          style={{
            display: "block",
            fontVariant: "small-caps",
            letterSpacing: ".2em",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          Map key · scan
        </b>
        <i style={{ color: MAP_MUTED }}>{line}</i>
        {children}
      </div>
    </div>
  );
}

export function MapBox({
  style,
  children,
}: Readonly<{ style: CSSProperties; children: ReactNode }>) {
  return <div style={{ ...BOX, ...style }}>{children}</div>;
}

export function Compass({
  left,
  top,
  size = 110,
}: Readonly<{ left?: number; top: number; size?: number }>) {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      style={{
        position: "absolute",
        left,
        right: left === undefined ? 56 : undefined,
        top,
      }}
      fill="none"
      stroke={MAP_INK}
      aria-hidden="true"
    >
      <circle cx="60" cy="60" r="52" strokeWidth="1.5" />
      <circle cx="60" cy="60" r="40" strokeWidth=".8" />
      <path d="M60 10 L68 60 L60 110 L52 60 Z" fill={MAP_INK} stroke="none" />
      <path
        d="M10 60 L60 52 L110 60 L60 68 Z"
        fill={MAP_PAPER}
        stroke={MAP_INK}
        strokeWidth="1.2"
      />
      <text
        x="60"
        y="8"
        textAnchor="middle"
        fontFamily="IBM Plex Mono, monospace"
        fontSize="11"
        fill={MAP_INK}
        stroke="none"
      >
        N
      </text>
    </svg>
  );
}

export function ScaleBar() {
  return (
    <div
      style={{
        position: "absolute",
        left: 52,
        bottom: 48,
        font: `11px ${LOOK_FONT_MONO}`,
        letterSpacing: ".22em",
        color: MAP_INK,
      }}
    >
      {"0"}
      <i
        style={{
          display: "inline-block",
          width: 220,
          height: 7,
          border: `1.5px solid ${MAP_INK}`,
          verticalAlign: "middle",
          margin: "0 8px",
          background: `repeating-linear-gradient(90deg,${MAP_INK} 0 55px,transparent 55px 110px)`,
        }}
      />
      {"50 fox-lengths"}
    </div>
  );
}

/** Ink tree symbols, as SVG <g> content to <use>. */
export function TreeDefs() {
  return (
    <defs>
      <g id="map-tree">
        <circle r="9" fill="none" stroke={MAP_INK} strokeWidth="1.6" />
        <circle
          r="5"
          cx="-5"
          cy="-4"
          fill="none"
          stroke={MAP_INK}
          strokeWidth="1.2"
        />
        <circle
          r="5"
          cx="5"
          cy="-3"
          fill="none"
          stroke={MAP_INK}
          strokeWidth="1.2"
        />
        <path d="M0 9 v7" stroke={MAP_INK} strokeWidth="1.6" />
      </g>
      <g id="map-oak">
        <circle r="46" fill="none" stroke={MAP_INK} strokeWidth="2" />
        <circle
          r="30"
          cx="-26"
          cy="-18"
          fill="none"
          stroke={MAP_INK}
          strokeWidth="1.4"
        />
        <circle
          r="30"
          cx="26"
          cy="-16"
          fill="none"
          stroke={MAP_INK}
          strokeWidth="1.4"
        />
        <circle
          r="24"
          cx="0"
          cy="-40"
          fill="none"
          stroke={MAP_INK}
          strokeWidth="1.2"
        />
        <path d="M0 46 v26 M-10 72 h20" stroke={MAP_INK} strokeWidth="3" />
      </g>
      <g id="map-paw">
        <circle r="3.2" fill={MAP_INK} />
        <circle r="1.4" cx="-3.5" cy="-4" fill={MAP_INK} />
        <circle r="1.4" cx="0" cy="-5.2" fill={MAP_INK} />
        <circle r="1.4" cx="3.5" cy="-4" fill={MAP_INK} />
      </g>
    </defs>
  );
}

/** A cat on the map with its label plank beneath. */
export function MapCat({
  x,
  y,
  size,
  children,
  label,
  sub,
  accent,
  style,
  labelStyle,
}: Readonly<{
  x: number;
  y: number;
  size: number;
  children: ReactNode;
  label: ReactNode;
  sub?: ReactNode;
  accent?: string;
  style?: CSSProperties;
  labelStyle?: CSSProperties;
}>) {
  return (
    <div
      style={{
        position: "absolute",
        left: Math.round(x - size / 2),
        top: Math.round(y - size / 2),
        width: size,
        textAlign: "center",
        // Cats glide to their new seat when the ring re-spaces after a cull.
        transition:
          "left 700ms cubic-bezier(.3,0,.2,1), top 700ms cubic-bezier(.3,0,.2,1)",
        animation: "look-pop 500ms ease both",
        ...style,
      }}
    >
      <div
        style={{
          filter:
            "drop-shadow(0 4px 0 rgba(59,47,34,.18)) drop-shadow(0 0 1px rgba(59,47,34,.6))",
        }}
      >
        {children}
      </div>
      <div
        style={{
          display: "inline-block",
          whiteSpace: "nowrap",
          marginTop: -6,
          padding: "2px 10px",
          background: "rgba(230,214,180,.9)",
          // Longhands so a plank state can swap borderColor without React
          // complaining about a shorthand/longhand mix.
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: MAP_INK,
          fontStyle: "italic",
          fontWeight: 600,
          fontSize: size > 140 ? 22 : 18,
          letterSpacing: ".01em",
          ...labelStyle,
        }}
      >
        {label}
        {sub ? (
          <small
            style={{
              display: "block",
              fontFamily: LOOK_FONT_MONO,
              fontStyle: "normal",
              fontWeight: 400,
              fontSize: 9.5,
              letterSpacing: ".22em",
              color: accent ?? MAP_MUTED,
              textTransform: "uppercase",
              marginTop: 1,
            }}
          >
            {sub}
          </small>
        ) : null}
      </div>
    </div>
  );
}
