import { describe, expect, it } from "vitest";
import {
  anchorPointInRect,
  buildPlaqueTally,
  capPlaqueTally,
  formatPlaqueTally,
  type PlaqueGroupInput,
  pickLeaderTargetIds,
} from "./plaqueModel";

const groups: PlaqueGroupInput[] = [
  { value: "MASK", label: "Mask", catIds: ["c16"] },
  {
    value: "LITTLE",
    label: "Little",
    catIds: ["c01", "c02", "c03", "c04", "c05", "c06"],
  },
  { value: "TUXEDO", label: "Tuxedo", catIds: ["c07", "c08", "c09"] },
];
const rareIds = new Set(["c16"]);
const numberById = new Map([
  ["c01", "01"],
  ["c07", "07"],
  ["c16", "16"],
]);

describe("buildPlaqueTally", () => {
  it("orders largest first and marks the lone group rare with its number", () => {
    const tally = buildPlaqueTally(groups, 14, rareIds, numberById);
    expect(tally.map((e) => `${e.count} ${e.label}`)).toEqual([
      "14 none",
      "6 Little",
      "3 Tuxedo",
      "1 Mask",
    ]);
    expect(tally[0].rare).toBe(false);
    expect(tally[3]).toEqual({
      label: "Mask",
      count: 1,
      rare: true,
      numbers: ["16"],
    });
    expect(tally[1].numbers).toBeUndefined();
  });

  it("omits none when unchangedCount is 0", () => {
    const tally = buildPlaqueTally(groups, 0, rareIds, numberById);
    expect(tally.map((e) => e.label)).toEqual(["Little", "Tuxedo", "Mask"]);
  });

  it("breaks count ties by label ascending, none included", () => {
    const tally = buildPlaqueTally(
      [
        { value: "B", label: "Zed", catIds: ["a", "b"] },
        { value: "A", label: "Alpha", catIds: ["c", "d"] },
      ],
      2,
      new Set(),
      new Map(),
    );
    expect(tally.map((e) => e.label)).toEqual(["Alpha", "Zed", "none"]);
  });

  it("only calls a group rare when every member is rare", () => {
    const tally = buildPlaqueTally(
      [{ value: "X", label: "Pair", catIds: ["c16", "c17"] }],
      0,
      rareIds,
      numberById,
    );
    expect(tally[0].rare).toBe(false);
    expect(tally[0].numbers).toBeUndefined();
  });
});

describe("formatPlaqueTally", () => {
  it("renders the mono line with the rare suffix", () => {
    const line = formatPlaqueTally([
      { label: "none", count: 14, rare: false },
      { label: "Little", count: 6, rare: false },
      { label: "Mask", count: 1, rare: true, numbers: ["16"] },
    ]);
    expect(line).toBe("14 none · 6 Little · 1 Mask, only #16");
  });

  it("joins several rare numbers with #", () => {
    expect(
      formatPlaqueTally([
        { label: "Mask", count: 2, rare: true, numbers: ["16", "21"] },
      ]),
    ).toBe("2 Mask, only #16 #21");
  });

  it("drops the suffix when a rare entry has no numbers", () => {
    expect(
      formatPlaqueTally([{ label: "Mask", count: 1, rare: true, numbers: [] }]),
    ).toBe("1 Mask");
    expect(formatPlaqueTally([])).toBe("");
  });
});

describe("capPlaqueTally", () => {
  const six = [
    { label: "none", count: 6, rare: false },
    { label: "Mask", count: 2, rare: false },
    { label: "Tuxedo", count: 2, rare: false },
    { label: "Little", count: 1, rare: true, numbers: ["05"] },
    { label: "Van", count: 1, rare: true, numbers: ["09"] },
    { label: "Belly", count: 1, rare: false },
  ];

  it("keeps rare entries, fills with the largest groups and counts the rest", () => {
    const { entries, more } = capPlaqueTally(six);
    expect(entries.map((e) => e.label)).toEqual([
      "none",
      "Mask",
      "Little",
      "Van",
    ]);
    expect(more).toBe(2);
  });

  it("keeps at most two rare entries so the big groups still show", () => {
    const rares = [
      { label: "Ginger", count: 12, rare: false },
      { label: "Grey", count: 9, rare: false },
      { label: "Black", count: 1, rare: true, numbers: ["07"] },
      { label: "Cream", count: 1, rare: true, numbers: ["32"] },
      { label: "Dark", count: 1, rare: true, numbers: ["15"] },
      { label: "Lilac", count: 1, rare: true, numbers: ["17"] },
    ];
    const { entries, more } = capPlaqueTally(rares);
    expect(entries.map((e) => e.label)).toEqual([
      "Ginger",
      "Grey",
      "Black",
      "Cream",
    ]);
    expect(more).toBe(2);
  });

  it("passes a short tally through untouched", () => {
    const { entries, more } = capPlaqueTally(six.slice(0, 3));
    expect(entries).toHaveLength(3);
    expect(more).toBe(0);
  });
});

describe("anchorPointInRect", () => {
  const rect = { x: 0, y: 10, width: 100, height: 200 };

  it("falls back to the rect centre without an anchor", () => {
    expect(anchorPointInRect(rect, null)).toEqual({ x: 50, y: 110 });
  });

  it("scales 0..50 sprite units into the rect", () => {
    expect(anchorPointInRect(rect, { x: 25, y: 0 })).toEqual({ x: 51, y: 12 });
    expect(anchorPointInRect({ ...rect, x: 40 }, { x: 49.5, y: 49.5 })).toEqual(
      { x: 140, y: 210 },
    );
  });
});

describe("pickLeaderTargetIds", () => {
  const order = [
    "u1",
    "u2",
    "c01",
    "c02",
    "c03",
    "c04",
    "c05",
    "c06",
    "c07",
    "c08",
    "c09",
    "c16",
  ];

  it("prefers rare ids, then the smallest groups, capped at 3", () => {
    expect(pickLeaderTargetIds(order, ["c16"], groups)).toEqual([
      "c16",
      "c07",
      "c08",
    ]);
  });

  it("honours the max and keeps rare ids in deal order", () => {
    const rareFirst = pickLeaderTargetIds(
      ["c09", "c16", "c07"],
      ["c16", "c09"],
      groups,
      2,
    );
    expect(rareFirst).toEqual(["c09", "c16"]);
    expect(pickLeaderTargetIds(order, ["c16"], groups, 1)).toEqual(["c16"]);
    expect(pickLeaderTargetIds(order, [], groups, 0)).toEqual([]);
  });

  it("never returns unchanged ids, even when listed as rare", () => {
    const picked = pickLeaderTargetIds(order, ["u1", "c16"], groups, 5);
    expect(picked).not.toContain("u1");
    expect(picked).not.toContain("u2");
    expect(picked).toEqual(["c16", "c07", "c08", "c09", "c01"]);
  });

  it("returns nothing when no group changed", () => {
    expect(pickLeaderTargetIds(order, [], [])).toEqual([]);
  });
});
