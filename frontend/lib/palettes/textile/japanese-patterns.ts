import type { PaletteCategory } from "../types";

export const japanesePatternsPalette: PaletteCategory = {
  id: "japanese-patterns",
  label: "Japanese Patterns",
  description:
    "Traditional Japanese textile motifs — indigo sashiko, sakura dots, yagasuri arrows, and wabi-sabi earth tones",
  colors: {
    // Sashiko — indigo running-stitch grid quilting
    JP_SASHIKO_FINE: {
      pattern: {
        type: "windowpane",
        tileSize: 6,
        background: [25, 38, 82],
        foreground: [215, 220, 235],
      },
    },
    JP_SASHIKO_MED: {
      pattern: {
        type: "windowpane",
        tileSize: 12,
        background: [25, 38, 82],
        foreground: [215, 220, 235],
      },
    },
    JP_SASHIKO_BOLD: {
      pattern: {
        type: "windowpane",
        tileSize: 20,
        background: [25, 38, 82],
        foreground: [215, 220, 235],
      },
    },
    // Ichimatsu — checkered (famously the Tokyo 2020 logo pattern, indigo/cream)
    JP_ICHIMATSU_FINE: {
      pattern: {
        type: "checkerboard",
        tileSize: 4,
        background: [32, 42, 95],
        foreground: [235, 228, 210],
      },
    },
    JP_ICHIMATSU_MED: {
      pattern: {
        type: "checkerboard",
        tileSize: 10,
        background: [32, 42, 95],
        foreground: [235, 228, 210],
      },
    },
    JP_ICHIMATSU_BOLD: {
      pattern: {
        type: "checkerboard",
        tileSize: 18,
        background: [32, 42, 95],
        foreground: [235, 228, 210],
      },
    },
    // Sakura kanoko — tie-dye dots (soft pink on ivory, cherry blossom)
    JP_SAKURA_FINE: {
      pattern: {
        type: "polkadot",
        tileSize: 6,
        background: [245, 235, 230],
        foreground: [220, 130, 155],
      },
    },
    JP_SAKURA_MED: {
      pattern: {
        type: "polkadot",
        tileSize: 12,
        background: [245, 235, 230],
        foreground: [220, 130, 155],
      },
    },
    JP_SAKURA_BOLD: {
      pattern: {
        type: "polkadot",
        tileSize: 20,
        background: [245, 235, 230],
        foreground: [220, 130, 155],
      },
    },
    // Beni kanoko — crimson tie-dye dots on deep red (festival wear)
    JP_BENI_FINE: {
      pattern: {
        type: "polkadot",
        tileSize: 6,
        background: [148, 18, 32],
        foreground: [235, 215, 195],
      },
    },
    JP_BENI_MED: {
      pattern: {
        type: "polkadot",
        tileSize: 12,
        background: [148, 18, 32],
        foreground: [235, 215, 195],
      },
    },
    JP_BENI_BOLD: {
      pattern: {
        type: "polkadot",
        tileSize: 20,
        background: [148, 18, 32],
        foreground: [235, 215, 195],
      },
    },
    // Yagasuri — arrow feather chevrons (indigo / pale gold, kimono classic)
    JP_YAGASURI_FINE: {
      pattern: {
        type: "chevron",
        tileSize: 50,
        background: [28, 38, 82],
        foreground: [210, 190, 140],
        spacing: 4,
      },
    },
    JP_YAGASURI_MED: {
      pattern: {
        type: "chevron",
        tileSize: 50,
        background: [28, 38, 82],
        foreground: [210, 190, 140],
        spacing: 7,
      },
    },
    JP_YAGASURI_BOLD: {
      pattern: {
        type: "chevron",
        tileSize: 50,
        background: [28, 38, 82],
        foreground: [210, 190, 140],
        spacing: 12,
      },
    },
    // Shima — striped kimono fabric (matcha green / ivory)
    JP_SHIMA_FINE: {
      pattern: {
        type: "pinstripe",
        tileSize: 8,
        background: [62, 98, 55],
        foreground: [228, 225, 210],
        spacing: 3,
      },
    },
    JP_SHIMA_MED: {
      pattern: {
        type: "pinstripe",
        tileSize: 8,
        background: [62, 98, 55],
        foreground: [228, 225, 210],
        spacing: 5,
      },
    },
    JP_SHIMA_BOLD: {
      pattern: {
        type: "pinstripe",
        tileSize: 8,
        background: [62, 98, 55],
        foreground: [228, 225, 210],
        spacing: 8,
      },
    },
    // Kasuri — splash-dyed gingham (deep indigo / faded blue, woven ikat)
    JP_KASURI_FINE: {
      pattern: {
        type: "gingham",
        tileSize: 6,
        background: [22, 30, 72],
        foreground: [105, 130, 170],
      },
    },
    JP_KASURI_MED: {
      pattern: {
        type: "gingham",
        tileSize: 12,
        background: [22, 30, 72],
        foreground: [105, 130, 170],
      },
    },
    JP_KASURI_BOLD: {
      pattern: {
        type: "gingham",
        tileSize: 20,
        background: [22, 30, 72],
        foreground: [105, 130, 170],
      },
    },
    // Uroko — scale/triangle pattern (indigo / white)
    JP_UROKO_FINE: {
      pattern: {
        type: "uroko",
        tileSize: 6,
        background: [235, 232, 222],
        foreground: [28, 38, 82],
      },
    },
    JP_UROKO_MED: {
      pattern: {
        type: "uroko",
        tileSize: 12,
        background: [235, 232, 222],
        foreground: [28, 38, 82],
      },
    },
    JP_UROKO_BOLD: {
      pattern: {
        type: "uroko",
        tileSize: 20,
        background: [235, 232, 222],
        foreground: [28, 38, 82],
      },
    },
    // Wabi-sabi basketweave — earthy tea-stained tones (chestnut / rice paper)
    JP_WABISABI_FINE: {
      pattern: {
        type: "basketweave",
        tileSize: 6,
        background: [115, 82, 55],
        foreground: [218, 205, 182],
      },
    },
    JP_WABISABI_MED: {
      pattern: {
        type: "basketweave",
        tileSize: 12,
        background: [115, 82, 55],
        foreground: [218, 205, 182],
      },
    },
    JP_WABISABI_BOLD: {
      pattern: {
        type: "basketweave",
        tileSize: 20,
        background: [115, 82, 55],
        foreground: [218, 205, 182],
      },
    },
    // Koushi — lattice buffalo check (persimmon / charcoal, noren curtain)
    JP_KOUSHI_FINE: {
      pattern: {
        type: "buffalo",
        tileSize: 6,
        background: [195, 82, 35],
        foreground: [42, 38, 35],
      },
    },
    JP_KOUSHI_MED: {
      pattern: {
        type: "buffalo",
        tileSize: 12,
        background: [195, 82, 35],
        foreground: [42, 38, 35],
      },
    },
    JP_KOUSHI_BOLD: {
      pattern: {
        type: "buffalo",
        tileSize: 20,
        background: [195, 82, 35],
        foreground: [42, 38, 35],
      },
    },
    // Nowaki — autumn wind diagonal stripes (plum / gold)
    JP_NOWAKI_FINE: {
      pattern: {
        type: "diagonal",
        tileSize: 50,
        background: [88, 32, 68],
        foreground: [215, 185, 105],
        spacing: 4,
      },
    },
    JP_NOWAKI_MED: {
      pattern: {
        type: "diagonal",
        tileSize: 50,
        background: [88, 32, 68],
        foreground: [215, 185, 105],
        spacing: 7,
      },
    },
    JP_NOWAKI_BOLD: {
      pattern: {
        type: "diagonal",
        tileSize: 50,
        background: [88, 32, 68],
        foreground: [215, 185, 105],
        spacing: 12,
      },
    },
    // Seigaiha — concentric wave arcs (indigo / white, classic wave pattern)
    JP_SEIGAIHA_FINE: {
      pattern: {
        type: "seigaiha",
        tileSize: 8,
        background: [25, 38, 82],
        foreground: [220, 225, 240],
      },
    },
    JP_SEIGAIHA_MED: {
      pattern: {
        type: "seigaiha",
        tileSize: 16,
        background: [25, 38, 82],
        foreground: [220, 225, 240],
      },
    },
    JP_SEIGAIHA_BOLD: {
      pattern: {
        type: "seigaiha",
        tileSize: 24,
        background: [25, 38, 82],
        foreground: [220, 225, 240],
      },
    },
    // Asanoha — hemp leaf star tessellation (deep indigo / silver grey)
    JP_ASANOHA_FINE: {
      pattern: {
        type: "asanoha",
        tileSize: 8,
        background: [18, 25, 62],
        foreground: [175, 180, 195],
      },
    },
    JP_ASANOHA_MED: {
      pattern: {
        type: "asanoha",
        tileSize: 16,
        background: [18, 25, 62],
        foreground: [175, 180, 195],
      },
    },
    JP_ASANOHA_BOLD: {
      pattern: {
        type: "asanoha",
        tileSize: 24,
        background: [18, 25, 62],
        foreground: [175, 180, 195],
      },
    },
    // Shippo — interlocking circles / seven treasures (teal / cream)
    JP_SHIPPO_FINE: {
      pattern: {
        type: "shippo",
        tileSize: 8,
        background: [22, 88, 82],
        foreground: [230, 225, 210],
      },
    },
    JP_SHIPPO_MED: {
      pattern: {
        type: "shippo",
        tileSize: 14,
        background: [22, 88, 82],
        foreground: [230, 225, 210],
      },
    },
    JP_SHIPPO_BOLD: {
      pattern: {
        type: "shippo",
        tileSize: 22,
        background: [22, 88, 82],
        foreground: [230, 225, 210],
      },
    },
    // Uroko (true triangle) — alternating triangles (terracotta / cream)
    JP_UROKO_TRI_FINE: {
      pattern: {
        type: "uroko",
        tileSize: 6,
        background: [235, 228, 210],
        foreground: [155, 65, 35],
      },
    },
    JP_UROKO_TRI_MED: {
      pattern: {
        type: "uroko",
        tileSize: 12,
        background: [235, 228, 210],
        foreground: [155, 65, 35],
      },
    },
    JP_UROKO_TRI_BOLD: {
      pattern: {
        type: "uroko",
        tileSize: 20,
        background: [235, 228, 210],
        foreground: [155, 65, 35],
      },
    },
    // Kikko — hexagonal tortoiseshell (indigo / silver)
    JP_KIKKO_FINE: {
      pattern: {
        type: "kikko",
        tileSize: 8,
        background: [22, 32, 72],
        foreground: [180, 185, 200],
      },
    },
    JP_KIKKO_MED: {
      pattern: {
        type: "kikko",
        tileSize: 16,
        background: [22, 32, 72],
        foreground: [180, 185, 200],
      },
    },
    JP_KIKKO_BOLD: {
      pattern: {
        type: "kikko",
        tileSize: 24,
        background: [22, 32, 72],
        foreground: [180, 185, 200],
      },
    },
    // Karakusa — flowing vine scroll (moss green / cream)
    JP_KARAKUSA_FINE: {
      pattern: {
        type: "karakusa",
        tileSize: 10,
        background: [42, 68, 38],
        foreground: [225, 220, 200],
      },
    },
    JP_KARAKUSA_MED: {
      pattern: {
        type: "karakusa",
        tileSize: 18,
        background: [42, 68, 38],
        foreground: [225, 220, 200],
      },
    },
    JP_KARAKUSA_BOLD: {
      pattern: {
        type: "karakusa",
        tileSize: 28,
        background: [42, 68, 38],
        foreground: [225, 220, 200],
      },
    },
    // Same komon — shark skin tiny dots (grey / charcoal)
    JP_SAME_FINE: {
      pattern: {
        type: "same_komon",
        tileSize: 6,
        background: [42, 42, 48],
        foreground: [165, 168, 175],
      },
    },
    JP_SAME_MED: {
      pattern: {
        type: "same_komon",
        tileSize: 12,
        background: [42, 42, 48],
        foreground: [165, 168, 175],
      },
    },
    JP_SAME_BOLD: {
      pattern: {
        type: "same_komon",
        tileSize: 20,
        background: [42, 42, 48],
        foreground: [165, 168, 175],
      },
    },
    // Tachiwaki — rising steam wavy lines (plum / gold)
    JP_TACHIWAKI_FINE: {
      pattern: {
        type: "tachiwaki",
        tileSize: 10,
        background: [68, 22, 52],
        foreground: [215, 185, 105],
      },
    },
    JP_TACHIWAKI_MED: {
      pattern: {
        type: "tachiwaki",
        tileSize: 18,
        background: [68, 22, 52],
        foreground: [215, 185, 105],
      },
    },
    JP_TACHIWAKI_BOLD: {
      pattern: {
        type: "tachiwaki",
        tileSize: 28,
        background: [68, 22, 52],
        foreground: [215, 185, 105],
      },
    },
    // Bishamon kikko — interlocking hexagonal lattice (ivory / indigo)
    JP_BISHAMON_FINE: {
      pattern: {
        type: "bishamon_kikko",
        tileSize: 12,
        background: [22, 28, 62],
        foreground: [215, 212, 200],
      },
    },
    JP_BISHAMON_MED: {
      pattern: {
        type: "bishamon_kikko",
        tileSize: 20,
        background: [22, 28, 62],
        foreground: [215, 212, 200],
      },
    },
    JP_BISHAMON_BOLD: {
      pattern: {
        type: "bishamon_kikko",
        tileSize: 32,
        background: [22, 28, 62],
        foreground: [215, 212, 200],
      },
    },
  },
};
