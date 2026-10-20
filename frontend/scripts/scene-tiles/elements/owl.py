"""Tufted and round-headed tawny owls blinking on cut tree stumps."""

import tilekit as kit
from animalkit import draw_canvas, stamp_canvas as _stamp

FEATHERS = kit.ramp("#90623f")
PALETTE = FEATHERS + ["#2d241e", "#c6a574", "#e9c857", "#c58e3b",
                      "#493022", "#725035", "#b58b56", "#345337"]
COLORS = {"#": "#2d241e", "k": "#2d241e", "b": FEATHERS[0],
          "m": FEATHERS[1], "l": "#c6a574", "Y": "#e9c857",
          "n": "#c58e3b", "d": "#493022", "r": "#725035",
          "h": "#b58b56", "_": "#345337"}

EYE_ROW = "#YkkYllYkkY#"
CHEEK_ROW = ".#bmllllmb#."

HEADS = (
    (
        ".#........#.",
        ".#b######b#.",
        "#lYYllllYYl#",
        EYE_ROW,
        EYE_ROW,
        "#bYYlnllYYb#",
        CHEEK_ROW,
    ),
    (
        "............",
        "..########..",
        ".#YYllllYY#.",
        EYE_ROW,
        EYE_ROW,
        "#bYYlnllYYb#",
        CHEEK_ROW,
    ),
)
BODY = (
    CHEEK_ROW,
    ".#bmblblmb#.",
    "..#bllllb#..",
    "...#n##n#...",
)
STUMP = (
    ".##########.",
    "#hhrrrrrrhh#",
    ".#drdddrdd#.",
    ".##dd#ddd##.",
)

def _blink(canvas):
    for left in (3, 9):
        for y in range(2, 6):
            ink = "#" if y == 3 else "l"
            for x in range(left, left + 4):
                canvas[y][x] = ink


def build(tile):
    canvas = [["."] * 16 for _ in range(16)]
    _stamp(canvas, ("...__________...",), y=15)
    # Keep all four stump rows below the owl, including its oval cut surface.
    _stamp(canvas, STUMP, 2, 11, mirror=tile.alt == 1)
    _stamp(canvas, BODY, 2, 7, mirror=tile.alt == 1)
    _stamp(canvas, HEADS[tile.alt], 2)
    blink = tile.frame == (2 if tile.alt == 0 else 3)
    if blink:
        _blink(canvas)
    draw_canvas(canvas, COLORS, flat=True)

