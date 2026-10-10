import type { CSSProperties } from "react";

/**
 * Overlay theme metadata — pure data, no React. Shared by the control page
 * (theme picker) and the OBS overlay (scene selection + CSS tokens), so it
 * must never import scene components.
 */

export type OverlayThemeId =
  | "classic"
  | "plate"
  | "sampler"
  | "starchart"
  | "transit"
  | "mixtape";

export const OVERLAY_THEME_IDS: readonly OverlayThemeId[] = [
  "plate",
  "sampler",
  "starchart",
  "transit",
  "mixtape",
  "classic",
];

/** Sessions without a saved theme render the field-guide plate. */
export const DEFAULT_OVERLAY_THEME: OverlayThemeId = "plate";

/** Session settings key written by the control page and read by the overlay. */
export const OVERLAY_THEME_SETTING_KEY = "overlayTheme";

export interface OverlayThemeTokens {
  /** Colour of the live/rolling trait and primary highlights. */
  accent: string;
  /** Same accent as "r, g, b" so scenes can build rgba() with any alpha. */
  accentRgb: string;
  /** Primary text colour on the theme's panels. */
  ink: string;
  /** Secondary text colour (captions, pending rows). */
  muted: string;
  /** CSS background for the theme's panel/card surface. */
  panelBg: string;
  /** Border colour for the panel surface. */
  panelBorder: string;
  /** Box shadow for the panel surface ("none" allowed). */
  panelShadow: string;
  /** Border radius for the panel surface. */
  panelRadius: string;
  fontSerif: string;
  fontSans: string;
  fontMono: string;
}

export interface OverlayThemeMeta {
  id: OverlayThemeId;
  label: string;
  /** One line for the picker tile. */
  blurb: string;
  /** Five swatches shown as dots on the picker tile. */
  palette: readonly [string, string, string, string, string];
  tokens: OverlayThemeTokens;
  /** Only classic honours `obsLayoutMode: "spread"`. */
  supportsSpread: boolean;
}

const SERIF =
  '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const SANS = '"Helvetica Neue", Inter, "Segoe UI", Arial, sans-serif';
const MONO = 'ui-monospace, Menlo, Consolas, "Courier New", monospace';

export const OVERLAY_THEME_META: Record<OverlayThemeId, OverlayThemeMeta> = {
  classic: {
    id: "classic",
    label: "Classic",
    blurb: "The original board: dark panels, amber trim, split-flap tiles.",
    palette: ["#0a0a0a", "#f59e0b", "#fbbf24", "#e4e4e7", "#3f3f46"],
    tokens: {
      accent: "#f59e0b",
      accentRgb: "245, 158, 11",
      ink: "#ffffff",
      muted: "#a1a1aa",
      panelBg:
        "linear-gradient(180deg, rgba(10,10,10,0.92) 0%, rgba(15,12,5,0.90) 100%)",
      panelBorder: "rgba(245, 158, 11, 0.2)",
      panelShadow:
        "0 0 60px rgba(245, 158, 11, 0.06), inset 0 1px 0 rgba(245, 158, 11, 0.08)",
      panelRadius: "20px",
      fontSerif: SERIF,
      fontSans: "var(--font-geist-sans, ui-sans-serif), system-ui, sans-serif",
      fontMono: "var(--font-geist-mono, 'Geist Mono'), ui-monospace, monospace",
    },
    supportsSpread: true,
  },
  plate: {
    id: "plate",
    label: "Field guide plate",
    blurb:
      "A naturalist's plate: leader lines point at the cat's real features, numbered legend beside it.",
    palette: ["#1b1f24", "#e9e4d8", "#8a9099", "#d9583b", "#7c8a4e"],
    tokens: {
      accent: "#d9583b",
      accentRgb: "217, 88, 59",
      ink: "#e9e4d8",
      muted: "#8a9099",
      panelBg: "rgba(27, 31, 36, 0.9)",
      panelBorder: "rgba(233, 228, 216, 0.25)",
      panelShadow: "none",
      panelRadius: "0px",
      fontSerif: SERIF,
      fontSans: SANS,
      fontMono: MONO,
    },
    supportsSpread: false,
  },
  sampler: {
    id: "sampler",
    label: "Cross-stitch sampler",
    blurb:
      "The sprite on aida cloth in a wooden hoop; the trait list is the thread legend.",
    palette: ["#efe6d3", "#b07a3f", "#f8f4ea", "#c43b3b", "#6e6a63"],
    tokens: {
      accent: "#c43b3b",
      accentRgb: "196, 59, 59",
      ink: "#2a2622",
      muted: "#6e6a63",
      panelBg: "#f8f4ea",
      panelBorder: "rgba(42, 38, 34, 0.25)",
      panelShadow: "0 16px 40px rgba(0, 0, 0, 0.5)",
      panelRadius: "4px",
      fontSerif: SERIF,
      fontSans: SANS,
      fontMono: MONO,
    },
    supportsSpread: false,
  },
  starchart: {
    id: "starchart",
    label: "StarClan chart",
    blurb:
      "Every trait is a named star on the cat; the constellation draws itself in reveal order.",
    palette: ["#070b16", "#c9d3e6", "#f2d27a", "#7fe0ff", "#27324d"],
    tokens: {
      accent: "#7fe0ff",
      accentRgb: "127, 224, 255",
      ink: "#c9d3e6",
      muted: "#5b6a8a",
      panelBg: "rgba(7, 11, 22, 0.88)",
      panelBorder: "#27324d",
      panelShadow: "none",
      panelRadius: "0px",
      fontSerif: SERIF,
      fontSans: SANS,
      fontMono: MONO,
    },
    supportsSpread: false,
  },
  transit: {
    id: "transit",
    label: "Transit line",
    blurb:
      "No panels. The reveal order is a metro route: one stop per trait, branches for layers.",
    palette: ["#f2b544", "#58c4ff", "#efe9dc", "#ff7a59", "#7fe0ff"],
    tokens: {
      accent: "#7fe0ff",
      accentRgb: "127, 224, 255",
      ink: "#ffffff",
      muted: "#9aa0ab",
      panelBg: "rgba(12, 13, 16, 0.82)",
      panelBorder: "rgba(255, 255, 255, 0.12)",
      panelShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
      panelRadius: "8px",
      fontSerif: SERIF,
      fontSans: SANS,
      fontMono: MONO,
    },
    supportsSpread: false,
  },
  mixtape: {
    id: "mixtape",
    label: "Mixtape J-card",
    blurb:
      "The cat is the cover, traits are the tracklist, and every track has a running time.",
    palette: ["#f1ece0", "#1f1c18", "#2f6fde", "#e8d79a", "#d9583b"],
    tokens: {
      accent: "#d9583b",
      accentRgb: "217, 88, 59",
      ink: "#1f1c18",
      muted: "#6e6a63",
      panelBg: "#f1ece0",
      panelBorder: "rgba(31, 28, 24, 0.2)",
      panelShadow: "0 20px 46px rgba(0, 0, 0, 0.55)",
      panelRadius: "2px",
      fontSerif: SERIF,
      fontSans: SANS,
      fontMono: '"Courier New", Courier, monospace',
    },
    supportsSpread: false,
  },
};

export function isOverlayThemeId(value: unknown): value is OverlayThemeId {
  return (
    typeof value === "string" &&
    (OVERLAY_THEME_IDS as readonly string[]).includes(value)
  );
}

/** Validates the session's `overlayTheme`; anything unknown falls back to the default. */
export function resolveOverlayTheme(
  record: Record<string, unknown> | null | undefined,
): OverlayThemeId {
  const value = record?.[OVERLAY_THEME_SETTING_KEY];
  return isOverlayThemeId(value) ? value : DEFAULT_OVERLAY_THEME;
}

/** Spread (crop) layout only exists for themes that support it. */
export function resolveOverlaySpread(
  record: Record<string, unknown> | null | undefined,
  theme: OverlayThemeId,
): boolean {
  return (
    OVERLAY_THEME_META[theme].supportsSpread &&
    record?.obsLayoutMode === "spread"
  );
}

/** CSS custom properties applied on the overlay root so every scene can read the theme. */
export function themeTokensToCssVars(
  tokens: OverlayThemeTokens,
): CSSProperties {
  return {
    "--obs-accent": tokens.accent,
    "--obs-accent-rgb": tokens.accentRgb,
    "--obs-ink": tokens.ink,
    "--obs-muted": tokens.muted,
    "--obs-panel-bg": tokens.panelBg,
    "--obs-panel-border": tokens.panelBorder,
    "--obs-panel-shadow": tokens.panelShadow,
    "--obs-panel-radius": tokens.panelRadius,
    "--obs-font-serif": tokens.fontSerif,
    "--obs-font-sans": tokens.fontSans,
    "--obs-font-mono": tokens.fontMono,
  } as CSSProperties;
}
