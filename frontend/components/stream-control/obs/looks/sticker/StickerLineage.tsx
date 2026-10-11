"use client";

import {
  type LineageCatState,
  type LineageReveal,
  type LineageRoll,
  lineageBranchOpen,
  lineageCatState,
  lineageSpriteUrl,
} from "../ceremony";
import { LOOK_FONT_SANS } from "../fonts";
import type { LineageBoardProps } from "../LookBoardProps";
import {
  additionTags,
  type LineageBranch,
  type LineageCat,
  lineageRank,
} from "../lineageModel";
import { LookQr, poolNumber } from "../shared";
import {
  AlbumPage,
  AlbumSpread,
  CompleteShout,
  EmptySlot,
  PackTag,
  ST_BROWN,
  ST_NAVY,
  ST_PINK,
  ST_ROUNDED,
  Sticker,
  StickerNumber,
} from "./StickerAlbum";

const LEFT = { left: 30, width: 340 };
const RIGHT = { left: 384, width: 866 };

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** What the left page says is happening right now: the roll by name, the value at land. */
function ceremonyStatus(reveal: LineageReveal): string {
  const roll = reveal.roll;
  if (reveal.charging) {
    if (!roll) return "opening a pack…";
    const trait = roll.traitLabel.toLowerCase();
    if (roll.valueLabel) return `${trait}: ${roll.valueLabel}!`;
    return `opening a pack · rolling ${trait} · ${(roll.index + 1).toString()} of ${roll.count.toString()}…`;
  }
  if (reveal.step.kind === "banner") {
    return `new row: the ${reveal.activeBranch ?? ""} line`;
  }
  return "sticking it in…";
}

function slotLabel(
  cat: LineageCat | null,
  state: LineageCatState,
  level: number,
  roll: LineageRoll | null,
): string {
  if (!cat || state === "hidden") {
    return `${lineageRank({ level: level + 1 })} · ???`;
  }
  if (state !== "charging") return cat.label;
  if (!roll) return "opening…";
  if (roll.valueLabel) return roll.valueLabel;
  return `${roll.traitLabel.toLowerCase()} · ${(roll.index + 1).toString()}/${roll.count.toString()}…`;
}

/**
 * The lineage as a sticker album: the starter is the big sticker on the
 * left page, every branch is a row of numbered slots on the right page.
 * During the ceremony a pack shakes over the slot being opened (teaser
 * flickering as a mystery silhouette), then the sticker peels in with its
 * foil corner. The newest sticker is holographic.
 */
export function StickerLineage({ model, reveal }: Readonly<LineageBoardProps>) {
  const branches = model.branches;
  const levels = model.maxLevels;
  const rows = Math.max(1, branches.length);
  const rowHeight = Math.min(230, Math.floor(820 / rows));
  const slot = Math.min(
    150,
    rowHeight - 70,
    Math.floor(700 / Math.max(2, levels)),
  );
  const done = !reveal || reveal.done;
  const newest = model.cats.at(-1) ?? null;
  const starter = model.starter;
  const starterState = starter
    ? lineageCatState(reveal, starter.key)
    : "hidden";
  const revealedCount = reveal ? reveal.revealedKeys.size : model.cats.length;

  return (
    <AlbumSpread title="Stream litter · evolution set">
      <AlbumPage
        side="left"
        {...LEFT}
        heading="Evo Set"
        sub={`Series 2026 · ${revealedCount} of ${model.totalCount} collected`}
      >
        {starter && starterState !== "hidden" ? (
          <StarterSticker cat={starter} state={starterState} />
        ) : (
          <div
            style={{ position: "relative", margin: "26px auto 0", width: 250 }}
          >
            <EmptySlot size={250} stamp="STARTER" round />
          </div>
        )}
        <div
          style={{
            position: "absolute",
            left: 24,
            right: 24,
            bottom: 70,
            font: `700 14px ${LOOK_FONT_SANS}`,
            color: ST_BROWN,
            lineHeight: 1.5,
          }}
        >
          {plural(branches.length, "line")} · {plural(levels, "sticker")} each
          <br />
          {reveal && !reveal.done ? (
            <span style={{ color: ST_PINK }}>{ceremonyStatus(reveal)}</span>
          ) : (
            <span>set complete</span>
          )}
        </div>
        {/* The plaque writes the roll under the starter sticker; always mounted. */}
        <div
          data-plaque-slot=""
          style={{
            position: "absolute",
            left: 10,
            top: 530,
            width: 320,
            height: 120,
            overflow: "hidden",
            ["--obs-plaque-ink" as string]: ST_NAVY,
            ["--obs-plaque-muted" as string]: ST_BROWN,
            ["--obs-plaque-accent" as string]: ST_PINK,
            ["--obs-plaque-shadow" as string]: "none",
            ["--obs-plaque-title-size" as string]: "30px",
          }}
        />
        {done ? (
          <CompleteShout
            style={{ bottom: 100, fontSize: 40 }}
            text="SET DONE!"
          />
        ) : null}
      </AlbumPage>

      <AlbumPage
        side="right"
        {...RIGHT}
        heading="Sticker sheet"
        sub={`${branches.length} rows · ${levels} per row · newest is holo`}
      >
        {branches.map((branch, rowIndex) => (
          <StickerRow
            key={branch.label}
            branch={branch}
            rowIndex={rowIndex}
            rowHeight={rowHeight}
            levels={levels}
            slot={slot}
            reveal={reveal}
            newestKey={done ? (newest?.key ?? null) : null}
          />
        ))}
        {done ? (
          <PackTag
            line1="ALL"
            line2="COLLECTED"
            style={{ right: 18, top: 12 }}
          />
        ) : null}
      </AlbumPage>

      {done ? <OrderForm url={model.url} /> : null}
    </AlbumSpread>
  );
}

function StarterSticker({
  cat,
  state,
}: Readonly<{ cat: LineageCat; state: LineageCatState }>) {
  return (
    <>
      <div style={{ position: "relative", margin: "26px auto 0", width: 250 }}>
        <div
          data-lineage-key={cat.key}
          style={{
            position: "relative",
            width: 250,
            height: 250,
            animation:
              state === "revealing"
                ? "look-peel 900ms cubic-bezier(.2,1.2,.4,1) both"
                : undefined,
          }}
        >
          <Sticker
            url={cat.previewUrl}
            alt={cat.label}
            size={250}
            style={{ transform: "rotate(-7deg)", border: "8px solid #fff" }}
          />
          <StickerNumber text="00" size={40} style={{ left: 10, top: 10 }} />
        </div>
      </div>
      <div style={{ textAlign: "center", marginTop: 12 }}>
        <div style={{ font: `900 24px ${ST_ROUNDED}`, color: ST_NAVY }}>
          {cat.label}
        </div>
        <div
          style={{
            font: `700 11px ${LOOK_FONT_SANS}`,
            color: ST_BROWN,
            letterSpacing: ".14em",
          }}
        >
          THE ORIGIN STICKER · KIT
        </div>
      </div>
    </>
  );
}

function StickerRow({
  branch,
  rowIndex,
  rowHeight,
  levels,
  slot,
  reveal,
  newestKey,
}: Readonly<{
  branch: LineageBranch;
  rowIndex: number;
  rowHeight: number;
  levels: number;
  slot: number;
  reveal: LineageReveal | undefined;
  newestKey: string | null;
}>) {
  const open = lineageBranchOpen(reveal, branch.label);
  return (
    <div
      style={{
        position: "absolute",
        left: 24,
        right: 24,
        top: 110 + rowIndex * rowHeight,
        height: rowHeight - 12,
        opacity: open ? 1 : 0.25,
        transition: "opacity 400ms",
      }}
    >
      <div
        style={{
          font: `900 16px ${ST_ROUNDED}`,
          color: branch.theme.to,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          animation: open ? "look-wipe 600ms ease both" : undefined,
        }}
      >
        {branch.theme.glyph} {branch.label} line
        <span
          style={{
            font: `700 11px ${LOOK_FONT_SANS}`,
            color: ST_BROWN,
            marginLeft: 10,
          }}
        >
          {branch.theme.blurb}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          gap: 22,
          marginTop: 10,
          alignItems: "flex-start",
        }}
      >
        {Array.from({ length: levels }, (_, level) => (
          <Slot
            key={level.toString()}
            cat={branch.cats[level] ?? null}
            level={level}
            number={poolNumber(rowIndex * levels + level)}
            slot={slot}
            reveal={reveal}
            newestKey={newestKey}
          />
        ))}
      </div>
    </div>
  );
}

function Slot({
  cat,
  level,
  number,
  slot,
  reveal,
  newestKey,
}: Readonly<{
  cat: LineageCat | null;
  level: number;
  number: string;
  slot: number;
  reveal: LineageReveal | undefined;
  newestKey: string | null;
}>) {
  const state = cat ? lineageCatState(reveal, cat.key) : "hidden";
  const empty = !cat || state === "hidden";
  const isNewest = Boolean(cat) && cat?.key === newestKey;
  const roll = state === "charging" ? (reveal?.roll ?? null) : null;
  const firstTag = cat ? additionTags(cat.additions, 1)[0] : undefined;
  return (
    <div
      style={{ position: "relative", width: slot + 20, textAlign: "center" }}
    >
      {empty || !cat ? (
        <div style={{ position: "relative", margin: "0 auto", width: slot }}>
          <EmptySlot size={slot} stamp="NEED" round />
          <StickerNumber text={number} muted style={{ left: -6, top: -6 }} />
        </div>
      ) : (
        <PlacedSticker
          cat={cat}
          state={state}
          roll={roll}
          landingAt={reveal?.landing?.at ?? null}
          url={lineageSpriteUrl(state, reveal, cat.previewUrl)}
          number={number}
          slot={slot}
          holo={isNewest}
        />
      )}
      <div
        style={{
          marginTop: 6,
          font: `800 13px ${LOOK_FONT_SANS}`,
          color: empty ? "#b8b0a2" : "#4a443c",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {slotLabel(cat, state, level, roll)}
      </div>
      {cat && !empty && (state !== "charging" || roll?.valueLabel) ? (
        <div
          style={{
            font: `700 10px ${LOOK_FONT_SANS}`,
            color: ST_BROWN,
            letterSpacing: ".08em",
          }}
        >
          {lineageRank(cat).toUpperCase()}
          {rankSuffix(roll?.valueLabel, firstTag)}
        </div>
      ) : null}
    </div>
  );
}

/** Rank-line suffix: the value just landed, else the cat's first tag. */
function rankSuffix(
  valueLabel: string | null | undefined,
  firstTag: string | undefined,
): string {
  if (valueLabel) return ` · +${valueLabel}`;
  if (firstTag) return ` · ${firstTag}`;
  return "";
}

function PlacedSticker({
  cat,
  state,
  roll,
  landingAt,
  url,
  number,
  slot,
  holo,
}: Readonly<{
  cat: LineageCat;
  state: LineageCatState;
  roll: LineageRoll | null;
  /** Scheduled land time of the latest land: keys the holo-star burst. */
  landingAt: number | null;
  url: string | null;
  number: string;
  slot: number;
  holo: boolean;
}>) {
  const charging = state === "charging";
  const phase = roll?.phase;
  // The foil hides the strobe; the near miss and the land show through it.
  const mystery =
    charging &&
    phase !== "slowdown" &&
    phase !== "nearmiss" &&
    phase !== "land";
  // The holo star is the look's own burst at the land and through the peel.
  const burst = (charging && phase === "land") || state === "revealing";
  return (
    <div
      data-lineage-key={cat.key}
      style={{
        position: "relative",
        margin: "0 auto",
        width: slot,
        animation:
          state === "revealing"
            ? "look-peel 900ms cubic-bezier(.2,1.2,.4,1) both"
            : undefined,
      }}
    >
      <Sticker
        url={url}
        alt={cat.label}
        size={slot}
        mystery={mystery}
        holo={holo}
        ring={charging && phase !== "land" ? ST_PINK : undefined}
      />
      <StickerNumber text={number} style={{ left: -6, top: -6 }} />
      {charging && phase !== "land" ? (
        <PackTag
          line1="PACK"
          line2={lineageRank(cat).toUpperCase()}
          shaking={phase !== "nearmiss"}
          style={{ right: -40, top: -26, width: 90 }}
        />
      ) : null}
      {holo || burst ? (
        <i
          key={burst ? (landingAt ?? 0).toString() : "holo"}
          style={{
            position: "absolute",
            right: -8,
            top: -14,
            fontSize: 30,
            fontStyle: "normal",
            background:
              "linear-gradient(45deg,#ff9fd6,#ffe37a,#8df0ff,#c89cff)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 1px 1px rgba(0,0,0,.4))",
            animation: burst
              ? "look-stamp 700ms cubic-bezier(.2,1.3,.4,1) both"
              : undefined,
          }}
        >
          ★
        </i>
      ) : null}
    </div>
  );
}

function OrderForm({ url }: Readonly<{ url: string }>) {
  return (
    <div
      style={{
        position: "absolute",
        left: 1000,
        top: 760,
        width: 250,
        height: 290,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 16px 40px rgba(0,0,0,.4)",
          transform: "rotate(-3deg)",
          padding: 12,
          textAlign: "center",
          animation: "look-drop 700ms cubic-bezier(.2,1.2,.4,1) both",
        }}
      >
        <div
          style={{
            font: `900 16px ${ST_ROUNDED}`,
            color: ST_NAVY,
            marginBottom: 8,
          }}
        >
          Order form
        </div>
        <div
          style={{ display: "inline-block", padding: 8, background: "#fff" }}
        >
          <LookQr url={url} size={190} fg={ST_NAVY} />
        </div>
        <div
          style={{
            font: `700 12px ${LOOK_FONT_SANS}`,
            color: ST_NAVY,
            marginTop: 6,
          }}
        >
          scan for every roll
        </div>
      </div>
    </div>
  );
}
