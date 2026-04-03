import type {
  AfterlifeOption,
  ExtendedMode,
  LayerRange,
} from "@/utils/singleCatVariants";
import { PORTABLE_PALETTE_REGISTRY } from "./registry";
import type { SingleCatPortableSettings } from "./types";
import { WORDLIST_V2 } from "./wordlist-v2";

// ---------------------------------------------------------------------------
// Shared tables
// ---------------------------------------------------------------------------

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

let _rangeIndex: Map<string, number> | null = null;
function getRangeIndex(): Map<string, number> {
  if (!_rangeIndex) {
    _rangeIndex = new Map();
    for (let i = 0; i < RANGE_TABLE.length; i++) {
      _rangeIndex.set(`${RANGE_TABLE[i][0]},${RANGE_TABLE[i][1]}`, i);
    }
  }
  return _rangeIndex;
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

// ---------------------------------------------------------------------------
// Lazy word -> index reverse map
// ---------------------------------------------------------------------------

let _wordIndex: Map<string, number> | null = null;
function getWordIndex(): Map<string, number> {
  if (!_wordIndex) {
    _wordIndex = new Map();
    for (let i = 0; i < WORDLIST_V2.length; i++)
      _wordIndex.set(WORDLIST_V2[i], i);
  }
  return _wordIndex;
}

// ---------------------------------------------------------------------------
// Range helpers
// ---------------------------------------------------------------------------

function encodeRange(range: LayerRange): number {
  const min = Math.min(range.min, range.max);
  const max = Math.max(range.min, range.max);
  return getRangeIndex().get(`${min},${max}`) ?? 0;
}

function decodeRange(index: number): LayerRange {
  const entry = RANGE_TABLE[index];
  if (!entry) return { min: 0, max: 0 };
  return { min: entry[0], max: entry[1] };
}

// ---------------------------------------------------------------------------
// Palette mask helpers — two-half split for 74-bit palette space
//
// Palette bitmask starts at bit 21 of the 96-bit value.
// It straddles the lower/upper boundary (bit 48):
//   paletteLow  = bits 21-47 -> 27 bits (palette positions 0-26)
//   paletteHigh = bits 48-94 -> 47 bits (palette positions 27-73)
//   reservedBit = bit 95     -> 1 bit   (exactLayerCounts mode)
//
// Uses 2**i (safe up to i=52) instead of 1<<i (32-bit truncation).
// ---------------------------------------------------------------------------

/** Encode palette selections into [low27, high47] pair. */
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

/** Decode [low27, high47] pair back to palette selections. */
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

// =========================================================================
// Encoding format — 6 words x 16 bits = 96 bits
//
// Uses WORDLIST_V2 (65,536 words, 16 bits per word).
// Every palette has its own bit — no group toggling.
//
// Layout (LSB first):
//   bits  0- 3  version = 1           (4)
//   bits  4- 7  accessory range       (4)  index into RANGE_TABLE
//   bits  8-11  scar range            (4)
//   bits 12-15  tortie range          (4)
//   bits 16-19  afterlife             (4)
//   bit  20     includeBase           (1)
//   bits 21-94  palette bitmask       (74) one bit per palette
//   bit  95     reserved mode bit     (1) 1 => exactLayerCounts = false
//                                     (inverted so legacy codes with 0 default to true)
//   ─────────────────────────────────────
//   total                             96 bits
//
// 96 bits exceeds Number.MAX_SAFE_INTEGER (2^53), so the value is split
// into two halves that are each within safe range:
//   lower (words 0-2, 48 bits): bits  0-47  (max ~2.8x10^14 < 2^53)
//   upper (words 3-5, 48 bits): bits 48-95  (max ~2.8x10^14 < 2^53)
//
// Palette bitmask straddles the boundary:
//   paletteLow   = bits 21-47 (27 bits, in lower half)
//   paletteHigh  = bits 48-94 (47 bits, in upper half)
//   reservedBit  = bit 95
// =========================================================================

const W = 65536; // 2^16
const W2 = W * W; // 2^32 = 4294967296

// Bit-position multipliers for the lower half
const POW4 = 16; // 2^4
const POW8 = 256; // 2^8
const POW12 = 4096; // 2^12
const POW16 = 65536; // 2^16
const POW20 = 1048576; // 2^20
const POW21 = 2097152; // 2^21

function pack(
  settings: SingleCatPortableSettings,
): [number, number, number, number, number, number] {
  const accIdx = encodeRange(settings.accessoryRange) & 0xf;
  const scarIdx = encodeRange(settings.scarRange) & 0xf;
  const tortieIdx = encodeRange(settings.tortieRange) & 0xf;
  const afterlifeIdx = (AFTERLIFE_INDEX.get(settings.afterlifeMode) ?? 0) & 0xf;
  const baseBit = settings.includeBaseColours ? 1 : 0;
  const reservedModeBit = settings.exactLayerCounts ? 0 : 1;

  const [paletteLow, paletteHigh] = encodePaletteMask(settings.extendedModes);

  // Lower half: bits 0-47 (version + ranges + afterlife + base + paletteLow)
  const lower =
    1 + // version = 1
    accIdx * POW4 +
    scarIdx * POW8 +
    tortieIdx * POW12 +
    afterlifeIdx * POW16 +
    baseBit * POW20 +
    paletteLow * POW21;

  // Upper half: bits 48-95 (paletteHigh + reserved mode bit)
  const upper = paletteHigh + reservedModeBit * 2 ** 47;

  // Split into 6 x 16-bit words via division + modulo
  return [
    lower % W,
    Math.floor(lower / W) % W,
    Math.floor(lower / W2) % W,
    upper % W,
    Math.floor(upper / W) % W,
    Math.floor(upper / W2) % W,
  ];
}

function unpack(
  w0: number,
  w1: number,
  w2: number,
  w3: number,
  w4: number,
  w5: number,
): SingleCatPortableSettings | null {
  // Reconstruct the two halves
  const lower = w0 + w1 * W + w2 * W2;
  const upper = w3 + w4 * W + w5 * W2;

  // Extract fields from lower half
  const version = lower % 16;
  if (version !== 1) return null;

  const accIdx = Math.floor(lower / POW4) % 16;
  if (accIdx >= RANGE_TABLE.length) return null;

  const scarIdx = Math.floor(lower / POW8) % 16;
  if (scarIdx >= RANGE_TABLE.length) return null;

  const tortieIdx = Math.floor(lower / POW12) % 16;
  if (tortieIdx >= RANGE_TABLE.length) return null;

  const afterlifeIdx = Math.floor(lower / POW16) % 16;
  if (afterlifeIdx >= AFTERLIFE_TABLE.length) return null;

  const includeBase = Math.floor(lower / POW20) % 2 === 1;

  const paletteLow = Math.floor(lower / POW21); // bits 21-47 = 27 bits
  const reservedModeBit = Math.floor(upper / 2 ** 47) % 2;
  const paletteHigh = upper % 2 ** 47; // bits 48-94 = 47 bits

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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encode portable settings into a 6-word code.
 *
 * 6 words from a 65,536-word list (16 bits each, 96 bits total).
 * Every palette has its own bit — no group toggling.
 *
 * @returns A hyphen-separated, lowercase 6-word string.
 */
export function encodePortableSettings(
  settings: SingleCatPortableSettings,
): string {
  const [w0, w1, w2, w3, w4, w5] = pack(settings);
  return [
    WORDLIST_V2[w0],
    WORDLIST_V2[w1],
    WORDLIST_V2[w2],
    WORDLIST_V2[w3],
    WORDLIST_V2[w4],
    WORDLIST_V2[w5],
  ].join("-");
}

/**
 * Decode a settings code back into portable settings.
 *
 * Accepts a 6-word code from the 65K wordlist.
 * Case-insensitive; hyphens, spaces, or mixed separators accepted.
 *
 * @returns The decoded settings, or `null` if the code is invalid.
 */
export function decodePortableSettings(
  code: string,
): SingleCatPortableSettings | null {
  const normalized = code
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, " ");
  const words = normalized.split(" ");

  if (words.length !== 6) return null;

  const idx = getWordIndex();
  const indices: number[] = [];
  for (const w of words) {
    const i = idx.get(w);
    if (i === undefined) return null;
    indices.push(i);
  }
  return unpack(
    indices[0],
    indices[1],
    indices[2],
    indices[3],
    indices[4],
    indices[5],
  );
}

/**
 * Quick check whether a string looks like a valid settings code.
 * Does a full decode attempt — returns `true` only if all words exist
 * in the wordlist and the payload decodes to valid settings.
 */
export function isValidSettingsCode(code: string): boolean {
  return decodePortableSettings(code) !== null;
}
