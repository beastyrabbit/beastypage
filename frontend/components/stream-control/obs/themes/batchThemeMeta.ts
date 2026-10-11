/**
 * Batch (adoption elimination) show looks — pure data shared by the control
 * page picker and the OBS overlay. Independent of the spin `overlayTheme`:
 * the batch show is its own object with its own set of looks.
 */

export type BatchThemeId =
  | "simple"
  | "gathering"
  | "album"
  | "catshow"
  | "claw"
  | "nursery"
  | "allegiances"
  | "handheld"
  | "trench"
  | "contact";

export const BATCH_THEME_IDS: readonly BatchThemeId[] = [
  "simple",
  "gathering",
  "album",
  "catshow",
  "claw",
  "nursery",
  "allegiances",
  "handheld",
  "trench",
  "contact",
];

/** Sessions without a saved batch look keep the original grid. */
export const DEFAULT_BATCH_THEME: BatchThemeId = "simple";

/** Session settings key written by the control page and read by the overlay. */
export const BATCH_THEME_SETTING_KEY = "batchTheme";

export interface BatchThemeMeta {
  id: BatchThemeId;
  label: string;
  /** One line for the picker tile. */
  blurb: string;
  /** Five swatches shown as dots on the picker tile. */
  palette: readonly [string, string, string, string, string];
}

export const BATCH_THEME_META: Record<BatchThemeId, BatchThemeMeta> = {
  simple: {
    id: "simple",
    label: "Simple",
    blurb:
      "The original grid: every cat in a panel, sprites grow as cats leave.",
    palette: ["#0a0a0a", "#f59e0b", "#e4e4e7", "#ef4444", "#facc15"],
  },
  gathering: {
    id: "gathering",
    label: "The Gathering",
    blurb:
      "A moonlit clearing at Fourtrees. Culled kits walk home; the spotlight stands on the Great Rock.",
    palette: ["#050812", "#15284a", "#f4f0dc", "#9fb0cc", "#f2d27a"],
  },
  album: {
    id: "album",
    label: "Sticker album",
    blurb:
      "Ten empty slots on the left, a numbered sticker sheet on the right. Culls are swapped away.",
    palette: ["#fbf7ee", "#ffb84a", "#1b2a4a", "#e05a7a", "#2f6fde"],
  },
  catshow: {
    id: "catshow",
    label: "Cat show",
    blurb:
      "Kits benched on numbered pedestals. The judge handles one on the table and excuses one per class.",
    palette: ["#d9e5d8", "#c9a46a", "#ffffff", "#e05a7a", "#2f6fde"],
  },
  claw: {
    id: "claw",
    label: "Claw machine",
    blurb:
      "Plush prizes with paper tags behind arcade glass. The claw hangs over the marked kit.",
    palette: ["#2a1b3d", "#ff5fa0", "#ffd23f", "#ffffff", "#7fe0ff"],
  },
  nursery: {
    id: "nursery",
    label: "Seed tray",
    blurb:
      "A seed tray on a potting bench, a numbered plant label in every cell. Culls are thinned to compost.",
    palette: ["#6b4a2e", "#1f1c1a", "#f6f1e4", "#b8502f", "#9bbf7a"],
  },
  allegiances: {
    id: "allegiances",
    label: "Allegiances page",
    blurb:
      "The Nursery as a Warriors book page: every kit is a roster line, culls are struck through in red ink.",
    palette: ["#efe6d2", "#2a2320", "#8c2f1b", "#b5a68e", "#6a5a48"],
  },
  handheld: {
    id: "handheld",
    label: "Pocket Cat handheld",
    blurb:
      "A four-shade LCD: the pool is the PARTY list, culled kits go to BOX 1 · RELEASED, the text box types.",
    palette: ["#9bbc0f", "#0f380f", "#306230", "#cfcabd", "#8e2f63"],
  },
  trench: {
    id: "trench",
    label: "Trench plan",
    blurb:
      "An excavation grid: every kit is a numbered find, culled squares are hatched and stamped BACKFILLED.",
    palette: ["#eeeae0", "#4a4034", "#b3261e", "#f3d35a", "#2b2825"],
  },
  contact: {
    id: "contact",
    label: "Contact sheet",
    blurb:
      "Darkroom film strips with grease pencil: an X for every kit that went home, a loupe on the spotlight.",
    palette: ["#0b0b0c", "#101010", "#d9d2c2", "#ff5a2b", "#f0b24a"],
  },
};

export function isBatchThemeId(value: unknown): value is BatchThemeId {
  return (
    typeof value === "string" &&
    (BATCH_THEME_IDS as readonly string[]).includes(value)
  );
}

/** Validates the session's `batchTheme`; anything unknown falls back to the default. */
export function resolveBatchTheme(
  record: Record<string, unknown> | null | undefined,
): BatchThemeId {
  const value = record?.[BATCH_THEME_SETTING_KEY];
  return isBatchThemeId(value) ? value : DEFAULT_BATCH_THEME;
}
