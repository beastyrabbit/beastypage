"use client";

import { useEffect, useState } from "react";
import {
  type BatchBoardCat,
  type BatchBoardModel,
  type BatchBoardStage,
  stageStripWindow,
} from "../batchModel";
import type { BatchBoardProps } from "../LookBoardProps";
import { chunkBySizes, splitColumns } from "../layout";
import { useTypewriter } from "../motion";
import { poolNumber } from "../shared";
import { GB_DIM, GB_INK, GB_SCREEN } from "./gbSprite";
import {
  HandheldShell,
  LCD_HEIGHT,
  LcdBox,
  LcdLink,
  LcdSprite,
} from "./HandheldShell";

const TOP_H = 76;
const TEXT_H = 122;
const PAD = 16;
const PARTY_W = 600;
const ROWS_PER_COLUMN = 10;
/** How often the text box re-reads the verdict clock. */
const VERDICT_TICK_MS = 250;

/** "NO KIT", "1 KIT", "4 KITS". */
function kitCount(count: number): string {
  if (count === 0) return "NO KIT";
  return count === 1 ? "1 KIT" : `${count} KITS`;
}

/** "3", "2", "1" for the verdict clock, clamped like the wrapper's numeral. */
function verdictDigit(endsAt: number | null, now: number): number {
  if (endsAt === null) return 3;
  return Math.max(1, Math.min(3, Math.ceil((endsAt - now) / 1000)));
}

/** Wall clock sampled every 250 ms while the verdict runs; 0 otherwise. */
function useVerdictClock(active: boolean): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), VERDICT_TICK_MS);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

/**
 * The text box line for a beat, in the handheld's voice. The verdict line
 * ends in a live digit that is rendered separately so the typewriter does
 * not retype it every second.
 */
function textBoxMessage(model: BatchBoardModel): string {
  const tail = `${model.remaining} KITS → ${model.finalCount}`;
  const trait = model.traitLabel.toUpperCase();
  const changed = model.survivors.filter(
    (cat) => cat.changed && !cat.fading,
  ).length;
  const leavingIndex = model.cats.findIndex((cat) => cat.fading);
  const leaving = leavingIndex >= 0 ? poolNumber(leavingIndex) : "??";
  switch (model.beat) {
    case "loading":
      return "SUMMONING THE PARTY…";
    case "windup":
    case "deal":
      return `THE PARTY ROLLS FOR ${trait}…\n${tail}`;
    case "hold":
      return `${kitCount(changed)} CHANGED!\n${tail}`;
    case "awaiting":
      return `${model.remaining} KITS IN THE PARTY.\nWHO LEAVES? ▶ CHOOSE ONE`;
    case "verdict":
      return `#${model.verdictNumber ?? "??"} LEAVES IN `;
    case "depart":
      return `#${leaving} LEAVES THE PARTY.\n${tail}`;
    case "repack":
      return `MAKING ROOM…\n${tail}`;
    case "done":
      return `${model.remaining} KITS ARE READY FOR THE ADOPT RUN!\n${model.qrUrl ? "SEND VIA LINK?  ▶YES   NO" : "SAVING…"}`;
  }
}

/**
 * PARTY screen: every kit still in the pool is a party row (number, sprite,
 * name, reveal bar); kits that left sit in BOX 1 · RELEASED. A spotlight
 * takes over the box as a big LOOK view. Marked = inverted blinking row,
 * potential = "?" after the name, favourite = ♥.
 *
 * Motion: the LCD whites out once per stage at the first landing, each
 * landed sprite flashes (gb-flash), a culled row blinks inverted then steps
 * out over the depart beat, the LOOK sprite flashes in, the text box types
 * and counts the verdict down in LCD digits.
 */
export function HandheldBatch({ model }: Readonly<BatchBoardProps>) {
  const numbered = model.cats.map((cat, index) => ({ cat, index }));
  const party = numbered.filter(({ cat }) => !cat.eliminated || cat.fading);
  const released = numbered.filter(({ cat }) => cat.eliminated && !cat.fading);
  const boxTop = PAD + TOP_H + 12;
  const boxHeight = LCD_HEIGHT - boxTop - TEXT_H - PAD - 8;
  const innerHeight = boxHeight - 28 - 30;

  const columnCount = Math.min(
    3,
    Math.max(1, Math.ceil(party.length / ROWS_PER_COLUMN)),
  );
  const columns = chunkBySizes(
    party,
    splitColumns(party.length, Math.ceil(party.length / columnCount)),
  );
  const rows = Math.max(1, ...columns.map((c) => c.length));
  const rowHeight = Math.min(44, Math.floor(innerHeight / rows));
  const showBars = columnCount === 1;
  const revealedCount = model.stages.filter((s) => s.revealed).length;
  const revealRatio = model.stages.length
    ? revealedCount / model.stages.length
    : 1;
  const releasedRow = Math.min(
    66,
    Math.floor(innerHeight / Math.max(1, released.length)),
  );
  const spotlight = model.spotlight;

  const verdict = model.beat === "verdict";
  const now = useVerdictClock(verdict);
  const message = textBoxMessage(model);
  const typed = useTypewriter(message, 24);
  // The verdict digit follows the typed head once it is fully out.
  const digit =
    verdict && typed.length >= message.length
      ? verdictDigit(model.verdictEndsAt, now)
      : null;
  // The LCD whites out once per stage, at the first landing of the deal.
  const anyLanded = model.survivors.some((cat) => cat.landed);
  const flash = model.beat === "deal" && anyLanded;
  const trait = model.traitLabel.toUpperCase();

  return (
    <HandheldShell flash={flash} flashKey={String(model.stageIndex)}>
      <LcdBox
        style={{
          left: PAD,
          top: PAD,
          right: PAD,
          height: TOP_H,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 8,
          padding: "0 18px",
          fontSize: 15,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            whiteSpace: "nowrap",
          }}
        >
          <span>
            ADOPT RUN ◆ STAGE{" "}
            {Math.min(model.stageIndex + 1, model.stages.length)}/
            {model.stages.length}
            {trait ? ` ◆ ${trait}` : ""}
          </span>
          <span
            key={model.remaining}
            style={{ animation: "gb-flash 500ms steps(3) both" }}
          >
            KITS {model.remaining}/{model.poolCount}
          </span>
        </div>
        <div
          style={{
            fontSize: 11,
            color: GB_DIM,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {model.statusLabel.toUpperCase()}
        </div>
      </LcdBox>

      <LcdBox
        style={{
          left: PAD,
          top: boxTop,
          width: PARTY_W,
          height: boxHeight,
          padding: "14px 12px",
        }}
      >
        <div
          style={{
            fontSize: 11,
            marginBottom: 8,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>PARTY · {model.phase === "done" ? "READY" : "ROLLING"}</span>
          <span
            style={{ color: GB_DIM, whiteSpace: "nowrap", overflow: "hidden" }}
          >
            {stageStripWindow(model.stages, 7).map((s) => (
              <span
                key={s.id}
                style={{
                  color: stageColour(s),
                  animation:
                    s.current && model.phase === "revealing"
                      ? "gb-blink 0.6s steps(1) infinite"
                      : undefined,
                }}
              >
                {s.label.slice(0, 3).toUpperCase()}{" "}
              </span>
            ))}
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
            gap: 8,
          }}
        >
          {columns.map((column, columnIndex) => (
            <div key={column[0]?.cat.id ?? columnIndex}>
              {column.map(({ cat, index }) => (
                <PartyRow
                  key={cat.id}
                  cat={cat}
                  number={poolNumber(index)}
                  height={rowHeight}
                  showBar={showBars}
                  revealRatio={revealRatio}
                />
              ))}
            </div>
          ))}
        </div>
      </LcdBox>

      <LcdBox
        style={{
          left: PAD + PARTY_W + 16,
          top: boxTop,
          right: PAD,
          height: boxHeight,
          padding: "14px 12px",
        }}
      >
        {spotlight?.previewUrl ? (
          <div
            key={spotlight.id}
            style={{
              textAlign: "center",
              animation: "gb-flash 700ms steps(4) both",
            }}
          >
            <div
              style={{
                fontSize: 11,
                marginBottom: 12,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>LOOK</span>
              <span style={{ color: GB_DIM }}>
                No.
                {poolNumber(model.cats.findIndex((c) => c.id === spotlight.id))}
              </span>
            </div>
            <LcdSprite
              url={spotlight.previewUrl}
              alt={spotlight.label}
              size={Math.min(300, boxHeight - 120)}
              style={{
                margin: "0 auto",
                animation: "look-bob 1.6s steps(2) infinite",
              }}
            />
            <div style={{ fontSize: 14, marginTop: 10 }}>
              {spotlight.favorite ? "♥ " : ""}
              {spotlight.label.toUpperCase()}
            </div>
          </div>
        ) : (
          <>
            <div
              style={{
                fontSize: 11,
                marginBottom: 12,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>BOX 1 · RELEASED</span>
              <span style={{ color: GB_DIM }}>{released.length}</span>
            </div>
            {released.map(({ cat, index }) => (
              <div
                key={cat.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "52px 1fr",
                  gap: 10,
                  alignItems: "center",
                  height: releasedRow,
                  opacity: 0.55,
                  animation: "look-rise 400ms steps(4) both",
                }}
              >
                <LcdSprite
                  url={cat.previewUrl}
                  alt={cat.label}
                  size={Math.min(48, releasedRow - 6)}
                  style={{ filter: "contrast(.6) brightness(1.1)" }}
                />
                <div
                  style={{
                    fontSize: releasedRow >= 40 ? 11 : 9,
                    lineHeight: 1.7,
                  }}
                >
                  {poolNumber(index)} {cat.label.toUpperCase()}
                  <small
                    style={{ display: "block", fontSize: 8, color: GB_DIM }}
                  >
                    LEFT AT STAGE {cat.eliminatedAtStage}
                  </small>
                </div>
              </div>
            ))}
          </>
        )}
      </LcdBox>

      <LcdBox
        style={{
          left: PAD,
          right: PAD,
          bottom: PAD,
          height: TEXT_H,
          padding: "20px 26px",
          fontSize: 15,
          lineHeight: 2,
          whiteSpace: "pre-line",
        }}
      >
        {typed}
        {digit !== null ? (
          <span
            key={digit}
            style={{ animation: "gb-flash 400ms steps(2) both" }}
          >
            {digit}…
          </span>
        ) : null}
        {model.qrUrl ? <LcdLink url={model.qrUrl} /> : null}
      </LcdBox>
    </HandheldShell>
  );
}

function stageColour(stage: BatchBoardStage): string {
  if (stage.current) return GB_INK;
  return stage.revealed ? GB_DIM : "rgba(48,98,48,.35)";
}

/** The leave fills the 1600 ms depart beat; the engine drops the row after it. */
function rowAnimation(cat: BatchBoardCat): string | undefined {
  if (cat.fading) return "look-leave 1500ms steps(5) forwards";
  return cat.marked ? "gb-blink 1.2s steps(1) infinite" : undefined;
}

/** "▶07 FERNKIT ♥ ?" — the row's name line with its state marks. */
function rowName(cat: BatchBoardCat, number: string): string {
  const lead = cat.spotlight ? "▶" : "";
  const marks = `${cat.favorite ? " ♥" : ""}${cat.potential ? " ?" : ""}`;
  return `${lead}${number} ${cat.label.toUpperCase()}${marks}`;
}

function PartyRow({
  cat,
  number,
  height,
  showBar,
  revealRatio,
}: Readonly<{
  cat: BatchBoardCat;
  number: string;
  height: number;
  showBar: boolean;
  revealRatio: number;
}>) {
  const inverted = cat.marked;
  const small = height < 36;
  // Flashes once per stage: `landed` resets at the next windup.
  const landed = cat.landed && cat.changed && !cat.fading;
  const ink = inverted ? GB_SCREEN : GB_INK;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: showBar
          ? `${height}px 1fr 150px`
          : `${height}px 1fr`,
        gap: 8,
        alignItems: "center",
        height,
        background: inverted ? GB_INK : undefined,
        color: ink,
        animation: rowAnimation(cat),
        padding: inverted ? "0 4px" : undefined,
      }}
    >
      <div
        style={{
          animation: landed ? "gb-flash 600ms steps(3) both" : undefined,
        }}
      >
        <LcdSprite
          url={cat.previewUrl}
          alt={cat.label}
          size={height - 4}
          catId={cat.id}
        />
      </div>
      <div
        style={{
          fontSize: small ? 9 : 12,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {rowName(cat, number)}
        {small ? null : (
          <small
            style={{
              display: "block",
              fontSize: 8,
              color: inverted ? GB_SCREEN : GB_DIM,
              marginTop: 4,
            }}
          >
            {cat.marked ? "MARKED" : "KIT"} · Lv.
            {Math.round(revealRatio * 9) + 1}
          </small>
        )}
      </div>
      {showBar ? <RevealBar ratio={revealRatio} ink={ink} /> : null}
    </div>
  );
}

function RevealBar({ ratio, ink }: Readonly<{ ratio: number; ink: string }>) {
  return (
    <div style={{ fontSize: 9, textAlign: "right" }}>
      REV{" "}
      <span
        style={{
          display: "inline-block",
          width: 120,
          height: 8,
          border: `2px solid ${ink}`,
          position: "relative",
          verticalAlign: "middle",
          marginLeft: 4,
        }}
      >
        <i
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${Math.round(ratio * 100)}%`,
            background: ink,
            transition: "width 600ms steps(6)",
          }}
        />
      </span>
    </div>
  );
}
