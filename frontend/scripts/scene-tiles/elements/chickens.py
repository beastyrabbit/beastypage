"""White and chestnut hens with red combs, taking turns to peck."""

import tilekit as kit
from animalkit import draw_pixels, stamp_pixels as _stamp

PALETTE = kit.ramp("white", "#b67b42", "red", "petal2", "grass") + ["#302c30"]
COLOURS = {"K": "#302c30", "W": PALETTE[1], "S": PALETTE[0],
           "B": PALETTE[4], "L": PALETTE[5], "D": PALETTE[3],
           "R": PALETTE[7], "Y": PALETTE[10], "g": PALETTE[12]}


def _hen(pixels, x, y, brown, mirror, peck):
    rows = [
        "....RR..",
        "K..KWWK.",
        "KWKKWKY.",
        "KWWWWSK.",
        ".KWSSK..",
        "..KKK...",
        "..Y.Y...",
    ]
    if peck:
        rows = [
            "........",
            "K.......",
            "KWKKRR..",
            "KWWWWKK.",
            ".KWSSWKY",
            "..KKKKR.",
            "..Y.Y...",
        ]
    if brown:
        rows = [row.translate(str.maketrans({"W": "L", "S": "B"}))
                for row in rows]
    _stamp(pixels, rows, x, y, mirror)


def build(tile):
    frame = int(tile.t * 4) % 4
    pixels = {}
    _stamp(pixels, ["gggggg"], 2, 11)
    _stamp(pixels, ["gggggg"], 8, 15)
    _hen(pixels, 1, 4, bool(tile.alt), bool(tile.alt), frame in (1, 2))
    _hen(pixels, 7, 8, not bool(tile.alt), not bool(tile.alt), frame in (2, 3))
    draw_pixels(pixels, COLOURS, "hen-")
