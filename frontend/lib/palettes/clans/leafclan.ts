import type { PaletteCategory } from "../types";

export const leafclanPalette: PaletteCategory = {
  id: "leafclan",
  label: "LeafClan",
  description:
    "Signature palette of LeafClan — loam and bark through moss and canopy to sunlit fern",
  colors: {
    LFC_LOAMDARK: { multiply: [26, 20, 12] },
    LFC_BARKBROWN: { multiply: [52, 38, 24] },
    LFC_ROOTUMBER: { multiply: [78, 56, 34] },
    LFC_TRUNKTAN: { multiply: [110, 82, 52] },
    LFC_ACORNGOLD: { multiply: [176, 134, 72] },
    LFC_FORESTNIGHT: { multiply: [18, 34, 22] },
    LFC_PINEDEEP: { multiply: [28, 52, 32] },
    LFC_HOLLYGREEN: { multiply: [38, 72, 42] },
    LFC_IVYSHADOW: { multiply: [60, 84, 60] },
    LFC_CANOPYGREEN: { multiply: [50, 94, 52] },
    LFC_MOSSGREEN: { multiply: [70, 114, 58] },
    LFC_OLIVEHUSH: { multiply: [104, 110, 62] },
    LFC_THICKETGREY: { multiply: [96, 104, 88] },
    LFC_FERNLEAF: { multiply: [92, 136, 66] },
    LFC_LEAFBRIGHT: { multiply: [116, 158, 76] },
    LFC_SPRINGLEAF: { multiply: [142, 180, 90] },
    LFC_SAGEWHISPER: { multiply: [150, 164, 120] },
    LFC_SUNLEAF: { multiply: [170, 200, 110] },
    LFC_LICHENPALE: { multiply: [198, 216, 150] },
    LFC_BIRCHLIGHT: { multiply: [224, 230, 190] },
    LFC_LEAFVEIN: {
      pattern: {
        type: "herringbone",
        tileSize: 8,
        background: [50, 94, 52],
        foreground: [142, 180, 90],
      },
    },
    LFC_HEMPLEAF: {
      pattern: {
        type: "asanoha",
        tileSize: 10,
        background: [28, 52, 32],
        foreground: [116, 158, 76],
      },
    },
    LFC_VINETRELLIS: {
      pattern: {
        type: "trellis",
        tileSize: 9,
        background: [224, 230, 190],
        foreground: [60, 84, 60],
      },
    },
    LFC_MOSSDOT: {
      pattern: {
        type: "polkadot",
        tileSize: 7,
        background: [38, 72, 42],
        foreground: [170, 200, 110],
      },
    },
    LFC_FORESTTARTAN: {
      pattern: {
        type: "tartan",
        tileSize: 10,
        background: [28, 52, 32],
        stripes: [
          { color: [110, 82, 52], width: 2, offset: 0 },
          { color: [142, 180, 90], width: 1, offset: 5 },
        ],
      },
    },
  },
};
