/**
 * Evolution-look metadata — pure data, no React. An evolution look is the
 * design used for the evolution ceremony and its lineage finale (the spin
 * board has `overlayTheme`, the batch show has `batchTheme`). Shared by the
 * control page (picker) and the OBS overlay (board selection), so it must
 * never import scene components.
 */

export type ShowLookId =
  | "classic"
  | "allegiances"
  | "handheld"
  | "strata"
  | "contact"
  | "territory"
  | "sticker";

export const SHOW_LOOK_IDS: readonly ShowLookId[] = [
  "classic",
  "allegiances",
  "handheld",
  "strata",
  "contact",
  "territory",
  "sticker",
];

/** Sessions without a saved look keep the original chamber and board. */
export const DEFAULT_SHOW_LOOK: ShowLookId = "classic";

/** Session settings key written by the control page and read by the overlay. */
export const SHOW_LOOK_SETTING_KEY = "evolutionLook";

export interface ShowLookMeta {
  id: ShowLookId;
  label: string;
  /** One line for the picker tile. */
  blurb: string;
  /** What the ceremony and finale become in this look. */
  evolution: string;
  /** Five swatches shown as dots on the picker tile. */
  palette: readonly [string, string, string, string, string];
}

export const SHOW_LOOK_META: Record<ShowLookId, ShowLookMeta> = {
  classic: {
    id: "classic",
    label: "Classic",
    blurb: "The original chamber and lineage board in the themed trim.",
    evolution:
      "Chamber ceremony: one roll per gained trait, the near miss, then the land; lineage cards per branch",
    palette: ["#0a0a0a", "#f59e0b", "#fbbf24", "#e4e4e7", "#3f3f46"],
  },
  allegiances: {
    id: "allegiances",
    label: "Allegiances page",
    blurb:
      "A Warriors book page: every cat is a roster line in prose, written in as the ceremony goes.",
    evolution:
      "The scribe writes each line: one roll per gained trait, the near miss, then the land on the plate",
    palette: ["#efe6d2", "#2a2320", "#8c2f1b", "#b5a68e", "#6a5a48"],
  },
  handheld: {
    id: "handheld",
    label: "Pocket Cat handheld",
    blurb:
      "A four-shade LCD in a plastic shell: evolution chart with level arrows and a typing text box.",
    evolution:
      "“What? X is evolving!”: one roll per gained trait, the near miss, then a whiteout on the land",
    palette: ["#9bbc0f", "#0f380f", "#306230", "#cfcabd", "#8e2f63"],
  },
  strata: {
    id: "strata",
    label: "Strata section",
    blurb:
      "A geological cliff section: the starter is bedrock, every level a stratum, every cat a fossil.",
    evolution:
      "One roll per gained trait while the stratum is sampled, the near miss, then the fossil lands in a puff of dust",
    palette: ["#0e0f14", "#a08c6c", "#7d5a3f", "#2d2b2a", "#b3261e"],
  },
  contact: {
    id: "contact",
    label: "Contact sheet",
    blurb:
      "Darkroom film strips, one roll per branch; frames expose and develop, pencil circles the keepers.",
    evolution:
      "One roll per gained trait on the lightbox, the near miss, then the frame develops on the land",
    palette: ["#0b0b0c", "#101010", "#d9d2c2", "#ff5a2b", "#f0b24a"],
  },
  territory: {
    id: "territory",
    label: "Territory map",
    blurb:
      "A hand-inked Clan map: trails ink themselves from camp and each cat walks to its landmark.",
    evolution:
      "The cat walks the trail: one roll per gained trait, the near miss, then it lands with a pawprint burst",
    palette: ["#e6d6b4", "#3b2f22", "#4f6b3a", "#a0452b", "#9a3a5c"],
  },
  sticker: {
    id: "sticker",
    label: "Sticker album",
    blurb:
      "A Panini-style evo set: one numbered sticker row per line, packs shake open, the newest is holo.",
    evolution:
      "A pack shakes over the slot: one roll per gained trait, the near miss shows through the foil, then the sticker peels in",
    palette: ["#fbf7ee", "#1b2a4a", "#ffb84a", "#e05a7a", "#2f6fde"],
  },
};

export function isShowLookId(value: unknown): value is ShowLookId {
  return (
    typeof value === "string" &&
    (SHOW_LOOK_IDS as readonly string[]).includes(value)
  );
}

/** Validates the session's `evolutionLook`; anything unknown falls back to classic. */
export function resolveShowLook(
  record: Record<string, unknown> | null | undefined,
): ShowLookId {
  const value = record?.[SHOW_LOOK_SETTING_KEY];
  return isShowLookId(value) ? value : DEFAULT_SHOW_LOOK;
}
