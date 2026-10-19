import { describe, expect, it } from "vitest";
import { formatName } from "./utils";

describe("builder trait labels", () => {
  it.each([
    [null, "None"],
    [undefined, "None"],
    ["", "None"],
    ["  DARK_GINGER--COAT  ", "Dark Ginger Coat"],
    [0, "#0"],
    [8, "#8"],
  ] as const)("formats %s as %s", (value, expected) => {
    expect(formatName(value)).toBe(expected);
  });
});
