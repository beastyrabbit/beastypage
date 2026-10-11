"use client";

import {
  type LineageCatState,
  type LineageReveal,
  type LineageRoll,
  lineageBranchOpen,
  lineageCatState,
  lineageSpriteUrl,
} from "../ceremony";
import { LOOK_FONT_HAND } from "../fonts";
import type { LineageBoardProps } from "../LookBoardProps";
import {
  additionTags,
  type LineageBranch,
  type LineageCat,
  type LineageModel,
  lineageRank,
} from "../lineageModel";
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

function landed(state: LineageCatState): boolean {
  return state === "shown" || state === "revealing";
}

/** Caption suffix while the lightbox is on (a cat is rolling). */
function lightboxNote(charging: boolean, roll: LineageRoll | null): string {
  if (!charging) return "";
  if (!roll) return " · LIGHTBOX ON";
  return ` · LIGHTBOX ON · ${roll.traitLabel} ${(roll.index + 1).toString()}/${roll.count.toString()}`;
}

function sheetCaption(
  model: LineageModel,
  reveal: LineageReveal | undefined,
  rankWord: string,
): string {
  if (!reveal || reveal.done) {
    return `EVOLUTION · ${model.totalCount} CATS · CONTACT SHEET · CIRCLE THE ${rankWord.toUpperCase()}S`;
  }
  const lightbox = lightboxNote(reveal.charging, reveal.roll);
  return `EXPOSING · ${reveal.revealedKeys.size}/${model.totalCount} FRAMES${lightbox}`;
}

/** Edge code listing what each landed stop added, e.g. "· 1 +LAVENDER COLLAR". */
function edgeCode(
  branch: LineageBranch,
  reveal: LineageReveal | undefined,
): string {
  const stops = branch.cats
    .filter((cat) => landed(lineageCatState(reveal, cat.key)))
    .map(
      (cat) =>
        ` · ${cat.level} ${additionTags(cat.additions, 2).join(" ").toUpperCase()}`,
    )
    .join("");
  return `${branch.label.toUpperCase()} ▸ ${branch.theme.label.toUpperCase()} · 0 ORIGIN${stops}`;
}

/** The frame's caption: the roll while exposing ("accessory · 1/2…"), the value from the land on. */
function frameCaption(
  cat: LineageCat | null,
  state: LineageCatState,
  roll: LineageRoll | null,
): string | undefined {
  if (!cat || state === "hidden") return undefined;
  if (state === "charging") {
    if (!roll) return "exposing…";
    if (roll.valueLabel) return roll.valueLabel.toLowerCase();
    return `${roll.traitLabel.toLowerCase()} · ${(roll.index + 1).toString()}/${roll.count.toString()}…`;
  }
  return `${cat.level} · ${lineageRank(cat)}`;
}

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

  return (
    <ContactSheet>
      <SheetHead
        title={`${starter?.label ?? "Lineage"} — ${rolls} roll${rolls === 1 ? "" : "s"}, ${model.maxLevels} stop${model.maxLevels === 1 ? "" : "s"} each`}
        caption={sheetCaption(model, reveal, rankWord)}
      />

      {branches.map((branch, rollIndex) => {
        if (!lineageBranchOpen(reveal, branch.label)) return null;
        const last = branch.cats.at(-1);
        const lastLanded = last
          ? landed(lineageCatState(reveal, last.key))
          : false;
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
              tight ? undefined : (
                <span style={{ fontSize: 14, letterSpacing: ".12em" }}>
                  {edgeCode(branch, reveal)}
                </span>
              )
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
              const roll = exposing ? (reveal?.roll ?? null) : null;
              // The lightbox strobe stops on the near miss and the land so the frame can be read.
              const strobing =
                exposing &&
                roll?.phase !== "nearmiss" &&
                roll?.phase !== "land";
              return (
                // The wrapper carries the lineage key the leader line targets.
                <div
                  key={i.toString()}
                  data-lineage-key={cat?.key}
                  style={{
                    position: "absolute",
                    top: 33,
                    left: frameLeft(i + 1),
                    width: frameWidth,
                    height: frameHeight,
                  }}
                >
                  <Frame
                    left={0}
                    width={frameWidth}
                    height={frameHeight}
                    cap={frameCaption(cat, state, roll)}
                    capColor={exposing ? CS_GREASE : undefined}
                    number={String(i + 1)}
                    url={url}
                    alt={cat?.label}
                    sprite={cat && state !== "hidden" ? sprite : undefined}
                    blank={!cat || state === "hidden"}
                    exposing={strobing}
                    developing={state === "revealing"}
                    style={{ top: 0 }}
                  />
                </div>
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
          const last = branch.cats.at(-1);
          if (!last) return null;
          const state = lineageCatState(reveal, last.key);
          if (!landed(state)) return null;
          return (
            <GreaseEllipse
              key={branch.label}
              cx={STRIP_LEFT + frameLeft(lastIndex) + frameWidth / 2}
              cy={stripTop(rollIndex) + 33 + frameHeight / 2}
              rx={frameWidth * 0.58}
              ry={frameHeight * 0.56}
              tilt={rollIndex % 2 ? 2 : -3}
              draw={Boolean(reveal)}
              delayMs={state === "revealing" ? 900 : 0}
            />
          );
        })}
      </svg>

      {/* The plaque writes the roll along the sheet's bottom edge; always mounted. */}
      <div
        data-plaque-slot=""
        style={{
          position: "absolute",
          left: 40,
          bottom: 20,
          width: 560,
          height: 110,
          ["--obs-plaque-ink" as string]: "#d9d2c2",
          ["--obs-plaque-muted" as string]: "#9a948a",
          ["--obs-plaque-accent" as string]: CS_GREASE,
          ["--obs-plaque-shadow" as string]: "none",
          ["--obs-plaque-font-serif" as string]: LOOK_FONT_HAND,
        }}
      />

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
