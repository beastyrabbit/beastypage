"""Grey heron: long bill, folded wing, S-neck and one bent resting leg."""

import tilekit as kit
from animalkit import draw_pixels, stamp_pixels as _stamp

PALETTE = kit.ramp("rockLight", "white", "#d7ad53", "grass") + ["#303846", "#749ba5"]
COLOURS = {"K": "#303846", "R": PALETTE[1], "D": PALETTE[0],
           "W": PALETTE[4], "S": PALETTE[3], "Y": PALETTE[7],
           "G": PALETTE[10], "g": PALETTE[9], "w": "#749ba5"}


HEAD_OUTLINE = ".KKK...."

def build(tile):
    frame = int(tile.t * 4) % 4
    pixels = {}
    # A few shallow-water marks, not an opaque water or ground tile.
    _stamp(pixels, ["....wwwww....", "..ww.....ww.."], 2, 13)
    _stamp(pixels, ["G.........G", "Gg.......gG", "gG.......Gg", ".G.......G.",
                    ".G.......G."], 2, 10)
    _stamp(pixels, [".KRRRRK.", "KRWDDDDK", ".KKKKKK.", "....Y.Y.",
                    "....YY..", "....Y...", "....Y...", "...KYK.."], 3, 7)
    neck = [".KK.", "KWSK", "KWK.", ".KWK", "..WK", ".KWK", ".WK."]
    _stamp(pixels, neck, 7, 2)
    heads = [
        [HEAD_OUTLINE, "KWWKKYYY", HEAD_OUTLINE],
        [HEAD_OUTLINE, "KWWKKYY.", ".KKK..YY"],
        ["..KKK...", ".KWWKYYY", "..KKK..."],
        [HEAD_OUTLINE, "KWWKKYY.", ".KKK..YY"],
    ]
    _stamp(pixels, heads[frame], 6, 1)
    if tile.alt:
        pixels = {(15 - x, y): colour for (x, y), colour in pixels.items()}
    draw_pixels(pixels, COLOURS, "heron-")
