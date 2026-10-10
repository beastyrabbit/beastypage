import { describe, expect, it } from "vitest";
import {
  DEFAULT_OVERLAY_THEME,
  OVERLAY_THEME_IDS,
  OVERLAY_THEME_META,
  OVERLAY_THEME_SETTING_KEY,
  resolveOverlaySpread,
  resolveOverlayTheme,
  themeTokensToCssVars,
} from "./themeMeta";

describe("resolveOverlayTheme", () => {
  it("defaults to plate when unset or invalid", () => {
    expect(DEFAULT_OVERLAY_THEME).toBe("plate");
    expect(resolveOverlayTheme(undefined)).toBe("plate");
    expect(resolveOverlayTheme(null)).toBe("plate");
    expect(resolveOverlayTheme({})).toBe("plate");
    expect(resolveOverlayTheme({ [OVERLAY_THEME_SETTING_KEY]: "neon" })).toBe(
      "plate",
    );
    expect(resolveOverlayTheme({ [OVERLAY_THEME_SETTING_KEY]: 3 })).toBe(
      "plate",
    );
  });

  it("round-trips every theme id", () => {
    for (const id of OVERLAY_THEME_IDS) {
      expect(resolveOverlayTheme({ [OVERLAY_THEME_SETTING_KEY]: id })).toBe(id);
    }
  });
});

describe("resolveOverlaySpread", () => {
  it("honours spread only for themes that support it", () => {
    const spread = { obsLayoutMode: "spread" };
    expect(resolveOverlaySpread(spread, "plate")).toBe(false);
    expect(resolveOverlaySpread(spread, "classic")).toBe(true);
    expect(resolveOverlaySpread({}, "classic")).toBe(false);
    expect(resolveOverlaySpread(undefined, "classic")).toBe(false);
  });
});

describe("OVERLAY_THEME_META", () => {
  it("describes every theme completely", () => {
    expect(Object.keys(OVERLAY_THEME_META).sort()).toEqual(
      [...OVERLAY_THEME_IDS].sort(),
    );
    for (const id of OVERLAY_THEME_IDS) {
      const meta = OVERLAY_THEME_META[id];
      expect(meta.id).toBe(id);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.blurb.length).toBeGreaterThan(0);
      expect(meta.palette).toHaveLength(5);
      expect(meta.supportsSpread).toBe(id === "classic");
    }
  });
});

describe("themeTokensToCssVars", () => {
  it("emits every --obs-* token", () => {
    const vars = themeTokensToCssVars(OVERLAY_THEME_META.classic.tokens);
    expect(Object.keys(vars).sort()).toEqual(
      [
        "--obs-accent",
        "--obs-accent-rgb",
        "--obs-ink",
        "--obs-muted",
        "--obs-panel-bg",
        "--obs-panel-border",
        "--obs-panel-shadow",
        "--obs-panel-radius",
        "--obs-font-serif",
        "--obs-font-sans",
        "--obs-font-mono",
      ].sort(),
    );
    for (const value of Object.values(vars)) {
      expect(typeof value).toBe("string");
      expect((value as string).length).toBeGreaterThan(0);
    }
  });

  it("classic tokens reproduce the original amber panel", () => {
    const vars = themeTokensToCssVars(
      OVERLAY_THEME_META.classic.tokens,
    ) as Record<string, string>;
    expect(vars["--obs-accent"]).toBe("#f59e0b");
    expect(vars["--obs-panel-border"]).toBe("rgba(245, 158, 11, 0.2)");
    expect(vars["--obs-panel-radius"]).toBe("20px");
  });
});
