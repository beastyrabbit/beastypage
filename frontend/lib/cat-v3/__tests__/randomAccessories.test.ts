import { describe, expect, it } from "vitest";
import {
  filterRandomAccessoryPool,
  getRandomAccessoryPool,
} from "../randomAccessories";

describe("random accessory pools", () => {
  it("keeps misc extra accessories by default", () => {
    expect(
      filterRandomAccessoryPool(
        ["HOLLY", "TOAST", "BLUEBELL"],
        ["TOAST"],
        false,
      ),
    ).toEqual(["HOLLY", "TOAST", "BLUEBELL"]);
  });

  it("excludes misc extra accessories only for new-sprite rolls", () => {
    expect(
      filterRandomAccessoryPool(
        ["HOLLY", "TOAST", "BLUEBELL"],
        ["TOAST"],
        true,
      ),
    ).toEqual(["HOLLY", "BLUEBELL"]);
  });

  it("uses the mapper extra_accessories group without hardcoded names", () => {
    const mapper = {
      getAccessories: () => ["PLANT", "LEGACY_ONE", "LEGACY_TWO", "COLLAR"],
      getExtraAccessories: () => ["LEGACY_ONE", "LEGACY_TWO"],
    };

    expect(getRandomAccessoryPool(mapper, true)).toEqual(["PLANT", "COLLAR"]);
  });
});
