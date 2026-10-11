"use client";

import type { CSSProperties, ReactNode } from "react";
import { LOOK_FONT_BOOK, LOOK_FONT_MONO } from "../fonts";
import { LOOK_KEYFRAMES, LookQr } from "../shared";

export const AL_PAPER = "#efe6d2";
export const AL_INK = "#2a2320";
export const AL_RED = "#8c2f1b";
export const AL_RULE = "#b5a68e";
export const AL_MUTED = "#6a5a48";
export const AL_FAINT = "#8a7762";

/** Chrome every Allegiances page shares: paper, running head, title, folio. */
export function AllegiancesPage({
  title,
  subtitle,
  marginNote,
  folio,
  children,
}: Readonly<{
  title: string;
  subtitle: ReactNode;
  marginNote: string;
  folio: string;
  children: ReactNode;
}>) {
  const page: CSSProperties = {
    position: "relative",
    width: 1280,
    height: 1080,
    overflow: "hidden",
    color: AL_INK,
    fontFamily: LOOK_FONT_BOOK,
    background: `radial-gradient(ellipse at 25% 15%, rgba(255,255,255,.4), transparent 55%),
      linear-gradient(90deg, rgba(60,40,20,.30) 0, rgba(60,40,20,.10) 40px, transparent 120px),
      repeating-linear-gradient(0deg, rgba(0,0,0,.012) 0 2px, transparent 2px 5px),
      ${AL_PAPER}`,
  };
  return (
    <div style={page} data-look="allegiances">
      <style>{LOOK_KEYFRAMES}</style>
      <div
        style={{
          position: "absolute",
          top: 50,
          left: 0,
          right: 0,
          textAlign: "center",
          fontVariant: "small-caps",
          letterSpacing: ".42em",
          fontSize: 22,
          color: "#5a4a3a",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: 120,
            top: "50%",
            width: 330,
            height: 1,
            background: "#8d7a63",
          }}
        />
        Allegiances
        <span
          style={{
            position: "absolute",
            right: 120,
            top: "50%",
            width: 330,
            height: 1,
            background: "#8d7a63",
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          top: 110,
          left: 120,
          fontSize: 48,
          fontWeight: 600,
          fontVariant: "small-caps",
          letterSpacing: ".05em",
          lineHeight: 1,
        }}
      >
        {title}
      </div>
      <div
        style={{
          position: "absolute",
          top: 166,
          left: 120,
          right: 120,
          fontStyle: "italic",
          fontSize: 22,
          color: AL_MUTED,
        }}
      >
        {subtitle}
      </div>
      {children}
      <div
        style={{
          position: "absolute",
          left: 38,
          top: 440,
          writingMode: "vertical-rl",
          transform: "rotate(180deg)",
          fontFamily: LOOK_FONT_MONO,
          fontSize: 11,
          letterSpacing: ".28em",
          color: "#9a8a73",
        }}
      >
        {marginNote}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 44,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 19,
          color: AL_MUTED,
          letterSpacing: ".2em",
        }}
      >
        — {folio} —
      </div>
    </div>
  );
}

/** Small-caps section rule with an italic note at the right. */
export function AllegiancesSection({
  heading,
  note,
  size = 1,
}: Readonly<{ heading: ReactNode; note?: ReactNode; size?: number }>) {
  return (
    <div
      style={{
        margin: `0 0 ${6 * size}px`,
        fontVariant: "small-caps",
        letterSpacing: ".3em",
        fontSize: 17 * size,
        fontWeight: 600,
        color: "#3a2f26",
        borderBottom: `1px solid ${AL_RULE}`,
        paddingBottom: 3,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
      }}
    >
      <span>{heading}</span>
      {note ? (
        <span
          style={{
            fontVariant: "normal",
            letterSpacing: ".06em",
            fontStyle: "italic",
            fontWeight: 400,
            color: AL_FAINT,
            fontSize: 15 * size,
          }}
        >
          {note}
        </span>
      ) : null}
    </div>
  );
}

/** Red-ink ex-libris stamp holding the QR code. */
export function AllegiancesBookplate({
  url,
  line,
  width = 320,
  style,
}: Readonly<{
  url: string;
  line: string;
  width?: number;
  style?: CSSProperties;
}>) {
  const qr = Math.round(width * 0.36);
  return (
    <div
      style={{
        position: "absolute",
        width,
        border: `1.5px solid #7b2d1e`,
        padding: "14px 16px",
        display: "grid",
        gridTemplateColumns: `${qr}px 1fr`,
        gap: 14,
        alignItems: "center",
        color: "#7b2d1e",
        transform: "rotate(-1.5deg)",
        background: "rgba(255,250,240,.55)",
        boxShadow:
          "inset 0 0 0 3px rgba(255,250,240,.55), inset 0 0 0 4px #7b2d1e",
        animation: "look-pop 500ms ease both",
        ...style,
      }}
    >
      <LookQr url={url} size={qr} fg="#2a1a14" />
      <div>
        <div
          style={{
            fontVariant: "small-caps",
            letterSpacing: ".22em",
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          Ex libris · scan
        </div>
        <div
          style={{
            fontSize: 16,
            fontStyle: "italic",
            lineHeight: 1.25,
            marginTop: 2,
          }}
        >
          {line}
        </div>
      </div>
    </div>
  );
}

/** Captioned plate (a framed sprite) for the newest cat or the spotlight. */
export function AllegiancesPlate({
  children,
  caption,
  width,
  style,
}: Readonly<{
  children: ReactNode;
  caption: ReactNode;
  width: number;
  style?: CSSProperties;
}>) {
  return (
    <figure
      style={{
        position: "absolute",
        width,
        textAlign: "center",
        margin: 0,
        animation: "look-pop 600ms ease both",
        ...style,
      }}
    >
      <div
        style={{
          border: "1px solid #9a8a73",
          padding: "18px 8px 6px",
          background: "linear-gradient(#f6efdf,#ece2cc)",
          boxShadow: `inset 0 0 0 4px ${AL_PAPER}, inset 0 0 0 5px ${AL_RULE}`,
          display: "flex",
          justifyContent: "center",
        }}
      >
        {children}
      </div>
      <figcaption
        style={{
          marginTop: 8,
          fontStyle: "italic",
          fontSize: 18,
          lineHeight: 1.3,
          color: "#4a3d32",
        }}
      >
        {caption}
      </figcaption>
    </figure>
  );
}
