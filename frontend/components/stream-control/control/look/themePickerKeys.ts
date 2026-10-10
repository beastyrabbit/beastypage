/**
 * Roving-selection keys for the theme radiogroup: arrows move to the
 * previous/next theme (wrapping), Home/End jump to the ends. Returns null for
 * keys the picker does not handle so the caller can leave the event alone.
 */
export function nextThemeOnKey<T>(
  current: T,
  key: string,
  ids: readonly T[],
): T | null {
  if (ids.length === 0) return null;
  const index = Math.max(0, ids.indexOf(current));
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return ids[(index + 1) % ids.length];
    case "ArrowLeft":
    case "ArrowUp":
      return ids[(index - 1 + ids.length) % ids.length];
    case "Home":
      return ids[0];
    case "End":
      return ids[ids.length - 1];
    default:
      return null;
  }
}
