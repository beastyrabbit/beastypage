"""Two scalloped woolly sheep with black faces and gently munching jaws."""

import tilekit as kit
from animalkit import draw_pixels, stamp_pixels as _stamp

PALETTE = kit.ramp("white", "cloudShade", "grass") + ["#292d36"]
COLOURS = {"K": "#292d36", "W": PALETTE[1], "S": PALETTE[3],
           "L": PALETTE[4], "g": PALETTE[6]}


def _sheep(pixels, x, y, mirror, munch):
    body = [
        "..KKKK...",
        ".KWWWWK..",
        "KWWWWWKKK",
        "KWLWLWKSK",
        ".KSSSKKKK",
        "..K.K..K.",
        "..K.K....",
    ]
    if munch:
        body[4] = ".KSSSKK.K"
        body[5] = "..K.K..KK"
    _stamp(pixels, body, x, y, mirror)


def build(tile):
    frame = int(tile.t * 4) % 4
    pixels = {}
    _stamp(pixels, ["gggggg"], 2, 11)
    _stamp(pixels, ["ggggggg"], 7, 15)
    # Stagger the pair vertically so both sets of scalloped fleece read.
    _sheep(pixels, 1, 4, bool(tile.alt), frame in (1, 2))
    _sheep(pixels, 6, 8, not bool(tile.alt), frame in (2, 3))
    draw_pixels(pixels, COLOURS, "sheep-")
