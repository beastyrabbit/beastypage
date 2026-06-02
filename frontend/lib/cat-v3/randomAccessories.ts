export interface RandomAccessoryMapper {
  getAccessories?: () => string[];
  getExtraAccessories?: () => string[];
}

export function filterRandomAccessoryPool(
  accessories: readonly string[],
  extraAccessories: readonly string[] = [],
  includeNewSprites = false,
): string[] {
  if (!includeNewSprites) {
    return [...accessories];
  }

  const legacyAccessories = new Set(extraAccessories);
  return accessories.filter((accessory) => !legacyAccessories.has(accessory));
}

export function getRandomAccessoryPool(
  mapper: RandomAccessoryMapper,
  includeNewSprites = false,
): string[] {
  return filterRandomAccessoryPool(
    mapper.getAccessories?.() ?? [],
    mapper.getExtraAccessories?.() ?? [],
    includeNewSprites,
  );
}
