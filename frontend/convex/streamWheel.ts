export const STREAM_WHEEL_PRIZES = [
  { name: "Moondust", chance: 40, color: "#8b8b7a" },
  { name: "Starborn", chance: 25, color: "#6b8e4e" },
  { name: "Lunara", chance: 15, color: "#9b7c5d" },
  { name: "Celestara", chance: 10, color: "#7a8ca5" },
  { name: "Divinara", chance: 6, color: "#c97743" },
  { name: "Holo Nova", chance: 3, color: "#f4e4c1" },
  { name: "Singularity", chance: 1, color: "#d4af37" },
] as const;

const BUCKET_COUNT = 100;
const UINT32_RANGE = 0x1_0000_0000;
const REJECTION_LIMIT = Math.floor(UINT32_RANGE / BUCKET_COUNT) * BUCKET_COUNT;

export type StreamWheelSpin = {
  prizeName: string;
  prizeIndex: number;
  color: string;
  chance: number;
  randomBucket: number;
  forced: boolean;
};

export type StreamWheelSourceCommand = {
  type?: string;
  seq?: number;
  params?: unknown;
  slots?: unknown;
};

export type StreamWheelSessionSnapshot = {
  currentCommand?: StreamWheelSourceCommand | null;
  lastWheelSpinForSeq?: number;
};

function secureRandomBucket() {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Secure random source unavailable");
  }

  const buffer = new Uint32Array(1);
  let value = UINT32_RANGE;
  while (value >= REJECTION_LIMIT) {
    globalThis.crypto.getRandomValues(buffer);
    value = buffer[0];
  }
  return value % BUCKET_COUNT;
}

function validateBucket(randomBucket: number) {
  if (
    !Number.isInteger(randomBucket) ||
    randomBucket < 0 ||
    randomBucket >= BUCKET_COUNT
  ) {
    throw new RangeError("Wheel random bucket must be an integer from 0 to 99.");
  }
  return randomBucket;
}

export function pickStreamWheelSpin(
  randomBucket = secureRandomBucket(),
): StreamWheelSpin {
  const bucket = validateBucket(randomBucket);
  let cumulative = 0;
  for (
    let prizeIndex = 0;
    prizeIndex < STREAM_WHEEL_PRIZES.length;
    prizeIndex++
  ) {
    const prize = STREAM_WHEEL_PRIZES[prizeIndex];
    cumulative += prize.chance;
    if (bucket < cumulative) {
      return {
        prizeName: prize.name,
        prizeIndex,
        color: prize.color,
        chance: prize.chance,
        randomBucket: bucket,
        forced: false,
      };
    }
  }

  const prizeIndex = STREAM_WHEEL_PRIZES.length - 1;
  const prize = STREAM_WHEEL_PRIZES[prizeIndex];
  return {
    prizeName: prize.name,
    prizeIndex,
    color: prize.color,
    chance: prize.chance,
    randomBucket: bucket,
    forced: false,
  };
}

export function buildStreamWheelUpdate(
  session: StreamWheelSessionSnapshot,
  wheelSpin: StreamWheelSpin,
  now: number,
) {
  const sourceCommand = session.currentCommand;
  if (
    !sourceCommand ||
    sourceCommand.type !== "spin" ||
    sourceCommand.params === undefined ||
    typeof sourceCommand.seq !== "number"
  ) {
    throw new Error("Spin a cat before spinning the wheel.");
  }
  if (session.lastWheelSpinForSeq === sourceCommand.seq) {
    throw new Error("Wheel already spun for this cat.");
  }

  const currentCommand: {
    type: "wheel";
    seq: number;
    params: unknown;
    slots?: unknown;
    wheelSpin: StreamWheelSpin;
    timestamp: number;
  } = {
    type: "wheel",
    seq: sourceCommand.seq + 1,
    params: sourceCommand.params,
    wheelSpin,
    timestamp: now,
  };
  if (sourceCommand.slots !== undefined) {
    currentCommand.slots = sourceCommand.slots;
  }

  return {
    wheelSpin,
    wheelLog: {
      prizeName: wheelSpin.prizeName,
      forced: wheelSpin.forced,
      randomBucket: wheelSpin.randomBucket,
      createdAt: now,
    },
    patch: {
      status: "active" as const,
      currentCommand,
      lastWheelSpinForSeq: sourceCommand.seq,
      updatedAt: now,
    },
  };
}
