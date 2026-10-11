"use client";

import type { CSSProperties, ReactNode } from "react";
import { LOOK_FONT_PIXEL } from "../fonts";
import { LOOK_KEYFRAMES, LookQr, LookSprite } from "../shared";
import { GB_DIM, GB_INK, GB_SCREEN, useGbSprite } from "./gbSprite";

/** Inner LCD size the screens lay out against. */
export const LCD_WIDTH = 980;
export const LCD_HEIGHT = 720;

/**
 * The plastic handheld around a 980×720 LCD. Screens render into the LCD
 * with absolute positions; everything else is dressing. `flash` whites the
 * LCD out for a beat (the evolve landing), keyed so it replays per cat.
 */
export function HandheldShell({
  children,
  flash,
  flashKey,
}: Readonly<{ children: ReactNode; flash?: boolean; flashKey?: string }>) {
  return (
    <div
      data-look="handheld"
      style={{
        position: "relative",
        width: 1280,
        height: 1080,
        overflow: "hidden",
        fontFamily: LOOK_FONT_PIXEL,
      }}
    >
      <style>{`${LOOK_KEYFRAMES}
@keyframes gb-blink { 50% { opacity: 0; } }
@keyframes gb-flash { 0% { filter: brightness(1.8); } 100% { filter: brightness(1); } }
@keyframes gb-evolve { 0%, 100% { filter: none; } 50% { filter: brightness(0) contrast(2); } }
@keyframes gb-whiteout { 0% { opacity: 1; } 35% { opacity: 1; } 100% { opacity: 0; } }`}</style>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg,#dcd8cc,#c3bfb2)",
          borderRadius: "28px 28px 140px 28px",
          boxShadow:
            "inset 0 0 0 6px rgba(255,255,255,.25), inset 0 -24px 40px rgba(0,0,0,.12)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 90,
          top: 44,
          width: 1100,
          height: 800,
          background: "#46464f",
          borderRadius: "18px 18px 80px 18px",
          boxShadow:
            "inset 0 2px 0 rgba(255,255,255,.08), 0 6px 0 rgba(0,0,0,.25)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 34,
            right: 34,
            top: 22,
            height: 3,
            background: "linear-gradient(90deg,#7b2c57,#2b3d8f)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 30,
            top: 300,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: "#ff3b3b",
            boxShadow: "0 0 10px #ff3b3b",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 14,
            top: 320,
            fontSize: 7,
            color: "#c9c4b8",
          }}
        >
          BATT
        </div>
        <div
          style={{
            position: "absolute",
            left: 34,
            bottom: 16,
            color: "#c9c4b8",
            fontSize: 11,
            letterSpacing: ".15em",
          }}
        >
          BEASTY <span style={{ color: "#e86b8a" }}>BOY</span> · POCKET CAT
        </div>
      </div>
      {/* LCD */}
      <div
        style={{
          position: "absolute",
          left: 150,
          top: 92,
          width: LCD_WIDTH,
          height: LCD_HEIGHT,
          background: GB_SCREEN,
          color: GB_INK,
          overflow: "hidden",
          boxShadow: "inset 0 0 50px rgba(15,56,15,.28)",
        }}
      >
        {children}
        {flash ? (
          <div
            key={flashKey}
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              background: "#e8f4b0",
              animation: "gb-whiteout 1100ms steps(5) both",
              pointerEvents: "none",
              zIndex: 5,
            }}
          />
        ) : null}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "linear-gradient(rgba(15,56,15,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(15,56,15,.10) 1px,transparent 1px)",
            backgroundSize: "4px 4px",
            zIndex: 6,
          }}
        />
      </div>
      {/* D-pad */}
      <div
        style={{
          position: "absolute",
          left: 130,
          top: 870,
          width: 180,
          height: 180,
        }}
      >
        <div style={{ ...PAD, left: 60, top: 0, width: 60, height: 180 }} />
        <div style={{ ...PAD, left: 0, top: 60, width: 180, height: 60 }} />
      </div>
      <div style={{ ...BUTTON, left: 970, top: 930 }}>B</div>
      <div style={{ ...BUTTON, left: 1090, top: 880 }}>A</div>
      <Pill left={500} label="SELECT" />
      <Pill left={630} label="START" />
      <div
        style={{
          position: "absolute",
          right: 140,
          top: 880,
          width: 140,
          height: 140,
          background:
            "repeating-linear-gradient(-30deg,transparent 0 12px,rgba(0,0,0,.28) 12px 20px)",
          borderRadius: "50%",
          opacity: 0.5,
        }}
      />
    </div>
  );
}

const PAD: CSSProperties = {
  position: "absolute",
  background: "#2a2a2e",
  borderRadius: 8,
  boxShadow: "inset 0 -4px 0 rgba(0,0,0,.45)",
};

const BUTTON: CSSProperties = {
  position: "absolute",
  width: 92,
  height: 92,
  borderRadius: "50%",
  background: "#8e2f63",
  boxShadow: "inset 0 -6px 0 rgba(0,0,0,.35),0 4px 0 rgba(0,0,0,.2)",
  color: "rgba(255,255,255,.6)",
  fontSize: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

function Pill({ left, label }: Readonly<{ left: number; label: string }>) {
  return (
    <div
      style={{
        position: "absolute",
        left,
        top: 960,
        width: 90,
        height: 22,
        borderRadius: 12,
        background: "#56565e",
        transform: "rotate(-25deg)",
        boxShadow: "inset 0 -3px 0 rgba(0,0,0,.4)",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 28,
          left: 0,
          fontSize: 8,
          color: "#6b6b72",
          transform: "rotate(25deg)",
          letterSpacing: ".1em",
        }}
      >
        {label}
      </span>
    </div>
  );
}

/** Double-ruled LCD window. */
export function LcdBox({
  style,
  children,
}: Readonly<{ style: CSSProperties; children: ReactNode }>) {
  return (
    <div
      style={{
        position: "absolute",
        border: `6px double ${GB_INK}`,
        background: GB_SCREEN,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** A sprite quantised to the LCD palette; `catId` marks its root for the batch wrapper. */
export function LcdSprite({
  url,
  alt,
  size,
  style,
  catId,
}: Readonly<{
  url: string | null;
  alt: string;
  size: number;
  style?: CSSProperties;
  catId?: string;
}>) {
  const gb = useGbSprite(url);
  return (
    <LookSprite
      url={gb}
      alt={alt}
      size={size}
      style={style}
      placeholderColor={GB_DIM}
      catId={catId}
    />
  );
}

/** "LINK CABLE · SCAN" QR in the corner of a text box. */
export function LcdLink({ url }: Readonly<{ url: string }>) {
  return (
    <div
      style={{
        position: "absolute",
        right: 16,
        top: 6,
        width: 110,
        textAlign: "center",
        fontSize: 7.5,
        lineHeight: 1.6,
        animation: "look-pop 500ms steps(4) both",
      }}
    >
      <LookQr
        url={url}
        size={78}
        fg={GB_INK}
        style={{ display: "block", margin: "0 auto 2px" }}
      />
      LINK CABLE
      <br />
      SCAN
    </div>
  );
}
