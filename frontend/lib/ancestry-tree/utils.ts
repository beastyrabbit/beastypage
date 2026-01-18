/**
 * Shared utilities for ancestry tree components
 */

import type { AncestryTreeCat } from './types';
import type { CatParams } from '@/lib/cat-v3/types';
import { encodeCatShare } from '@/lib/catShare';

/**
 * Maximum sprite pose number (0-20)
 */
export const MAX_SPRITE_POSE = 20;

/**
 * Warrior cat name suffixes used when aging up to warrior
 */
export const WARRIOR_SUFFIXES = [
  'fur', 'pelt', 'tail', 'claw', 'heart',
  'stripe', 'leaf', 'storm', 'wing', 'shine'
] as const;

/**
 * Generate a preview URL for a cat's sprite
 */
export function getCatPreviewUrl(cat: AncestryTreeCat): string {
  const encoded = encodeCatShare({
    params: cat.params as unknown as Record<string, unknown>,
    accessorySlots: cat.params.accessories ?? [],
    scarSlots: cat.params.scars ?? [],
    tortieSlots: cat.params.tortie ?? [],
    counts: {
      accessories: cat.params.accessories?.length ?? 0,
      scars: cat.params.scars?.length ?? 0,
      tortie: cat.params.tortie?.length ?? 0,
    },
  });
  return `/api/preview/_?cat=${encodeURIComponent(encoded)}`;
}

/**
 * Generate a preview URL from CatParams directly
 */
export function getParamsPreviewUrl(params: CatParams): string {
  const encoded = encodeCatShare({
    params: params as unknown as Record<string, unknown>,
    accessorySlots: params.accessories ?? [],
    scarSlots: params.scars ?? [],
    tortieSlots: params.tortie ?? [],
    counts: {
      accessories: params.accessories?.length ?? 0,
      scars: params.scars?.length ?? 0,
      tortie: params.tortie?.length ?? 0,
    },
  });
  return `/api/preview/_?cat=${encodeURIComponent(encoded)}`;
}
