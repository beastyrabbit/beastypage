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
    [true, "True"],
    [false, "False"],
    [BigInt(12), "12"],
    [Symbol("DARK_GINGER"), "Symbol(Dark Ginger)"],
    [{}, "None"],
    [["GINGER"], "None"],
    [[], "None"],
    [
      {
        toString: () => {
          throw new Error("Must not coerce objects");
        },
      },
      "None",
    ],
  ] as const)("formats input case %#", (value, expected) => {
    expect(formatName(value)).toBe(expected);
  });
});
