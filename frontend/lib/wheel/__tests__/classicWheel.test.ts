import { afterEach, describe, expect, it } from "vitest";
import {
  CLASSIC_WHEEL_ITEMS,
  CLASSIC_WHEEL_PRIZES,
  pickClassicWheelPrize,
} from "@/lib/wheel/classicWheel";

const originalCrypto = globalThis.crypto;

function setCryptoBucket(bucket: number) {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {
      getRandomValues(array: Uint8Array) {
        array[0] = bucket;
        return array;
      },
    },
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: originalCrypto,
  });
});

describe("classicWheel", () => {
  it("keeps wheel items aligned with prize order, weights, and colors", () => {
    expect(CLASSIC_WHEEL_ITEMS).toHaveLength(CLASSIC_WHEEL_PRIZES.length);
    expect(CLASSIC_WHEEL_ITEMS.map((item) => item.label)).toEqual(
      CLASSIC_WHEEL_PRIZES.map((prize) => prize.name),
    );
    expect(CLASSIC_WHEEL_ITEMS.map((item) => item.weight)).toEqual(
      CLASSIC_WHEEL_PRIZES.map((prize) => prize.chance),
    );
    expect(CLASSIC_WHEEL_ITEMS.map((item) => item.backgroundColor)).toEqual(
      CLASSIC_WHEEL_PRIZES.map((prize) => prize.color),
    );
  });

  it("prize chances sum to exactly 100", () => {
    const total = CLASSIC_WHEEL_PRIZES.reduce((sum, p) => sum + p.chance, 0);
    expect(total).toBe(100);
  });

  it("supports forced selections by index", () => {
    const selection = pickClassicWheelPrize(4);
    expect(selection.index).toBe(4);
    expect(selection.prize).toEqual(CLASSIC_WHEEL_PRIZES[4]);
    expect(selection.random).toBeUndefined();
  });

  it("throws on out-of-bounds forced index", () => {
    expect(() => pickClassicWheelPrize(-1)).toThrow(RangeError);
    expect(() => pickClassicWheelPrize(7)).toThrow(RangeError);
    expect(() => pickClassicWheelPrize(NaN)).toThrow(RangeError);
    expect(() => pickClassicWheelPrize(1.5)).toThrow(RangeError);
  });

  it.each([
    { bucket: 0, expectedIndex: 0 },
    { bucket: 39, expectedIndex: 0 },
    { bucket: 40, expectedIndex: 1 },
    { bucket: 64, expectedIndex: 1 },
    { bucket: 65, expectedIndex: 2 },
    { bucket: 79, expectedIndex: 2 },
    { bucket: 80, expectedIndex: 3 },
    { bucket: 89, expectedIndex: 3 },
    { bucket: 90, expectedIndex: 4 },
    { bucket: 95, expectedIndex: 4 },
    { bucket: 96, expectedIndex: 5 },
    { bucket: 98, expectedIndex: 5 },
    { bucket: 99, expectedIndex: 6 },
  ])("maps random bucket $bucket to prize index $expectedIndex", ({
    bucket,
    expectedIndex,
  }) => {
    setCryptoBucket(bucket);
    const selection = pickClassicWheelPrize();
    expect(selection.index).toBe(expectedIndex);
    expect(selection.prize).toEqual(CLASSIC_WHEEL_PRIZES[expectedIndex]);
    expect(selection.random).toBe(bucket);
  });
});
