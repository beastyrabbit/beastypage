"""Two scalloped woolly sheep with black faces and gently munching jaws."""

import tilekit as kit

PALETTE = kit.ramp("white", "cloudShade", "grass") + ["#292d36"]
COLOURS = {"K": "#292d36", "W": PALETTE[1], "S": PALETTE[3],
           "L": PALETTE[4], "g": PALETTE[6]}


def _stamp(pixels, rows, x, y, mirror=False):
    width = max(map(len, rows))
    for dy, row in enumerate(rows):
        for dx, colour in enumerate(row):
            if colour != ".":
                pixels[x + (width - 1 - dx if mirror else dx), y + dy] = colour


def _draw(pixels):
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
            kit.mesh(verts, faces, kit.mat(colour), name="sheep-" + key)


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
    _draw(pixels)
