"use client";

import { useState } from "react";
import {
  type LineageCatState,
  type LineageReveal,
  lineageBranchOpen,
  lineageCatState,
  lineageSpriteUrl,
} from "../ceremony";
import type { LineageBoardProps } from "../LookBoardProps";
import { quadraticPoint } from "../layout";
import { additionTags, lineageRank } from "../lineageModel";
import { LookSprite } from "../shared";
import {
  Cartouche,
  Compass,
  MAP_INK,
  MAP_MUTED,
  MapCat,
  MapKey,
  Parchment,
  ScaleBar,
  TreeDefs,
} from "./Parchment";

const CAMP: [number, number] = [330, 585];
const CAMP_RADIUS = 150;
/** Horizontal / vertical radii of the ellipse the trail ends sit on. */
const TRAIL_LENGTH = 720;
const TRAIL_RISE = 320;

const LANDMARKS: Record<string, string> = {
  leaf: "Mossy Hollow",
  flare: "Sunningrocks",
  rose: "Rosebriar",
  aqua: "The Shallows",
  volt: "Thunderpath Edge",
  moon: "Moonstone Path",
  crystal: "Highstones",
  steel: "Twoleg Fence",
  void: "Owl Tree Hollow",
  sun: "Sunning Meadow",
};

const TREES: [number, number][] = [
  [120, 300],
  [160, 330],
  [110, 370],
  [190, 290],
  [150, 400],
  [230, 340],
  [100, 440],
  [210, 420],
  [120, 700],
  [160, 740],
  [110, 790],
  [200, 770],
  [150, 840],
  [240, 820],
  [90, 870],
  [280, 870],
  [620, 120],
  [660, 150],
  [600, 170],
  [690, 110],
  [1180, 430],
  [1210, 500],
  [1170, 560],
];

/** Cats shrink as more trails share the map. */
function branchScale(count: number): number {
  if (count >= 4) return 0.66;
  return count === 3 ? 0.92 : 1;
}

function mapSubtitle(
  trails: number,
  totalCount: number,
  reveal: LineageReveal | undefined,
): string {
  if (!reveal || reveal.done) {
    return `${trails} trail${trails === 1 ? "" : "s"} walked from camp · ${totalCount} cats`;
  }
  return `walking the trails · ${reveal.revealedKeys.size} of ${totalCount} cats placed`;
}

/**
 * Landing drop mid-ceremony; a staggered pop only when a finished map mounts
 * with no ceremony at all. A done `reveal` still counts as in-ceremony so the
 * handoff to the board never re-pops every cat.
 */
function stopAnimation(
  state: LineageCatState,
  inCeremony: boolean,
  delayMs: number,
): string | undefined {
  if (state === "revealing") {
    return "look-drop 700ms cubic-bezier(.2,1.2,.4,1) both";
  }
  return inCeremony ? undefined : `look-pop 500ms ease ${delayMs}ms both`;
}

/**
 * A hand-inked territory map: the starter sits in camp, one dotted trail per
 * branch (in the branch's ink) leads to a named landmark, and every stop on
 * the way is a cat with a label plank.
 *
 * Ceremony: a trail inks itself in when its branch opens, the charging cat
 * walks the trail from the previous stop (teaser frames flickering as it
 * goes), its plank drops with a puff of pawprints when it arrives, and the
 * map key unrolls at the end.
 */
export function TerritoryLineage({
  model,
  reveal,
}: Readonly<LineageBoardProps>) {
  const branches = model.branches;
  const count = Math.max(1, branches.length);
  const spread = count === 1 ? 0 : Math.min(120, 40 * (count - 1) + 30);
  const levels = model.maxLevels;
  const sizeScale = branchScale(count) * (levels >= 3 ? 0.85 : 1);
  const done = !reveal || reveal.done;

  const trails = branches.map((branch, index) => {
    const angle =
      count === 1 ? 0 : -spread / 2 + (spread / (count - 1)) * index;
    const rad = (angle * Math.PI) / 180;
    const dir: [number, number] = [Math.cos(rad), Math.sin(rad)];
    // Everything is rounded so server and client markup match exactly.
    const start: [number, number] = [
      Math.round(CAMP[0] + dir[0] * CAMP_RADIUS),
      Math.round(CAMP[1] + dir[1] * CAMP_RADIUS),
    ];
    const end: [number, number] = [
      Math.round(CAMP[0] + dir[0] * TRAIL_LENGTH),
      Math.round(CAMP[1] + dir[1] * TRAIL_RISE),
    ];
    const bend = (index - (count - 1) / 2) * -40;
    const control: [number, number] = [
      Math.round((start[0] + end[0]) / 2),
      Math.round((start[1] + end[1]) / 2 + bend),
    ];
    const firstStop = levels >= 3 ? 0.3 : 0.42;
    const stops = branch.cats.map((cat, level) => {
      const t =
        levels === 1
          ? 1
          : firstStop + ((1 - firstStop) * level) / Math.max(1, levels - 1);
      const [px, py] = quadraticPoint(start, control, end, t);
      return {
        cat,
        t,
        point: [Math.round(px), Math.round(py)] as [number, number],
        last: level === branch.cats.length - 1,
      };
    });
    const path = `M ${start[0]} ${start[1]} Q ${control[0]} ${control[1]} ${end[0]} ${end[1]}`;
    return {
      branch,
      start,
      control,
      end,
      stops,
      ink: branch.theme.to,
      path,
      open: lineageBranchOpen(reveal, branch.label),
    };
  });

  const starter = model.starter;
  const starterState = starter
    ? lineageCatState(reveal, starter.key)
    : "hidden";

  return (
    <Parchment>
      <style>{`@keyframes map-walk { from { offset-distance: var(--from); } to { offset-distance: var(--to); } }`}</style>
      <svg
        viewBox="0 0 1280 1080"
        width={1280}
        height={1080}
        style={{ position: "absolute", inset: 0 }}
        role="img"
        aria-label="Territory map"
      >
        <TreeDefs />
        <defs>
          {trails.map(({ branch, path, open }, index) => (
            <mask key={branch.label} id={`trail-mask-${index.toString()}`}>
              {/* Mounted with the trail (not at summon) so the ink draw plays at the banner. */}
              {open ? (
                <path
                  key={`${branch.label}-${open.toString()}`}
                  d={path}
                  fill="none"
                  stroke="#fff"
                  strokeWidth="26"
                  pathLength={1}
                  style={
                    reveal
                      ? {
                          strokeDasharray: 1,
                          strokeDashoffset: 1,
                          animation: "look-draw 2600ms linear forwards",
                        }
                      : undefined
                  }
                />
              ) : null}
            </mask>
          ))}
        </defs>
        <path
          d="M -10 985 C 150 945, 260 1015, 420 990 S 600 1040, 700 1080"
          fill="none"
          stroke="#7d93a3"
          strokeWidth="30"
          opacity=".55"
        />
        <path
          d="M -10 985 C 150 945, 260 1015, 420 990 S 600 1040, 700 1080"
          fill="none"
          stroke={MAP_INK}
          strokeWidth="1.2"
        />
        <path
          d="M -10 1000 C 150 960, 260 1030, 420 1005 S 600 1055, 690 1090"
          fill="none"
          stroke={MAP_INK}
          strokeWidth="1"
          opacity=".7"
        />
        <text
          x="150"
          y="1000"
          fontFamily="Cormorant Garamond, serif"
          fontStyle="italic"
          fontSize="18"
          fill={MAP_INK}
          transform="rotate(-8 150 1000)"
        >
          the river
        </text>
        <path d="M 920 30 L 1258 130" stroke={MAP_INK} strokeWidth="12" />
        <path
          d="M 920 30 L 1258 130"
          stroke="#e6d6b4"
          strokeWidth="2"
          strokeDasharray="14 12"
        />
        {TREES.map(([x, y]) => (
          <use
            key={`${x.toString()}-${y.toString()}`}
            href="#map-tree"
            x={x}
            y={y}
          />
        ))}
        <ellipse
          cx={CAMP[0]}
          cy={CAMP[1]}
          rx="200"
          ry="128"
          fill="none"
          stroke={MAP_INK}
          strokeWidth="2"
          strokeDasharray="3 7"
          strokeLinecap="round"
        />
        <ellipse
          cx={CAMP[0]}
          cy={CAMP[1]}
          rx="186"
          ry="116"
          fill="none"
          stroke={MAP_INK}
          strokeWidth=".8"
        />
        {trails.map(({ branch, path, ink, open }, index) =>
          open ? (
            <path
              key={branch.label}
              d={path}
              fill="none"
              stroke={ink}
              strokeWidth="7"
              strokeDasharray="1 14"
              strokeLinecap="round"
              mask={reveal ? `url(#trail-mask-${index.toString()})` : undefined}
            />
          ) : null,
        )}
      </svg>

      <Cartouche
        title={`${starter?.label ?? "The"}'s Territory`}
        subtitle={mapSubtitle(count, model.totalCount, reveal)}
        code={`EVOLUTION · ${branches.map((b) => b.label).join(" · ")}`}
        plaqueSlot
      />
      <Compass top={186} />

      {starter && starterState !== "hidden" ? (
        <MapCat
          x={CAMP[0]}
          y={CAMP[1] - 20}
          size={Math.round(250 * sizeScale)}
          label={starter.label}
          sub="origin · kit"
          accent="#8a6a2a"
          lineageKey={starter.key}
          style={{
            animation:
              starterState === "revealing"
                ? "look-drop 900ms cubic-bezier(.2,1.2,.4,1) both"
                : undefined,
          }}
        >
          <LookSprite
            url={starter.previewUrl}
            alt={starter.label}
            size={Math.round(250 * sizeScale)}
          />
        </MapCat>
      ) : null}
      <div
        style={{
          position: "absolute",
          left: CAMP[0] - 60,
          top: CAMP[1] - 128 - 34,
          width: 120,
          textAlign: "center",
          fontVariant: "small-caps",
          fontWeight: 700,
          fontSize: 18,
          letterSpacing: ".14em",
          borderBottom: `1.5px solid ${MAP_INK}`,
        }}
      >
        Camp
      </div>

      {trails.map(({ branch, end, stops, ink, path, open }, trailIndex) => {
        if (!open) return null;
        return (
          <div key={branch.label}>
            <div
              style={{
                position: "absolute",
                left: end[0] - 110,
                top: end[1] - Math.round(200 * sizeScale) / 2 - 56,
                width: 220,
                textAlign: "center",
                whiteSpace: "nowrap",
                fontVariant: "small-caps",
                fontWeight: 700,
                fontSize: 22,
                letterSpacing: ".14em",
                color: MAP_INK,
                animation: "look-wipe 900ms ease 1800ms both",
              }}
            >
              <span
                style={{
                  borderBottom: `1.5px solid ${MAP_INK}`,
                  paddingBottom: 1,
                }}
              >
                {LANDMARKS[branch.archetype ?? ""] ?? `${branch.label} Hollow`}
              </span>
              <i
                style={{
                  display: "block",
                  fontVariant: "normal",
                  letterSpacing: 0,
                  fontWeight: 500,
                  fontSize: 15,
                  color: MAP_MUTED,
                }}
              >
                end of the {branch.label} trail
              </i>
            </div>
            {stops.map(({ cat, t, point, last }, stopIndex) => {
              const state = lineageCatState(reveal, cat.key);
              if (state === "hidden") return null;
              const size = Math.round((last ? 200 : 170) * sizeScale);
              if (state === "charging" && reveal) {
                const from = stopIndex === 0 ? 0 : stops[stopIndex - 1].t;
                return (
                  <TrailWalker
                    key={cat.key}
                    lineageKey={cat.key}
                    path={path}
                    from={from}
                    to={t}
                    size={size}
                    reveal={reveal}
                    url={lineageSpriteUrl(state, reveal, cat.previewUrl)}
                    alt={cat.label}
                  />
                );
              }
              return (
                <MapCat
                  key={cat.key}
                  x={point[0]}
                  y={point[1]}
                  size={size}
                  label={cat.label}
                  sub={[lineageRank(cat), ...additionTags(cat.additions)].join(
                    " · ",
                  )}
                  accent={ink}
                  lineageKey={cat.key}
                  style={{
                    animation: stopAnimation(
                      state,
                      Boolean(reveal),
                      300 + trailIndex * 200 + stopIndex * 350,
                    ),
                  }}
                >
                  <LookSprite
                    url={cat.previewUrl}
                    alt={cat.label}
                    size={size}
                  />
                  {state === "revealing" ? <PawBurst /> : null}
                </MapCat>
              );
            })}
          </div>
        );
      })}

      <ScaleBar />
      {done ? (
        <MapKey url={model.url} line="the full lineage with every roll">
          {trails.map(({ branch, ink }) => (
            <div
              key={branch.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 14,
                marginTop: 3,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 36,
                  borderTop: `4px dotted ${ink}`,
                }}
              />
              {branch.label} trail
            </div>
          ))}
        </MapKey>
      ) : null}
    </Parchment>
  );
}

/** What the walker's caption says: the roll by name, the value from the land on. */
function walkerCaption(reveal: LineageReveal): string {
  const roll = reveal.roll;
  if (!roll) return "walking the trail…";
  const trait = roll.traitLabel.toLowerCase();
  if (roll.valueLabel) return `${trait}: ${roll.valueLabel}`;
  return `walking the trail · rolling its ${trait} · ${(roll.index + 1).toString()} of ${roll.count.toString()}…`;
}

/**
 * The charging cat walking the trail between two stops. One walk spans every
 * roll of the cat (count × the per-roll budget, both constant for the cat) so
 * the animation string never changes mid-walk; a walker mounted mid-cat
 * (reload) starts part-way, and a hold pauses it.
 */
function TrailWalker({
  lineageKey,
  path,
  from,
  to,
  size,
  reveal,
  url,
  alt,
}: Readonly<{
  lineageKey: string;
  path: string;
  from: number;
  to: number;
  size: number;
  reveal: LineageReveal;
  url: string | null;
  alt: string;
}>) {
  const roll = reveal.roll;
  const durationMs = roll ? roll.count * reveal.chargeMs : reveal.chargeMs;
  const [startOffsetMs] = useState(() =>
    roll ? Math.round((roll.index + roll.progress) * reveal.chargeMs) : 0,
  );
  const landed = roll?.phase === "land";
  return (
    <div
      data-lineage-key={lineageKey}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: size,
        height: size,
        offsetPath: `path("${path}")`,
        offsetRotate: "0deg",
        offsetAnchor: "50% 60%",
        ["--from" as string]: `${Math.round(from * 100)}%`,
        ["--to" as string]: `${Math.round(to * 100)}%`,
        animation: `map-walk ${durationMs.toString()}ms linear forwards`,
        animationDelay: `${(-startOffsetMs).toString()}ms`,
        animationPlayState: reveal.held ? "paused" : "running",
        zIndex: 2,
      }}
    >
      <div
        style={{
          animation: landed ? undefined : "look-bob 0.5s ease-in-out infinite",
          filter: "drop-shadow(0 4px 0 rgba(59,47,34,.18))",
        }}
      >
        <LookSprite url={url} alt={alt} size={size} />
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: size,
          transform: "translateX(-50%)",
          whiteSpace: "nowrap",
          fontStyle: "italic",
          fontSize: 16,
          color: landed ? MAP_INK : MAP_MUTED,
          animation: landed ? undefined : "look-pulse 1s ease-in-out infinite",
        }}
      >
        {walkerCaption(reveal)}
      </div>
    </div>
  );
}

function PawBurst() {
  return (
    <svg
      viewBox="0 0 120 120"
      width={120}
      height={120}
      aria-hidden="true"
      style={{
        position: "absolute",
        left: "50%",
        top: "70%",
        transform: "translate(-50%,-50%)",
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <g
          key={i.toString()}
          style={{
            ["--dx" as string]: `${Math.round(Math.cos((i / 6) * Math.PI * 2) * 60)}px`,
            ["--dy" as string]: `${Math.round(Math.sin((i / 6) * Math.PI * 2) * 40)}px`,
            animation: `look-dust 900ms ease-out ${i * 50}ms both`,
            transformOrigin: "60px 60px",
          }}
        >
          <use href="#map-paw" x={60} y={60} />
        </g>
      ))}
    </svg>
  );
}
