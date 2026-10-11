"use client";

import {
  type BatchBoardCat,
  type BatchBoardStage,
  stageStripWindow,
} from "../batchModel";
import type { BatchBoardProps } from "../LookBoardProps";
import { chunkBySizes, splitColumns } from "../layout";
import { useChangeTick, useTypewriter } from "../motion";
import { poolNumber } from "../shared";
import { GB_DIM, GB_INK, GB_SCREEN } from "./gbSprite";
import {
  HandheldShell,
  LCD_HEIGHT,
  LcdBox,
  LcdLink,
  LcdSprite,
} from "./HandheldShell";

const TOP_H = 56;
const TEXT_H = 122;
const PAD = 16;
const PARTY_W = 600;
const ROWS_PER_COLUMN = 10;

/**
 * PARTY screen: every kit still in the pool is a party row (number, sprite,
 * name, reveal bar); kits that left sit in BOX 1 · RELEASED. A spotlight
 * takes over the box as a big LOOK view. Marked = inverted blinking row,
 * potential = "?" after the name, favourite = ♥.
 *
 * Motion: a new layer flashes every sprite (gb-flash), a culled row blinks
 * inverted then steps out, the LOOK sprite flashes in, the text box types.
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

  const message = (() => {
    if (model.phase === "done") {
      return `${model.remaining} KITS ARE READY FOR THE ADOPT RUN!\n${model.qrUrl ? "SEND VIA LINK?  ▶YES   NO" : "SAVING…"}`;
    }
    if (model.phase === "awaitingCull") {
      return `${model.remaining} KITS IN THE PARTY.\nWHO LEAVES? ▶ CHOOSE ONE`;
    }
    return `${model.statusLabel.toUpperCase()}\n${model.remaining} KITS → ${model.finalCount}`;
  })();
  const typed = useTypewriter(message, 24);

  return (
    <HandheldShell>
      <LcdBox
        style={{
          left: PAD,
          top: PAD,
          right: PAD,
          height: TOP_H,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 18px",
          fontSize: 15,
        }}
      >
        <span>
          ADOPT RUN ◆ STAGE{" "}
          {Math.min(model.stageIndex + 1, model.stages.length)}/
          {model.stages.length}
        </span>
        <span
          key={model.remaining}
          style={{ animation: "gb-flash 500ms steps(3) both" }}
        >
          KITS {model.remaining}/{model.poolCount}
        </span>
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
        {model.qrUrl ? <LcdLink url={model.qrUrl} /> : null}
      </LcdBox>
    </HandheldShell>
  );
}

function stageColour(stage: BatchBoardStage): string {
  if (stage.current) return GB_INK;
  return stage.revealed ? GB_DIM : "rgba(48,98,48,.35)";
}

function rowAnimation(cat: BatchBoardCat): string | undefined {
  if (cat.fading) return "look-leave 900ms steps(5) forwards";
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
  const tick = useChangeTick(cat.previewUrl);
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
        key={tick}
        style={{
          animation: tick > 0 ? "gb-flash 600ms steps(3) both" : undefined,
        }}
      >
        <LcdSprite url={cat.previewUrl} alt={cat.label} size={height - 4} />
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
