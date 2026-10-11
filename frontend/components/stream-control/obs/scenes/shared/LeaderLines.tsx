"use client";

import type { ReactElement } from "react";
import { anchorPointInRect, type Point, type Rect } from "./plaqueModel";

export interface LeaderTarget {
  id: string;
  rect: Rect;
  /** Sprite anchor in 0..50 units for the drawn pose, null → rect centre. */
  anchor: Point | null;
}

export interface LeaderLinesProps {
  /** Start point on the 1280×1080 canvas (the plaque's right-middle, or left-middle when the plaque is on the right half). */
  from: Point | null;
  targets: readonly LeaderTarget[];
  /** Draw/undraw; lines are kept mounted and fade so the look never jumps. */
  visible: boolean;
  /** Stroke colour; default "var(--obs-plaque-accent)". */
  color?: string;
  /** Replays the draw animation (batch: beat.stageId; evolution: `${activeKey}:${roll.index}`). */
  drawKey: string;
}

const CANVAS = { width: 1280, height: 1080 } as const;

const LEADER_KEYFRAMES = `
@keyframes obs-leader-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes obs-leader-dot { 0% { opacity: 0; r: 0; } 60% { opacity: 1; r: 8; } 100% { opacity: 1; r: 5; } }
`;

/**
 * Leader lines from the plaque to the changed cats. One absolutely positioned
 * SVG at the wrapper root; each line draws itself (650 ms) and ends in a dot
 * that pops at 560 ms. Kept mounted; `visible` only fades the layer.
 */
export function LeaderLines({
  from,
  targets,
  visible,
  color = "var(--obs-plaque-accent, var(--obs-accent, #f2d27a))",
  drawKey,
}: Readonly<LeaderLinesProps>): ReactElement {
  return (
    <svg
      aria-hidden="true"
      data-leader-lines={visible ? "1" : "0"}
      width={CANVAS.width}
      height={CANVAS.height}
      viewBox={`0 0 ${CANVAS.width.toString()} ${CANVAS.height.toString()}`}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        overflow: "visible",
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 240ms ease",
      }}
    >
      <style>{LEADER_KEYFRAMES}</style>
      {from &&
        targets.map((target) => {
          const to = anchorPointInRect(target.rect, target.anchor);
          return (
            <g key={`${drawKey}:${target.id}`} data-leader-target={target.id}>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                pathLength={1}
                stroke={color}
                strokeWidth={2.4}
                strokeDasharray="1"
                strokeLinecap="round"
                style={{ animation: "obs-leader-draw 650ms ease-out both" }}
              />
              <circle
                cx={to.x}
                cy={to.y}
                r={5}
                fill={color}
                style={{
                  animation: "obs-leader-dot 420ms ease-out 560ms both",
                }}
              />
            </g>
          );
        })}
    </svg>
  );
}
