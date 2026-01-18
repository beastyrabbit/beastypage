import { useMemo } from 'react';
import { ADDITIONAL_PALETTES, getPaletteMetadata, type PaletteId } from '@/lib/palettes';

export interface PaletteOption {
  id: PaletteId;
  label: string;
  description?: string;
  colorCount: number;
  previewColors: Array<[number, number, number]>;
}

/**
 * Hook providing palette metadata for UI components
 */
export function usePaletteOptions(): PaletteOption[] {
  return useMemo(() => {
    return ADDITIONAL_PALETTES.map((palette) => {
      const colorEntries = Object.entries(palette.colors);
      // Get first 4 colors for preview
      const previewColors = colorEntries
        .slice(0, 4)
        .map(([, def]) => def.multiply);

      return {
        id: palette.id as PaletteId,
        label: palette.label,
        description: palette.description,
        colorCount: colorEntries.length,
        previewColors,
      };
    });
  }, []);
}

/**
 * Get all palette IDs for validation
 */
export function getAllPaletteIds(): PaletteId[] {
  return ADDITIONAL_PALETTES.map((p) => p.id as PaletteId);
}

/**
 * Get palette label by ID
 */
export function getPaletteLabel(id: PaletteId): string {
  const palette = ADDITIONAL_PALETTES.find((p) => p.id === id);
  return palette?.label ?? id;
}

/**
 * Check if a string is a valid palette ID
 */
export function isValidPaletteId(id: string): id is PaletteId {
  return ADDITIONAL_PALETTES.some((p) => p.id === id);
}
