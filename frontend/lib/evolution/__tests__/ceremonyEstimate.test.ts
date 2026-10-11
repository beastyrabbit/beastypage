import { describe, expect, it } from "vitest";
import {
  estimateCeremonySeconds,
  estimateCeremonySecondsFromCounts,
  formatDuration,
} from "../ceremonyEstimate";

describe("estimateCeremonySeconds", () => {
  it("keeps the page formula by default: 5 + 3.5·b + e·(s + 6.7)", () => {
    expect(estimateCeremonySeconds(3, 2, 15)).toBeCloseTo(145.7, 6);
    expect(estimateCeremonySeconds(3, 2, 15, "page")).toBeCloseTo(145.7, 6);
    expect(estimateCeremonySecondsFromCounts(1, 1, 8.4)).toBeCloseTo(23.6, 6);
  });

  it("overlay pacing: 3 + 2·b + e·(2·clamp(s/2, 2.5, 8) + 2.36) + 3.5", () => {
    expect(estimateCeremonySeconds(3, 2, 15, "overlay")).toBeCloseTo(116.66, 6);
    // Rolls clamp at 2.5 s below and 8 s above.
    expect(estimateCeremonySecondsFromCounts(1, 1, 2, "overlay")).toBeCloseTo(
      3 + 2 + (2 * 2.5 + 2.36) + 3.5,
      6,
    );
    expect(estimateCeremonySecondsFromCounts(1, 1, 40, "overlay")).toBeCloseTo(
      3 + 2 + (2 * 8 + 2.36) + 3.5,
      6,
    );
  });

  it("formatDuration is unchanged", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(145.7)).toBe("2m 26s");
  });
});
