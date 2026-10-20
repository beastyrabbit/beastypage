"""White and chestnut hens with red combs, taking turns to peck."""

import tilekit as kit

PALETTE = kit.ramp("white", "#b67b42", "red", "petal2", "grass") + ["#302c30"]
COLOURS = {"K": "#302c30", "W": PALETTE[1], "S": PALETTE[0],
           "B": PALETTE[4], "L": PALETTE[5], "D": PALETTE[3],
           "R": PALETTE[7], "Y": PALETTE[10], "g": PALETTE[12]}


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
            kit.mesh(verts, faces, kit.mat(colour), name="hen-" + key)


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
    _draw(pixels)
