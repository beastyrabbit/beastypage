export const SETTINGS_CODE_WORD_COUNT = 6;

export function parseSettingsCodeWords(code: string): string[] | null {
  const normalized = code
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, " ")
    .trim();

  if (!normalized) return null;

  const words = normalized.split(" ");
  return words.length === SETTINGS_CODE_WORD_COUNT ? words : null;
}

export function formatSettingsCodeWords(words: readonly string[]): string {
  return words.join("-");
}

