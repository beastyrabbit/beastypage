import { describe, expect, it } from "vitest";
import {
  filterRandomAccessoryPool,
  getRandomAccessoryPool,
} from "../randomAccessories";

describe("random accessory pools", () => {
  it("keeps every accessory in the random pool", () => {
    expect(
      filterRandomAccessoryPool(
        ["HOLLY", "TOAST", "BLUEBELL"],
        ["TOAST"],
        false,
      ),
    ).toEqual(["HOLLY", "TOAST", "BLUEBELL"]);
  });

  it("ignores the retired new-sprite compatibility flag", () => {
    expect(
      filterRandomAccessoryPool(
        ["HOLLY", "TOAST", "BLUEBELL"],
        ["TOAST"],
        true,
      ),
    ).toEqual(["HOLLY", "TOAST", "BLUEBELL"]);
  });

  it("keeps duplicate category entries from changing selection weight", () => {
    expect(
      filterRandomAccessoryPool(
        ["WISTERIA", "HOLLY", "WISTERIA"],
        ["WISTERIA"],
      ),
    ).toEqual(["WISTERIA", "HOLLY"]);
  });

  it("returns every accessory exposed by the mapper", () => {
    const mapper = {
      getAccessories: () => ["PLANT", "LEGACY_ONE", "LEGACY_TWO", "COLLAR"],
      getExtraAccessories: () => ["LEGACY_ONE", "LEGACY_TWO"],
    };

    expect(getRandomAccessoryPool(mapper, true)).toEqual([
      "PLANT",
      "LEGACY_ONE",
      "LEGACY_TWO",
      "COLLAR",
    ]);
  });
});
