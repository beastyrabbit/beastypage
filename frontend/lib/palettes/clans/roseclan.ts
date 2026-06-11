import type { PaletteCategory } from "../types";

export const roseclanPalette: PaletteCategory = {
  id: "roseclan",
  label: "RoseClan",
  description:
    "The poison garden — nightshade wine and wild fuchsia blooms wound through with viper-green thorns",
  colors: {
    RSC_NIGHTSHADE: { multiply: [40, 14, 32] },
    RSC_THORNWINE: { multiply: [76, 20, 44] },
    RSC_INKROSE: { multiply: [90, 45, 70] },
    RSC_TOXICMAUVE: { multiply: [120, 40, 80] },
    RSC_VENOMROSE: { multiply: [170, 40, 95] },
    RSC_WILDFUCHSIA: { multiply: [215, 55, 130] },
    RSC_BRIGHTPETAL: { multiply: [240, 95, 160] },
    RSC_SOFTPINK: { multiply: [250, 155, 190] },
    RSC_BLUSHLIGHT: { multiply: [252, 200, 215] },
    RSC_PALEBLOOM: { multiply: [252, 232, 236] },
    RSC_VIPERGREEN: { multiply: [70, 130, 55] },
    RSC_LEAFVENOM: { multiply: [105, 165, 70] },
    RSC_POISONGLOW: { multiply: [165, 210, 90] },
    RSC_DUSKLILAC: { multiply: [175, 130, 185] },
    RSC_BRAMBLEGOLD: { multiply: [220, 170, 90] },
    RSC_THORNSTRIPE: {
      pattern: {
        type: "diagonal",
        tileSize: 8,
        background: [76, 20, 44],
        foreground: [105, 165, 70],
      },
    },
    RSC_SAKURAKANOKO: {
      pattern: {
        type: "kanoko",
        tileSize: 8,
        background: [170, 40, 95],
        foreground: [252, 200, 215],
      },
    },
    RSC_POISONDOT: {
      pattern: {
        type: "polkadot",
        tileSize: 7,
        background: [40, 14, 32],
        foreground: [165, 210, 90],
      },
    },
    RSC_BLOOMPAISLEY: {
      pattern: {
        type: "paisley",
        tileSize: 12,
        background: [252, 232, 236],
        foreground: [215, 55, 130],
      },
    },
    RSC_GARDENQUATREFOIL: {
      pattern: {
        type: "quatrefoil",
        tileSize: 10,
        background: [250, 155, 190],
        foreground: [76, 20, 44],
      },
    },
    RSC_BRIARKNOT: {
      pattern: {
        type: "celtic_knot",
        tileSize: 11,
        background: [40, 14, 32],
        foreground: [240, 95, 160],
      },
    },
    RSC_PETALGINGHAM: {
      pattern: {
        type: "gingham",
        tileSize: 8,
        background: [252, 232, 236],
        foreground: [240, 95, 160],
      },
    },
    RSC_VINEDAMASK: {
      pattern: {
        type: "damask",
        tileSize: 12,
        background: [76, 20, 44],
        foreground: [250, 155, 190],
      },
    },
    RSC_ROSESTAR: {
      pattern: {
        type: "eight_point_star",
        tileSize: 11,
        background: [170, 40, 95],
        foreground: [252, 232, 236],
      },
    },
    RSC_NECTARCHECK: {
      pattern: {
        type: "buffalo",
        tileSize: 8,
        background: [215, 55, 130],
        foreground: [40, 14, 32],
      },
    },
  },
};
