"""Side-on dairy cow and chestnut cow, grazing and flicking their tails."""

import tilekit as kit

PALETTE = kit.ramp("white", "#a56b42", "#d58f99", "grass") + ["#282b32"]
COLOURS = {
    "K": "#282b32", "W": PALETTE[1], "S": PALETTE[0],
    "B": PALETTE[4], "L": PALETTE[5], "D": PALETTE[3],
    "P": PALETTE[7], "g": PALETTE[9],
}


def _stamp(pixels, rows, x, y):
    for dy, row in enumerate(rows):
        for dx, colour in enumerate(row):
            if colour != ".":
                pixels[x + dx, y + dy] = colour


def _draw(pixels):
    # Coplanar, pixel-aligned quads keep the 1 px outline at supersampling.
    for key, colour in COLOURS.items():
        verts, faces = [], []
        for (x, y), value in pixels.items():
            if value != key:
                continue
            i = len(verts)
            verts.extend([(x / 16, 0, (15 - y) / 16),
                          ((x + 1) / 16, 0, (15 - y) / 16),
                          ((x + 1) / 16, 0, (16 - y) / 16),
                          (x / 16, 0, (16 - y) / 16)])
            faces.append((i, i + 1, i + 2, i + 3))
        if faces:
            kit.mesh(verts, faces, kit.mat(colour), name="cow-" + key)


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
        ".K.K.K.K.",
        ".K.K.K.K.",
        ".K.K.K.K.",
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
    _draw(pixels)
