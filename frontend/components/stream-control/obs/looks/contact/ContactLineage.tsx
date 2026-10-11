"use client";

import {
  lineageBranchOpen,
  lineageCatState,
  lineageSpriteUrl,
} from "../ceremony";
import { LOOK_FONT_HAND } from "../fonts";
import type { LineageBoardProps } from "../LookBoardProps";
import { additionTags, lineageRank } from "../lineageModel";
import {
  ContactSheet,
  CS_GREASE,
  FilmStrip,
  Frame,
  FrameMarker,
  GreaseEllipse,
  Pencil,
  ProofSticker,
  SheetHead,
} from "./ContactSheet";

const STRIP_LEFT = 60;
const FIRST_TOP = 124;
const STRIP_GAP = 30;
const BOTTOM_LIMIT = 880;

/**
 * One roll per branch, one frame per stop (frame 0 is the shared starter
 * negative); the last cat of every roll is circled in grease pencil with a
 * "print" note, and the proof sticker carries the QR.
 *
 * Ceremony: a roll slides onto the light table when its branch opens, a
 * charging frame strobes on the lightbox ("EXPOSING"), a revealed frame
 * develops from black, the pencil circle draws itself when a roll's last
 * frame lands, and the proof sticker drops at the end.
 */
export function ContactLineage({ model, reveal }: Readonly<LineageBoardProps>) {
  const branches = model.branches;
  const rolls = Math.max(1, branches.length);
  const stripHeight = Math.min(
    230,
    Math.floor((BOTTOM_LIMIT - FIRST_TOP - (rolls - 1) * STRIP_GAP) / rolls),
  );
  const frameCount = Math.max(5, model.maxLevels + 1);
  const frameGap = 26;
  const frameWidth = Math.min(
    200,
    Math.floor((1160 - 60 - (frameCount - 1) * frameGap) / frameCount),
  );
  const frameHeight = stripHeight - 72;
  const sprite = Math.max(40, Math.min(150, frameHeight - 8, frameWidth - 20));
  const frameLeft = (i: number) => 30 + i * (frameWidth + frameGap);
  const stripTop = (i: number) => FIRST_TOP + i * (stripHeight + STRIP_GAP);
  const starter = model.starter;
  const starterState = starter
    ? lineageCatState(reveal, starter.key)
    : "hidden";
  const tight = stripHeight < 170;
  const done = !reveal || reveal.done;
  const rankWord = lineageRank({ level: model.maxLevels });
  const exposed = reveal ? reveal.revealedKeys.size : model.totalCount;

  return (
    <ContactSheet>
      <SheetHead
        title={`${starter?.label ?? "Lineage"} — ${rolls} roll${rolls === 1 ? "" : "s"}, ${model.maxLevels} stop${model.maxLevels === 1 ? "" : "s"} each`}
        caption={
          done
            ? `EVOLUTION · ${model.totalCount} CATS · CONTACT SHEET · CIRCLE THE ${rankWord.toUpperCase()}S`
            : `EXPOSING · ${exposed}/${model.totalCount} FRAMES${reveal?.charging ? " · LIGHTBOX ON" : ""}`
        }
      />

      {branches.map((branch, rollIndex) => {
        if (!lineageBranchOpen(reveal, branch.label)) return null;
        const last = branch.cats[branch.cats.length - 1];
        const lastState = last ? lineageCatState(reveal, last.key) : "hidden";
        const lastLanded = lastState === "shown" || lastState === "revealing";
        return (
          <FilmStrip
            key={branch.label}
            top={stripTop(rollIndex)}
            height={stripHeight}
            roll={`ROLL ${rollIndex + 1} · ${branch.label.toUpperCase()} LINE`}
            edge="BEASTY 400TX · SAFETY FILM"
            style={{
              animation: "look-rise 600ms cubic-bezier(.2,1,.3,1) both",
            }}
            edgeBottom={
              tight
                ? undefined
                : `${branch.label.toUpperCase()} ▸ ${branch.theme.label.toUpperCase()} · 0 ORIGIN${branch.cats
                    .map((cat) =>
                      lineageCatState(reveal, cat.key) === "shown" ||
                      lineageCatState(reveal, cat.key) === "revealing"
                        ? ` · ${cat.level} ${additionTags(cat.additions, 2, 14).join(" ").toUpperCase()}`
                        : "",
                    )
                    .join("")}`
            }
          >
            {Array.from({ length: frameCount - 1 }, (_, i) => (
              <FrameMarker
                key={`marker-${i.toString()}`}
                left={frameLeft(i + 1) + frameWidth - 26}
                label={String(i + 1)}
              />
            ))}
            <Frame
              left={frameLeft(0)}
              width={frameWidth}
              height={frameHeight}
              cap={rollIndex === 0 ? "0 · origin" : "0 · same neg"}
              number="0"
              url={starter?.previewUrl}
              alt={starter?.label}
              sprite={sprite}
              dim={rollIndex > 0}
              developing={rollIndex === 0 && starterState === "revealing"}
            />
            {Array.from({ length: frameCount - 1 }, (_, i) => {
              const cat = branch.cats[i] ?? null;
              const state = cat ? lineageCatState(reveal, cat.key) : "hidden";
              const url = cat
                ? lineageSpriteUrl(state, reveal, cat.previewUrl)
                : null;
              const exposing = state === "charging";
              return (
                <Frame
                  key={i.toString()}
                  left={frameLeft(i + 1)}
                  width={frameWidth}
                  height={frameHeight}
                  cap={
                    cat && state !== "hidden"
                      ? exposing
                        ? "exposing…"
                        : `${cat.level} · ${lineageRank(cat)}`
                      : undefined
                  }
                  capColor={exposing ? CS_GREASE : undefined}
                  number={String(i + 1)}
                  url={url}
                  alt={cat?.label}
                  sprite={cat && state !== "hidden" ? sprite : undefined}
                  blank={!cat || state === "hidden"}
                  exposing={exposing}
                  developing={state === "revealing"}
                />
              );
            })}
            {last && lastLanded ? (
              <Pencil
                style={{
                  left: frameLeft(branch.cats.length + 1) + 6,
                  top: 33 + frameHeight / 2 - 10,
                  fontSize: tight ? 22 : 28,
                  animation: "look-pop 500ms ease 1500ms both",
                }}
              >
                → print · {last.label}
              </Pencil>
            ) : null}
          </FilmStrip>
        );
      })}

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
        {branches.map((branch, rollIndex) => {
          const lastIndex = branch.cats.length;
          const last = branch.cats[lastIndex - 1];
          if (!last) return null;
          const state = lineageCatState(reveal, last.key);
          if (state !== "shown" && state !== "revealing") return null;
          return (
            <GreaseEllipse
              key={branch.label}
              cx={STRIP_LEFT + frameLeft(lastIndex) + frameWidth / 2}
              cy={stripTop(rollIndex) + 33 + frameHeight / 2}
              rx={frameWidth * 0.58}
              ry={frameHeight * 0.56}
              tilt={rollIndex % 2 ? 2 : -3}
              draw={Boolean(reveal)}
              delayMs={state === "revealing" ? 1200 : 0}
            />
          );
        })}
      </svg>

      {done ? (
        <>
          <div
            style={{
              position: "absolute",
              left: 64,
              bottom: 50,
              fontFamily: LOOK_FONT_HAND,
              fontSize: 34,
              color: "#f4f0e6",
              transform: "rotate(-2deg)",
              animation: "look-pop 600ms ease 200ms both",
            }}
          >
            keep <b style={{ color: CS_GREASE }}>{branches.length}</b>{" "}
            {rankWord.toLowerCase()}s of {model.totalCount} · {rolls} line
            {rolls === 1 ? "" : "s"}, no misfires
          </div>
          <ProofSticker
            url={model.url}
            title="PROOF SET"
            lines="scan for every frame, roll by roll"
            style={{ right: 70, bottom: 36 }}
          />
        </>
      ) : null}
    </ContactSheet>
  );
}
