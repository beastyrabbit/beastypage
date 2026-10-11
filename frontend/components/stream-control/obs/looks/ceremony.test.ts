import { describe, expect, it } from "vitest";
import {
  CEREMONY_MS,
  CEREMONY_STEP_MS,
  type LineageReveal,
  lineageBranchOpen,
  lineageCatState,
  lineageSpriteUrl,
  REVEAL_MS_PER_ADDITION,
} from "./ceremony";

function reveal(overrides: Partial<LineageReveal>): LineageReveal {
  return {
    step: { kind: "summon" },
    revealedKeys: new Set(["s"]),
    openBranches: new Set(),
    activeKey: "s",
    activeBranch: null,
    charging: false,
    revealing: true,
    teaserUrl: null,
    baseUrl: null,
    progress: 0.2,
    chargeMs: 5000,
    done: false,
    roll: null,
    landedValues: [],
    landing: null,
    clock: { elapsedMs: 0, totalMs: 20000 },
    held: false,
    reducedMotion: false,
    ...overrides,
  };
}

describe("CEREMONY_STEP_MS", () => {
  it("mirrors the overlay pacing of CEREMONY_MS", () => {
    expect(CEREMONY_STEP_MS).toEqual({
      summon: CEREMONY_MS.summon,
      banner: CEREMONY_MS.banner,
      reveal: CEREMONY_MS.reveal,
      finale: CEREMONY_MS.finale,
    });
    expect(CEREMONY_STEP_MS.summon).toBe(3000);
    expect(CEREMONY_STEP_MS.banner).toBe(2000);
    expect(CEREMONY_STEP_MS.reveal).toBe(2000);
    expect(CEREMONY_STEP_MS.finale).toBe(3500);
    expect(REVEAL_MS_PER_ADDITION).toBe(CEREMONY_MS.revealPerAddition);
  });
});

describe("lineageCatState", () => {
  it("draws everything when there is no ceremony", () => {
    expect(lineageCatState(undefined, "a")).toBe("shown");
  });

  it("marks the active cat charging during a roll step", () => {
    const rolling = reveal({
      step: { kind: "roll", index: 1, addition: 0, count: 2 },
      activeKey: "a",
      charging: true,
      revealing: false,
    });
    expect(lineageCatState(rolling, "a")).toBe("charging");
    expect(lineageCatState(rolling, "s")).toBe("shown");
    expect(lineageCatState(rolling, "b")).toBe("hidden");
  });

  it("marks the active cat revealing during its reveal, shown afterwards", () => {
    const revealing = reveal({
      step: { kind: "reveal", index: 1 },
      revealedKeys: new Set(["s", "a"]),
      activeKey: "a",
      revealing: true,
    });
    expect(lineageCatState(revealing, "a")).toBe("revealing");
    const later = reveal({
      step: { kind: "banner", index: 2 },
      revealedKeys: new Set(["s", "a"]),
      activeKey: "b",
      revealing: false,
    });
    expect(lineageCatState(later, "a")).toBe("shown");
  });

  it("the done reveal shows every cat", () => {
    const done = reveal({
      step: { kind: "done" },
      revealedKeys: new Set(["s", "a", "b"]),
      activeKey: null,
      revealing: false,
      done: true,
    });
    expect(lineageCatState(done, "b")).toBe("shown");
  });
});

describe("lineageBranchOpen / lineageSpriteUrl", () => {
  it("opens a branch once its banner played", () => {
    expect(lineageBranchOpen(undefined, "A")).toBe(true);
    expect(
      lineageBranchOpen(reveal({ openBranches: new Set(["A"]) }), "A"),
    ).toBe(true);
    expect(lineageBranchOpen(reveal({}), "A")).toBe(false);
  });

  it("draws the teaser while charging and never the finished preview", () => {
    const rolling = reveal({ teaserUrl: "data:candidate" });
    expect(lineageSpriteUrl("charging", rolling, "data:preview")).toBe(
      "data:candidate",
    );
    // No candidate frame yet: the roll's base (parent) or nothing, never
    // the finished cat (that would spoil the result).
    expect(lineageSpriteUrl("charging", reveal({}), "data:preview")).toBeNull();
    expect(
      lineageSpriteUrl(
        "charging",
        reveal({ baseUrl: "data:parent" }),
        "data:preview",
      ),
    ).toBe("data:parent");
    expect(lineageSpriteUrl("hidden", rolling, "data:preview")).toBeNull();
    expect(lineageSpriteUrl("revealing", rolling, "data:preview")).toBe(
      "data:preview",
    );
  });
});

describe("lineageSpriteUrl", () => {
  const reveal = (teaserUrl: string | null, baseUrl: string | null) =>
    ({ teaserUrl, baseUrl }) as unknown as Parameters<
      typeof lineageSpriteUrl
    >[1];
  it("never shows the finished cat while charging", () => {
    expect(
      lineageSpriteUrl("charging", reveal(null, null), "final.png"),
    ).toBeNull();
    expect(
      lineageSpriteUrl("charging", reveal(null, "parent.png"), "final.png"),
    ).toBe("parent.png");
    expect(
      lineageSpriteUrl(
        "charging",
        reveal("candidate.png", "parent.png"),
        "final.png",
      ),
    ).toBe("candidate.png");
  });
  it("draws the finished cat once shown or revealing", () => {
    expect(
      lineageSpriteUrl("shown", reveal(null, "parent.png"), "final.png"),
    ).toBe("final.png");
    expect(lineageSpriteUrl("revealing", reveal(null, null), "final.png")).toBe(
      "final.png",
    );
    expect(
      lineageSpriteUrl(
        "hidden",
        reveal("candidate.png", "parent.png"),
        "final.png",
      ),
    ).toBeNull();
  });
});
