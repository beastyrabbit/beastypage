import type { GachaSeed, RandomSource } from "./types";

export const GACHA_RNG_VERSION = "xoshiro128**-v1" as const;

let entropyCounter = 0;

function rotateLeft(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

/** Stable 128-bit string hash used only to expand a public seed into state. */
function hashSeed(value: string): [number, number, number, number] {
  let h1 = 1_779_033_703;
  let h2 = 3_144_134_277;
  let h3 = 1_013_904_242;
  let h4 = 2_773_480_762;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ code, 597_399_067);
    h2 = h3 ^ Math.imul(h2 ^ code, 2_869_860_233);
    h3 = h4 ^ Math.imul(h3 ^ code, 951_274_213);
    h4 = h1 ^ Math.imul(h4 ^ code, 2_716_044_179);
  }

  h1 = Math.imul(h3 ^ (h1 >>> 18), 597_399_067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2_869_860_233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951_274_213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2_716_044_179);

  const words: [number, number, number, number] = [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];
  if (words.every((word) => word === 0)) words[0] = 1;
  return words;
}

export function createUnseededGachaSeed(): string {
  const words = new Uint32Array(4);
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(words);
  } else {
    entropyCounter += 1;
    const fallback = hashSeed(
      `entropy:${Date.now()}:${entropyCounter}:${
        typeof performance === "undefined" ? 0 : performance.now()
      }`,
    );
    words.set(fallback);
  }
  return Array.from(words, (word) => word.toString(16).padStart(8, "0")).join(
    "",
  );
}

export class Xoshiro128StarStar implements RandomSource {
  private readonly state: Uint32Array;

  constructor(seed: GachaSeed) {
    if (typeof seed === "number" && !Number.isFinite(seed)) {
      throw new Error("Gacha seed numbers must be finite");
    }
    const prefix = typeof seed === "number" ? "number:" : "string:";
    this.state = Uint32Array.from(hashSeed(`${prefix}${String(seed)}`));
  }

  nextUint32(): number {
    const state = this.state;
    const result =
      Math.imul(rotateLeft(Math.imul(state[1], 5) >>> 0, 7), 9) >>> 0;
    const shifted = (state[1] << 9) >>> 0;

    state[2] = (state[2] ^ state[0]) >>> 0;
    state[3] = (state[3] ^ state[1]) >>> 0;
    state[1] = (state[1] ^ state[2]) >>> 0;
    state[0] = (state[0] ^ state[3]) >>> 0;
    state[2] = (state[2] ^ shifted) >>> 0;
    state[3] = rotateLeft(state[3], 11);

    return result;
  }

  nextFloat(): number {
    return this.nextUint32() / 4_294_967_296;
  }
}

export function createRandomSource(seed: GachaSeed): RandomSource {
  return new Xoshiro128StarStar(seed);
}
