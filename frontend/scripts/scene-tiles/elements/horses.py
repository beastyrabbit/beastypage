"""Long-legged bay and grey horses, with a dark mane and a swishing tail."""

import tilekit as kit
from animalkit import draw_pixels, stamp_pixels as _stamp

PALETTE = kit.ramp("#a36a43", "white", "rock", "grass") + ["#292830"]
COLOURS = {"K": "#292830", "B": PALETTE[1], "L": PALETTE[2],
           "D": PALETTE[0], "W": PALETTE[4], "S": PALETTE[3],
           "R": PALETTE[7], "g": PALETTE[9]}


def build(tile):
    frame = int(tile.t * 4) % 4
    pixels = {}
    _stamp(pixels, [".ggggggggggg."], 2, 14)
    body = [
        ".KKKKKKKK.",
        "KLLLLBBBKK",
        "KLBBBBBBBK",
        "KBBBBBBBDK",
        ".KDDDDDDK.",
        ".KBK..KBK.",
        ".KBK..KBK.",
        ".K.K..K.K.",
        ".K.K..K.K.",
    ]
    neck = [
        ".K.K..",
        ".KKKK.",
        "KKLBKK",
        "KKBBBK",
        "KLBKKK",
        "KBBK..",
        "KBBK..",
    ]
    if tile.alt:
        replace = str.maketrans({"B": "S", "L": "W", "D": "R"})
        body = [row.translate(replace) for row in body]
        neck = [row.translate(replace) for row in neck]
    _stamp(pixels, body, 3, 5)
    # Raised muzzle and long neck distinguish this silhouette from the cow.
    _stamp(pixels, neck, 9, 1 + (frame in (2, 3)))
    tails = [
        ["..K", ".KK", ".KK", "KK.", "KK."],
        ["..K", ".KK", "KK.", "KK."],
        ["..K", ".KK", ".KK", "KK.", "KK."],
        ["..K", "..K", ".KK", ".KK", ".KK"],
    ]
    _stamp(pixels, tails[frame], 1, 6)
    if tile.alt:
        pixels = {(15 - x, y): colour for (x, y), colour in pixels.items()}
    draw_pixels(pixels, COLOURS, "horse-")
