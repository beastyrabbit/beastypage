"use client";

import type { ExtractedColor } from "@/lib/color-extraction/types";

import { ColorSwatch } from "./ColorSwatch";

interface PaletteDisplayProps {
  colors: ExtractedColor[];
  onColorHover: (index: number | null) => void;
  selectedIndex: number | null;
  onColorSelect: (index: number | null) => void;
}

/**
 * Render a palette of extracted color swatches or an empty-state prompt.
 *
 * Displays a centered placeholder when `colors` is empty. Otherwise shows a header with the total
 * count, an optional "Clear selection" action when a swatch is selected, a grid of interactive
 * color swatches that propagate hover and select events, and a short helper note.
 *
 * @param colors - Array of extracted colors to display
 * @param onColorHover - Called with the swatch index or `null` when a swatch is hovered or unhovered
 * @param selectedIndex - The index of the currently selected swatch, or `null` if none is selected
 * @param onColorSelect - Called with a swatch index to select it or `null` to clear the selection
 * @returns The component's rendered element: an empty-state card when `colors` is empty, otherwise a header, swatch grid, and helper text
 */
export function PaletteDisplay({
  colors,
  onColorHover,
  selectedIndex,
  onColorSelect,
}: PaletteDisplayProps) {
  if (colors.length === 0) {
    return (
      <div className="glass-card flex flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="text-4xl">🎨</div>
        <div>
          <p className="font-semibold text-foreground">No colors yet</p>
          <p className="text-sm text-muted-foreground">
            Click &quot;Extract Colors&quot; to analyze your image
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Extracted Colors ({colors.length})
        </h3>
        {selectedIndex !== null && (
          <button
            onClick={() => onColorSelect(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear selection
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {colors.map((color, index) => (
          <ColorSwatch
            key={index}
            color={color}
            index={index}
            isSelected={selectedIndex === index}
            onHover={onColorHover}
            onSelect={() =>
              onColorSelect(selectedIndex === index ? null : index)
            }
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Hover swatches to highlight matching regions. Click to view variations. Drag crosshairs on the image to pick new colors.
      </p>
    </div>
  );
}