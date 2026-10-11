"use client";

import type { CSSProperties, ReactNode } from "react";
import { LOOK_FONT_MONO, LOOK_FONT_SANS } from "../fonts";
import { LOOK_KEYFRAMES, LookQr, LookSprite } from "../shared";

export const ST_NAVY = "#1b2a4a";
export const ST_AMBER = "#ffb84a";
export const ST_AMBER_DEEP = "#c98a2a";
export const ST_PINK = "#e05a7a";
export const ST_RED = "#e0322b";
export const ST_BLUE = "#2f6fde";
export const ST_YELLOW = "#ffd23f";
export const ST_PAPER = "#fbf7ee";
export const ST_BROWN = "#8c6a2a";
export const ST_ROUNDED = `"Arial Rounded MT Bold", Nunito, ${LOOK_FONT_SANS}`;

const STICKER_SHAPE = "50% 50% 46% 46% / 44% 44% 56% 56%";

export const STICKER_KEYFRAMES = `${LOOK_KEYFRAMES}
@keyframes st-foil { 0% { transform: translate(0,0); } 100% { transform: translate(60%, -60%) rotate(8deg); opacity: 0; } }
@keyframes st-peel-off { 0% { opacity: 1; transform: none; } 100% { opacity: 0; transform: rotate(28deg) scale(0.3) translate(40%, -60%); } }
@keyframes st-pack { 0%, 100% { transform: rotate(6deg); } 25% { transform: rotate(2deg) translateY(-6px); } 50% { transform: rotate(10deg); } 75% { transform: rotate(4deg) translateY(-3px); } }
@keyframes st-holo { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
@keyframes st-mystery { 0%, 100% { filter: brightness(0) opacity(0.5); } 50% { filter: brightness(0) opacity(0.25); } }
`;

/** Dark table with the two album pages on it. */
export function AlbumSpread({
  children,
  title,
}: Readonly<{ children: ReactNode; title: string }>) {
  return (
    <div
      data-look="sticker"
      style={{
        position: "relative",
        width: 1280,
        height: 1080,
        overflow: "hidden",
        background: "#2b2140",
        fontFamily: LOOK_FONT_SANS,
        color: ST_NAVY,
      }}
    >
      <style>{STICKER_KEYFRAMES}</style>
      {children}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 8,
          textAlign: "center",
          font: `700 11px ${LOOK_FONT_SANS}`,
          color: "#8a7fa8",
          letterSpacing: ".3em",
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
    </div>
  );
}

/** One album page: cream paper with soft pastel glows and a dotted header rule. */
export function AlbumPage({
  side,
  left,
  width,
  heading,
  sub,
  children,
  style,
}: Readonly<{
  side: "left" | "right";
  left: number;
  width: number;
  heading: string;
  sub: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}>) {
  return (
    <div
      style={{
        position: "absolute",
        top: 30,
        bottom: 30,
        left,
        width,
        background: ST_PAPER,
        boxShadow: "0 20px 60px rgba(0,0,0,.6)",
        backgroundImage:
          "radial-gradient(circle at 20% 10%, rgba(255,180,220,.25), transparent 40%), radial-gradient(circle at 80% 90%, rgba(140,220,255,.25), transparent 40%)",
        borderRadius:
          side === "left" ? "14px 2px 2px 14px" : "2px 14px 14px 2px",
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        style={{
          padding: "20px 24px 8px",
          borderBottom: `4px dotted ${ST_AMBER}`,
        }}
      >
        <b
          style={{
            display: "block",
            font: `900 30px ${ST_ROUNDED}`,
            color: ST_NAVY,
          }}
        >
          {heading}
        </b>
        <span
          style={{
            font: `700 12px ${LOOK_FONT_SANS}`,
            color: ST_BROWN,
            textTransform: "uppercase",
            letterSpacing: ".12em",
          }}
        >
          {sub}
        </span>
      </div>
      {children}
    </div>
  );
}

/** Amber Panini-style corner number. */
export function StickerNumber({
  text,
  size = 34,
  muted,
  style,
}: Readonly<{
  text: string;
  size?: number;
  muted?: boolean;
  style?: CSSProperties;
}>) {
  return (
    <b
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: "50%",
        background: muted ? "#e6e0d4" : ST_AMBER,
        color: muted ? "#9a9184" : ST_NAVY,
        boxShadow: muted ? "none" : `0 2px 0 ${ST_AMBER_DEEP}`,
        font: `900 ${Math.round(size * 0.47)}px ${LOOK_FONT_SANS}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2,
        ...style,
      }}
    >
      {text}
    </b>
  );
}

/**
 * A round sticker with a sprite; `foil` adds the silver corner, `holo` the
 * rainbow sheen, `mystery` a blacked-out silhouette (unrevealed pack).
 */
export function Sticker({
  url,
  alt,
  size,
  foil = true,
  holo,
  mystery,
  ring,
  style,
  animation,
}: Readonly<{
  url: string | null;
  alt: string;
  size: number;
  foil?: boolean;
  holo?: boolean;
  mystery?: boolean;
  ring?: string;
  style?: CSSProperties;
  animation?: string;
}>) {
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: STICKER_SHAPE,
        background: holo
          ? "linear-gradient(120deg,#ffe8b0,#ffd6f1,#d8f6ff,#ffe8b0)"
          : "#ffe8b0",
        backgroundSize: holo ? "200% 200%" : undefined,
        boxShadow: ring
          ? `0 0 0 4px ${ring}, 0 3px 6px rgba(0,0,0,.25)`
          : "0 2px 0 #fff, 0 3px 6px rgba(0,0,0,.25)",
        overflow: "hidden",
        border: "3px solid #fff",
        animation:
          animation ?? (holo ? "st-holo 4s linear infinite" : undefined),
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "48%",
          transform: "translate(-50%,-50%)",
          animation: mystery
            ? "st-mystery 0.8s ease-in-out infinite"
            : undefined,
        }}
      >
        <LookSprite
          url={url}
          alt={alt}
          size={Math.round(size * 0.86)}
          placeholderColor={ST_BROWN}
        />
      </div>
      {foil ? (
        <i
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "repeating-linear-gradient(135deg,#d9d9df 0 4px,#a9a9b3 4px 8px,#eeeef2 8px 12px)",
            clipPath:
              "polygon(100% 100%,48% 100%,56% 84%,42% 70%,62% 56%,70% 40%,100% 36%)",
            opacity: 0.95,
          }}
        />
      ) : null}
    </div>
  );
}

/** Dashed empty slot; `stamp` = NEED / SWAPPED text. */
export function EmptySlot({
  size,
  stamp,
  colour = ST_PINK,
  round,
  style,
}: Readonly<{
  size: number;
  stamp: string;
  colour?: string;
  round?: boolean;
  style?: CSSProperties;
}>) {
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: round ? size : Math.round(size * 0.6),
        border: "3px dashed #d9d2c4",
        borderRadius: round ? STICKER_SHAPE : 12,
        background: "rgba(255,255,255,.5)",
        ...style,
      }}
    >
      <span
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "38%",
          textAlign: "center",
          font: `900 ${round ? 13 : 14}px ${LOOK_FONT_SANS}`,
          color: colour,
          transform: "rotate(-12deg)",
          letterSpacing: ".18em",
          opacity: 0.7,
          border: `2px solid ${colour}`,
          margin: `0 ${Math.round(size * 0.14)}px`,
          borderRadius: 4,
        }}
      >
        {stamp}
      </span>
    </div>
  );
}

/** Pink sticker pack in the corner: "PACK n · STAGE". */
export function PackTag({
  line1,
  line2,
  shaking,
  style,
}: Readonly<{
  line1: string;
  line2: string;
  shaking?: boolean;
  style?: CSSProperties;
}>) {
  return (
    <div
      style={{
        position: "absolute",
        width: 110,
        background: "#ff5a8a",
        color: "#fff",
        padding: 10,
        borderRadius: 10,
        transform: "rotate(6deg)",
        textAlign: "center",
        boxShadow: "0 10px 24px rgba(0,0,0,.35)",
        animation: shaking
          ? "st-pack 0.6s ease-in-out infinite"
          : "look-drop 500ms ease both",
        ...style,
      }}
    >
      <b style={{ display: "block", font: `900 18px ${LOOK_FONT_SANS}` }}>
        {line1}
      </b>
      <span
        style={{
          display: "block",
          font: `700 10px ${LOOK_FONT_SANS}`,
          letterSpacing: ".12em",
        }}
      >
        {line2}
      </span>
    </div>
  );
}

/** "COMPLETE!" shout. */
export function CompleteShout({
  text = "COMPLETE!",
  style,
}: Readonly<{ text?: string; style?: CSSProperties }>) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        textAlign: "center",
        font: `900 54px ${ST_ROUNDED}`,
        color: ST_AMBER,
        WebkitTextStroke: `2px ${ST_NAVY}`,
        letterSpacing: ".06em",
        transform: "rotate(-4deg)",
        animation: "look-stamp-flat 600ms cubic-bezier(.2,1.4,.4,1) both",
        ...style,
      }}
    >
      {text}
    </div>
  );
}

/** Order form page with the QR. */
export function OrderForm({
  url,
  left,
  width,
}: Readonly<{ url: string; left: number; width: number }>) {
  return (
    <AlbumPage
      side="right"
      left={left}
      width={width}
      heading="Order form"
      sub="missing none · ready"
      style={{ textAlign: "center", animation: "look-rise 600ms ease both" }}
    >
      <div
        style={{
          margin: "40px auto 0",
          width: 240,
          padding: 14,
          background: "#fff",
          borderRadius: 10,
          boxShadow: "0 10px 30px rgba(0,0,0,.2)",
        }}
      >
        <LookQr url={url} size={212} fg={ST_NAVY} />
      </div>
      <div
        style={{
          font: `700 18px ${LOOK_FONT_SANS}`,
          color: ST_NAVY,
          marginTop: 16,
        }}
      >
        Scan to see the whole set
      </div>
      <div
        style={{
          font: `11px ${LOOK_FONT_MONO}`,
          color: ST_BROWN,
          marginTop: 6,
        }}
      >
        beastypage
      </div>
    </AlbumPage>
  );
}
