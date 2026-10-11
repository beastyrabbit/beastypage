"use client";

import { STARTER_THEME } from "@/components/evolution/archetypes";
import {
  type LineageCatState,
  type LineageReveal,
  lineageBranchOpen,
  lineageCatState,
  lineageSpriteUrl,
} from "../ceremony";
import { describeCat } from "../describeCat";
import type { LineageBoardProps } from "../LookBoardProps";
import { chunkBySizes, splitColumns } from "../layout";
import { additionTags, type LineageCat, lineageRank } from "../lineageModel";
import { LookSprite } from "../shared";
import {
  AL_FAINT,
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
  const newest = model.cats[model.cats.length - 1] ?? null;
  const rows: Row[] = [];
  if (model.starter) {
    rows.push({
      kind: "section",
      key: "origin",
      heading: "Origin",
      note: "kit · where every line begins",
      branch: null,
    });
    rows.push({
      kind: "cat",
      key: model.starter.key,
      cat: model.starter,
      newest: false,
    });
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
        newest: cat.key === newest?.key,
      });
    }
  }
  // Layout is decided on the finished lineage so lines never jump columns
  // mid-ceremony; hidden rows simply are not drawn yet.
  const catRows = rows.filter((row) => row.kind === "cat").length;
  const twoColumns = catRows > 8;
  const columns = twoColumns
    ? chunkBySizes(rows, splitColumns(rows.length, Math.ceil(rows.length / 2)))
    : [rows];
  const columnWidth = twoColumns ? 380 : 650;
  const columnLeft = (index: number) => 120 + index * (columnWidth + 30);
  const spriteSize = twoColumns ? 60 : 76;
  const fontSize = twoColumns ? 17 : 20;
  const plateLeft = twoColumns ? 950 : 840;
  const plateWidth = twoColumns ? 260 : 340;
  const plateSprite = twoColumns ? 220 : 300;

  // The plate shows the cat being written, else the newest.
  const activeCat = reveal?.activeKey
    ? (model.cats.find((cat) => cat.key === reveal.activeKey) ?? null)
    : null;
  const plateCat = reveal && !reveal.done ? activeCat : newest;
  const plateState = plateCat
    ? lineageCatState(reveal, plateCat.key)
    : "hidden";
  const plateUrl = plateCat
    ? lineageSpriteUrl(plateState, reveal, plateCat.previewUrl)
    : null;

  const lineLabel = model.starter?.label ?? "the line";
  const written = reveal ? reveal.revealedKeys.size : model.totalCount;
  const subtitle = done
    ? `${model.branches.length} line${model.branches.length === 1 ? "" : "s"} · ${model.totalCount} cat${model.totalCount === 1 ? "" : "s"}, as the lineage stood when the ceremony ended`
    : `being written · ${written} of ${model.totalCount} cats named${reveal?.charging ? " · StarClan is choosing" : ""}`;

  return (
    <AllegiancesPage
      title={`${lineLabel}'s Line`}
      subtitle={subtitle}
      marginNote="BEASTYPAGE · EVOLUTION · LINEAGE"
      folio="117"
    >
      {columns.map((columnRows, columnIndex) => (
        <div
          key={columnRows[0]?.key ?? columnIndex}
          style={{
            position: "absolute",
            top: 222,
            left: columnLeft(columnIndex),
            width: columnWidth,
          }}
        >
          {columnRows.map((row) => {
            if (row.kind === "section") {
              const open =
                row.branch === null
                  ? !reveal || reveal.revealedKeys.size > 0
                  : lineageBranchOpen(reveal, row.branch);
              if (!open) return null;
              return (
                <div
                  key={row.key}
                  style={{ animation: "look-wipe 700ms ease both" }}
                >
                  <AllegiancesSection
                    heading={row.heading}
                    note={row.note}
                    size={twoColumns ? 0.92 : 1}
                  />
                </div>
              );
            }
            const state = lineageCatState(reveal, row.cat.key);
            if (state === "hidden") return null;
            return (
              <Entry
                key={row.key}
                cat={row.cat}
                state={state}
                reveal={reveal}
                newest={row.newest && done}
                spriteSize={spriteSize}
                fontSize={fontSize}
              />
            );
          })}
        </div>
      ))}

      {plateCat && plateUrl ? (
        <AllegiancesPlate
          key={`${plateCat.key}-${plateState}`}
          width={plateWidth}
          style={{
            top: 214,
            left: plateLeft,
            animation:
              plateState === "revealing"
                ? "look-stamp-flat 700ms cubic-bezier(.2,1.3,.4,1) both"
                : "look-pop 500ms ease both",
          }}
          caption={
            plateState === "charging" ? (
              <>
                <b style={{ fontStyle: "normal", fontVariant: "small-caps" }}>
                  Plate.
                </b>{" "}
                the next {lineageRank(plateCat).toLowerCase()} of the{" "}
                {plateCat.branchLabel ?? "origin"} line, still being drawn…
              </>
            ) : (
              <>
                <b style={{ fontStyle: "normal", fontVariant: "small-caps" }}>
                  Plate {romanNumeral(model.cats.indexOf(plateCat) + 1)}.
                </b>{" "}
                {plateCat.label}, {lineageRank(plateCat).toLowerCase()}
                {plateCat.branchLabel
                  ? ` of the ${plateCat.branchLabel} line`
                  : ""}
                {done && plateCat.key === newest?.key
                  ? ", newest of them all."
                  : "."}
              </>
            )
          }
        >
          <div
            style={{
              animation:
                plateState === "charging"
                  ? "look-flicker 0.5s steps(3) infinite"
                  : undefined,
              filter:
                plateState === "charging"
                  ? "sepia(.6) contrast(.8)"
                  : undefined,
            }}
          >
            <LookSprite
              url={plateUrl}
              alt={plateCat.label}
              size={plateSprite}
            />
          </div>
        </AllegiancesPlate>
      ) : null}

      {done ? (
        <AllegiancesBookplate
          url={model.url}
          line="the full lineage, every roll and addition"
          width={twoColumns ? 260 : 320}
          style={{
            right: twoColumns ? 70 : 96,
            bottom: 100,
            animation: "look-stamp 700ms cubic-bezier(.2,1.3,.4,1) both",
            transform: "rotate(-1.5deg)",
          }}
        />
      ) : null}
    </AllegiancesPage>
  );
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
  const rank = lineageRank(cat).toLowerCase();
  const tags = additionTags(cat.additions, 3, 22);
  const gained =
    cat.level === 0
      ? `${STARTER_THEME.blurb}.`
      : tags.length
        ? `${tags.map((tag) => tag.replace(/^\+/, "")).join(", ")}.`
        : "";
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
        animation:
          state === "revealing"
            ? "look-wipe 1100ms cubic-bezier(.3,0,.2,1) both"
            : state === "shown"
              ? undefined
              : "look-pop 400ms ease both",
      }}
    >
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
          —{rank}; the scribe waits on StarClan…
        </p>
      ) : (
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
          —{cat.level > 0 ? `${rank}; ` : ""}
          {describeCat(cat.params)}
          {gained ? (
            <>
              {" "}
              <i>{gained}</i>
            </>
          ) : (
            "."
          )}
        </p>
      )}
    </div>
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
