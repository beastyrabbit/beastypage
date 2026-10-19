/** Repair old duplicate layers, preserving the first occurrence and empty slots. */
export function deduplicateTortieLayers<T>(layers: readonly T[]): T[] {
  const seen = new Set<string>();
  return layers.filter((layer) => {
    if (!layer || typeof layer !== "object") return true;
    const { mask, pattern, colour } = layer as Record<string, unknown>;
    if (![mask, pattern, colour].every((value) => typeof value === "string"))
      return true;
    const key = JSON.stringify([mask, pattern, colour]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
