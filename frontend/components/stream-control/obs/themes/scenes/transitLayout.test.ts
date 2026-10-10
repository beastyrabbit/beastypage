import { describe, expect, it } from "vitest";
import type { TransitFamily } from "../format";
import {
  branchAnchorIndex,
  computeTransitLayout,
  estimateBranchLabelWidth,
  ROLLING_TEXT,
  routePassed,
  TRANSIT_FAMILY_COLOR,
  TRANSIT_GEOMETRY,
  TRANSIT_LIVE,
  type TransitBranchInput,
  type TransitSlotInput,
  type TransitSlotStatus,
} from "./transitLayout";

const SEQUENCE = [
  "colour",
  "pelt",
  "eyeColour",
  "eyeColour2",
  "tortie",
  "tint",
  "skinColour",
  "whitePatches",
  "points",
  "whitePatchesTint",
  "vitiligo",
  "accessory",
  "scar",
  "sprite",
];
const BOARD = SEQUENCE.filter(
  (id) => !["tortie", "accessory", "scar"].includes(id),
);

function slots(
  activeIndex: number,
  noneIds: string[] = [],
): TransitSlotInput[] {
  return BOARD.map((id, i) => {
    let status: TransitSlotStatus = "pending";
    if (i < activeIndex) status = "revealed";
    else if (i === activeIndex) status = "active";
    const isNone = status === "revealed" && noneIds.includes(id);
    return {
      id,
      name: id,
      family: (i % 2 === 0 ? "coat" : "eyes") as TransitFamily,
      status,
      value: status === "revealed" ? (isNone ? "None" : `v-${id}`) : null,
      isNone,
    };
  });
}

function branch(
  key: string,
  state: TransitBranchInput["state"],
  values: string[] = [],
): TransitBranchInput {
  const paramId = { tortie: "tortie", acc: "accessory", scar: "scar" }[key];
  return {
    key,
    label: key,
    family: "extra",
    anchorIndex: branchAnchorIndex(SEQUENCE, BOARD, paramId ?? key),
    state,
    values,
  };
}

describe("computeTransitLayout", () => {
  it("puts 9 stops on the trunk and 2 on the bottom line, all outside the camera zone", () => {
    const layout = computeTransitLayout(
      slots(8),
      [
        branch("tortie", "closed"),
        branch("acc", "served", ["Catmint", "Holly"]),
      ],
      false,
    );
    const trunk = layout.stations.filter((s) => s.slotId);
    expect(trunk).toHaveLength(11);
    expect(
      trunk.slice(0, 9).every((s) => s.x === TRANSIT_GEOMETRY.trunkX),
    ).toBe(true);
    expect(trunk.slice(9).every((s) => s.y === TRANSIT_GEOMETRY.bottomY)).toBe(
      true,
    );
    for (const s of layout.stations) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x + s.r).toBeLessThan(1280);
      expect(s.y + s.r).toBeLessThan(1080);
    }
    for (const label of layout.labels.filter((l) => l.anchor === "start")) {
      const px = label.size === "tiny" ? 10.6 : 14;
      expect(label.x + label.text.length * px).toBeLessThan(1280);
    }
  });

  it("colours segments by destination family, live cyan, upcoming dotted", () => {
    const layout = computeTransitLayout(slots(3), [], false);
    const seg = (id: string) =>
      layout.segments.find((s) => s.key === `seg-${id}`);
    expect(seg("colour")).toMatchObject({
      state: "served",
      color: TRANSIT_FAMILY_COLOR.coat,
    });
    expect(seg("pelt")?.color).toBe(TRANSIT_FAMILY_COLOR.eyes);
    expect(seg("eyeColour2")).toMatchObject({
      state: "live",
      color: TRANSIT_LIVE,
    });
    expect(seg("tint")?.state).toBe("next");
    expect(layout.labels.find((l) => l.key === "value-eyeColour2")?.text).toBe(
      ROLLING_TEXT,
    );
    expect(layout.served).toBe(3);
  });

  it("closes None stops and turns the corner into the bottom segment", () => {
    const layout = computeTransitLayout(slots(11, ["points"]), [], true);
    expect(layout.stations.find((s) => s.slotId === "points")?.kind).toBe(
      "closed",
    );
    expect(layout.segments.find((s) => s.key === "seg-vitiligo")?.d).toContain(
      "Q",
    );
    expect(layout.segments.find((s) => s.key === "seg-terminus")?.state).toBe(
      "served",
    );
    expect(layout.terminus.reached).toBe(true);
  });

  it("widens the gap for a trunk branch so its label clears both neighbours", () => {
    const layout = computeTransitLayout(
      slots(5),
      [branch("tortie", "closed")],
      false,
    );
    const anchor = layout.stations.find((s) => s.slotId === "eyeColour2");
    const next = layout.stations.find((s) => s.slotId === "tint");
    if (!anchor || !next) throw new Error("missing stations");
    expect(next.y - anchor.y).toBe(
      TRANSIT_GEOMETRY.pitch + TRANSIT_GEOMETRY.branchGap,
    );
    const label = layout.labels.find((l) => l.key === "blabel-tortie-0");
    expect(label?.text).toBe("tortie · closed");
    if (!label) throw new Error("missing label");
    // anchor value baseline is anchor.y + 9; next value cap top ≈ next.y - 10.
    expect(label.y - 14 - (anchor.y + 14)).toBeGreaterThanOrEqual(20);
    const row = layout.stations.find((s) => s.key === "bst-tortie-0");
    expect(row?.kind).toBe("closed");
    expect(next.y - 10 - ((row?.y ?? 0) + 8)).toBeGreaterThanOrEqual(20);
  });

  it("marks a rolling layer group live and overflows long value lists", () => {
    const many = Array.from({ length: 8 }, (_, i) => `Accessory ${i} long`);
    const layout = computeTransitLayout(
      slots(10),
      [branch("acc", "live", many), branch("scar", "next")],
      false,
    );
    const seg = layout.segments.find((s) => s.key === "branch-acc");
    expect(seg?.state).toBe("live");
    const labels = layout.labels.filter((l) => l.key.startsWith("blabel-acc"));
    expect(labels[labels.length - 1].text).toMatch(/^\+\d+$/);
    for (const l of labels) {
      expect(l.x + estimateBranchLabelWidth(l.text)).toBeLessThanOrEqual(
        TRANSIT_GEOMETRY.maxX + 1,
      );
    }
    // Two tail branches stack on separate rows.
    const accRow = layout.stations.find((s) => s.key === "bst-acc-0");
    const scarRow = layout.stations.find((s) => s.key === "bst-scar-0");
    expect(Math.abs((accRow?.y ?? 0) - (scarRow?.y ?? 0))).toBeGreaterThan(60);
  });
});

describe("branch helpers", () => {
  it("anchors each layer group on the board slot revealed before it", () => {
    expect(branchAnchorIndex(SEQUENCE, BOARD, "tortie")).toBe(3);
    expect(branchAnchorIndex(SEQUENCE, BOARD, "accessory")).toBe(9);
    expect(branchAnchorIndex(SEQUENCE, BOARD, "scar")).toBe(9);
  });

  it("knows when the route has passed a layer group", () => {
    const status = new Map<string, TransitSlotStatus>(
      BOARD.map((id) => [id, "pending"]),
    );
    expect(routePassed(SEQUENCE, status, "tortie", false)).toBe(false);
    status.set("tint", "active");
    expect(routePassed(SEQUENCE, status, "tortie", false)).toBe(true);
    expect(routePassed(SEQUENCE, status, "scar", false)).toBe(false);
    expect(routePassed(SEQUENCE, status, "scar", true)).toBe(true);
  });
});
