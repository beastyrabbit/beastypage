"""Transparent mallard riders: a swimming pair or a hen leading ducklings."""

import math

import tilekit as kit

PALETTE = kit.ramp("#27794a", "#9c7148", "#d6c7a2", "#e9ad43") + [
    "#243c36", kit.BASE["white"], kit.BASE["waterLight"],
]
COLORS = {
    "D": "#243c36", "G": "#27794a", "B": "#9c7148",
    "b": PALETTE[3], "L": "#d6c7a2", "Y": "#e9ad43",
    "W": "white", "r": "waterLight",
}


def _stamp(rows, x, z, y=0):
    """Pixel-sized faces, batched by colour; dots leave the host water visible."""
    for symbol in set("".join(rows)) - {"."}:
        verts, faces = [], []
        for row, line in enumerate(rows):
            for col, value in enumerate(line):
                if value != symbol:
                    continue
                a, b = (x + col) / 16, (z + len(rows) - row - 1) / 16
                n = len(verts)
                verts.extend([(a, y, b), (a + 1 / 16, y, b),
                              (a + 1 / 16, y, b + 1 / 16), (a, y, b + 1 / 16)])
                faces.append((n, n + 1, n + 2, n + 3))
        kit.mesh(verts, faces, kit.mat(COLORS[symbol]), name="duck-pixels")


def _ripple(x, z, width, phase):
    # A hollow, flattened ring, with a one-pixel widening on the bob's crest.
    w = width + (1 if phase == 1 else 0)
    _stamp([".." + "r" * (w - 4) + "..",
            "r" + "." * (w - 2) + "r",
            ".." + "r" * (w - 4) + ".."], x, z, 0.2)


def build(tile):
    frame = int(tile.t * 4) % 4
    bob = round(math.sin(2 * math.pi * tile.t))
    if tile.alt == 0:
        _ripple(0, 6, 9, (frame + 2) % 4)
        _stamp([
            "....DDD.",
            "...DBDDY",
            "...DBB..",
            "D.DBBBD.",
            "DDBBLBD.",
            ".DDDDD..",
        ], 1, 7 - bob, 0)
        _ripple(4, 1, 11, frame)
        _stamp([
            ".....DD..",
            "....DGGD.",
            "....DGDYY",
            "....DWW..",
            "D..DBBB..",
            "DDDLLLLD.",
            ".DDDDDD..",
        ], 5, 3 + bob, -0.08)
    else:
        # The hen leads right; two yellow chicks follow in a diagonal line.
        _ripple(6, 5, 9, frame)
        _stamp([
            "....DDD.",
            "...DBDDY",
            "...DBB..",
            "D.DBBBD.",
            "DDBBLBD.",
            ".DDDDD..",
        ], 7, 6 + bob, -0.04)
        for i, (x, z) in enumerate(((3, 4), (0, 2))):
            chick_bob = round(math.sin(2 * math.pi * tile.t + i * math.pi))
            _ripple(x, z - 1, 5, (frame + i) % 4)
            _stamp(["..DY", ".DYY", "DYYD", ".DD."],
                   x, z + chick_bob, -0.08 - i * 0.02)
