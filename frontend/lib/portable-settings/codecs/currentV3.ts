import type { SingleCatPortableSettings } from "../types";
import { WORDLIST_V3 } from "../wordlist-v3";
import { packPayload, type RawCodeWords, unpackPayload } from "./payload";
import {
  formatSettingsCodeWords,
  parseSettingsCodeWords,
} from "./settingsCode";

const CURRENT_PAYLOAD_VERSION = 3;

export const POSITION_MASKS: RawCodeWords = [
  0x6d2b, 0xb491, 0x38e7, 0xc55d, 0x9a13, 0x27cf,
];

let wordIndex: Map<string, number> | null = null;

function getWordIndex(): Map<string, number> {
  if (!wordIndex) {
    wordIndex = new Map();
    for (let i = 0; i < WORDLIST_V3.length; i++) {
      wordIndex.set(WORDLIST_V3[i], i);
    }
  }
  return wordIndex;
}

function toDisplayIndex(rawIndex: number, position: number): number {
  return rawIndex ^ POSITION_MASKS[position];
}

function toRawIndex(displayIndex: number, position: number): number {
  return displayIndex ^ POSITION_MASKS[position];
}

function decodeRawWords(code: string): {
  displayWords: string[];
  rawWords: RawCodeWords;
} | null {
  const displayWords = parseSettingsCodeWords(code);
  if (!displayWords) return null;

  const idx = getWordIndex();
  const rawWords: number[] = [];
  for (let position = 0; position < displayWords.length; position++) {
    const displayIndex = idx.get(displayWords[position]);
    if (displayIndex === undefined) return null;
    rawWords.push(toRawIndex(displayIndex, position));
  }

  return {
    displayWords,
    rawWords: rawWords as RawCodeWords,
  };
}

export function encodeCurrentV3(
  settings: SingleCatPortableSettings,
): string {
  const rawWords = packPayload(settings, CURRENT_PAYLOAD_VERSION);
  return formatSettingsCodeWords(
    rawWords.map((rawIndex, position) => {
      const displayIndex = toDisplayIndex(rawIndex, position);
      return WORDLIST_V3[displayIndex];
    }),
  );
}

export function decodeCurrentV3(
  code: string,
): SingleCatPortableSettings | null {
  const decoded = decodeRawWords(code);
  if (!decoded) return null;
  return unpackPayload(decoded.rawWords, CURRENT_PAYLOAD_VERSION);
}

export function normalizeCurrentV3Code(code: string): string | null {
  const decoded = decodeRawWords(code);
  if (!decoded) return null;
  if (!unpackPayload(decoded.rawWords, CURRENT_PAYLOAD_VERSION)) return null;
  return formatSettingsCodeWords(decoded.displayWords);
}

