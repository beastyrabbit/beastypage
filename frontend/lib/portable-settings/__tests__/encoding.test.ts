import { describe, expect, it } from "vitest";
import type { SingleCatSettings } from "@/utils/singleCatVariants";
import { DEFAULT_SINGLE_CAT_SETTINGS } from "@/utils/singleCatVariants";
import {
  decodePortableSettings,
  encodePortableSettings,
  isValidSettingsCode,
  normalizePortableSettingsCode,
} from "../encoding";
import { applyPortableSettings, extractPortableSettings } from "../helpers";
import { PORTABLE_PALETTE_REGISTRY } from "../registry";
import type { SingleCatPortableSettings } from "../types";
import { WORDLIST_V3, WORDLIST_V3_BLOCKLIST } from "../wordlist-v3";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSettings(
  overrides: Partial<SingleCatPortableSettings> = {},
): SingleCatPortableSettings {
  return {
    accessoryRange: { min: 1, max: 4 },
    scarRange: { min: 1, max: 1 },
    tortieRange: { min: 1, max: 4 },
    exactLayerCounts: true,
    afterlifeMode: "dark10",
    includeBaseColours: true,
    extendedModes: [],
    ...overrides,
  };
}

function assertRoundTrip(settings: SingleCatPortableSettings) {
  const code = encodePortableSettings(settings);
  const decoded = decodePortableSettings(code);
  expect(decoded).not.toBeNull();
  expect(decoded?.accessoryRange).toEqual(settings.accessoryRange);
  expect(decoded?.scarRange).toEqual(settings.scarRange);
  expect(decoded?.tortieRange).toEqual(settings.tortieRange);
  expect(decoded?.exactLayerCounts).toBe(settings.exactLayerCounts);
  expect(decoded?.afterlifeMode).toBe(settings.afterlifeMode);
  expect(decoded?.includeBaseColours).toBe(settings.includeBaseColours);
  expect([...(decoded?.extendedModes ?? [])].sort()).toEqual(
    [...settings.extendedModes].sort(),
  );
}

// ---------------------------------------------------------------------------
// Core round-trip tests
// ---------------------------------------------------------------------------

describe("encodePortableSettings / decodePortableSettings", () => {
  it("uses a full safe V3 wordlist for new codes", () => {
    expect(WORDLIST_V3).toHaveLength(65_536);

    const words = new Set(WORDLIST_V3);
    expect(words.size).toBe(WORDLIST_V3.length);

    for (const word of WORDLIST_V3) {
      expect(word).toMatch(/^[a-z]+$/);
    }

    for (const blockedWord of WORDLIST_V3_BLOCKLIST) {
      expect(words.has(blockedWord)).toBe(false);
    }
  });

  it("excludes blocked words without shrinking code capacity", () => {
    const blockedWords = [
      "that",
      "there",
      "this",
      "with",
      "have",
      "migrant",
      "immigrant",
      "refugee",
      "deport",
      "illegal",
      "alkaloids",
      "reefer",
    ];

    for (const word of blockedWords) {
      expect(WORDLIST_V3).not.toContain(word);
    }
    expect(WORDLIST_V3).toHaveLength(65_536);
  });

  it("round-trips default settings", () => {
    assertRoundTrip(makeSettings());
  });

  it("round-trips exactLayerCounts = true", () => {
    assertRoundTrip(makeSettings({ exactLayerCounts: true }));
  });

  it("round-trips exactLayerCounts = false", () => {
    assertRoundTrip(makeSettings({ exactLayerCounts: false }));
  });

  it("round-trips with no palettes and base off", () => {
    assertRoundTrip(
      makeSettings({ extendedModes: [], includeBaseColours: false }),
    );
  });

  it("round-trips with all palettes selected", () => {
    assertRoundTrip(
      makeSettings({ extendedModes: [...PORTABLE_PALETTE_REGISTRY] }),
    );
  });

  it("round-trips each palette individually", () => {
    for (const palette of PORTABLE_PALETTE_REGISTRY) {
      assertRoundTrip(makeSettings({ extendedModes: [palette] }));
    }
  });

  it("round-trips with mixed palette selection", () => {
    assertRoundTrip(
      makeSettings({
        extendedModes: [
          "mood",
          "demonslayer",
          "fma",
          "scottish-clans",
          "flag-patterns",
        ],
      }),
    );
  });

  it("round-trips every valid range combo for accessories", () => {
    const combos: [number, number][] = [];
    for (let min = 0; min <= 4; min++) {
      for (let max = min; max <= 4; max++) {
        combos.push([min, max]);
      }
    }
    expect(combos).toHaveLength(15);
    for (const [min, max] of combos) {
      assertRoundTrip(makeSettings({ accessoryRange: { min, max } }));
    }
  });

  it("round-trips every valid range combo for scars", () => {
    for (let min = 0; min <= 4; min++) {
      for (let max = min; max <= 4; max++) {
        assertRoundTrip(makeSettings({ scarRange: { min, max } }));
      }
    }
  });

  it("round-trips every valid range combo for torties", () => {
    for (let min = 0; min <= 4; min++) {
      for (let max = min; max <= 4; max++) {
        assertRoundTrip(makeSettings({ tortieRange: { min, max } }));
      }
    }
  });

  it("round-trips every afterlife option", () => {
    const options = [
      "off",
      "dark10",
      "star10",
      "both10",
      "darkForce",
      "starForce",
    ] as const;
    for (const opt of options) {
      assertRoundTrip(makeSettings({ afterlifeMode: opt }));
    }
  });

  it("produces a 6-word hyphen-separated code", () => {
    const code = encodePortableSettings(makeSettings());
    const words = code.split("-");
    expect(words).toHaveLength(6);
    for (const w of words) {
      expect(w).toMatch(/^[a-z]+$/);
    }
  });

  it("uses position masks so repeated raw values display as different words", () => {
    const code = encodePortableSettings(
      makeSettings({ exactLayerCounts: true, extendedModes: [] }),
    );
    const words = code.split("-");

    expect(new Set(words.slice(3)).size).toBe(3);
  });

  it("decodes case-insensitively", () => {
    const settings = makeSettings({ extendedModes: ["howl", "fma"] });
    const code = encodePortableSettings(settings);
    const upper = code.toUpperCase();
    const mixed = code
      .split("-")
      .map((w, i) => (i === 1 ? w.toUpperCase() : w))
      .join("-");

    expect(decodePortableSettings(upper)).not.toBeNull();
    expect(decodePortableSettings(mixed)).not.toBeNull();

    const decodedUpper = decodePortableSettings(upper)!;
    expect(decodedUpper.afterlifeMode).toBe(settings.afterlifeMode);
    expect([...decodedUpper.extendedModes].sort()).toEqual(
      [...settings.extendedModes].sort(),
    );
  });

  it("accepts spaces instead of hyphens", () => {
    const settings = makeSettings();
    const code = encodePortableSettings(settings);
    const spaced = code.replace(/-/g, " ");
    expect(decodePortableSettings(spaced)).not.toBeNull();
  });

  it("accepts mixed separators and extra whitespace", () => {
    const settings = makeSettings();
    const code = encodePortableSettings(settings);
    const words = code.split("-");
    const messy = `  ${words[0]}  - ${words[1]}   ${words[2]}  ${words[3]}   ${words[4]} ${words[5]}  `;
    expect(decodePortableSettings(messy)).not.toBeNull();
  });

  it("rejects wrong word count", () => {
    expect(decodePortableSettings("that")).toBeNull();
    expect(decodePortableSettings("that with")).toBeNull();
    expect(decodePortableSettings("that with this")).toBeNull();
    expect(decodePortableSettings("that with this have from")).toBeNull();
  });

  it("rejects unknown words", () => {
    expect(
      decodePortableSettings("that with this have xyznotaword extra"),
    ).toBeNull();
    expect(decodePortableSettings("qqq www eee rrr ttt uuu")).toBeNull();
  });

  it("rejects empty string", () => {
    expect(decodePortableSettings("")).toBeNull();
  });

  it("produces different codes for different settings", () => {
    const a = encodePortableSettings(makeSettings({ afterlifeMode: "off" }));
    const b = encodePortableSettings(
      makeSettings({ afterlifeMode: "starForce" }),
    );
    expect(a).not.toBe(b);
  });

  it("rejects old V1 codes containing blocked V3 words", () => {
    expect(
      decodePortableSettings("migrant-there-that-that-that-that"),
    ).toBeNull();
    expect(
      decodePortableSettings("alkaloids-which-that-that-that-that"),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

describe("normalizePortableSettingsCode", () => {
  it("normalizes V3 codes to lowercase hyphen formatting", () => {
    const code = encodePortableSettings(
      makeSettings({ extendedModes: ["howl", "fma"] }),
    );
    const messy = `  ${code.toUpperCase().replace(/-/g, " - ")}  `;

    expect(normalizePortableSettingsCode(messy)).toBe(code);
  });

  it("returns null for old V1 codes", () => {
    const oldCodes = [
      "migrant-there-that-that-that-that",
      "alkaloids-which-that-that-that-that",
    ];

    for (const oldCode of oldCodes) {
      expect(normalizePortableSettingsCode(oldCode)).toBeNull();
    }
  });

  it("returns null for invalid codes", () => {
    expect(normalizePortableSettingsCode("not a real code at all")).toBeNull();
    expect(normalizePortableSettingsCode("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Individual palette tests (every palette has its own bit)
// ---------------------------------------------------------------------------

describe("individual palette encoding", () => {
  it("each palette produces a different code", () => {
    const base = makeSettings({ extendedModes: [] });
    const baseCode = encodePortableSettings(base);

    for (const palette of PORTABLE_PALETTE_REGISTRY) {
      const code = encodePortableSettings(
        makeSettings({ extendedModes: [palette] }),
      );
      expect(code).not.toBe(baseCode);
    }
  });

  it("adding a second palette from the same category changes the code", () => {
    const one = encodePortableSettings(
      makeSettings({ extendedModes: ["scottish-clans"] }),
    );
    const two = encodePortableSettings(
      makeSettings({ extendedModes: ["scottish-clans", "japanese-patterns"] }),
    );
    expect(one).not.toBe(two);
  });

  it("round-trips heritage palettes individually", () => {
    assertRoundTrip(
      makeSettings({ extendedModes: ["scottish-clans", "chinese-patterns"] }),
    );
  });

  it("round-trips textile palettes individually", () => {
    assertRoundTrip(
      makeSettings({ extendedModes: ["royal-stewart", "gingham-patterns"] }),
    );
  });

  it("round-trips ornate palettes individually", () => {
    assertRoundTrip(
      makeSettings({ extendedModes: ["european-ornate", "medieval-patterns"] }),
    );
  });

  it("round-trips solid-ext palettes individually", () => {
    assertRoundTrip(
      makeSettings({
        extendedModes: ["ocean-depths", "ink-wash", "golden-hour"],
      }),
    );
  });

  it("round-trips flag palette individually", () => {
    assertRoundTrip(makeSettings({ extendedModes: ["flag-patterns"] }));
  });

  it("round-trips all palettes at once", () => {
    assertRoundTrip(
      makeSettings({ extendedModes: [...PORTABLE_PALETTE_REGISTRY] }),
    );
  });

  it("round-trips a large cross-category mix", () => {
    assertRoundTrip(
      makeSettings({
        extendedModes: [
          "mood",
          "bold",
          "fma", // core
          "ocean-depths",
          "crimson-flame",
          "greyscale", // solid-ext
          "royal-stewart",
          "gingham-patterns", // textile
          "european-ornate", // ornate
          "scottish-clans",
          "japanese-patterns",
          "korean-patterns", // heritage
          "flag-patterns", // flags
        ],
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("isValidSettingsCode", () => {
  it("returns true for a valid 6-word code", () => {
    const code = encodePortableSettings(makeSettings());
    expect(isValidSettingsCode(code)).toBe(true);
  });

  it("returns false for garbage", () => {
    expect(isValidSettingsCode("not a real code at all")).toBe(false);
    expect(isValidSettingsCode("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Append compatibility
// ---------------------------------------------------------------------------

describe("append-compatibility", () => {
  it("existing codes are stable regardless of future registry additions", () => {
    const settings = makeSettings({
      extendedModes: ["mood", "blackout", "fma", "scottish-clans"],
      includeBaseColours: true,
      afterlifeMode: "both10",
      accessoryRange: { min: 2, max: 4 },
      scarRange: { min: 0, max: 0 },
      tortieRange: { min: 3, max: 4 },
    });
    const code = encodePortableSettings(settings);
    const decoded = decodePortableSettings(code)!;
    expect([...decoded.extendedModes].sort()).toEqual([
      "blackout",
      "fma",
      "mood",
      "scottish-clans",
    ]);
    expect(decoded.accessoryRange).toEqual({ min: 2, max: 4 });
  });
});

// ---------------------------------------------------------------------------
// Extract / apply helpers
// ---------------------------------------------------------------------------

describe("extractPortableSettings / applyPortableSettings", () => {
  it("extract picks only portable fields", () => {
    const full = { ...DEFAULT_SINGLE_CAT_SETTINGS };
    const portable = extractPortableSettings(full);
    expect(portable.accessoryRange).toEqual(full.accessoryRange);
    expect(portable.afterlifeMode).toBe(full.afterlifeMode);
    const raw = portable as unknown as Record<string, unknown>;
    expect(raw.timing).toBeUndefined();
    expect(raw.mode).toBeUndefined();
    expect(raw.speedMultiplier).toBeUndefined();
  });

  it("apply preserves non-portable fields", () => {
    const full: SingleCatSettings = {
      ...DEFAULT_SINGLE_CAT_SETTINGS,
      mode: "calm",
      speedMultiplier: 2.5,
      catName: "TestCat",
      creatorName: "TestCreator",
    };
    const portable: SingleCatPortableSettings = {
      accessoryRange: { min: 0, max: 0 },
      scarRange: { min: 4, max: 4 },
      tortieRange: { min: 2, max: 3 },
      exactLayerCounts: false,
      afterlifeMode: "starForce",
      includeBaseColours: false,
      extendedModes: ["howl"],
    };
    const result = applyPortableSettings(full, portable);

    expect(result.accessoryRange).toEqual({ min: 0, max: 0 });
    expect(result.exactLayerCounts).toBe(false);
    expect(result.afterlifeMode).toBe("starForce");
    expect(result.extendedModes).toEqual(["howl"]);
    expect(result.mode).toBe("calm");
    expect(result.speedMultiplier).toBe(2.5);
    expect(result.catName).toBe("TestCat");
    expect(result.creatorName).toBe("TestCreator");
    expect(result.timing).toEqual(full.timing);
  });
});
