"use client";

import { STARTER_THEME } from "@/components/evolution/archetypes";
import {
  type LineageCatState,
  type LineageReveal,
  type LineageRoll,
  lineageBranchOpen,
  lineageCatState,
  lineageSpriteUrl,
} from "../ceremony";
import { describeCat } from "../describeCat";
import type { LineageBoardProps } from "../LookBoardProps";
import { chunkBySizes, splitColumns } from "../layout";
import {
  additionTags,
  type LineageCat,
  type LineageModel,
  lineageRank,
} from "../lineageModel";
import { LookSprite } from "../shared";
import {
  AL_FAINT,
  AL_MUTED,
  AL_RED,
  AllegiancesBookplate,
  AllegiancesPage,
  AllegiancesPlate,
  AllegiancesSection,
} from "./AllegiancesPage";

type Row =
  | {
      kind: "section";
      key: string;
      heading: string;
      note: string;
      branch: string | null;
    }
  | { kind: "cat"; key: string; cat: LineageCat; newest: boolean };

interface Layout {
  twoColumns: boolean;
  columnWidth: number;
  spriteSize: number;
  fontSize: number;
  plateLeft: number;
  plateWidth: number;
  plateSprite: number;
  bookplateWidth: number;
  bookplateRight: number;
  /** The plaque slot: the margin under the plate (the plaque portals into it). */
  slotLeft: number;
  slotTop: number;
  slotWidth: number;
  slotTitleSize: number;
}

const WIDE: Layout = {
  twoColumns: false,
  columnWidth: 650,
  spriteSize: 76,
  fontSize: 20,
  plateLeft: 840,
  plateWidth: 340,
  plateSprite: 300,
  bookplateWidth: 320,
  bookplateRight: 96,
  slotLeft: 780,
  slotTop: 640,
  slotWidth: 460,
  slotTitleSize: 34,
};

const NARROW: Layout = {
  twoColumns: true,
  columnWidth: 380,
  spriteSize: 60,
  fontSize: 17,
  plateLeft: 950,
  plateWidth: 260,
  plateSprite: 220,
  bookplateWidth: 260,
  bookplateRight: 70,
  slotLeft: 930,
  slotTop: 560,
  slotWidth: 320,
  slotTitleSize: 28,
};

/** Origin section + starter, then one section per branch with its cats. */
function buildRows(model: LineageModel, newestKey: string | null): Row[] {
  const rows: Row[] = [];
  if (model.starter) {
    rows.push(
      {
        kind: "section",
        key: "origin",
        heading: "Origin",
        note: "kit · where every line begins",
        branch: null,
      },
      {
        kind: "cat",
        key: model.starter.key,
        cat: model.starter,
        newest: false,
      },
    );
  }
  for (const branch of model.branches) {
    rows.push({
      kind: "section",
      key: `branch-${branch.label}`,
      heading: `❧ ${branch.label} line`,
      note: branch.theme.blurb,
      branch: branch.label,
    });
    for (const cat of branch.cats) {
      rows.push({
        kind: "cat",
        key: cat.key,
        cat,
        newest: cat.key === newestKey,
      });
    }
  }
  return rows;
}

/** A section rules itself in once its branch has opened (origin: once any cat is written). */
function sectionOpen(
  row: Extract<Row, { kind: "section" }>,
  reveal: LineageReveal | undefined,
): boolean {
  if (row.branch === null) return !reveal || reveal.revealedKeys.size > 0;
  return lineageBranchOpen(reveal, row.branch);
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function subtitleFor(
  model: LineageModel,
  reveal: LineageReveal | undefined,
): string {
  if (!reveal || reveal.done) {
    return `${plural(model.branches.length, "line")} · ${plural(model.totalCount, "cat")}, as the lineage stood when the ceremony ended`;
  }
  const choosing = reveal.charging ? " · StarClan is choosing" : "";
  return `being written · ${reveal.revealedKeys.size} of ${model.totalCount} cats named${choosing}`;
}

/**
 * The lineage typeset like the front matter of a Warriors book: Origin,
 * then one section per branch, every cat described in prose with a marginal
 * sprite; the newest cat gets the plate and the QR is an ex-libris stamp.
 *
 * Ceremony: sections rule themselves in as a branch opens, a charging cat
 * is a half-written line (the sprite flickers through what it could be,
 * the name is still blank), and a revealed line writes itself in from left
 * to right. The plate follows whichever cat is being written.
 */
export function AllegiancesLineage({
  model,
  reveal,
}: Readonly<LineageBoardProps>) {
  const done = !reveal || reveal.done;
  const newest = model.cats.at(-1) ?? null;
  const rows = buildRows(model, newest?.key ?? null);
  // Layout is decided on the finished lineage so lines never jump columns
  // mid-ceremony; hidden rows simply are not drawn yet.
  const catRows = rows.filter((row) => row.kind === "cat").length;
  const layout = catRows > 8 ? NARROW : WIDE;
  const columns = layout.twoColumns
    ? chunkBySizes(rows, splitColumns(rows.length, Math.ceil(rows.length / 2)))
    : [rows];

  // The plate shows the cat being written; during a banner (the next cat is
  // still hidden) it keeps the last cat written so it never unmounts.
  const activeCat = reveal?.activeKey
    ? (model.cats.find((cat) => cat.key === reveal.activeKey) ?? null)
    : null;
  const lastShownCat =
    model.cats.findLast(
      (cat) => lineageCatState(reveal, cat.key) === "shown",
    ) ?? null;
  const plateCat = done
    ? newest
    : activeCat && lineageCatState(reveal, activeCat.key) !== "hidden"
      ? activeCat
      : lastShownCat;
  const lineLabel = model.starter?.label ?? "the line";

  return (
    <AllegiancesPage
      title={`${lineLabel}'s Line`}
      subtitle={subtitleFor(model, reveal)}
      marginNote="BEASTYPAGE · EVOLUTION · LINEAGE"
      folio="117"
    >
      {columns.map((columnRows, columnIndex) => (
        <div
          key={columnRows[0]?.key ?? columnIndex}
          style={{
            position: "absolute",
            top: 222,
            left: 120 + columnIndex * (layout.columnWidth + 30),
            width: layout.columnWidth,
          }}
        >
          {columnRows.map((row) => (
            <RowView
              key={row.key}
              row={row}
              reveal={reveal}
              done={done}
              layout={layout}
            />
          ))}
        </div>
      ))}

      {plateCat ? (
        <Plate
          cat={plateCat}
          model={model}
          reveal={reveal}
          done={done}
          newestKey={newest?.key ?? null}
          layout={layout}
        />
      ) : null}

      {/* The plaque writes the roll in the margin under the plate; always mounted. */}
      <div
        data-plaque-slot=""
        style={{
          position: "absolute",
          left: layout.slotLeft,
          top: layout.slotTop,
          width: layout.slotWidth,
          height: 120,
          overflow: "hidden",
          ["--obs-plaque-ink" as string]: "#2a2320",
          ["--obs-plaque-muted" as string]: AL_MUTED,
          ["--obs-plaque-accent" as string]: AL_RED,
          ["--obs-plaque-shadow" as string]: "none",
          ["--obs-plaque-title-size" as string]: `${layout.slotTitleSize.toString()}px`,
        }}
      />

      {done ? (
        <AllegiancesBookplate
          url={model.url}
          line="the full lineage, every roll and addition"
          width={layout.bookplateWidth}
          style={{
            right: layout.bookplateRight,
            bottom: 100,
            animation: "look-stamp 700ms cubic-bezier(.2,1.3,.4,1) both",
            transform: "rotate(-1.5deg)",
          }}
        />
      ) : null}
    </AllegiancesPage>
  );
}

function RowView({
  row,
  reveal,
  done,
  layout,
}: Readonly<{
  row: Row;
  reveal: LineageReveal | undefined;
  done: boolean;
  layout: Layout;
}>) {
  if (row.kind === "section") {
    if (!sectionOpen(row, reveal)) return null;
    return (
      <div style={{ animation: "look-wipe 700ms ease both" }}>
        <AllegiancesSection
          heading={row.heading}
          note={row.note}
          size={layout.twoColumns ? 0.92 : 1}
        />
      </div>
    );
  }
  const state = lineageCatState(reveal, row.cat.key);
  if (state === "hidden") return null;
  return (
    <Entry
      cat={row.cat}
      state={state}
      reveal={reveal}
      newest={row.newest && done}
      spriteSize={layout.spriteSize}
      fontSize={layout.fontSize}
    />
  );
}

function Plate({
  cat,
  model,
  reveal,
  done,
  newestKey,
  layout,
}: Readonly<{
  cat: LineageCat;
  model: LineageModel;
  reveal: LineageReveal | undefined;
  done: boolean;
  newestKey: string | null;
  layout: Layout;
}>) {
  const state = lineageCatState(reveal, cat.key);
  const url = lineageSpriteUrl(state, reveal, cat.previewUrl);
  if (!url) return null;
  const charging = state === "charging";
  const roll = charging ? (reveal?.roll ?? null) : null;
  // The strobe stops on the near miss and the land so the frame can be read.
  const strobing =
    charging && roll?.phase !== "nearmiss" && roll?.phase !== "land";
  const animation =
    state === "revealing"
      ? "look-stamp-flat 700ms cubic-bezier(.2,1.3,.4,1) both"
      : "look-pop 500ms ease both";
  return (
    <AllegiancesPlate
      key={`${cat.key}-${state}`}
      width={layout.plateWidth}
      style={{ top: 214, left: layout.plateLeft, animation }}
      caption={
        charging ? (
          <ChargingCaption cat={cat} roll={roll} />
        ) : (
          <NamedCaption
            cat={cat}
            number={model.cats.indexOf(cat) + 1}
            newest={done && cat.key === newestKey}
          />
        )
      }
    >
      <div
        data-lineage-key={cat.key}
        style={{
          animation: strobing
            ? "look-flicker 0.5s steps(3) infinite"
            : undefined,
          filter:
            charging && roll?.phase !== "land"
              ? "sepia(.6) contrast(.8)"
              : undefined,
        }}
      >
        <LookSprite url={url} alt={cat.label} size={layout.plateSprite} />
      </div>
    </AllegiancesPlate>
  );
}

const CAPTION_LEAD = {
  fontStyle: "normal",
  fontVariant: "small-caps",
} as const;

/** The roll named in prose: "still rolling its accessory · 1 of 2…", then the value at land. */
function rollClause(roll: LineageRoll | null): string {
  if (!roll) return "still being drawn…";
  const trait = roll.traitLabel.toLowerCase();
  if (roll.valueLabel) return `its ${trait}: ${roll.valueLabel}.`;
  return `still rolling its ${trait} · ${(roll.index + 1).toString()} of ${roll.count.toString()}…`;
}

function ChargingCaption({
  cat,
  roll,
}: Readonly<{ cat: LineageCat; roll: LineageRoll | null }>) {
  return (
    <>
      <b style={CAPTION_LEAD}>Plate.</b> the next{" "}
      {lineageRank(cat).toLowerCase()} of the {cat.branchLabel ?? "origin"}{" "}
      line, {rollClause(roll)}
    </>
  );
}

function NamedCaption({
  cat,
  number,
  newest,
}: Readonly<{ cat: LineageCat; number: number; newest: boolean }>) {
  const line = cat.branchLabel ? ` of the ${cat.branchLabel} line` : "";
  const ending = newest ? ", newest of them all." : ".";
  return (
    <>
      <b style={CAPTION_LEAD}>Plate {romanNumeral(number)}.</b> {cat.label},{" "}
      {lineageRank(cat).toLowerCase()}
      {line}
      {ending}
    </>
  );
}

/**
 * What the roster line says the cat gained at this stop. Tags the prose
 * already states ("wearing red collar") are not repeated after it.
 */
function gainedText(cat: LineageCat, prose: string): string {
  if (cat.level === 0) return `${STARTER_THEME.blurb}.`;
  const said = prose.toLowerCase();
  const tags = additionTags(cat.additions)
    .map((tag) => tag.replace(/^\+/, ""))
    .filter((tag) => !said.includes(tag.toLowerCase()));
  if (tags.length === 0) return "";
  return `${tags.join(", ")}.`;
}

function entryAnimation(state: LineageCatState): string | undefined {
  if (state === "revealing")
    return "look-wipe 1100ms cubic-bezier(.3,0,.2,1) both";
  if (state === "shown") return undefined;
  return "look-pop 400ms ease both";
}

function Entry({
  cat,
  state,
  reveal,
  newest,
  spriteSize,
  fontSize,
}: Readonly<{
  cat: LineageCat;
  state: LineageCatState;
  reveal: LineageReveal | undefined;
  newest: boolean;
  spriteSize: number;
  fontSize: number;
}>) {
  const url = lineageSpriteUrl(state, reveal, cat.previewUrl);
  const charging = state === "charging";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${spriteSize}px 1fr`,
        gap: 12,
        alignItems: "center",
        minHeight: spriteSize - 2,
        margin: "0 0 8px",
        animation: entryAnimation(state),
      }}
    >
      {/* The plate carries the lineage key (line + confetti target), not this marginal sprite. */}
      <div
        style={{
          animation: charging
            ? "look-flicker 0.45s steps(2) infinite"
            : undefined,
          filter: charging ? "sepia(.7) contrast(.7) opacity(.8)" : undefined,
        }}
      >
        <LookSprite url={url} alt={cat.label} size={spriteSize} />
      </div>
      {charging ? (
        <ChargingLine
          cat={cat}
          roll={reveal?.roll ?? null}
          fontSize={fontSize}
        />
      ) : (
        <WrittenLine
          cat={cat}
          state={state}
          newest={newest}
          fontSize={fontSize}
        />
      )}
    </div>
  );
}

function ChargingLine({
  cat,
  roll,
  fontSize,
}: Readonly<{ cat: LineageCat; roll: LineageRoll | null; fontSize: number }>) {
  return (
    <p
      style={{
        fontSize,
        lineHeight: 1.28,
        margin: 0,
        color: AL_FAINT,
        fontStyle: "italic",
      }}
    >
      <b
        style={{
          fontStyle: "normal",
          fontWeight: 600,
          fontVariant: "small-caps",
          letterSpacing: ".2em",
          color: AL_RED,
          animation: "look-pulse 1s ease-in-out infinite",
        }}
      >
        — — —
      </b>
      —{lineageRank(cat).toLowerCase()};{" "}
      {roll
        ? rollClause(roll).replace(/^its /, "")
        : "the scribe waits on StarClan…"}
    </p>
  );
}

function WrittenLine({
  cat,
  state,
  newest,
  fontSize,
}: Readonly<{
  cat: LineageCat;
  state: LineageCatState;
  newest: boolean;
  fontSize: number;
}>) {
  const prose = describeCat(cat.params);
  const gained = gainedText(cat, prose);
  const rankLead = cat.level > 0 ? `${lineageRank(cat).toLowerCase()}; ` : "";
  return (
    <p style={{ fontSize, lineHeight: 1.28, margin: 0 }}>
      <b
        style={{
          fontWeight: 600,
          fontVariant: "small-caps",
          letterSpacing: ".04em",
          fontSize: fontSize + 1,
          color: newest ? AL_RED : undefined,
          position: "relative",
        }}
      >
        {cat.label}
        {state === "revealing" ? (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 0,
              bottom: -2,
              height: 2,
              background: AL_RED,
              animation: "look-ink 900ms ease 900ms both",
            }}
          />
        ) : null}
      </b>
      —{rankLead}
      {prose}
      {gained ? (
        <>
          {" "}
          <i>{gained}</i>
        </>
      ) : (
        "."
      )}
    </p>
  );
}

function romanNumeral(value: number): string {
  const table: [number, string][] = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let n = Math.max(1, Math.min(39, value));
  let out = "";
  for (const [num, sym] of table) {
    while (n >= num) {
      out += sym;
      n -= num;
    }
  }
  return out;
}
