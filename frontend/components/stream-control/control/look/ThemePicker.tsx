"use client";

import { type KeyboardEvent, useRef } from "react";
import {
  OVERLAY_THEME_IDS,
  type OverlayThemeId,
} from "../../obs/themes/themeMeta";
import { ThemeTile } from "./ThemeTile";
import { nextThemeOnKey } from "./themePickerKeys";

/**
 * Overlay theme radiogroup. Only the selected tile is in the tab order;
 * arrows / Home / End move the selection (and focus), Space / Enter select
 * the focused tile.
 */
export function ThemePicker({
  value,
  onChange,
}: Readonly<{
  value: OverlayThemeId;
  onChange: (id: OverlayThemeId) => void;
}>) {
  const tiles = useRef(new Map<OverlayThemeId, HTMLButtonElement>());

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = nextThemeOnKey(value, event.key, OVERLAY_THEME_IDS);
    if (!next) return;
    event.preventDefault();
    onChange(next);
    tiles.current.get(next)?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Overlay theme"
      onKeyDown={handleKeyDown}
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
    >
      {OVERLAY_THEME_IDS.map((id) => (
        <ThemeTile
          key={id}
          id={id}
          selected={id === value}
          onSelect={onChange}
          ref={(el) => {
            if (el) tiles.current.set(id, el);
            else tiles.current.delete(id);
          }}
        />
      ))}
    </div>
  );
}
