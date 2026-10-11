"use client";

import type { CSSProperties, ReactNode } from "react";
import { LOOK_FONT_HAND, LOOK_FONT_MONO, LOOK_FONT_TYPEWRITER } from "../fonts";
import { LOOK_KEYFRAMES, LookQr, LookSprite } from "../shared";

export const CS_GREASE = "#ff5a2b";
export const CS_EDGE = "#d9d2c2";
export const CS_AMBER = "#f0b24a";
export const CS_FRAME_BG = "#1a1a1c";

/** Black light-table background with the shared keyframes. */
export function ContactSheet({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div
      data-look="contact"
      style={{
        position: "relative",
        width: 1280,
        height: 1080,
        overflow: "hidden",
        background: "radial-gradient(ellipse at 50% 40%,#1c1c20,#08080a 72%)",
        fontFamily: LOOK_FONT_MONO,
        color: "#e6dfcf",
      }}
    >
      <style>{LOOK_KEYFRAMES}</style>
      {children}
    </div>
  );
}

/** Handwritten heading + mono caption. */
export function SheetHead({
  title,
  caption,
}: Readonly<{ title: string; caption: ReactNode }>) {
  return (
    <div style={{ position: "absolute", left: 64, top: 26 }}>
      <div
        style={{
          fontFamily: LOOK_FONT_HAND,
          fontSize: 46,
          color: "#f4f0e6",
          lineHeight: 1,
          transform: "rotate(-1.5deg)",
          transformOrigin: "left",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 11,
          letterSpacing: ".3em",
          color: "#9a9385",
          marginTop: 8,
          whiteSpace: "nowrap",
        }}
      >
        {caption}
      </div>
    </div>
  );
}

/** One 35mm strip: sprocket rows, edge codes, frames absolutely positioned inside. */
export function FilmStrip({
  top,
  height,
  edge,
  edgeBottom,
  roll,
  children,
  style,
}: Readonly<{
  top: number;
  height: number;
  edge: ReactNode;
  edgeBottom?: ReactNode;
  roll: string;
  children: ReactNode;
  style?: CSSProperties;
}>) {
  const holes: CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    height: 11,
    background:
      "repeating-linear-gradient(90deg,transparent 0 10px,#d9d2c2 10px 28px,transparent 28px 42px)",
    opacity: 0.9,
  };
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        top,
        width: 1160,
        height,
        background: "#101010",
        boxShadow: "0 0 0 1px #262626, 0 8px 30px rgba(0,0,0,.6)",
        ...style,
      }}
    >
      <div style={{ ...holes, top: 6 }} />
      <div style={{ ...holes, bottom: 6 }} />
      <div
        style={{
          position: "absolute",
          left: 14,
          top: 19,
          fontSize: 9.5,
          letterSpacing: ".22em",
          color: CS_EDGE,
          opacity: 0.85,
          whiteSpace: "nowrap",
        }}
      >
        {edge}
      </div>
      {edgeBottom ? (
        <div
          style={{
            position: "absolute",
            left: 14,
            bottom: 19,
            fontSize: 9.5,
            letterSpacing: ".22em",
            color: CS_EDGE,
            opacity: 0.85,
            whiteSpace: "nowrap",
          }}
        >
          {edgeBottom}
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          right: 16,
          bottom: 19,
          fontSize: 9.5,
          letterSpacing: ".22em",
          color: CS_AMBER,
        }}
      >
        {roll}
      </div>
      {children}
    </div>
  );
}

/** Amber "▸12" frame marker on the top edge, right-aligned to a frame. */
export function FrameMarker({
  left,
  label,
}: Readonly<{ left: number; label: string }>) {
  return (
    <div
      style={{
        position: "absolute",
        left,
        top: 19,
        fontSize: 9.5,
        letterSpacing: ".22em",
        color: CS_AMBER,
        whiteSpace: "nowrap",
      }}
    >
      ▸{label}
    </div>
  );
}

function spriteAnimation(
  exposing: boolean,
  developing: boolean,
): string | undefined {
  if (exposing) return "look-flicker 0.4s steps(3) infinite";
  return developing ? "look-develop 1600ms ease both" : undefined;
}

function FrameCaption({
  text,
  color,
  maxWidth,
  blinking,
}: Readonly<{
  text: string;
  color: string;
  maxWidth: number;
  blinking: boolean;
}>) {
  return (
    <div
      style={{
        position: "absolute",
        left: 6,
        top: 4,
        fontSize: 9,
        color,
        letterSpacing: ".1em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        maxWidth,
        overflow: "hidden",
        textOverflow: "ellipsis",
        animation: blinking ? "look-blink 0.7s steps(1) infinite" : undefined,
        zIndex: 2,
      }}
    >
      {text}
    </div>
  );
}

function FrameSprite({
  url,
  alt,
  size,
  dim,
  animation,
}: Readonly<{
  url: string | null;
  alt: string;
  size: number;
  dim: boolean;
  animation: string | undefined;
}>) {
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%,-50%)",
        opacity: dim ? 0.35 : 1,
        filter: dim ? "grayscale(.7)" : undefined,
        animation,
      }}
    >
      <LookSprite url={url} alt={alt} size={size} placeholderColor="#777" />
    </div>
  );
}

/**
 * A frame on a strip. `dim` for repeated/unexposed negatives, `exposing`
 * strobes the sprite like a lightbox, `developing` plays the develop wash.
 */
export function Frame({
  left,
  width,
  height,
  cap,
  capColor,
  number,
  url,
  alt,
  sprite,
  dim,
  blank,
  exposing,
  developing,
  style,
}: Readonly<{
  left: number;
  width: number;
  height: number;
  cap?: string;
  capColor?: string;
  number: string;
  url?: string | null;
  alt?: string;
  sprite?: number;
  dim?: boolean;
  blank?: boolean;
  exposing?: boolean;
  developing?: boolean;
  style?: CSSProperties;
}>) {
  return (
    <div
      style={{
        position: "absolute",
        top: 33,
        left,
        width,
        height,
        background: blank ? "#060606" : CS_FRAME_BG,
        border: "1px solid #2b2b2b",
        overflow: "hidden",
        ...style,
      }}
    >
      {cap ? (
        <FrameCaption
          text={cap}
          color={capColor ?? (dim ? "#6a6a6a" : "#b5b5b5")}
          maxWidth={width - 12}
          blinking={Boolean(exposing)}
        />
      ) : null}
      {!blank && sprite ? (
        <FrameSprite
          url={url ?? null}
          alt={alt ?? ""}
          size={sprite}
          dim={Boolean(dim)}
          animation={spriteAnimation(Boolean(exposing), Boolean(developing))}
        />
      ) : null}
      {exposing ? (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(255,240,200,.14)",
            animation: "look-blink 0.25s steps(1) infinite",
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          right: 6,
          bottom: 4,
          fontSize: 10,
          color: "#8a8a8a",
          letterSpacing: ".1em",
        }}
      >
        {number}
      </div>
    </div>
  );
}

/** Grease-pencil handwriting. */
export function Pencil({
  children,
  style,
  white,
}: Readonly<{ children: ReactNode; style?: CSSProperties; white?: boolean }>) {
  return (
    <div
      style={{
        position: "absolute",
        fontFamily: LOOK_FONT_HAND,
        color: white ? "#f4f0e6" : CS_GREASE,
        fontSize: 28,
        lineHeight: 1,
        fontWeight: 600,
        transform: "rotate(-4deg)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** White proof sticker with the QR. */
export function ProofSticker({
  url,
  title,
  lines,
  style,
}: Readonly<{
  url: string;
  title: string;
  lines: string;
  style?: CSSProperties;
}>) {
  return (
    <div
      style={{
        position: "absolute",
        width: 300,
        background: "#f4efe3",
        color: "#2a2622",
        padding: "14px 16px",
        transform: "rotate(2.5deg)",
        boxShadow: "0 10px 30px rgba(0,0,0,.7)",
        display: "grid",
        gridTemplateColumns: "110px 1fr",
        gap: 14,
        alignItems: "center",
        animation: "look-drop 700ms cubic-bezier(.2,1.2,.4,1) both",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: -9,
          width: 64,
          height: 20,
          marginLeft: -32,
          background: "rgba(255,255,255,.3)",
          border: "1px solid rgba(0,0,0,.08)",
        }}
      />
      <LookQr url={url} size={110} fg="#1d1b19" />
      <div
        style={{
          fontFamily: LOOK_FONT_TYPEWRITER,
          fontSize: 13,
          lineHeight: 1.35,
        }}
      >
        <b
          style={{
            display: "block",
            fontSize: 16,
            letterSpacing: ".06em",
            marginBottom: 4,
          }}
        >
          {title}
        </b>
        {lines}
      </div>
    </div>
  );
}

const DRAW: CSSProperties = {
  strokeDasharray: 1,
  strokeDashoffset: 1,
  animation: "look-draw 900ms cubic-bezier(.4,0,.2,1) forwards",
};

/** Hand-drawn ellipse for the marks layer; `draw` animates the pencil stroke. */
export function GreaseEllipse({
  cx,
  cy,
  rx,
  ry,
  tilt = -3,
  dashed,
  draw,
  delayMs = 0,
}: Readonly<{
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  tilt?: number;
  dashed?: boolean;
  draw?: boolean;
  delayMs?: number;
}>) {
  const drawing = Boolean(draw) && !dashed;
  let strokeDasharray: string | number | undefined;
  if (dashed) strokeDasharray = "0.06 0.04";
  else if (draw) strokeDasharray = 1;
  return (
    <ellipse
      cx={cx}
      cy={cy}
      rx={rx}
      ry={ry}
      transform={`rotate(${tilt} ${cx} ${cy})`}
      pathLength={1}
      strokeDasharray={strokeDasharray}
      style={drawing ? { ...DRAW, animationDelay: `${delayMs}ms` } : undefined}
    />
  );
}

/** Two pencil strokes; `draw` animates them one after the other. */
export function GreaseX({
  cx,
  cy,
  r,
  draw,
}: Readonly<{ cx: number; cy: number; r: number; draw?: boolean }>) {
  return (
    <g strokeWidth={6}>
      <path
        d={`M ${cx - r} ${cy - r * 0.72} L ${cx + r} ${cy + r * 0.72}`}
        pathLength={1}
        style={draw ? { ...DRAW, animationDuration: "450ms" } : undefined}
      />
      <path
        d={`M ${cx + r} ${cy - r * 0.75} L ${cx - r} ${cy + r * 0.75}`}
        pathLength={1}
        style={
          draw
            ? { ...DRAW, animationDuration: "450ms", animationDelay: "380ms" }
            : undefined
        }
      />
    </g>
  );
}
