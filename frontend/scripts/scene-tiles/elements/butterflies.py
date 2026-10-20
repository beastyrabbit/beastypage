"""Two jewel-coloured butterflies flutter above a few low wildflowers."""

import tilekit as kit
from animalkit import draw_pixels, stamp_pixels as _stamp

PALETTE = kit.ramp("#e9983f", "#49bdeb", "petal1", "grass") + ["#2c3042", "#fff0ae"]
COLOURS = {"K": "#2c3042", "O": PALETTE[1], "o": PALETTE[0],
           "B": PALETTE[4], "b": PALETTE[3], "P": PALETTE[7],
           "p": PALETTE[6], "G": PALETTE[10], "g": PALETTE[9],
           "Y": "#fff0ae"}


ANTENNA_ROW = "..K.K.."
LOWER_WING_ROW = ".KoKoK."

def _butterfly(pixels, x, y, phase, blue=False):
    wings = [
        [".K...K.", "KOK.KOK", "KOoKoOK", ".oKKKo.", LOWER_WING_ROW, ANTENNA_ROW],
        [ANTENNA_ROW, ".KOKOK.", LOWER_WING_ROW, "..KKK..", "..oKo..", ANTENNA_ROW],
        [ANTENNA_ROW, "..OKK..", "..oKK..", "...KK..", "..oKK..", "...K..."],
        [ANTENNA_ROW, ".KOKOK.", LOWER_WING_ROW, "..KKK..", "..oKo..", ANTENNA_ROW],
    ]
    translation = {"O": "B", "o": "b"} if blue else None
    _stamp(pixels, wings[phase], x, y, translation=translation)


def build(tile):
    frame = int(tile.t * 4) % 4
    pixels = {}
    _stamp(pixels, ["..P.......P..", ".PYP..P..PYP.", "..G..PYP..G..",
                    ".gGg..G..gGg."], 1, 11)
    drift = (0, -1, 0, 1)[frame]
    _butterfly(pixels, 1, 2 + drift, frame, bool(tile.alt))
    _butterfly(pixels, 8, 4 - drift, (frame + 2) % 4, not bool(tile.alt))
    draw_pixels(pixels, COLOURS, "butterfly-")
