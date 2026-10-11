"use client";

import {
  type BatchBoardCat,
  type BatchBoardModel,
  type BatchBoardStage,
  stageStripWindow,
} from "../batchModel";
import { describeCat } from "../describeCat";
import { LOOK_FONT_MONO } from "../fonts";
import type { BatchBoardProps } from "../LookBoardProps";
import { chunkBySizes, splitColumns } from "../layout";
import { useChangeTick } from "../motion";
import { LookSprite, poolNumber } from "../shared";
import {
  AL_FAINT,
  AL_INK,
  AL_RED,
  AL_RULE,
  AllegiancesBookplate,
  AllegiancesPage,
  AllegiancesPlate,
  AllegiancesSection,
} from "./AllegiancesPage";

const ROWS_PER_COLUMN = 10;

function rosterFontSize(compact: boolean, rowHeight: number): number {
  if (compact) return 15;
  return rowHeight >= 60 ? 17.5 : 15.5;
}

function stageColour(stage: BatchBoardStage): string {
  if (stage.current) return AL_RED;
  return stage.revealed ? AL_INK : AL_FAINT;
}

/**
 * The Nursery: every kit in the pool is a roster line with its number; the
 * stage strip shows what has been revealed; culled kits are struck through
 * in red ink with the stage they left on. Spotlight = the plate.
 *
 * Motion: a new layer landing flashes the sprite like fresh ink, a cull
 * draws its strike line and stamps the note, the plate stamps in, the
 * bookplate slams down at the end.
 */
export function AllegiancesBatch({ model }: Readonly<BatchBoardProps>) {
  const n = model.cats.length;
  const columnCount = Math.min(3, Math.max(1, Math.ceil(n / ROWS_PER_COLUMN)));
  const columns = chunkBySizes(
    model.cats.map((cat, index) => ({ cat, index })),
    splitColumns(n, Math.ceil(n / columnCount)),
  );
  const plateWidth = columnCount >= 3 ? 200 : 240;
  const contentWidth = 1060 - plateWidth - 30;
  const columnWidth = Math.floor(
    (contentWidth - (columnCount - 1) * 24) / columnCount,
  );
  const rows = Math.max(...columns.map((column) => column.length), 1);
  const rowHeight = Math.min(68, Math.floor(600 / rows));
  const spriteSize = Math.min(56, rowHeight - 8);
  const compact = columnCount >= 3;
  const fontSize = rosterFontSize(compact, rowHeight);
  const gone = model.eliminated.length;
  const plate = model.spotlight;

  return (
    <AllegiancesPage
      title="The Nursery"
      subtitle={`${n} kits came in · ${model.remaining} remain for the adopt run · ${gone} went home`}
      marginNote="BEASTYPAGE · ADOPTION · ELIMINATION"
      folio="118"
    >
      <StageStrip model={model} />

      {columns.map((column, columnIndex) => (
        <div
          key={column[0]?.cat.id ?? columnIndex}
          style={{
            position: "absolute",
            top: 252,
            left: 120 + columnIndex * (columnWidth + 24),
            width: columnWidth,
          }}
        >
          <AllegiancesSection
            heading={columnIndex === 0 ? "Kits" : " "}
            note={
              columnIndex === 0 ? "to be named by their new Clans" : "continued"
            }
            size={0.92}
          />
          {column.map(({ cat, index }) => (
            <Entry
              key={cat.id}
              cat={cat}
              number={poolNumber(index)}
              rowHeight={rowHeight}
              spriteSize={spriteSize}
              fontSize={fontSize}
              compact={compact}
            />
          ))}
        </div>
      ))}

      {plate?.previewUrl ? (
        <AllegiancesPlate
          key={plate.id}
          width={plateWidth}
          style={{
            top: 254,
            left: 1200 - plateWidth,
            animation: "look-stamp-flat 600ms cubic-bezier(.2,1.3,.4,1) both",
          }}
          caption={
            <>
              <b style={{ fontStyle: "normal", fontVariant: "small-caps" }}>
                Plate.
              </b>{" "}
              {plate.label}
              {plate.favorite ? ", the crowd's favourite" : ""}, held up for the
              camera.
            </>
          }
        >
          <LookSprite
            url={plate.previewUrl}
            alt={plate.label}
            size={plateWidth - 40}
          />
        </AllegiancesPlate>
      ) : null}

      <Tally model={model} top={plate ? 600 : 300} width={plateWidth} />

      {model.qrUrl ? (
        <AllegiancesBookplate
          url={model.qrUrl}
          line="the litter, saved for adoption"
          width={plateWidth + 20}
          style={{
            right: 70,
            bottom: 92,
            animation: "look-stamp 700ms cubic-bezier(.2,1.3,.4,1) both",
            transform: "rotate(-1.5deg)",
          }}
        />
      ) : null}
    </AllegiancesPage>
  );
}

function Tally({
  model,
  top,
  width,
}: Readonly<{ model: BatchBoardModel; top: number; width: number }>) {
  const awaiting = model.phase === "awaitingCull";
  return (
    <div
      style={{
        position: "absolute",
        left: 1200 - width,
        top,
        width,
        borderTop: `1px solid ${AL_RULE}`,
        borderBottom: `1px solid ${AL_RULE}`,
        padding: "10px 0",
        textAlign: "center",
        transition: "top 500ms ease",
      }}
    >
      <div
        key={model.remaining}
        style={{
          fontSize: 64,
          lineHeight: 1,
          fontWeight: 500,
          animation: "look-pop 400ms ease both",
        }}
      >
        {model.remaining}
        <small style={{ fontSize: 22, color: AL_FAINT }}>
          {" "}
          / {model.poolCount}
        </small>
      </div>
      <div
        style={{
          fontVariant: "small-caps",
          letterSpacing: ".3em",
          fontSize: 14,
          color: "#5a4a3a",
        }}
      >
        {model.phase === "done"
          ? "kits for the adopt run"
          : `until ${model.finalCount} remain`}
      </div>
      <div
        style={{
          marginTop: 6,
          fontStyle: "italic",
          fontSize: 15,
          color: awaiting ? AL_RED : AL_FAINT,
          animation: awaiting
            ? "look-pulse 1.4s ease-in-out infinite"
            : undefined,
        }}
      >
        {model.statusLabel}
      </div>
    </div>
  );
}

function StageStrip({ model }: Readonly<{ model: BatchBoardModel }>) {
  const revealing = model.phase === "revealing";
  return (
    <div
      style={{
        position: "absolute",
        top: 204,
        left: 120,
        fontFamily: LOOK_FONT_MONO,
        fontSize: 12,
        letterSpacing: ".2em",
        color: AL_FAINT,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      revealed{" "}
      {stageStripWindow(model.stages).map((stage, index) => (
        <span key={stage.id}>
          {index > 0 ? " · " : ""}
          <span
            style={{
              color: stageColour(stage),
              fontWeight: stage.revealed ? 500 : 400,
              borderBottom: stage.current ? `2px solid ${AL_RED}` : undefined,
              opacity: stage.revealed || stage.current ? 1 : 0.6,
              animation:
                stage.current && revealing
                  ? "look-pulse 0.9s ease-in-out infinite"
                  : undefined,
            }}
          >
            {stage.label}
          </span>
        </span>
      ))}
      {"  ·  "}stage {Math.min(model.stageIndex + 1, model.stages.length)} of{" "}
      {model.stages.length}
    </div>
  );
}

function nameColour(cat: BatchBoardCat): string {
  if (cat.eliminated) return AL_FAINT;
  return cat.marked || cat.spotlight ? AL_RED : AL_INK;
}

function Entry({
  cat,
  number,
  rowHeight,
  spriteSize,
  fontSize,
  compact,
}: Readonly<{
  cat: BatchBoardCat;
  number: string;
  rowHeight: number;
  spriteSize: number;
  fontSize: number;
  compact: boolean;
}>) {
  const out = cat.eliminated;
  const tick = useChangeTick(cat.previewUrl);
  const flash = !out && tick > 0;
  return (
    <div
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: `30px ${spriteSize}px 1fr`,
        gap: 8,
        alignItems: "center",
        height: rowHeight,
      }}
    >
      <span
        style={{
          fontFamily: LOOK_FONT_MONO,
          fontSize: 13,
          color: out ? AL_FAINT : AL_INK,
          letterSpacing: ".04em",
        }}
      >
        {number}
      </span>
      <div
        key={tick}
        style={{
          animation: flash ? "look-flash 600ms ease both" : undefined,
          transition: "filter 900ms ease, opacity 900ms ease",
          filter: out ? "grayscale(1) contrast(.8)" : undefined,
          opacity: out ? 0.45 : 1,
        }}
      >
        <LookSprite url={cat.previewUrl} alt={cat.label} size={spriteSize} />
      </div>
      <p
        style={{
          fontSize,
          lineHeight: 1.2,
          margin: 0,
          color: out ? AL_FAINT : AL_INK,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          transition: "color 900ms ease",
        }}
      >
        <b
          style={{
            fontWeight: 600,
            fontVariant: "small-caps",
            letterSpacing: ".04em",
            fontSize: fontSize + 1,
            color: nameColour(cat),
            background: cat.potential ? "rgba(250, 204, 21, .55)" : undefined,
            padding: cat.potential ? "0 3px" : undefined,
            animation: cat.marked
              ? "look-pulse 1.1s ease-in-out infinite"
              : undefined,
          }}
        >
          {cat.favorite ? "♥ " : ""}
          {cat.label}
        </b>
        {compact ? null : <>—{describeCat(cat.params)}.</>}
      </p>
      {out ? <StrikeOut cat={cat} spriteSize={spriteSize} /> : null}
      {cat.marked ? <Note text="marked to leave" delayMs={0} /> : null}
    </div>
  );
}

function StrikeOut({
  cat,
  spriteSize,
}: Readonly<{ cat: BatchBoardCat; spriteSize: number }>) {
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 40 + spriteSize,
          top: "50%",
          height: 2,
          width: `calc(100% - ${40 + spriteSize}px)`,
          background: AL_RED,
          transform: "rotate(-1.2deg)",
          transformOrigin: "left",
          opacity: 0.85,
          animation: "look-ink 900ms cubic-bezier(.3,0,.2,1) both",
        }}
      />
      <Note text={`went home · stage ${cat.eliminatedAtStage}`} delayMs={700} />
    </>
  );
}

function Note({ text, delayMs }: Readonly<{ text: string; delayMs: number }>) {
  return (
    <div
      style={{
        position: "absolute",
        right: 0,
        top: -2,
        fontStyle: "italic",
        fontSize: 12,
        color: AL_RED,
        transform: "rotate(-3deg)",
        animation: `look-stamp-flat 500ms ease ${delayMs}ms both`,
      }}
    >
      {text}
    </div>
  );
}
