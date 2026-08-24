export interface RandomAccessoryMapper {
  getAccessories?: () => string[];
  getExtraAccessories?: () => string[];
}

export function filterRandomAccessoryPool(
  accessories: readonly string[],
  _extraAccessories: readonly string[] = [],
  _includeNewSprites = false,
): string[] {
  return Array.from(new Set(accessories));
}

export function getRandomAccessoryPool(
  mapper: RandomAccessoryMapper,
  _includeNewSprites = false,
): string[] {
  return filterRandomAccessoryPool(mapper.getAccessories?.() ?? []);
}
