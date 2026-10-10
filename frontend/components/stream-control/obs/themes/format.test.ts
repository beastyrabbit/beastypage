import { describe, expect, it } from "vitest";
import { PARAM_SEQUENCE } from "../spinSupport";
import {
  bayerLetter,
  formatTrackTime,
  isNoneValue,
  legendNumber,
  type TransitFamily,
  transitFamily,
  truncateValue,
} from "./format";

describe("formatTrackTime", () => {
  it("formats m:ss", () => {
    expect(formatTrackTime(4000)).toBe("0:04");
    expect(formatTrackTime(65000)).toBe("1:05");
    expect(formatTrackTime(0)).toBe("0:00");
  });

  it("uses a dash placeholder for missing values", () => {
    expect(formatTrackTime(undefined)).toBe("–:––");
    expect(formatTrackTime(null)).toBe("–:––");
    expect(formatTrackTime(Number.NaN)).toBe("–:––");
    expect(formatTrackTime(-5)).toBe("–:––");
  });
});

describe("bayerLetter / legendNumber", () => {
  it("names stars with Greek letters", () => {
    expect(bayerLetter(0)).toBe("α");
    expect(bayerLetter(1)).toBe("β");
    expect(bayerLetter(24)).toBe("α");
  });

  it("pads legend numbers", () => {
    expect(legendNumber(0)).toBe("01");
    expect(legendNumber(10)).toBe("11");
  });
});

describe("transitFamily", () => {
  const expected: Record<string, TransitFamily> = {
    colour: "coat",
    pelt: "coat",
    tint: "coat",
    tortie: "coat",
    eyeColour: "eyes",
    eyeColour2: "eyes",
    whitePatches: "patch",
    points: "patch",
    whitePatchesTint: "patch",
    vitiligo: "patch",
    skinColour: "extra",
    accessory: "extra",
    scar: "extra",
    sprite: "extra",
  };

  it("assigns every reveal param a line", () => {
    for (const def of PARAM_SEQUENCE) {
      if (def.id in expected) {
        expect(transitFamily(def.id)).toBe(expected[def.id]);
      } else {
        // Layer sub-params (tortie mask/pattern/colour…) ride the extra line.
        expect(transitFamily(def.id)).toBe("extra");
      }
    }
    for (const [id, family] of Object.entries(expected)) {
      expect(transitFamily(id)).toBe(family);
    }
  });
});

describe("truncateValue", () => {
  it("keeps short values and ellipsises long ones", () => {
    expect(truncateValue("Tabby", 10)).toBe("Tabby");
    expect(truncateValue("Adult Short Two", 8)).toBe("Adult S…");
    expect(truncateValue("Adult Short Two", 8).length).toBe(8);
  });
});

describe("isNoneValue", () => {
  it("treats empty and none-like values as none", () => {
    for (const v of [null, undefined, "", "none", " None ", "—", "-"]) {
      expect(isNoneValue(v)).toBe(true);
    }
    expect(isNoneValue("Tabby")).toBe(false);
  });
});
