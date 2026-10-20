"""Side-on dairy cow and chestnut cow, grazing and flicking their tails."""

import tilekit as kit
from animalkit import draw_pixels, stamp_pixels as _stamp

PALETTE = kit.ramp("white", "#a56b42", "#d58f99", "grass") + ["#282b32"]
COLOURS = {
    "K": "#282b32", "W": PALETTE[1], "S": PALETTE[0],
    "B": PALETTE[4], "L": PALETTE[5], "D": PALETTE[3],
    "P": PALETTE[7], "g": PALETTE[9],
}


LEG_ROW = ".K.K.K.K."

def build(tile):
    frame = int(tile.t * 4) % 4
    pixels = {}
    _stamp(pixels, [".ggggggggggg."], 2, 14)
    body = [
        ".KKKKKKK.",
        "KWWKKWWWK",
        "KWKKKWWWK",
        "KWWWWKWWK",
        "KSSWKKSSK",
        ".KSSSSSK.",
        LEG_ROW,
        LEG_ROW,
        LEG_ROW,
    ]
    if tile.alt:
        body = [row.translate(str.maketrans({"W": "L", "S": "B"}))
                for row in body]
        # Brown rather than piebald flanks; the white blaze is on the head.
        body[1:5] = ["KLLLBBBBK", "KLLBBBBBK", "KLBBBBBBK", "KDBBBBBDK"]
    _stamp(pixels, body, 3, 5)
    tails = [
        ["..K", ".K.", ".K.", ".K.", "KK."],
        ["..K", ".K.", "K..", "KK."],
        ["..K", ".K.", ".K.", ".K.", "KK."],
        ["..K", "..K", "..K", ".K.", ".KK"],
    ]
    _stamp(pixels, tails[frame], 1, 6)
    head = [".W..", "KKK.", "KWK.", "KWK.", "KPPK", ".KK."]
    if tile.alt:
        head[2:4] = ["KWK.", "KBK."]
    _stamp(pixels, head, 11, 6 + (frame in (2, 3)))
    if tile.alt:
        pixels = {(15 - x, y): colour for (x, y), colour in pixels.items()}
    draw_pixels(pixels, COLOURS, "cow-")
