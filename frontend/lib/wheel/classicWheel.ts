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
    return {
      prize: CLASSIC_WHEEL_PRIZES[forcedIndex],
      index: forcedIndex,
    };
  }

  const random = getSecureRandomInt100();
  if (random < 40) return { prize: CLASSIC_WHEEL_PRIZES[0], index: 0, random };
  if (random < 65) return { prize: CLASSIC_WHEEL_PRIZES[1], index: 1, random };
  if (random < 80) return { prize: CLASSIC_WHEEL_PRIZES[2], index: 2, random };
  if (random < 90) return { prize: CLASSIC_WHEEL_PRIZES[3], index: 3, random };
  if (random < 96) return { prize: CLASSIC_WHEEL_PRIZES[4], index: 4, random };
  if (random < 99) return { prize: CLASSIC_WHEEL_PRIZES[5], index: 5, random };
  return { prize: CLASSIC_WHEEL_PRIZES[6], index: 6, random };
}
