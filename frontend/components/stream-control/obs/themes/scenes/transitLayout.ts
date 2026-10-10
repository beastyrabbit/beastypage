import { type TransitFamily, truncateValue } from "../format";

/**
 * Pure geometry for the transit-line scene: board slots + layer groups in,
 * station / segment / label descriptors out (stage pixels, 1920×1080).
 * Everything stays inside x 0–1280 so the camera zone is untouched.
 */

export const TRANSIT_FAMILY_COLOR: Record<TransitFamily, string> = {
  coat: "#f2b544",
  eyes: "#58c4ff",
  patch: "#efe9dc",
  extra: "#ff7a59",
};

export const TRANSIT_LIVE = "#7fe0ff";
const TERMINUS_SEGMENT_COLOR = "#ffffff";

export const TRANSIT_GEOMETRY = {
  trunkX: 880,
  lineStartY: 56,
  firstStopY: 100,
  pitch: 74,
  /** Extra room after a trunk stop that has a branch hanging in its gap. */
  branchGap: 40,
  /** Stops on the vertical trunk; the rest sit on the bottom line. */
  verticalCount: 9,
  bendStartY: 800,
  bottomY: 860,
  bendRadius: 60,
  bottomStopXs: [640, 400] as readonly number[],
  terminusX: 140,
  /** Right edge for any text; the camera zone starts at 1280. */
  maxX: 1268,
} as const;

const G = TRANSIT_GEOMETRY;
const NAME_GAP = 30;
const BRANCH_STOP_R = 8;
/** Rough glyph advance for the 18px/600 branch labels (incl. letter-spacing). */
const BRANCH_CHAR_PX = 10.6;
const TRUNK_VALUE_MAX = 24;
const BOTTOM_VALUE_MAX = 16;
const BRANCH_VALUE_MAX = 16;
/** "►" (U+25BA) rather than "▶", which Chrome draws as an emoji even with VS15. */
export const ROLLING_TEXT = "► rolling";

export type TransitSlotStatus = "pending" | "active" | "revealed";

export interface TransitSlotInput {
  id: string;
  name: string;
  family: TransitFamily;
  status: TransitSlotStatus;
  /** Display value once revealed. */
  value: string | null;
  isNone: boolean;
}

export type TransitBranchState = "next" | "live" | "served" | "closed";

export interface TransitBranchInput {
  key: string;
  /** Short group name ("Tortie", "Accessory", "Scar"). */
  label: string;
  family: TransitFamily;
  /** Index of the board slot the branch leaves from (the slot revealed just before it). */
  anchorIndex: number;
  state: TransitBranchState;
  /** Revealed, non-"None" values. */
  values: string[];
}

export type SegmentState = "served" | "live" | "next";

export interface TransitSegment {
  key: string;
  d: string;
  state: SegmentState;
  color: string;
  branch: boolean;
}

export type StationKind = "served" | "closed" | "live" | "next";

export type LabelTone = "ink" | "dim" | "live" | TransitFamily;

export interface TransitLabel {
  key: string;
  text: string;
  /** Untruncated text, for a <title> when it differs. */
  full: string;
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  tone: LabelTone;
  size: "name" | "value" | "tiny";
}

export interface TransitStation {
  key: string;
  x: number;
  y: number;
  r: number;
  kind: StationKind;
  /** Slot id when this is a trunk stop (for flash matching). */
  slotId?: string;
}

export interface TransitLayout {
  segments: TransitSegment[];
  stations: TransitStation[];
  labels: TransitLabel[];
  terminus: { x: number; y: number; reached: boolean };
  served: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Branches anchored before the last vertical stop hang in the gap below it. */
function hangsInGap(anchorIndex: number): boolean {
  return anchorIndex < G.verticalCount - 1;
}

/** Trunk stop positions; gaps that hold a branch get `branchGap` extra. */
export function computeStopPoints(
  count: number,
  gapAnchors: ReadonlySet<number>,
): Point[] {
  const points: Point[] = [];
  let y = G.firstStopY;
  for (let i = 0; i < count; i += 1) {
    if (i < G.verticalCount) {
      points.push({ x: G.trunkX, y });
      y += G.pitch + (gapAnchors.has(i) ? G.branchGap : 0);
    } else {
      const b = i - G.verticalCount;
      const last = G.bottomStopXs[G.bottomStopXs.length - 1];
      const x =
        G.bottomStopXs[b] ?? last - 200 * (b - G.bottomStopXs.length + 1);
      points.push({ x, y: G.bottomY });
    }
  }
  return points;
}

function bendStartY(points: Point[]): number {
  const lastVertical = points[Math.min(points.length, G.verticalCount) - 1];
  return Math.max(G.bendStartY, (lastVertical?.y ?? 0) + 40);
}

/** Path from `start` to `to`; turns the corner when it leaves the trunk. */
function trunkPath(
  start: Point,
  to: Point,
  crossesBend: boolean,
  bendY: number,
): string {
  if (crossesBend) {
    const r = G.bendRadius;
    return [
      `M${start.x},${start.y}`,
      `L${G.trunkX},${bendY}`,
      `Q${G.trunkX},${G.bottomY} ${G.trunkX - r},${G.bottomY}`,
      `L${to.x},${to.y}`,
    ].join(" ");
  }
  return `M${start.x},${start.y} L${to.x},${to.y}`;
}

function slotKind(slot: TransitSlotInput): StationKind {
  if (slot.status === "active") return "live";
  if (slot.status === "revealed") return slot.isNone ? "closed" : "served";
  return "next";
}

function segmentState(kind: StationKind): SegmentState {
  if (kind === "live") return "live";
  if (kind === "next") return "next";
  return "served";
}

export function estimateBranchLabelWidth(text: string): number {
  return text.length * BRANCH_CHAR_PX;
}

interface BranchRow {
  junction: Point;
  rowStart: Point;
}

/**
 * Branch rows leave the trunk at 45°. Anchors on the vertical trunk use the
 * widened gap under the anchor stop; anchors at/after the last vertical
 * stop stack in the free area right of the bend.
 */
function branchRows(
  branches: TransitBranchInput[],
  points: Point[],
  bendY: number,
): Map<string, BranchRow> {
  const rows = new Map<string, BranchRow>();
  const lastVertical = points[Math.min(points.length, G.verticalCount) - 1];
  let tailIndex = 0;
  for (const branch of branches) {
    const anchor = Math.max(0, branch.anchorIndex);
    if (hangsInGap(anchor) && points[anchor]) {
      const stop = points[anchor];
      const junction = { x: G.trunkX, y: stop.y + 12 };
      const rowY = stop.y + G.pitch;
      rows.set(branch.key, {
        junction,
        rowStart: { x: G.trunkX + (rowY - junction.y), y: rowY },
      });
    } else if (lastVertical) {
      const junctionY = Math.min(lastVertical.y + 32 + tailIndex * 28, bendY);
      const rowY = lastVertical.y + 100 + tailIndex * 76;
      rows.set(branch.key, {
        junction: { x: G.trunkX, y: junctionY },
        rowStart: { x: G.trunkX + (rowY - junctionY), y: rowY },
      });
      tailIndex += 1;
    }
  }
  return rows;
}

interface BranchItem {
  text: string;
  full: string;
  kind: StationKind;
  tone: LabelTone;
}

function branchItems(branch: TransitBranchInput): BranchItem[] {
  const prefix = (v: string) => `${branch.label} · ${v}`;
  const closed: BranchItem = {
    text: prefix("closed"),
    full: prefix("closed"),
    kind: "closed",
    tone: "dim",
  };
  if (branch.state === "closed") return [closed];
  if (branch.state === "next") {
    return [
      { text: branch.label, full: branch.label, kind: "next", tone: "dim" },
    ];
  }
  const items: BranchItem[] = branch.values.map((value, i) => {
    const short = truncateValue(value, BRANCH_VALUE_MAX);
    return {
      text: i === 0 ? prefix(short) : short,
      full: i === 0 ? prefix(value) : value,
      kind: "served",
      tone: branch.family,
    };
  });
  if (branch.state === "live") {
    const text = items.length === 0 ? prefix("rolling") : "rolling";
    items.push({ text, full: text, kind: "live", tone: "live" });
  }
  return items.length > 0 ? items : [closed];
}

function trunkLabels(
  slot: TransitSlotInput,
  kind: StationKind,
  at: Point,
  onBottom: boolean,
): TransitLabel[] {
  const nameTone: LabelTone =
    kind === "live" ? "live" : kind === "next" ? "dim" : "ink";
  const out: TransitLabel[] = [];
  out.push({
    key: `name-${slot.id}`,
    text: slot.name,
    full: slot.name,
    x: onBottom ? at.x : at.x - NAME_GAP,
    y: onBottom ? at.y - 28 : at.y + 9,
    anchor: onBottom ? "middle" : "end",
    tone: nameTone,
    size: "name",
  });
  if (kind === "next") return out;
  let text = ROLLING_TEXT;
  let full = ROLLING_TEXT;
  let tone: LabelTone = "live";
  if (kind !== "live") {
    full = slot.value ?? "None";
    text = truncateValue(full, onBottom ? BOTTOM_VALUE_MAX : TRUNK_VALUE_MAX);
    tone = kind === "closed" ? "dim" : slot.family;
  }
  out.push({
    key: `value-${slot.id}`,
    text,
    full,
    x: onBottom ? at.x : at.x + NAME_GAP + (kind === "live" ? 10 : 0),
    y: onBottom ? at.y + 44 : at.y + 9,
    anchor: onBottom ? "middle" : "start",
    tone,
    size: "value",
  });
  return out;
}

export function computeTransitLayout(
  slots: TransitSlotInput[],
  branches: TransitBranchInput[],
  spinDone: boolean,
): TransitLayout {
  const segments: TransitSegment[] = [];
  const stations: TransitStation[] = [];
  const labels: TransitLabel[] = [];

  const gapAnchors = new Set(
    branches
      .map((b) => Math.max(0, b.anchorIndex))
      .filter((i) => hangsInGap(i) && i < slots.length - 1),
  );
  const points = computeStopPoints(slots.length, gapAnchors);
  const bendY = bendStartY(points);
  const lineStart = { x: G.trunkX, y: G.lineStartY };

  slots.forEach((slot, index) => {
    const at = points[index];
    const kind = slotKind(slot);
    const state = segmentState(kind);
    const start = index === 0 ? lineStart : points[index - 1];
    segments.push({
      key: `seg-${slot.id}`,
      d: trunkPath(start, at, index === G.verticalCount, bendY),
      state,
      color:
        state === "live" ? TRANSIT_LIVE : TRANSIT_FAMILY_COLOR[slot.family],
      branch: false,
    });
    stations.push({
      key: `st-${slot.id}`,
      x: at.x,
      y: at.y,
      r: kind === "live" ? 15 : 13,
      kind,
      slotId: slot.id,
    });
    labels.push(...trunkLabels(slot, kind, at, index >= G.verticalCount));
  });

  // Terminus.
  const terminus = { x: G.terminusX, y: G.bottomY };
  const allServed =
    slots.length > 0 && slots.every((s) => s.status === "revealed");
  let terminusState: SegmentState = "next";
  if (spinDone) terminusState = "served";
  else if (allServed) terminusState = "live";
  segments.push({
    key: "seg-terminus",
    d: trunkPath(
      points[points.length - 1] ?? lineStart,
      terminus,
      slots.length <= G.verticalCount,
      bendY,
    ),
    state: terminusState,
    color: terminusState === "live" ? TRANSIT_LIVE : TERMINUS_SEGMENT_COLOR,
    branch: false,
  });
  labels.push({
    key: "name-terminus",
    text: "Saved",
    full: "Saved",
    x: terminus.x,
    y: terminus.y - 42,
    anchor: "middle",
    tone: spinDone ? "ink" : "dim",
    size: "name",
  });

  // Branches: stops on a 45° stub, labels above the row (metro style).
  const rows = branchRows(branches, points, bendY);
  for (const branch of branches) {
    const row = rows.get(branch.key);
    if (!row) continue;
    const items = branchItems(branch);
    const placed: { item: BranchItem; x: number; more: boolean }[] = [];
    let x = row.rowStart.x + 26;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const width = Math.max(
        BRANCH_STOP_R * 2,
        estimateBranchLabelWidth(item.text) - 7,
      );
      const reserve = i < items.length - 1 ? 48 : 0;
      if (placed.length > 0 && x + width + reserve > G.maxX) {
        const more = `+${items.length - i}`;
        placed.push({
          item: { text: more, full: more, kind: "next", tone: "dim" },
          x,
          more: true,
        });
        break;
      }
      placed.push({ item, x, more: false });
      x += width + 30;
    }
    const lastStopX =
      placed.filter((p) => !p.more).pop()?.x ?? row.rowStart.x + 26;
    let branchState: SegmentState = "next";
    if (branch.state === "live") branchState = "live";
    else if (branch.state === "served") branchState = "served";
    segments.push({
      key: `branch-${branch.key}`,
      d: `M${row.junction.x},${row.junction.y} L${row.rowStart.x},${row.rowStart.y} L${lastStopX},${row.rowStart.y}`,
      state: branchState,
      color:
        branchState === "live"
          ? TRANSIT_LIVE
          : TRANSIT_FAMILY_COLOR[branch.family],
      branch: true,
    });
    placed.forEach(({ item, x: stopX, more }, i) => {
      if (!more) {
        stations.push({
          key: `bst-${branch.key}-${i}`,
          x: stopX,
          y: row.rowStart.y,
          r: item.kind === "live" ? 10 : BRANCH_STOP_R,
          kind: item.kind,
        });
      }
      labels.push({
        key: `blabel-${branch.key}-${i}`,
        text: item.text,
        full: item.full,
        x: more ? stopX : stopX - 7,
        y: more ? row.rowStart.y + 6 : row.rowStart.y - 18,
        anchor: "start",
        tone: item.tone,
        size: "tiny",
      });
    });
  }

  return {
    segments,
    stations,
    labels,
    terminus: { ...terminus, reached: spinDone },
    served: slots.filter((s) => s.status === "revealed").length,
  };
}

/**
 * The board slot a layer group branches from: the last board slot that
 * precedes it in reveal order (0 if none precede it).
 */
export function branchAnchorIndex(
  sequenceIds: readonly string[],
  boardIds: readonly string[],
  layerParamId: string,
): number {
  const position = sequenceIds.indexOf(layerParamId);
  if (position < 0) return boardIds.length - 1;
  for (let i = position - 1; i >= 0; i -= 1) {
    const boardIndex = boardIds.indexOf(sequenceIds[i]);
    if (boardIndex >= 0) return boardIndex;
  }
  return 0;
}

/** True once any board slot after the group has started (or the spin ended). */
export function routePassed(
  sequenceIds: readonly string[],
  slotStatus: ReadonlyMap<string, TransitSlotStatus>,
  layerParamId: string,
  spinDone: boolean,
): boolean {
  if (spinDone) return true;
  const position = sequenceIds.indexOf(layerParamId);
  if (position < 0) return false;
  for (let i = position + 1; i < sequenceIds.length; i += 1) {
    const status = slotStatus.get(sequenceIds[i]);
    if (status && status !== "pending") return true;
  }
  return false;
}
