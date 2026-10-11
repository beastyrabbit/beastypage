"use client";

import type { CSSProperties } from "react";
import {
  type BatchBoardCat,
  type BatchBoardModel,
  type BatchBoardStage,
  stageStripWindow,
} from "../batchModel";
import { LOOK_FONT_DISPLAY, LOOK_FONT_HAND, LOOK_FONT_MONO } from "../fonts";
import type { BatchBoardProps } from "../LookBoardProps";
import { packGrid } from "../layout";
import { LOOK_KEYFRAMES, LookQr, LookSprite, poolNumber } from "../shared";

const INK = "#2b2825";
const SOIL = "#4a4034";
const STRING = "#b3261e";
const PAPER = "#eeeae0";
const TRENCH = { left: 110, top: 160, width: 800, height: 860 };
/** The finds register column; the plaque prints inside it, so it is as wide as the margin allows. */
const REGISTER = { left: 940, top: 160, width: 300, pad: 16 };

/** "A", "B", … for a grid column. */
function columnLetter(column: number): string {
  return String.fromCodePoint(65 + column);
}

function squareRef(index: number, columns: number): string {
  return `${columnLetter(index % columns)}${Math.floor(index / columns) + 1}`;
}

function registerState(cat: BatchBoardCat): string {
  if (cat.marked) return "marked";
  return cat.potential ? "maybe" : "kept";
}

function stageColour(stage: BatchBoardStage): string {
  if (stage.current) return STRING;
  return stage.revealed ? INK : "#9a958c";
}

/**
 * Trench plan: the pool is an excavation grid. Every kit is a find with a
 * yellow find tag (pink with ♥ for favourites); culled squares get hatched
 * and stamped BACKFILLED with the stage.
 *
 * Motion: a new layer flashes every find like a fresh brush pass, a cull
 * shakes the find loose, hatches the square left to right and slams the
 * stamp, the finds register stamps RETAINED at the end and the finds bag
 * drops in.
 */
export function TrenchBatch({ model }: Readonly<BatchBoardProps>) {
  const n = model.cats.length;
  const grid = packGrid(n, TRENCH.width, TRENCH.height);
  const columns = grid.columns;
  const rows = Math.ceil(n / columns);
  const cellW = TRENCH.width / columns;
  const cellH = TRENCH.height / rows;
  const sprite = Math.max(
    56,
    Math.min(150, Math.floor(cellH - 60), Math.floor(cellW - 40)),
  );
  const compact = cellH < 140;

  return (
    <div
      data-look="strata"
      style={{
        position: "relative",
        width: 1280,
        height: 1080,
        overflow: "hidden",
        color: INK,
        fontFamily: LOOK_FONT_DISPLAY,
        background: `linear-gradient(rgba(60,80,120,.16) 1px,transparent 1px),linear-gradient(90deg,rgba(60,80,120,.16) 1px,transparent 1px),
          linear-gradient(rgba(60,80,120,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(60,80,120,.08) 1px,transparent 1px),${PAPER}`,
        backgroundSize: "100px 100px,100px 100px,20px 20px,20px 20px",
      }}
    >
      <style>{`${LOOK_KEYFRAMES}
@keyframes trench-marked { 0%,100% { box-shadow: inset 0 0 0 3px rgba(179,38,30,.55); } 50% { box-shadow: inset 0 0 0 6px rgba(179,38,30,1); } }`}</style>

      <Heading model={model} />
      <NorthArrow />

      {Array.from({ length: columns }, (_, c) => (
        <div
          key={`c${c.toString()}`}
          style={{
            position: "absolute",
            top: TRENCH.top - 28,
            left: TRENCH.left + c * cellW,
            width: cellW,
            textAlign: "center",
            font: `13px ${LOOK_FONT_MONO}`,
            letterSpacing: ".2em",
            color: SOIL,
          }}
        >
          {columnLetter(c)}
        </div>
      ))}
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={`r${r.toString()}`}
          style={{
            position: "absolute",
            left: 70,
            top: TRENCH.top + r * cellH,
            height: cellH,
            width: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            font: `13px ${LOOK_FONT_MONO}`,
            color: SOIL,
          }}
        >
          {r + 1}
        </div>
      ))}

      <div
        style={{
          position: "absolute",
          ...TRENCH,
          background: "rgba(120,96,70,.18)",
          border: `2px solid ${SOIL}`,
        }}
      >
        {Array.from({ length: columns - 1 }, (_, i) => (
          <div
            key={`v${i.toString()}`}
            style={{
              position: "absolute",
              left: (i + 1) * cellW,
              top: 0,
              bottom: 0,
              width: 1.5,
              background: STRING,
              opacity: 0.8,
            }}
          />
        ))}
        {Array.from({ length: rows - 1 }, (_, i) => (
          <div
            key={`h${i.toString()}`}
            style={{
              position: "absolute",
              top: (i + 1) * cellH,
              left: 0,
              right: 0,
              height: 1.5,
              background: STRING,
              opacity: 0.8,
            }}
          />
        ))}
        {model.cats.map((cat, index) => (
          <Square
            key={cat.id}
            cat={cat}
            index={index}
            left={(index % columns) * cellW}
            top={Math.floor(index / columns) * cellH}
            width={cellW}
            height={cellH}
            sprite={sprite}
            compact={compact}
          />
        ))}
      </div>

      <FindsRegister model={model} columns={columns} />
      {model.qrUrl ? <FindsBag url={model.qrUrl} /> : null}
      <ScaleBar />
    </div>
  );
}

function Heading({ model }: Readonly<{ model: BatchBoardModel }>) {
  const retained = model.phase === "done" ? "retained" : "still in the ground";
  const choosing =
    model.phase === "awaitingCull"
      ? " · choosing which square to backfill"
      : "";
  return (
    <div style={{ position: "absolute", left: 70, top: 28 }}>
      <h1 style={{ fontSize: 36, fontWeight: 600, lineHeight: 1, margin: 0 }}>
        Trench 2 · plan at stage{" "}
        {Math.min(model.stageIndex + 1, model.stages.length)} of{" "}
        {model.stages.length}
      </h1>
      <p
        style={{
          fontStyle: "italic",
          fontSize: 20,
          color: "#5f5a52",
          margin: "4px 0 0",
        }}
      >
        the adoption pool, dug as a site: {model.poolCount} squares,{" "}
        {model.eliminated.length} backfilled, {model.remaining} finds {retained}
        {choosing}
      </p>
      <StageStrip model={model} />
    </div>
  );
}

function NorthArrow() {
  return (
    <div
      style={{
        position: "absolute",
        left: 1130,
        top: 40,
        width: 70,
        height: 70,
        border: `1.5px solid ${SOIL}`,
        borderRadius: "50%",
        fontFamily: LOOK_FONT_MONO,
        fontSize: 12,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: 4,
        color: SOIL,
      }}
    >
      {"N"}
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: 22,
          width: 2,
          height: 40,
          background: SOIL,
          marginLeft: -1,
        }}
      />
    </div>
  );
}

function FindsRegister({
  model,
  columns,
}: Readonly<{ model: BatchBoardModel; columns: number }>) {
  const survivors = model.cats.filter((cat) => !cat.eliminated);
  const twoCol = survivors.length > 14;
  const awaiting = model.phase === "awaitingCull";
  return (
    <div
      style={{
        position: "absolute",
        left: REGISTER.left,
        top: REGISTER.top,
        width: REGISTER.width,
        height: model.qrUrl ? 620 : 860,
        background: "#fbfaf6",
        border: "1px solid #cfc9bd",
        boxShadow: "0 10px 24px rgba(0,0,0,.12)",
        padding: `${REGISTER.pad}px`,
        overflow: "hidden",
        transition: "height 500ms ease",
      }}
    >
      <h2
        style={{
          fontSize: 12,
          letterSpacing: ".3em",
          fontFamily: LOOK_FONT_MONO,
          fontWeight: 400,
          color: "#6b665e",
          borderBottom: "1px solid #cfc9bd",
          paddingBottom: 8,
          margin: "0 0 6px",
        }}
      >
        FINDS REGISTER · {model.remaining} IN THE GROUND
      </h2>
      {/* The wrapper's plaque (trait, roll status, tally) is the register's first entry; always mounted. The column is narrower than a tally can run, so the overrun fades at the edge. */}
      <div
        data-plaque-slot=""
        style={{
          width: "100%",
          height: 120,
          marginBottom: 6,
          borderBottom: "1px solid #cfc9bd",
          overflow: "hidden",
          maskImage: "linear-gradient(90deg, #000 92%, transparent)",
          WebkitMaskImage: "linear-gradient(90deg, #000 92%, transparent)",
          ["--obs-plaque-ink" as string]: INK,
          ["--obs-plaque-muted" as string]: "#6b665e",
          ["--obs-plaque-accent" as string]: STRING,
          ["--obs-plaque-shadow" as string]: "none",
          ["--obs-plaque-title-size" as string]: "30px",
          ["--obs-plaque-font-serif" as string]: LOOK_FONT_DISPLAY,
          ["--obs-plaque-font-mono" as string]: LOOK_FONT_MONO,
        }}
      />
      <div
        style={{
          columnCount: twoCol ? 2 : 1,
          columnGap: 10,
          fontFamily: LOOK_FONT_MONO,
          fontSize: twoCol ? 10 : 11.5,
        }}
      >
        {survivors.map((cat) => {
          const index = model.cats.indexOf(cat);
          return (
            <div
              key={cat.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 6,
                padding: twoCol ? "4px 0" : "7px 0",
                borderBottom: "1px dotted #d8d2c6",
                breakInside: "avoid",
                color: cat.marked ? STRING : INK,
              }}
            >
              <span style={{ color: "#6b665e" }}>F-{poolNumber(index)}</span>
              <span
                style={{
                  fontFamily: LOOK_FONT_DISPLAY,
                  fontSize: twoCol ? 14 : 18,
                  fontWeight: 600,
                  fontStyle: "italic",
                  flex: 1,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {cat.label}
                {cat.favorite ? " ♥" : ""}
              </span>
              {twoCol ? null : (
                <span style={{ color: "#6b665e", fontSize: 10.5 }}>
                  {squareRef(index, columns)} · {registerState(cat)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {model.phase === "done" ? (
        <div
          style={{
            position: "absolute",
            right: -6,
            bottom: 28,
            border: `3px solid ${STRING}`,
            color: STRING,
            font: `13px/1.3 ${LOOK_FONT_MONO}`,
            letterSpacing: ".2em",
            padding: "10px 12px",
            textAlign: "center",
            background: "rgba(251,250,246,.8)",
            animation: "look-stamp 600ms cubic-bezier(.2,1.3,.4,1) both",
            transform: "rotate(-14deg)",
          }}
        >
          RETAINED FOR
          <br />
          ADOPTION · {model.remaining}
        </div>
      ) : (
        <div
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: 16,
            fontStyle: "italic",
            fontSize: 16,
            color: awaiting ? STRING : "#6b665e",
            animation: awaiting
              ? "look-pulse 1.4s ease-in-out infinite"
              : undefined,
          }}
        >
          {registerNote(model)}
        </div>
      )}
    </div>
  );
}

/** The register's foot in the dig's voice; the trait stays named through the verdict. */
function registerNote(model: BatchBoardModel): string {
  const trait = model.traitLabel;
  const leavingIndex = model.cats.findIndex((cat) => cat.fading);
  const leaving = leavingIndex >= 0 ? poolNumber(leavingIndex) : "??";
  switch (model.beat) {
    case "loading":
      return "surveying the site…";
    case "windup":
    case "deal":
      return `brushing back for ${trait}…`;
    case "hold":
      return `${trait} exposed`;
    case "awaiting":
      return `${trait} exposed · say a square to backfill`;
    case "verdict":
      return `${trait} exposed · lifting F-${model.verdictNumber ?? "??"}…`;
    case "depart":
      return `F-${leaving} lifted · backfilling`;
    case "repack":
      return "tidying the plan…";
    case "done":
      return model.statusLabel;
  }
}

function FindsBag({ url }: Readonly<{ url: string }>) {
  return (
    <div
      style={{
        position: "absolute",
        left: 960,
        top: 812,
        width: 250,
        height: 208,
        background: "#f6f6f4",
        border: "1px solid #cfd3d8",
        boxShadow: "0 10px 24px rgba(0,0,0,.14)",
        padding: 12,
        transform: "rotate(2deg)",
        animation: "look-drop 800ms cubic-bezier(.2,1.2,.4,1) 300ms both",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 14,
          background:
            "repeating-linear-gradient(90deg,#9aa3ad 0 8px,#e2e6ea 8px 16px)",
        }}
      />
      <LookQr
        url={url}
        size={130}
        fg="#1d1b19"
        style={{ position: "absolute", left: 12, top: 30 }}
      />
      <div
        style={{
          position: "absolute",
          left: 150,
          top: 34,
          font: `11px/1.6 ${LOOK_FONT_MONO}`,
          letterSpacing: ".06em",
        }}
      >
        <b
          style={{
            display: "block",
            fontSize: 12,
            letterSpacing: ".2em",
            marginBottom: 4,
          }}
        >
          FINDS BAG
        </b>
        TRENCH 2
        <br />
        SCAN FOR
        <br />
        THE RECORD
      </div>
    </div>
  );
}

function ScaleBar() {
  return (
    <div
      style={{
        position: "absolute",
        left: 110,
        top: 1036,
        font: `11px ${LOOK_FONT_MONO}`,
        letterSpacing: ".2em",
        color: SOIL,
      }}
    >
      {"0"}
      <i
        style={{
          display: "inline-block",
          width: 200,
          height: 6,
          border: `1px solid ${SOIL}`,
          verticalAlign: "middle",
          margin: "0 8px",
          background: `linear-gradient(90deg,${SOIL} 0 50%,transparent 50%)`,
        }}
      />
      {"1 fox-length"}
    </div>
  );
}

function StageStrip({ model }: Readonly<{ model: BatchBoardModel }>) {
  const revealing = model.phase === "revealing";
  return (
    <div
      style={{
        fontFamily: LOOK_FONT_MONO,
        fontSize: 11,
        letterSpacing: ".26em",
        color: "#6b665e",
        marginTop: 8,
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
    </div>
  );
}

/** Shake for 1000 ms, then lift out by 1600 ms: the depart beat's end, where the hatch and stamp take over. */
function spriteAnimation(cat: BatchBoardCat): string | undefined {
  if (cat.fading) {
    return "look-shake 500ms ease 2, look-leave 600ms ease 1000ms forwards";
  }
  return undefined;
}

function labelColour(cat: BatchBoardCat, out: boolean): string {
  if (out) return "rgba(74,64,52,.5)";
  return cat.marked ? STRING : SOIL;
}

function Square({
  cat,
  index,
  left,
  top,
  width,
  height,
  sprite,
  compact,
}: Readonly<{
  cat: BatchBoardCat;
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
  sprite: number;
  compact: boolean;
}>) {
  const out = cat.eliminated && !cat.fading;
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: cat.potential
          ? "inset 0 0 0 4px rgba(243,211,90,.9)"
          : undefined,
        animation: cat.marked
          ? "trench-marked 1.1s ease-in-out infinite"
          : undefined,
      }}
    >
      {out ? (
        <Hatching />
      ) : (
        <FindTag cat={cat} index={index} compact={compact} />
      )}
      {cat.spotlight && !out ? <SpotlightRing /> : null}
      <div
        style={{
          animation: spriteAnimation(cat),
          opacity: out ? 0.22 : 1,
          filter: out
            ? "grayscale(1)"
            : "drop-shadow(0 6px 6px rgba(0,0,0,.25))",
          transition: "opacity 600ms, filter 600ms",
        }}
      >
        <LookSprite
          url={cat.previewUrl}
          alt={cat.label}
          size={sprite}
          catId={cat.id}
          landed={!out && cat.landed && cat.changed}
        />
      </div>
      <div
        style={{
          fontFamily: LOOK_FONT_HAND,
          fontSize: compact ? 18 : 24,
          color: labelColour(cat, out),
          marginTop: -6,
          transform: "rotate(-2deg)",
          whiteSpace: "nowrap",
          maxWidth: width - 8,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {cat.label}
      </div>
      {out ? (
        <BackfilledStamp stage={cat.eliminatedAtStage} compact={compact} />
      ) : null}
    </div>
  );
}

function Hatching() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        background:
          "repeating-linear-gradient(45deg,transparent 0 9px,rgba(74,64,52,.35) 9px 11px)",
        animation: "look-wipe 900ms cubic-bezier(.3,0,.2,1) both",
      }}
    />
  );
}

function FindTag({
  cat,
  index,
  compact,
}: Readonly<{ cat: BatchBoardCat; index: number; compact: boolean }>) {
  return (
    <div
      style={{
        position: "absolute",
        left: 10,
        top: 10,
        background: cat.favorite ? "#f29bb0" : "#f3d35a",
        color: INK,
        font: `${compact ? 9 : 11}px/1.2 ${LOOK_FONT_MONO}`,
        padding: "4px 6px",
        boxShadow: "1px 2px 3px rgba(0,0,0,.3)",
        transform: "rotate(-4deg)",
        letterSpacing: ".1em",
        animation: "look-drop 400ms ease both",
      }}
    >
      F-{poolNumber(index)}
      {cat.favorite ? " ♥" : ""}
    </div>
  );
}

function SpotlightRing() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 10,
        border: `2px dashed ${STRING}`,
        borderRadius: "50%",
        animation: "look-stamp-flat 500ms cubic-bezier(.2,1.3,.4,1) both",
      }}
    />
  );
}

function BackfilledStamp({
  stage,
  compact,
}: Readonly<{ stage: number | null; compact: boolean }>) {
  const style: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    border: `2.5px solid ${STRING}`,
    color: STRING,
    font: `${compact ? 9 : 12}px/1.4 ${LOOK_FONT_MONO}`,
    letterSpacing: ".2em",
    padding: compact ? "3px 6px" : "6px 10px",
    textAlign: "center",
    background: "rgba(238,234,224,.7)",
    whiteSpace: "nowrap",
    marginLeft: compact ? -44 : -60,
    marginTop: compact ? -18 : -24,
    animation: "look-stamp 600ms cubic-bezier(.2,1.3,.4,1) 700ms both",
    transform: "rotate(-14deg)",
  };
  return (
    <div style={style}>
      BACKFILLED
      <br />
      STAGE {stage}
    </div>
  );
}
