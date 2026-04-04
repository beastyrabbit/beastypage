export type ClassicWheelPrize = {
  name: string;
  chance: number;
  color: string;
};

export type ClassicWheelSelection = {
  prize: ClassicWheelPrize;
  index: number;
  random?: number;
};

/** Wire format for wheel spin data sent to/from Convex. */
export type StreamWheelSpin = {
  prizeName: string;
  prizeIndex: number;
  color: string;
  chance: number;
  randomBucket?: number;
  forced: boolean;
};

export const CLASSIC_WHEEL_PRIZES: ClassicWheelPrize[] = [
  { name: "Moondust", chance: 40, color: "#8b8b7a" },
  { name: "Starborn", chance: 25, color: "#6b8e4e" },
  { name: "Lunara", chance: 15, color: "#9b7c5d" },
  { name: "Celestara", chance: 10, color: "#7a8ca5" },
  { name: "Divinara", chance: 6, color: "#c97743" },
  { name: "Holo Nova", chance: 3, color: "#f4e4c1" },
  { name: "Singularity", chance: 1, color: "#d4af37" },
];

export const CLASSIC_WHEEL_ITEMS = CLASSIC_WHEEL_PRIZES.map((prize) => ({
  label: prize.name,
  weight: prize.chance,
  backgroundColor: prize.color,
  labelColor: "#ffffff",
}));

// Rejection sampling: discard values >= 200 to avoid modulo bias
// (200 is the largest multiple of 100 within Uint8 range 0-255).
function getSecureRandomInt100() {
  const array = new Uint8Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(array);
    value = array[0];
  } while (value >= 200);
  return value % 100;
}

export function pickClassicWheelPrize(
  forcedIndex?: number,
): ClassicWheelSelection {
  if (typeof forcedIndex === "number") {
    if (
      !Number.isInteger(forcedIndex) ||
      forcedIndex < 0 ||
      forcedIndex >= CLASSIC_WHEEL_PRIZES.length
    ) {
      throw new RangeError(
        `Invalid prize index ${forcedIndex} — must be 0..${CLASSIC_WHEEL_PRIZES.length - 1}`,
      );
    }
    return {
      prize: CLASSIC_WHEEL_PRIZES[forcedIndex],
      index: forcedIndex,
    };
  }

  // Cumulative probability thresholds computed from CLASSIC_WHEEL_PRIZES.chance values.
  const random = getSecureRandomInt100();
  let cumulative = 0;
  for (let i = 0; i < CLASSIC_WHEEL_PRIZES.length; i++) {
    cumulative += CLASSIC_WHEEL_PRIZES[i].chance;
    if (random < cumulative) {
      return { prize: CLASSIC_WHEEL_PRIZES[i], index: i, random };
    }
  }
  const last = CLASSIC_WHEEL_PRIZES.length - 1;
  return { prize: CLASSIC_WHEEL_PRIZES[last], index: last, random };
}
