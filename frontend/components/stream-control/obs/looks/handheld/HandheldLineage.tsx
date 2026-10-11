"use client";

import {
  type LineageCatState,
  type LineageReveal,
  lineageBranchOpen,
  lineageCatState,
  lineageSpriteUrl,
} from "../ceremony";
import type { LineageBoardProps } from "../LookBoardProps";
import {
  additionTags,
  type LineageCat,
  type LineageModel,
} from "../lineageModel";
import { useTypewriter } from "../motion";
import { GB_DIM, GB_INK, GB_SCREEN } from "./gbSprite";
import {
  HandheldShell,
  LCD_HEIGHT,
  LCD_WIDTH,
  LcdBox,
  LcdLink,
  LcdSprite,
} from "./HandheldShell";

const TOP_H = 56;
const TEXT_H = 130;
const PAD = 16;

/**
 * EVOLUTION chart: one row per branch, the starter then every stop with a
 * "LV.n ▶ +ADDITION" arrow between sprites.
 *
 * Ceremony: rows step in as a branch opens; a charging cat strobes between
 * its silhouette and the teaser frames (the classic evolve strobe) while
 * the text box types "What? X is evolving!"; the reveal whites out the LCD
 * for a beat and types "X evolved into Y!".
 */
export function HandheldLineage({
  model,
  reveal,
}: Readonly<LineageBoardProps>) {
  const branches = model.branches;
  const rowsTop = PAD + TOP_H + 12;
  const rowsHeight = LCD_HEIGHT - rowsTop - TEXT_H - PAD - 8;
  const rowCount = Math.max(1, branches.length);
  const rowHeight = Math.min(150, Math.floor(rowsHeight / rowCount));
  const levels = model.maxLevels;
  const nameWidth = levels >= 3 ? 150 : 190;
  const arrowWidth = levels >= 3 ? 88 : 112;
  const tagWidth = 116;
  const spriteBudget =
    LCD_WIDTH - 2 * PAD - tagWidth - nameWidth - levels * arrowWidth - 16;
  const spriteSize = Math.max(
    48,
    Math.min(rowHeight - 18, Math.floor(spriteBudget / (levels + 1))),
  );
  const fontScale = rowHeight < 110 ? 0.8 : 1;
  const done = !reveal || reveal.done;
  const newest = model.cats.at(-1) ?? null;
  const active = reveal?.activeKey
    ? (model.cats.find((c) => c.key === reveal.activeKey) ?? null)
    : null;
  const focus = done ? newest : active;
  const focusParent = focus ? parentOf(focus, model.cats) : null;
  const highlightKey = highlightKeyFor(reveal, active, newest);
  const message = textBoxMessage(model, reveal, focus, focusParent);
  const typed = useTypewriter(message, 22, Boolean(reveal));
  // One whiteout per land, keyed by the scheduled land time (both instances agree).
  const landing = reveal?.landing ?? null;
  const flash = Boolean(landing) && landing?.key === reveal?.activeKey;

  return (
    <HandheldShell
      flash={flash}
      flashKey={landing ? landing.at.toString() : ""}
    >
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
          EVOLUTION ◆ {(model.starter?.label ?? "LINE").toUpperCase()}
        </span>
        <span>
          CATS {reveal ? reveal.revealedKeys.size : model.cats.length}/
          {model.totalCount} · LV.{levels}
        </span>
      </LcdBox>

      {branches.map((branch, index) => {
        const open = lineageBranchOpen(reveal, branch.label);
        if (!open) return null;
        return (
          <div
            key={branch.label}
            style={{
              position: "absolute",
              left: PAD,
              right: PAD,
              top: rowsTop + index * rowHeight,
              height: rowHeight,
              display: "grid",
              gridTemplateColumns: `${tagWidth}px ${spriteSize}px ${Array.from(
                { length: levels },
                () => `${arrowWidth}px ${spriteSize}px`,
              ).join(" ")} 1fr`,
              alignItems: "center",
              justifyItems: "center",
              animation: "look-rise 400ms steps(4) both",
            }}
          >
            <div
              style={{
                fontSize: 13 * fontScale,
                lineHeight: 1.6,
                textAlign: "center",
                border: `3px solid ${GB_INK}`,
                padding: "6px 4px",
                width: 104,
                animation:
                  reveal?.activeBranch === branch.label &&
                  reveal.step.kind === "banner"
                    ? "look-blink 0.5s steps(1) infinite"
                    : undefined,
              }}
            >
              {branch.label.toUpperCase()}
              <small
                style={{
                  display: "block",
                  fontSize: 8 * fontScale,
                  color: GB_DIM,
                }}
              >
                {(branch.theme.blurb.split(" ").at(-2) ?? "").toUpperCase()}
              </small>
            </div>
            <LcdSprite
              url={model.starter?.previewUrl ?? null}
              alt={model.starter?.label ?? "starter"}
              size={spriteSize}
            />
            {Array.from({ length: levels }, (_, level) => {
              const cat = branch.cats[level] ?? null;
              const state = cat ? lineageCatState(reveal, cat.key) : "hidden";
              const url = cat
                ? lineageSpriteUrl(state, reveal, cat.previewUrl)
                : null;
              const tag = gainTag(cat, state, reveal);
              return [
                <div
                  key={`arrow-${level.toString()}`}
                  style={{
                    fontSize: 10 * fontScale,
                    textAlign: "center",
                    lineHeight: 1.9,
                    opacity: state === "hidden" ? 0.3 : 1,
                  }}
                >
                  LV.{level + 1}
                  <b
                    style={{
                      display: "block",
                      fontSize: 22 * fontScale,
                      animation:
                        state === "charging"
                          ? "look-blink 0.4s steps(1) infinite"
                          : undefined,
                    }}
                  >
                    ▶
                  </b>
                  <span
                    style={{
                      display: "block",
                      fontSize: 14 * fontScale,
                      lineHeight: 1.2,
                      width: arrowWidth + 24,
                      marginLeft: -12,
                      whiteSpace: "normal",
                    }}
                  >
                    {tag.toUpperCase()}
                  </span>
                </div>,
                <div
                  key={`sprite-${level.toString()}`}
                  data-lineage-key={cat?.key}
                  style={{
                    opacity: state === "hidden" ? 0 : 1,
                    animation: spriteAnimation(state, reveal),
                  }}
                >
                  <LcdSprite
                    url={url}
                    alt={cat?.label ?? ""}
                    size={spriteSize}
                  />
                </div>,
              ];
            })}
            <div
              style={{
                fontSize: 11 * fontScale,
                textAlign: "left",
                lineHeight: 1.9,
                justifySelf: "start",
                paddingLeft: 6,
                width: nameWidth,
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  display: "block",
                  color: GB_DIM,
                  whiteSpace: "nowrap",
                }}
              >
                {(model.starter?.label ?? "").toUpperCase()}
              </span>
              {branch.cats.map((cat) => {
                const state = lineageCatState(reveal, cat.key);
                if (state === "hidden") return null;
                const highlighted = cat.key === highlightKey;
                return (
                  <span
                    key={cat.key}
                    style={{
                      display: "block",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      background: highlighted ? GB_INK : undefined,
                      color: highlighted ? GB_SCREEN : undefined,
                      padding: highlighted ? "2px 4px" : undefined,
                      animation:
                        state === "charging"
                          ? "look-blink 0.6s steps(1) infinite"
                          : undefined,
                    }}
                  >
                    {state === "charging"
                      ? "????????"
                      : cat.label.toUpperCase()}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}

      <LcdBox
        style={{
          left: PAD,
          right: PAD,
          bottom: PAD,
          height: TEXT_H,
          padding: "24px 26px",
          fontSize: 16,
          lineHeight: 2,
        }}
      >
        {reveal ? typed : message}
        {reveal && typed.length >= message.length ? (
          <span
            style={{
              position: "absolute",
              right: done ? 140 : 24,
              bottom: 14,
              fontSize: 16,
              animation: "gb-blink 1s steps(1) infinite",
            }}
          >
            ▼
          </span>
        ) : null}
        {done ? <LcdLink url={model.url} /> : null}
      </LcdBox>
    </HandheldShell>
  );
}

/** The name row to invert: the landing cat mid-ceremony, the newest at the end. */
function highlightKeyFor(
  reveal: LineageReveal | undefined,
  active: LineageCat | null,
  newest: LineageCat | null,
): string | null | undefined {
  if (!reveal || reveal.done) return newest?.key;
  return reveal.revealing ? active?.key : null;
}

/** The evolve strobe runs through spinup/cruise/slowdown; it stops on the near miss and the land. */
function spriteAnimation(
  state: LineageCatState,
  reveal: LineageReveal | undefined,
): string | undefined {
  if (state === "charging") {
    const phase = reveal?.roll?.phase;
    if (phase === "nearmiss" || phase === "land") return undefined;
    return "gb-evolve 0.5s steps(2) infinite";
  }
  return state === "revealing" ? "gb-flash 900ms steps(4) both" : undefined;
}

/** The arrow's gain tag: "???" while rolling, the value from the land on, the full word once written. */
function gainTag(
  cat: LineageCat | null,
  state: LineageCatState,
  reveal: LineageReveal | undefined,
): string {
  if (!cat || state === "hidden") return "";
  if (state === "charging") {
    const value = reveal?.roll?.valueLabel;
    return value ? `+${value}` : "???";
  }
  return additionTags(cat.additions, 1)[0] ?? "";
}

/** "ROLLING ACCESSORY… 1/2", then "ACCESSORY: LAVENDER!" from the land on. */
function rollText(reveal: LineageReveal): string {
  const roll = reveal.roll;
  if (!roll) return "";
  const trait = roll.traitLabel.toUpperCase();
  if (roll.valueLabel) return `${trait}: ${roll.valueLabel.toUpperCase()}!`;
  return `ROLLING ${trait}… ${(roll.index + 1).toString()}/${roll.count.toString()}`;
}

function shout(label: string | null | undefined, fallback = ""): string {
  return (label ?? fallback).toUpperCase();
}

/** What the text box types for the current step. */
function textBoxMessage(
  model: LineageModel,
  reveal: LineageReveal | undefined,
  focus: LineageCat | null,
  focusParent: LineageCat | null,
): string {
  if (!reveal) {
    return focus && focusParent
      ? `${shout(focusParent.label)} evolved into ${shout(focus.label)}!`
      : "The lineage is complete!";
  }
  switch (reveal.step.kind) {
    case "summon":
      return `${shout(model.starter?.label, "A KIT")} enters the chamber.`;
    case "banner":
      return `The ${shout(reveal.activeBranch)} line begins!`;
    case "roll":
      return reveal.roll?.valueLabel
        ? rollText(reveal)
        : `${rollText(reveal)} What? ${shout(focusParent?.label)} is evolving!`;
    case "reveal": {
      const gained = reveal.landedValues.length
        ? ` +${reveal.landedValues.join(", ").toUpperCase()}`
        : "";
      return `${shout(focusParent?.label)} evolved into ${shout(focus?.label)}!${gained}`;
    }
    case "done":
      return "…";
    case "finale":
      return `All ${model.totalCount} cats recorded!`;
  }
}

function parentOf(cat: LineageCat, cats: LineageCat[]): LineageCat | null {
  if (cat.level <= 1) return cats.find((c) => c.level === 0) ?? null;
  return (
    cats.find(
      (c) => c.branchLabel === cat.branchLabel && c.level === cat.level - 1,
    ) ?? null
  );
}
