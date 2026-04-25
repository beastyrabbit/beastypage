import {
  decodeCurrentV3,
  encodeCurrentV3,
  normalizeCurrentV3Code,
} from "./codecs/currentV3";
import type { SingleCatPortableSettings } from "./types";

/**
 * Encode portable settings into a strict 6-word current settings code.
 *
 * Codes use the V3 wordlist plus a deterministic per-position display
 * transform so repeated raw 16-bit values do not display as repeated words.
 */
export function encodePortableSettings(
  settings: SingleCatPortableSettings,
): string {
  return encodeCurrentV3(settings);
}

/**
 * Decode a settings code back into portable settings.
 *
 * Accepts V3 codes. Inputs are case-insensitive; hyphens, spaces, or mixed
 * separators are accepted.
 *
 * @returns The decoded settings, or `null` if the code is invalid.
 */
export function decodePortableSettings(
  code: string,
): SingleCatPortableSettings | null {
  return decodeCurrentV3(code);
}

/**
 * Normalize any valid V3 settings code to canonical formatting.
 *
 * Valid codes are returned as lowercase hyphen-separated words. Invalid codes
 * return `null`.
 */
export function normalizePortableSettingsCode(code: string): string | null {
  return normalizeCurrentV3Code(code);
}

/**
 * Quick check whether a string looks like a valid settings code.
 * Does a full decode attempt — returns `true` only if all words exist
 * in a supported wordlist and the payload decodes to valid settings.
 */
export function isValidSettingsCode(code: string): boolean {
  return decodePortableSettings(code) !== null;
}
