"use client";

import { type BatchBoardCat, stageStripWindow } from "../batchModel";
import type { BatchBoardProps } from "../LookBoardProps";
import { useChangeTick } from "../motion";
import { LookSprite, poolNumber } from "../shared";
import {
  ContactSheet,
  CS_GREASE,
  FilmStrip,
  Frame,
  FrameMarker,
  GreaseEllipse,
  GreaseX,
  Pencil,
  ProofSticker,
  SheetHead,
} from "./ContactSheet";

const STRIP_LEFT = 60;
const FIRST_TOP = 180;
const STRIP_GAP = 20;
const BOTTOM_LIMIT = 1060;

/**
 * The adoption pool as one contact sheet: every kit is an exposure with its
 * number. Grease pencil: X = went home, circle = print for adoption (every
 * survivor once the show is done), a dashed circle + "?" for the marked kit,
 * a yellow tick for potentials, a heart for favourites. The spotlight sits
 * under a loupe.
 *
 * Motion: every new layer re-develops the frame, a cull flickers the frame
 * and draws its X stroke by stroke, the final circles draw in sequence and
 * the proof sticker drops.
 */
export function ContactBatch({ model }: Readonly<BatchBoardProps>) {
  const n = model.cats.length;
  const perStrip = n <= 16 ? 4 : n <= 25 ? 5 : 6;
  const strips = Math.max(1, Math.ceil(n / perStrip));
  const stripHeight = Math.min(
    215,
    Math.floor((BOTTOM_LIMIT - FIRST_TOP - (strips - 1) * STRIP_GAP) / strips),
  );
  const frameGap = 30;
  const frameWidth = Math.floor(
    (1160 - 60 - (perStrip - 1) * frameGap) / perStrip,
  );
  const frameHeight = stripHeight - 66;
  const sprite = Math.max(40, Math.min(142, frameHeight - 8, frameWidth - 20));
  const frameLeft = (i: number) => 30 + i * (frameWidth + frameGap);
  const stripTop = (i: number) => FIRST_TOP + i * (stripHeight + STRIP_GAP);
  const center = (index: number) => ({
    cx: STRIP_LEFT + frameLeft(index % perStrip) + frameWidth / 2,
    cy: stripTop(Math.floor(index / perStrip)) + 33 + frameHeight / 2,
  });
  const done = model.phase === "done";
  const spotlightIndex = model.spotlight
    ? model.cats.findIndex((cat) => cat.id === model.spotlight?.id)
    : -1;
  const loupe = Math.min(330, stripHeight * 1.5);
  let circleOrder = 0;

  return (
    <ContactSheet>
      <SheetHead
        title={`Adopt run — ${n} exposures, keep ${model.finalCount}`}
        caption={
          <>
            STAGE {Math.min(model.stageIndex + 1, model.stages.length)}/
            {model.stages.length} ·{" "}
            {stageStripWindow(model.stages, 6)
              .filter((stage) => stage.revealed)
              .map((stage) => stage.label.toUpperCase())
              .join(" · ") || "NOTHING YET"}{" "}
            · <i style={{ fontStyle: "normal", color: CS_GREASE }}>X</i> WENT
            HOME · <i style={{ fontStyle: "normal", color: CS_GREASE }}>○</i>{" "}
            {done ? "PRINT" : "STILL IN"}
          </>
        }
      />
      {model.qrUrl ? (
        <ProofSticker
          url={model.qrUrl}
          title="PROOF SET"
          lines={`${model.remaining} prints, saved — scan for the litter`}
          style={{ right: 60, top: 22, width: 290 }}
        />
      ) : (
        <Pencil
          key={model.statusLabel}
          style={{
            right: 80,
            top: 60,
            fontSize: 30,
            transform: "rotate(3deg)",
            animation: "look-pop 400ms ease both",
          }}
          white
        >
          {model.statusLabel}
        </Pencil>
      )}

      {Array.from({ length: strips }, (_, stripIndex) => (
        <FilmStrip
          key={stripIndex.toString()}
          top={stripTop(stripIndex)}
          height={stripHeight}
          roll={`STRIP ${stripIndex + 1}`}
          edge="BEASTY 400TX · SAFETY FILM"
        >
          {Array.from({ length: perStrip }, (_, i) => {
            const index = stripIndex * perStrip + i;
            if (i === 0 || index >= n) return null;
            return (
              <FrameMarker
                key={`marker-${i.toString()}`}
                left={frameLeft(i) + frameWidth - 32}
                label={String(index + 1)}
              />
            );
          })}
          {model.cats
            .slice(stripIndex * perStrip, stripIndex * perStrip + perStrip)
            .map((cat, i) => (
              <ExposureFrame
                key={cat.id}
                cat={cat}
                index={stripIndex * perStrip + i}
                left={frameLeft(i)}
                width={frameWidth}
                height={frameHeight}
                sprite={sprite}
              />
            ))}
        </FilmStrip>
      ))}

      <svg
        viewBox="0 0 1280 1080"
        width={1280}
        height={1080}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        fill="none"
        stroke={CS_GREASE}
        strokeWidth={5}
        strokeLinecap="round"
        opacity={0.92}
        role="img"
        aria-label="Grease pencil marks"
      >
        {model.cats.map((cat, index) => {
          const { cx, cy } = center(index);
          if (cat.eliminated && !cat.fading) {
            return (
              <GreaseX
                key={cat.id}
                cx={cx}
                cy={cy}
                r={frameWidth * 0.34}
                draw
              />
            );
          }
          if (cat.marked) {
            return (
              <GreaseEllipse
                key={`${cat.id}-marked`}
                cx={cx}
                cy={cy}
                rx={frameWidth * 0.5}
                ry={frameHeight * 0.52}
                dashed
              />
            );
          }
          if (cat.potential) {
            return (
              <path
                key={`${cat.id}-maybe`}
                d={`M ${cx - frameWidth * 0.42} ${cy + frameHeight * 0.3} l 14 16 l 30 -40`}
                stroke="#f3d35a"
                strokeWidth={6}
                pathLength={1}
                style={{
                  strokeDasharray: 1,
                  strokeDashoffset: 1,
                  animation: "look-draw 500ms ease forwards",
                }}
              />
            );
          }
          if (done && !cat.fading) {
            const order = circleOrder++;
            return (
              <GreaseEllipse
                key={`${cat.id}-keep`}
                cx={cx}
                cy={cy}
                rx={frameWidth * 0.5}
                ry={frameHeight * 0.52}
                tilt={index % 2 ? 2 : -3}
                draw
                delayMs={300 + order * 160}
              />
            );
          }
          return null;
        })}
      </svg>

      {model.cats.map((cat, index) => {
        if ((!cat.marked && !cat.favorite) || cat.eliminated) return null;
        const { cx, cy } = center(index);
        return (
          <Pencil
            key={`${cat.id}-${cat.marked ? "marked" : "fav"}`}
            style={{
              left: cx + frameWidth * 0.3,
              top: cy - frameHeight * 0.62,
              fontSize: 34,
              color: cat.marked ? CS_GREASE : "#ff6f9c",
              animation: cat.marked
                ? "look-pulse 1.1s ease-in-out infinite"
                : "look-stamp-flat 400ms ease both",
            }}
          >
            {cat.marked ? "?" : "♥"}
          </Pencil>
        );
      })}

      {model.spotlight?.previewUrl && spotlightIndex >= 0 ? (
        <>
          <div
            key={model.spotlight.id}
            style={{
              position: "absolute",
              left: center(spotlightIndex).cx - loupe / 2,
              top: center(spotlightIndex).cy - loupe / 2,
              width: loupe,
              height: loupe,
              borderRadius: "50%",
              overflow: "hidden",
              background: "#000",
              boxShadow:
                "0 0 0 12px #2f3238, 0 0 0 16px #9ea4ad, 0 0 0 18px #3a3d44, 0 30px 60px rgba(0,0,0,.8)",
              zIndex: 5,
              animation: "look-stamp-flat 500ms cubic-bezier(.2,1.3,.4,1) both",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%,-50%)",
              }}
            >
              <LookSprite
                url={model.spotlight.previewUrl}
                alt={model.spotlight.label}
                size={Math.round(loupe * 0.9)}
              />
            </div>
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                background:
                  "radial-gradient(ellipse at 30% 25%,rgba(255,255,255,.28),transparent 45%),radial-gradient(ellipse at 70% 80%,rgba(255,255,255,.07),transparent 40%)",
                boxShadow: "inset 0 0 40px rgba(0,0,0,.6)",
              }}
            />
          </div>
          <Pencil
            white
            style={{
              left: center(spotlightIndex).cx + loupe / 2 + 20,
              top: center(spotlightIndex).cy + loupe / 2 - 30,
              fontSize: 30,
              zIndex: 6,
              transform: "rotate(-3deg)",
              animation: "look-pop 400ms ease 300ms both",
            }}
          >
            under the loupe:{" "}
            <b style={{ color: CS_GREASE }}>{model.spotlight.label}</b>
            {model.spotlight.favorite ? " — crowd favourite" : ""}
          </Pencil>
        </>
      ) : null}

      {done ? (
        <Pencil
          style={{
            right: 80,
            top: 150,
            fontSize: 24,
            transform: "rotate(6deg)",
            animation: "look-pop 400ms ease 800ms both",
          }}
        >
          {model.remaining} prints
        </Pencil>
      ) : null}
    </ContactSheet>
  );
}

function ExposureFrame({
  cat,
  index,
  left,
  width,
  height,
  sprite,
}: Readonly<{
  cat: BatchBoardCat;
  index: number;
  left: number;
  width: number;
  height: number;
  sprite: number;
}>) {
  const out = cat.eliminated && !cat.fading;
  const tick = useChangeTick(cat.previewUrl);
  return (
    <Frame
      left={left}
      width={width}
      height={height}
      cap={`${poolNumber(index)} ${cat.label}${out ? ` · st.${cat.eliminatedAtStage}` : cat.favorite ? " ♥" : ""}`}
      number={String(index + 1)}
      url={cat.previewUrl}
      alt={cat.label}
      sprite={sprite}
      dim={out}
      developing={tick > 0 && !out && !cat.fading}
      style={
        cat.fading
          ? { animation: "look-flicker 1000ms steps(6) both" }
          : undefined
      }
    />
  );
}
