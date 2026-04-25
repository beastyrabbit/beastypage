import { describe, expect, it } from "vitest";
import {
  STREAM_WHEEL_PRIZES,
  buildStreamWheelUpdate,
  pickStreamWheelSpin,
} from "@/convex/streamWheel";
import { CLASSIC_WHEEL_PRIZES } from "@/lib/wheel/classicWheel";

describe("pickStreamWheelSpin", () => {
  it("stays aligned with the OBS wheel prize table", () => {
    expect(STREAM_WHEEL_PRIZES).toEqual(CLASSIC_WHEEL_PRIZES);
  });

  it("keeps prize odds positive and totaling 100 buckets", () => {
    const totalChance = STREAM_WHEEL_PRIZES.reduce(
      (sum, prize) => sum + prize.chance,
      0,
    );

    expect(totalChance).toBe(100);
    expect(STREAM_WHEEL_PRIZES.every((prize) => prize.chance > 0)).toBe(true);
  });

  it.each([
    [0, 0],
    [39, 0],
    [40, 1],
    [64, 1],
    [65, 2],
    [79, 2],
    [80, 3],
    [89, 3],
    [90, 4],
    [95, 4],
    [96, 5],
    [98, 5],
    [99, 6],
  ])("maps random bucket %s to prize index %s", (randomBucket, prizeIndex) => {
    const spin = pickStreamWheelSpin(randomBucket);
    const prize = STREAM_WHEEL_PRIZES[prizeIndex];

    expect(spin).toMatchObject({
      prizeName: prize.name,
      prizeIndex,
      color: prize.color,
      chance: prize.chance,
      randomBucket,
      forced: false,
    });
  });

  it.each([-1, 100, 0.5, Number.NaN])(
    "rejects invalid bucket %s",
    (randomBucket) => {
      expect(() => pickStreamWheelSpin(randomBucket)).toThrow(RangeError);
    },
  );
});

describe("buildStreamWheelUpdate", () => {
  it("requires a current spin command with params", () => {
    const wheelSpin = pickStreamWheelSpin(99);

    expect(() => buildStreamWheelUpdate({}, wheelSpin, 123)).toThrow(
      "Spin a cat before spinning the wheel.",
    );
    expect(() =>
      buildStreamWheelUpdate(
        { currentCommand: { type: "lobby", seq: 7 } },
        wheelSpin,
        123,
      ),
    ).toThrow("Spin a cat before spinning the wheel.");
    expect(() =>
      buildStreamWheelUpdate(
        { currentCommand: { type: "spin", seq: 7 } },
        wheelSpin,
        123,
      ),
    ).toThrow("Spin a cat before spinning the wheel.");
  });

  it("rejects a second wheel spin for the same cat", () => {
    const wheelSpin = pickStreamWheelSpin(99);

    expect(() =>
      buildStreamWheelUpdate(
        {
          currentCommand: { type: "spin", seq: 7, params: { colour: "BLACK" } },
          lastWheelSpinForSeq: 7,
        },
        wheelSpin,
        123,
      ),
    ).toThrow("Wheel already spun for this cat.");
  });

  it("copies source params and slots into a wheel command and log row", () => {
    const params = { colour: "BLACK", darkForest: true };
    const slots = { accessories: ["flower"], scars: ["none"] };
    const wheelSpin = pickStreamWheelSpin(99);
    const update = buildStreamWheelUpdate(
      {
        currentCommand: { type: "spin", seq: 7, params, slots },
      },
      wheelSpin,
      123,
    );

    expect(update.patch).toEqual({
      status: "active",
      currentCommand: {
        type: "wheel",
        seq: 8,
        params,
        slots,
        wheelSpin,
        timestamp: 123,
      },
      lastWheelSpinForSeq: 7,
      updatedAt: 123,
    });
    expect(update.wheelLog).toEqual({
      prizeName: wheelSpin.prizeName,
      forced: false,
      randomBucket: 99,
      createdAt: 123,
    });
  });
});
