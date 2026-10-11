"use client";

import { useReducedMotion } from "motion/react";
import {
  type ReactElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  BatchLiveState,
  BatchStreamCommand,
} from "@/lib/adoption/streamBatch";
import { DEFAULT_POSE_NAME } from "@/lib/cat-v3/poseOptions";
import type { BatchThemeId } from "../themes/batchThemeMeta";
import { anchorForParam } from "../themes/traitAnchorMap";
import { useSpriteAnchors } from "../themes/useSpriteAnchors";
import { stageAnchorParam } from "./batch/batchBeats";
import { BATCH_SCENES } from "./batch/batchRegistry";
import { BATCH_LOOK_CHROME, type BatchShowView } from "./batch/batchView";
import { useBatchShow } from "./batch/useBatchShow";
import { LeaderLines, type LeaderTarget } from "./shared/LeaderLines";
import { CountdownNumeral, Plaque } from "./shared/Plaque";
import {
  buildPlaqueTally,
  type PlaqueModel,
  type Point,
  pickLeaderTargetIds,
  type Rect,
} from "./shared/plaqueModel";
import { useElementRects, useFlipRepack } from "./shared/useElementRects";

interface BatchSceneProps {
  command: BatchStreamCommand & { seq: number };
  /** Live elimination state from the session — the control page culls into it. */
  liveState: BatchLiveState | null;
  apiKey: string;
  /** Which look draws the show (session setting `batchTheme`). */
  theme: BatchThemeId;
}

export interface BatchShowFrameProps {
  view: BatchShowView;
  theme: BatchThemeId;
}

/** Landing flash, glint and the one reduced-motion rule, scoped to the wrapper root. */
const FRAME_STYLES = `
@keyframes obs-batch-land { 0% { filter: brightness(1.6); } 100% { filter: brightness(1); } }
.obs-batch-landed { animation: obs-batch-land 300ms ease-out; }
@keyframes obs-batch-glint { 0%, 100% { opacity: 0.25; transform: scale(1); } 50% { opacity: 0.85; transform: scale(1.7); } }
@media (prefers-reduced-motion: reduce) {
  [data-batch-theme], [data-batch-theme] * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; animation-delay: 0ms !important; transition-duration: 0.01ms !important; }
}
`;

const NUMERAL_TICK_MS = 200;
const CANVAS_MID_X = 640;
/** A plaque whose bottom edge is above this sits over the board (lines leave its bottom-centre). */
const PLAQUE_ABOVE_BOARD_MAX_Y = 400;
/** A plaque whose top edge is below this sits under the board (lines leave its top-centre). */
const PLAQUE_BELOW_BOARD_MIN_Y = 700;
const NUMERAL_MAX_SIZE = 220;
/** Above every batch look's own stacking (sprites at 2, Claw's claw at 5, Contact's overlays at 6): the numeral is the verdict's one focal object. */
const NUMERAL_LAYER_Z = 10;

/** Where the leader lines leave the plaque: bottom-centre above the board, top-centre below it, else the side facing the board. */
function leaderOrigin(rect: Rect): Point {
  const cx = rect.x + rect.width / 2;
  if (rect.y + rect.height < PLAQUE_ABOVE_BOARD_MAX_Y) {
    return { x: cx, y: rect.y + rect.height };
  }
  if (rect.y > PLAQUE_BELOW_BOARD_MIN_Y) {
    return { x: cx, y: rect.y };
  }
  return {
    x: cx > CANVAS_MID_X ? rect.x : rect.x + rect.width,
    y: rect.y + rect.height / 2,
  };
}

/** The look's plaque vars (ink, shadow, accent); undefined where the look leaves the default. */
interface PlaqueInk {
  ink?: string;
  shadow?: string;
  accent?: string;
}

/**
 * The numeral and leader lines are mounted at canvas level, outside the
 * look's `[data-plaque-slot]`, so the vars a look sets on the slot never
 * reach them by inheritance; read them off the slot instead.
 */
function readPlaqueInk(root: HTMLElement): PlaqueInk {
  const slot = root.querySelector<HTMLElement>("[data-plaque-slot]") ?? root;
  const style = getComputedStyle(slot);
  const read = (name: string) =>
    style.getPropertyValue(name).trim() || undefined;
  return {
    ink: read("--obs-plaque-ink"),
    shadow: read("--obs-plaque-shadow"),
    accent: read("--obs-plaque-accent"),
  };
}

function samePlaqueInk(a: PlaqueInk, b: PlaqueInk): boolean {
  return a.ink === b.ink && a.shadow === b.shadow && a.accent === b.accent;
}

/** Light sans line under the plaque title, per beat. */
function plaqueStatus(view: BatchShowView, pendingNumber: string | null) {
  const beat = view.beat;
  switch (beat.kind) {
    case "loading":
      return "summoning…";
    case "windup":
      return "rolling…";
    case "deal":
      return `rolling · ${beat.landedIds.length.toString()} of ${beat.order.length.toString()}`;
    case "hold":
      return beat.changedIds.length === 0
        ? "nothing changed"
        : `${beat.changedIds.length.toString()} changed`;
    case "awaiting":
      return "Who leaves? Say a number";
    case "verdict":
      return `#${pendingNumber ?? "??"} leaves in…`;
    case "depart":
      return `#${pendingNumber ?? "??"} leaves`;
    case "repack":
      return "making room…";
    case "done":
      return view.qrUrl ? "complete" : "saving…";
  }
}

/**
 * The wrapper: look + plaque + leader lines + verdict numeral + glints +
 * reduced-motion rule, gated by BATCH_LOOK_CHROME[theme]. Engine-free (the
 * harness renders it with a mock view).
 */
export function BatchShowFrame({
  view,
  theme,
}: Readonly<BatchShowFrameProps>): ReactElement {
  const chrome = BATCH_LOOK_CHROME[theme];
  const Scene = BATCH_SCENES[theme];
  const beat = view.beat;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const setRoot = useCallback((el: HTMLDivElement | null) => {
    rootRef.current = el;
    setContainer(el);
  }, []);

  const live =
    beat.kind === "deal" || beat.kind === "depart" || beat.kind === "repack";
  // Re-measure on a spotlight change too: looks reflow their grid when the
  // spotlight toggles mid-beat, which would leave lines/glints on stale rects.
  const rects = useElementRects(
    rootRef,
    "data-batch-cat",
    [beat.kind, beat.stageId, view.spotlight?.id ?? null],
    live,
  );
  const [plaqueRect, setPlaqueRect] = useState<Rect | null>(null);
  // Re-read on a beat change too: looks like Album and Nursery swap the slot
  // element per phase, and the Plaque re-portals on the same trigger.
  const [plaqueInk, setPlaqueInk] = useState<PlaqueInk>({});
  // biome-ignore lint/correctness/useExhaustiveDependencies: theme/beat.kind are the re-read triggers
  useLayoutEffect(() => {
    if (!container) return;
    const next = readPlaqueInk(container);
    setPlaqueInk((prev) => (samePlaqueInk(prev, next) ? prev : next));
  }, [container, theme, beat.kind]);
  const anchors = useSpriteAnchors(DEFAULT_POSE_NAME, false);
  useFlipRepack(rootRef, beat.kind, !view.reducedMotion);

  // The verdict numeral counts on the server's verdictAt against this clock.
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (beat.kind !== "verdict") return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), NUMERAL_TICK_MS);
    return () => window.clearInterval(id);
  }, [beat.kind]);
  const numeralText =
    beat.kind === "verdict" && beat.verdictEndsAt !== undefined
      ? String(
          Math.max(
            1,
            Math.min(3, Math.ceil((beat.verdictEndsAt - now) / 1000)),
          ),
        )
      : null;

  const numberById = useMemo(
    () => new Map(view.cats.map((cat) => [cat.id, cat.numberLabel])),
    [view.cats],
  );
  const pendingNumber = beat.pendingCullId
    ? (numberById.get(beat.pendingCullId) ?? null)
    : null;
  const pendingRect = beat.pendingCullId
    ? (rects.get(beat.pendingCullId) ?? null)
    : null;
  // The verdict numeral sits on the cat's upper body and never grows past
  // its tile, so it does not cover the row above.
  const numeralAt: Point | null = pendingRect
    ? {
        x: pendingRect.x + pendingRect.width / 2,
        y: pendingRect.y + pendingRect.height * 0.45,
      }
    : null;
  const numeralSize = pendingRect
    ? Math.min(NUMERAL_MAX_SIZE, Math.round(pendingRect.height * 1.1))
    : undefined;

  // Tally of what has landed so far: the plaque never spoils a group
  // before its cats are on the board.
  const plaqueModel = useMemo<PlaqueModel>(() => {
    const landed = new Set(beat.landedIds);
    const groups = beat.groups
      .map((group) => ({
        value: group.value,
        label: group.label,
        catIds: group.catIds.filter((id) => landed.has(id)),
      }))
      .filter((group) => group.catIds.length > 0);
    const unchangedLanded = beat.unchangedIds.filter((id) =>
      landed.has(id),
    ).length;
    return {
      title: view.traitLabel,
      status: plaqueStatus(view, pendingNumber),
      tally: buildPlaqueTally(
        groups,
        unchangedLanded,
        new Set(beat.rareIds),
        numberById,
      ),
      numerals: beat.kind === "verdict" && !pendingRect ? numeralText : null,
    };
  }, [beat, view, pendingNumber, numberById, pendingRect, numeralText]);

  // Leader lines: from the plaque's edge facing the board to ≤ 3 changed cats.
  const stage = view.stages[view.stageIndex];
  const lastStage = view.stageIndex >= view.stages.length - 1;
  const lineFrom: Point | null = plaqueRect ? leaderOrigin(plaqueRect) : null;
  const lineTargets = useMemo<LeaderTarget[]>(() => {
    const anchor =
      anchors && stage && !lastStage
        ? anchors.points[anchorForParam(stageAnchorParam(stage))]
        : null;
    return pickLeaderTargetIds(beat.order, beat.rareIds, beat.groups).flatMap(
      (id) => {
        const rect = rects.get(id);
        return rect ? [{ id, rect, anchor }] : [];
      },
    );
  }, [anchors, stage, lastStage, beat.order, beat.rareIds, beat.groups, rects]);
  // Lines point out the changed cats; the verdict is the numeral's moment.
  const linesVisible = beat.kind === "hold" || beat.kind === "awaiting";

  // Glints on favourite / rare cats, registered to the measured sprite rects.
  const glintIds = useMemo(() => {
    const ids = view.survivors
      .filter((cat) => cat.favorite && !cat.eliminated)
      .map((cat) => cat.id);
    for (const id of beat.rareIds) if (!ids.includes(id)) ids.push(id);
    return ids;
  }, [view.survivors, beat.rareIds]);

  return (
    <div
      ref={setRoot}
      data-batch-theme={theme}
      data-batch-phase={view.phase}
      data-batch-beat={beat.kind}
      data-reduced-motion={view.reducedMotion ? "1" : "0"}
      style={{ position: "relative", width: 1280, height: 1080 }}
    >
      <style>{FRAME_STYLES}</style>
      <Scene view={view} />
      {chrome.plaque !== "none" ? (
        <Plaque
          model={plaqueModel}
          mode={chrome.plaque}
          container={container}
          slotKey={theme}
          beatKey={beat.kind}
          entranceKey={beat.stageId}
          onAnchorRect={setPlaqueRect}
          breathing={beat.kind === "awaiting"}
        />
      ) : null}
      {chrome.lines ? (
        <LeaderLines
          from={lineFrom}
          targets={lineTargets}
          visible={linesVisible}
          color={plaqueInk.accent}
          drawKey={beat.stageId}
        />
      ) : null}
      {chrome.plaque !== "none" ? (
        // Looks without plaque chrome (Handheld) count the verdict down in
        // their own material; one clock on screen, never two. The slot's
        // ink/shadow are re-set on this layer so the numeral reads in the
        // plaque's material, not the cream default. Sized to the cat's tile
        // it would otherwise sit behind looks that lift their sprites.
        <div
          data-batch-numeral-layer=""
          style={{
            position: "absolute",
            inset: 0,
            zIndex: NUMERAL_LAYER_Z,
            pointerEvents: "none",
            ["--obs-plaque-ink" as string]: plaqueInk.ink,
            ["--obs-plaque-shadow" as string]: plaqueInk.shadow,
          }}
        >
          <CountdownNumeral
            text={numeralText}
            at={numeralAt}
            size={numeralSize}
          />
        </div>
      ) : null}
      {chrome.glints ? (
        <div
          data-batch-glints=""
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          {glintIds.map((id, i) => {
            const rect = rects.get(id);
            if (!rect) return null;
            return (
              <span
                key={id}
                style={{
                  position: "absolute",
                  left: rect.x + rect.width - 10,
                  top: rect.y + 2,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle, rgba(255,255,255,.95) 0%, rgba(255,240,200,.55) 40%, transparent 70%)",
                  animation: `obs-batch-glint ${(3.2 + (i % 5) * 0.7).toString()}s ease-in-out ${((i * 0.37) % 3).toString()}s infinite`,
                }}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The adoption elimination show on the overlay: `useBatchShow` runs the
 * reveal/cull engine and syncs progress through the session; the frame
 * draws the chosen look plus the shared chrome. Swapping the look mid-show
 * keeps the engine state because the hook lives here, above the look.
 */
export function BatchScene({
  command,
  liveState,
  apiKey,
  theme,
}: Readonly<BatchSceneProps>): ReactElement {
  // Null on the first render; the engine only reads it when it builds a
  // timeline, so the post-mount flip never rebuilds a running beat.
  const reducedMotion = useReducedMotion();
  const view = useBatchShow({
    command,
    liveState,
    apiKey,
    reducedMotion: Boolean(reducedMotion),
  });
  return <BatchShowFrame view={view} theme={theme} />;
}
