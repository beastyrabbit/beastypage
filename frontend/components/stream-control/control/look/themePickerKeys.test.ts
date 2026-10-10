import { describe, expect, it } from "vitest";
import { OVERLAY_THEME_IDS } from "../../obs/themes/themeMeta";
import { nextThemeOnKey } from "./themePickerKeys";

const ids = ["a", "b", "c"] as const;

describe("nextThemeOnKey", () => {
  it("moves forward with ArrowRight/ArrowDown and wraps", () => {
    expect(nextThemeOnKey("a", "ArrowRight", ids)).toBe("b");
    expect(nextThemeOnKey("b", "ArrowDown", ids)).toBe("c");
    expect(nextThemeOnKey("c", "ArrowRight", ids)).toBe("a");
  });

  it("moves back with ArrowLeft/ArrowUp and wraps", () => {
    expect(nextThemeOnKey("b", "ArrowLeft", ids)).toBe("a");
    expect(nextThemeOnKey("a", "ArrowUp", ids)).toBe("c");
  });

  it("jumps to the ends with Home/End", () => {
    expect(nextThemeOnKey("b", "Home", ids)).toBe("a");
    expect(nextThemeOnKey("a", "End", ids)).toBe("c");
  });

  it("ignores keys the picker does not handle", () => {
    expect(nextThemeOnKey("a", "Enter", ids)).toBeNull();
    expect(nextThemeOnKey("a", " ", ids)).toBeNull();
    expect(nextThemeOnKey("a", "Tab", ids)).toBeNull();
  });

  it("treats an unknown current id as the first", () => {
    expect(nextThemeOnKey("zzz" as never, "ArrowRight", ids)).toBe("b");
  });

  it("returns null for an empty list", () => {
    expect(nextThemeOnKey("a", "ArrowRight", [])).toBeNull();
  });

  it("walks the real theme order", () => {
    expect(nextThemeOnKey("plate", "ArrowRight", OVERLAY_THEME_IDS)).toBe(
      "sampler",
    );
    expect(nextThemeOnKey("plate", "ArrowLeft", OVERLAY_THEME_IDS)).toBe(
      "classic",
    );
  });
});
