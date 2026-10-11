import { describe, expect, it } from "vitest";
import {
  CEREMONY_STEP_MS,
  type CeremonyCatInput,
  lineageCatState,
  REVEAL_MS_PER_ADDITION,
  stepDurationMs,
} from "./ceremony";

const cats: CeremonyCatInput[] = [
  {
    key: "s",
    label: "Starter",
    level: 0,
    branchLabel: null,
    archetype: null,
    previewUrl: null,
    additions: [],
  },
  {
    key: "a",
    label: "A",
    level: 1,
    branchLabel: "Leaf",
    archetype: "leaf",
    previewUrl: null,
    additions: [1, 2, 3],
  },
];

describe("stepDurationMs", () => {
  it("uses the command's spin length for a charge", () => {
    expect(stepDurationMs({ kind: "charge", index: 1 }, cats, 4200)).toBe(4200);
  });

  it("lingers 180 ms longer per addition on a reveal, like the chamber", () => {
    expect(stepDurationMs({ kind: "reveal", index: 1 }, cats, 8400)).toBe(
      CEREMONY_STEP_MS.reveal + 3 * REVEAL_MS_PER_ADDITION,
    );
    expect(stepDurationMs({ kind: "reveal", index: 0 }, cats, 8400)).toBe(
      CEREMONY_STEP_MS.reveal,
    );
    // Cats without an additions list (harness mocks) get the base time.
    expect(stepDurationMs({ kind: "reveal", index: 5 }, cats, 8400)).toBe(
      CEREMONY_STEP_MS.reveal,
    );
  });

  it("keeps the fixed steps fixed", () => {
    expect(stepDurationMs({ kind: "summon" }, cats, 8400)).toBe(
      CEREMONY_STEP_MS.summon,
    );
    expect(stepDurationMs({ kind: "banner", index: 1 }, cats, 8400)).toBe(
      CEREMONY_STEP_MS.banner,
    );
    expect(stepDurationMs({ kind: "waiting", index: 1 }, cats, 8400)).toBe(0);
  });
});

describe("lineageCatState", () => {
  it("draws everything when there is no ceremony", () => {
    expect(lineageCatState(undefined, "a")).toBe("shown");
  });
});
