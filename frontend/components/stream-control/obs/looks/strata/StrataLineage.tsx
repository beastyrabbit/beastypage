"use client";

import { withAlpha } from "@/components/evolution/archetypes";
import {
  type LineageCatState,
  type LineageReveal,
  lineageBranchOpen,
  lineageCatState,
  lineageSpriteUrl,
} from "../ceremony";
import { LOOK_FONT_DISPLAY, LOOK_FONT_MONO, LOOK_FONT_SANS } from "../fonts";
import type { LineageBoardProps } from "../LookBoardProps";
import {
  additionTags,
  type LineageBranch,
  type LineageCat,
  lineageRank,
} from "../lineageModel";
import { scatter } from "../motion";
import { LOOK_KEYFRAMES, LookQr, LookSprite } from "../shared";

const INK = "#efe9dc";
const MUTED = "#b9b1a2";
const SURFACE_Y = 262;
const BEDROCK_H = 290;
const LEFT = 100;
const RIGHT = 1280;
const BAND_FILLS = ["#a08c6c", "#7d5a3f", "#6b5d55", "#8a7257"];

function wavy(y: number): string {
  return `M0 ${y} C 220 ${y - 20}, 330 ${y + 30}, 520 ${y + 12} S 980 ${y - 20}, 1280 ${y + 20}`;
}

/**
 * Section A–A′: the lineage as geological strata. The starter is bedrock,
 * each evolution level is a stratum above it, one column per branch split by
 * dashed faults. Every cat is a fossil with a numbered tag.
 *
 * Ceremony: a charging fossil is "being sampled" (halo pulses, the
 * silhouette flickers through what it could be), a revealed one is
 * excavated bottom-up with a puff of dust, and the sample tag with the QR
 * drops in at the end.
 */
export function StrataLineage({ model, reveal }: Readonly<LineageBoardProps>) {
  const levels = model.maxLevels;
  const branches = model.branches;
  const columns = Math.max(1, branches.length);
  const bedrockTop = 1080 - BEDROCK_H;
  const bandHeight = (bedrockTop - SURFACE_Y) / levels;
  const columnWidth = (RIGHT - LEFT) / columns;
  const spriteSize = Math.max(
    72,
    Math.min(190, Math.floor(bandHeight - 78), Math.floor(columnWidth - 70)),
  );
  const starterSize = Math.min(230, BEDROCK_H - 60);
  const starterLeft = columns === 1 ? 560 : 640 - starterSize / 2;
  const done = !reveal || reveal.done;
  const fossilNumber = new Map<string, number>();
  let counter = 0;
  for (let level = 1; level <= levels; level++) {
    for (const branch of branches) {
      const cat = branch.cats[level - 1];
      if (cat) fossilNumber.set(cat.key, ++counter);
    }
  }
  const excavated = reveal ? reveal.revealedKeys.size : model.cats.length;

  return (
    <div
      data-look="strata"
      style={{
        position: "relative",
        width: 1280,
        height: 1080,
        overflow: "hidden",
        background: "#0e0f14",
        fontFamily: LOOK_FONT_DISPLAY,
        color: INK,
      }}
    >
      <style>{LOOK_KEYFRAMES}</style>
      <svg
        viewBox="0 0 1280 1080"
        width={1280}
        height={1080}
        style={{ position: "absolute", inset: 0 }}
        role="img"
        aria-label="Cliff section"
      >
        <defs>
          <pattern
            id="strata-speck"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
          >
            <rect width="6" height="6" fill="#2d2b2a" />
            <circle cx="1.5" cy="2" r=".8" fill="#4a4745" />
            <circle cx="4.5" cy="4.6" r=".6" fill="#1a1918" />
          </pattern>
          {BAND_FILLS.map((fill, index) => (
            <pattern
              key={fill}
              id={`strata-band-${index.toString()}`}
              width="40"
              height="11"
              patternUnits="userSpaceOnUse"
            >
              <rect width="40" height="11" fill={fill} />
              <rect y="9" width="40" height="1" fill="rgba(0,0,0,.18)" />
              <rect
                x="12"
                y="4"
                width="12"
                height="1"
                fill="rgba(255,255,255,.14)"
              />
            </pattern>
          ))}
          <linearGradient id="strata-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0e0f14" />
            <stop offset="1" stopColor="#1c1d26" />
          </linearGradient>
        </defs>
        <rect width="1280" height="1080" fill="url(#strata-sky)" />
        <path
          d={`${wavy(bedrockTop)} L1280 1080 L0 1080 Z`}
          fill="url(#strata-speck)"
        />
        {Array.from({ length: levels }, (_, i) => {
          const level = i + 1;
          const top = bedrockTop - level * bandHeight;
          const bottom = bedrockTop - (level - 1) * bandHeight;
          return (
            <path
              key={level}
              d={`${wavy(top)} L1280 ${bottom + 20} C 980 ${bottom - 20}, 700 ${bottom + 40}, 520 ${bottom + 12} S 200 ${bottom - 20}, 0 ${bottom} Z`}
              fill={`url(#strata-band-${((level - 1) % BAND_FILLS.length).toString()})`}
            />
          );
        })}
        {Array.from({ length: levels + 1 }, (_, i) => (
          <path
            key={`seam-${i.toString()}`}
            d={wavy(bedrockTop - i * bandHeight)}
            fill="none"
            stroke="#2a2420"
            strokeWidth="3"
          />
        ))}
        {branches.slice(1).map((branch, index) => {
          const x = LEFT + (index + 1) * columnWidth;
          return (
            <path
              key={branch.label}
              d={`M${x + 8} ${SURFACE_Y} L ${x - 10} ${bedrockTop + 10}`}
              stroke={INK}
              strokeWidth="1.5"
              strokeDasharray="10 8"
              opacity=".55"
            />
          );
        })}
        <path
          d={wavy(SURFACE_Y)}
          fill="none"
          stroke="#3f5a3a"
          strokeWidth="7"
          strokeLinecap="round"
        />
      </svg>

      <div style={{ position: "absolute", left: 110, top: 30, maxWidth: 760 }}>
        <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1, margin: 0 }}>
          Section A–A′ · the {model.starter?.label ?? "Lineage"} Formation
        </h1>
        <p
          style={{
            fontStyle: "italic",
            fontSize: 21,
            color: MUTED,
            margin: "8px 0 0",
          }}
        >
          a lineage read as strata: the oldest cat at the bottom, every
          evolution laid down above it
        </p>
        <div
          style={{
            fontFamily: LOOK_FONT_MONO,
            fontSize: 11,
            letterSpacing: ".28em",
            color: "#8d8778",
            marginTop: 10,
          }}
        >
          {done
            ? `EVOLUTION · ${model.totalCount} CATS · ${branches.length} BRANCH${branches.length === 1 ? "" : "ES"} · ${levels} HORIZON${levels === 1 ? "" : "S"}`
            : `EXCAVATING · ${excavated}/${model.totalCount} SPECIMENS${reveal?.charging ? " · SAMPLING…" : ""}`}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          right: 60,
          top: 30,
          width: 330,
          border: `1px solid ${withAlpha("#efe9dc", 0.35)}`,
          padding: "12px 14px",
          background: "rgba(14,15,20,.6)",
        }}
      >
        <h2
          style={{
            fontSize: 12,
            letterSpacing: ".32em",
            fontFamily: LOOK_FONT_MONO,
            color: MUTED,
            margin: "0 0 8px",
            fontWeight: 400,
          }}
        >
          LEGEND
        </h2>
        {branches.map((branch, index) => (
          <LegendRow
            key={branch.label}
            swatch={`repeating-linear-gradient(${45 - index * 45}deg, ${branch.theme.from} 0 2px, #a08c6c 2px 8px)`}
            label={`${branch.label} series`}
            note={branch.theme.blurb.replace(/^the /, "· ")}
            code={branch.label.slice(0, 1).toUpperCase()}
            compact={branches.length > 3}
            dim={!lineageBranchOpen(reveal, branch.label)}
          />
        ))}
        <LegendRow
          swatch="#2d2b2a"
          label="Origin bedrock"
          note=""
          code="0"
          compact={branches.length > 3}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: 48,
          top: SURFACE_Y,
          height: 1080 - SURFACE_Y - 20,
          width: 40,
          borderRight: `1px solid ${withAlpha("#efe9dc", 0.6)}`,
        }}
      >
        {Array.from({ length: 7 }, (_, i) => (
          <span
            key={i.toString()}
            style={{
              position: "absolute",
              right: 8,
              top: i * 130,
              transform: "translateY(-50%)",
              font: `11px ${LOOK_FONT_MONO}`,
              color: "#cfc8b8",
              letterSpacing: ".05em",
              whiteSpace: "nowrap",
            }}
          >
            {i === 0 ? "0 m" : `−${(i * 3).toString()}`}
          </span>
        ))}
      </div>
      {Array.from({ length: levels }, (_, i) => {
        const level = levels - i;
        const top = bedrockTop - level * bandHeight;
        return (
          <EraLabel
            key={level}
            top={top + bandHeight / 2}
            text={`${lineageRank({ level })} ${level >= 2 ? "cap" : "bed"} · ${roman(level)}`}
          />
        );
      })}
      <EraLabel top={bedrockTop + BEDROCK_H / 2} text="Origin bedrock · 0" />

      {branches.map((branch, index) =>
        lineageBranchOpen(reveal, branch.label) ? (
          <div
            key={branch.label}
            style={{
              position: "absolute",
              top: SURFACE_Y - 36,
              left: LEFT + index * columnWidth + 60,
              fontSize: 13,
              letterSpacing: ".32em",
              fontFamily: LOOK_FONT_MONO,
              textTransform: "uppercase",
              animation: "look-wipe 600ms ease both",
            }}
          >
            {branch.label}
            <div
              style={{
                width: 60,
                height: 2,
                background: branch.theme.from,
                marginTop: 5,
              }}
            />
          </div>
        ) : null,
      )}

      {branches.map((branch, columnIndex) =>
        branch.cats.map((cat) => {
          const state = lineageCatState(reveal, cat.key);
          if (state === "hidden") return null;
          const level = cat.level;
          const bandTop = bedrockTop - level * bandHeight;
          const left =
            LEFT + columnIndex * columnWidth + (columnWidth - spriteSize) / 2;
          return (
            <Fossil
              key={cat.key}
              cat={cat}
              branch={branch}
              state={state}
              reveal={reveal}
              number={fossilNumber.get(cat.key) ?? 0}
              left={left}
              top={bandTop + 24}
              size={spriteSize}
            />
          );
        }),
      )}
      {model.starter &&
      lineageCatState(reveal, model.starter.key) !== "hidden" ? (
        <Fossil
          cat={model.starter}
          branch={null}
          state={lineageCatState(reveal, model.starter.key)}
          reveal={reveal}
          number={0}
          left={starterLeft}
          top={bedrockTop + 36}
          size={starterSize}
          tagSide="left"
        />
      ) : null}

      {done ? (
        <>
          <div
            style={{
              position: "absolute",
              right: 128,
              bottom: 214,
              width: 2,
              height: 80,
              background: "#c9b48a",
              transform: "rotate(26deg)",
              transformOrigin: "bottom",
              animation: "look-pop 400ms ease 500ms both",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 56,
              bottom: 40,
              width: 170,
              background: "#d9c7a3",
              color: "#3a2f22",
              padding: "16px 12px 10px",
              transform: "rotate(3deg)",
              boxShadow: "0 10px 24px rgba(0,0,0,.6)",
              clipPath: "polygon(0 18px,18px 0,100% 0,100% 100%,0 100%)",
              animation: "look-drop 800ms cubic-bezier(.2,1.2,.4,1) both",
            }}
          >
            <LookQr
              url={model.url}
              size={146}
              fg="#1d1610"
              style={{ display: "block" }}
            />
            <div
              style={{
                font: `10px/1.5 ${LOOK_FONT_MONO}`,
                letterSpacing: ".12em",
                marginTop: 8,
                textAlign: "center",
              }}
            >
              SAMPLE A-A′
              <br />
              SCAN FOR THE CORE
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function LegendRow({
  swatch,
  label,
  note,
  code,
  compact = false,
  dim = false,
}: Readonly<{
  swatch: string;
  label: string;
  note: string;
  code: string;
  compact?: boolean;
  dim?: boolean;
}>) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "44px 1fr auto",
        gap: 10,
        alignItems: "center",
        fontSize: compact ? 15 : 18,
        margin: compact ? "2px 0" : "5px 0",
        opacity: dim ? 0.35 : 1,
        transition: "opacity 500ms",
      }}
    >
      <div
        style={{
          height: compact ? 16 : 20,
          border: "1px solid rgba(255,255,255,.5)",
          background: swatch,
        }}
      />
      <span>
        {label}{" "}
        {compact ? null : <i style={{ color: MUTED, fontSize: 16 }}>{note}</i>}
      </span>
      <span
        style={{ fontFamily: LOOK_FONT_MONO, fontSize: 11, color: "#8d8778" }}
      >
        {code}
      </span>
    </div>
  );
}

function EraLabel({ top, text }: Readonly<{ top: number; text: string }>) {
  return (
    <div
      style={{
        position: "absolute",
        left: 100,
        top,
        transform: "translateY(-50%) rotate(180deg)",
        writingMode: "vertical-rl",
        fontStyle: "italic",
        fontSize: 19,
        color: withAlpha("#efe9dc", 0.8),
        letterSpacing: ".08em",
        textShadow: "0 1px 2px rgba(0,0,0,.6)",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
}

function Fossil({
  cat,
  branch,
  state,
  reveal,
  number,
  left,
  top,
  size,
  tagSide = "below",
}: Readonly<{
  cat: LineageCat;
  branch: LineageBranch | null;
  state: LineageCatState;
  reveal: LineageReveal | undefined;
  number: number;
  left: number;
  top: number;
  size: number;
  tagSide?: "below" | "left";
}>) {
  const accent = branch?.theme.from ?? "#fbbf24";
  const charging = state === "charging";
  const revealing = state === "revealing";
  const url = lineageSpriteUrl(state, reveal, cat.previewUrl);
  const meta =
    cat.level === 0
      ? "the origin"
      : additionTags(cat.additions, 3, 16).join(" · ");
  const tagStyle =
    tagSide === "left"
      ? { right: size + 24, top: size / 2 - 20, textAlign: "right" as const }
      : { left: -20, top: size + 2 };
  return (
    <div style={{ position: "absolute", left, top, width: size, height: size }}>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: size * 1.25,
          height: size * 1.05,
          border: `1.5px dashed ${withAlpha("#efe9dc", 0.6)}`,
          borderRadius: "50%",
          transform: "translate(-50%,-50%)",
          animation: charging
            ? "look-pulse 0.8s ease-in-out infinite"
            : revealing
              ? "look-pop 600ms ease both"
              : undefined,
        }}
      />
      <div
        style={{
          position: "relative",
          animation: revealing
            ? "look-wipe-up 1300ms cubic-bezier(.3,0,.2,1) both"
            : charging
              ? "look-flicker 0.5s steps(3) infinite"
              : undefined,
          filter: charging
            ? "sepia(.8) contrast(.6) brightness(.8)"
            : "drop-shadow(0 0 1px rgba(0,0,0,.9)) drop-shadow(0 10px 14px rgba(0,0,0,.6))",
        }}
      >
        <LookSprite url={url} alt={cat.label} size={size} />
      </div>
      {revealing
        ? Array.from({ length: 8 }, (_, i) => (
            <span
              key={i.toString()}
              aria-hidden="true"
              style={{
                position: "absolute",
                left: size * (0.2 + scatter(i + number * 7) * 0.6),
                top: size * 0.85,
                width: 6 + scatter(i * 3 + 1) * 6,
                height: 6 + scatter(i * 5 + 2) * 6,
                borderRadius: "50%",
                background: "#c9b48a",
                opacity: 0,
                ["--dx" as string]: `${Math.round((scatter(i * 11 + 3) - 0.5) * 120)}px`,
                ["--dy" as string]: `${Math.round(-40 - scatter(i * 13 + 4) * 90)}px`,
                animation: `look-dust 1100ms ease-out ${300 + i * 60}ms both`,
              }}
            />
          ))
        : null}
      <div
        style={{
          position: "absolute",
          whiteSpace: "nowrap",
          textShadow: "0 1px 3px rgba(0,0,0,.8)",
          animation: revealing
            ? "look-stamp-flat 500ms ease 1100ms both"
            : undefined,
          ...tagStyle,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 22,
            height: 22,
            borderRadius: "50%",
            border: `1px solid ${INK}`,
            font: `12px/20px ${LOOK_FONT_MONO}`,
            textAlign: "center",
            marginRight: 8,
            verticalAlign: "middle",
            background: "rgba(14,15,20,.5)",
          }}
        >
          {charging ? "?" : number}
        </span>
        <span
          style={{
            fontSize: size > 150 ? 25 : 21,
            fontStyle: "italic",
            fontWeight: 600,
            verticalAlign: "middle",
          }}
        >
          {charging ? "specimen pending" : cat.label}
        </span>
        <span
          style={{
            display: "block",
            fontFamily: LOOK_FONT_SANS,
            fontWeight: 300,
            fontSize: 13,
            color: "#e6dfcf",
            marginTop: 2,
            marginLeft: tagSide === "left" ? 0 : 30,
            letterSpacing: ".02em",
          }}
        >
          <b style={{ fontWeight: 400, color: accent }}>{lineageRank(cat)}</b>
          {charging ? " · sampling the stratum…" : meta ? ` · ${meta}` : ""}
        </span>
      </div>
    </div>
  );
}

function roman(n: number): string {
  return ["", "I", "II", "III", "IV", "V", "VI"][n] ?? String(n);
}
