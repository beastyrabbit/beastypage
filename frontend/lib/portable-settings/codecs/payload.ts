import type {
  AfterlifeOption,
  ExtendedMode,
  LayerRange,
} from "@/utils/singleCatVariants";
import { PORTABLE_PALETTE_REGISTRY } from "../registry";
import type { SingleCatPortableSettings } from "../types";

export type RawCodeWords = [number, number, number, number, number, number];

/**
 * All 15 valid (min, max) pairs where 0 <= min <= max <= 4.
 * Index into this array is stored in 4 bits.
 */
const RANGE_TABLE: readonly [number, number][] = [
  [0, 0],
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [1, 1],
  [1, 2],
  [1, 3],
  [1, 4],
  [2, 2],
  [2, 3],
  [2, 4],
  [3, 3],
  [3, 4],
  [4, 4],
];

let rangeIndex: Map<string, number> | null = null;

function getRangeIndex(): Map<string, number> {
  if (!rangeIndex) {
    rangeIndex = new Map();
    for (let i = 0; i < RANGE_TABLE.length; i++) {
      rangeIndex.set(`${RANGE_TABLE[i][0]},${RANGE_TABLE[i][1]}`, i);
    }
  }
  return rangeIndex;
}

const AFTERLIFE_TABLE: readonly AfterlifeOption[] = [
  "off",
  "dark10",
  "star10",
  "both10",
  "darkForce",
  "starForce",
];

const AFTERLIFE_INDEX = new Map<string, number>(
  AFTERLIFE_TABLE.map((v, i) => [v, i]),
);

const MAX_RANGE_VALUE = 4;
const PALETTE_LOW_BITS = 27;
const PALETTE_BIT_CAPACITY = 74;

function isRangeValue(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_RANGE_VALUE;
}

function encodeRange(range: LayerRange): number {
  if (!isRangeValue(range.min) || !isRangeValue(range.max)) {
    throw new RangeError(
      "Portable settings ranges must be integers from 0 to 4",
    );
  }

  const min = Math.min(range.min, range.max);
  const max = Math.max(range.min, range.max);
  const index = getRangeIndex().get(`${min},${max}`);
  if (index === undefined) {
    throw new Error("Internal portable settings range table is incomplete");
  }
  return index;
}

function decodeRange(index: number): LayerRange {
  const entry = RANGE_TABLE[index];
  if (!entry) return { min: 0, max: 0 };
  return { min: entry[0], max: entry[1] };
}

/**
 * Encode palette selections into [low27, high47] pair.
 *
 * Palette bitmask starts at bit 21 of the 96-bit value. It straddles the
 * lower/upper boundary:
 *   paletteLow  = bits 21-47 -> 27 bits
 *   paletteHigh = bits 48-94 -> 47 bits
 */
function encodePaletteMask(modes: readonly ExtendedMode[]): [number, number] {
  let low = 0;
  let high = 0;
  const modeSet = new Set(modes);
  const len = Math.min(PORTABLE_PALETTE_REGISTRY.length, 74);

  for (let i = 0; i < Math.min(len, 27); i++) {
    if (modeSet.has(PORTABLE_PALETTE_REGISTRY[i])) low += 2 ** i;
  }
  for (let i = 27; i < len; i++) {
    if (modeSet.has(PORTABLE_PALETTE_REGISTRY[i])) high += 2 ** (i - 27);
  }
  return [low, high];
}

function decodePaletteMask(low: number, high: number): ExtendedMode[] {
  const modes: ExtendedMode[] = [];
  const len = Math.min(PORTABLE_PALETTE_REGISTRY.length, 74);

  for (let i = 0; i < Math.min(len, 27); i++) {
    if (Math.floor(low / 2 ** i) % 2 === 1) {
      modes.push(PORTABLE_PALETTE_REGISTRY[i]);
    }
  }
  for (let i = 27; i < len; i++) {
    if (Math.floor(high / 2 ** (i - 27)) % 2 === 1) {
      modes.push(PORTABLE_PALETTE_REGISTRY[i]);
    }
  }
  return modes;
}

function hasBitsAtOrAbove(value: number, startBit: number): boolean {
  if (startBit <= 0) return value !== 0;
  return Math.floor(value / 2 ** startBit) > 0;
}

function hasUnusedPaletteBits(low: number, high: number): boolean {
  const usedBits = Math.min(
    PORTABLE_PALETTE_REGISTRY.length,
    PALETTE_BIT_CAPACITY,
  );

  if (usedBits < PALETTE_LOW_BITS && hasBitsAtOrAbove(low, usedBits)) {
    return true;
  }

  const usedHighBits = Math.max(0, usedBits - PALETTE_LOW_BITS);
  return hasBitsAtOrAbove(high, usedHighBits);
}

// 6 words x 16 bits = 96 bits. The value is split into two safe 48-bit halves.
const W = 65536; // 2^16
const W2 = W * W; // 2^32

const POW4 = 16;
const POW8 = 256;
const POW12 = 4096;
const POW16 = 65536;
const POW20 = 1048576;
const POW21 = 2097152;

export function packPayload(
  settings: SingleCatPortableSettings,
  payloadVersion: number,
): RawCodeWords {
  const accIdx = encodeRange(settings.accessoryRange) & 0xf;
  const scarIdx = encodeRange(settings.scarRange) & 0xf;
  const tortieIdx = encodeRange(settings.tortieRange) & 0xf;
  const afterlifeIdx = (AFTERLIFE_INDEX.get(settings.afterlifeMode) ?? 0) & 0xf;
  const baseBit = settings.includeBaseColours ? 1 : 0;
  const reservedModeBit = settings.exactLayerCounts ? 0 : 1;

  const [paletteLow, paletteHigh] = encodePaletteMask(settings.extendedModes);

  const lower =
    (payloadVersion & 0xf) +
    accIdx * POW4 +
    scarIdx * POW8 +
    tortieIdx * POW12 +
    afterlifeIdx * POW16 +
    baseBit * POW20 +
    paletteLow * POW21;

  const upper = paletteHigh + reservedModeBit * 2 ** 47;

  return [
    lower % W,
    Math.floor(lower / W) % W,
    Math.floor(lower / W2) % W,
    upper % W,
    Math.floor(upper / W) % W,
    Math.floor(upper / W2) % W,
  ];
}

export function unpackPayload(
  words: RawCodeWords,
  expectedPayloadVersion: number,
): SingleCatPortableSettings | null {
  const [w0, w1, w2, w3, w4, w5] = words;
  const lower = w0 + w1 * W + w2 * W2;
  const upper = w3 + w4 * W + w5 * W2;

  const version = lower % 16;
  if (version !== expectedPayloadVersion) return null;

  const accIdx = Math.floor(lower / POW4) % 16;
  if (accIdx >= RANGE_TABLE.length) return null;

  const scarIdx = Math.floor(lower / POW8) % 16;
  if (scarIdx >= RANGE_TABLE.length) return null;

  const tortieIdx = Math.floor(lower / POW12) % 16;
  if (tortieIdx >= RANGE_TABLE.length) return null;

  const afterlifeIdx = Math.floor(lower / POW16) % 16;
  if (afterlifeIdx >= AFTERLIFE_TABLE.length) return null;

  const includeBase = Math.floor(lower / POW20) % 2 === 1;

  const paletteLow = Math.floor(lower / POW21);
  const reservedModeBit = Math.floor(upper / 2 ** 47) % 2;
  const paletteHigh = upper % 2 ** 47;

  if (hasUnusedPaletteBits(paletteLow, paletteHigh)) return null;

  return {
    accessoryRange: decodeRange(accIdx),
    scarRange: decodeRange(scarIdx),
    tortieRange: decodeRange(tortieIdx),
    exactLayerCounts: reservedModeBit === 0,
    afterlifeMode: AFTERLIFE_TABLE[afterlifeIdx],
    includeBaseColours: includeBase,
    extendedModes: decodePaletteMask(paletteLow, paletteHigh),
  };
}
