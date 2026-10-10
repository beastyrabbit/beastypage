import type { CSSProperties } from "react";

/**
 * The shared panel/card surface, driven by the theme CSS variables set on
 * the overlay root (see themeTokensToCssVars). With classic tokens this is
 * byte-identical to the old copy-pasted inline style.
 */
export const OBS_PANEL_STYLE: CSSProperties = {
  background: "var(--obs-panel-bg)",
  border: "2px solid var(--obs-panel-border)",
  boxShadow: "var(--obs-panel-shadow)",
  borderRadius: "var(--obs-panel-radius)",
};

/** `rgba(<theme accent>, alpha)` */
export function obsAccentAlpha(alpha: number): string {
  return `rgba(var(--obs-accent-rgb), ${alpha})`;
}
