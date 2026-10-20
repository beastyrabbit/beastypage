"""White swans with S-curved necks, orange bills and hollow waterline ripples."""

import math

import tilekit as kit

PALETTE = kit.ramp("white", "cloudShade", "#e99540", "waterLight") + ["#354954"]
COLORS = {"D": "#354954", "W": "white", "S": "cloudShade",
          "O": "#e99540", "r": "waterLight"}


def _stamp(rows, x, z, y=0, mirror=False):
    for symbol in set("".join(rows)) - {"."}:
        verts, faces = [], []
        for row, line in enumerate(rows):
            for col, value in enumerate(line[::-1] if mirror else line):
                if value != symbol:
                    continue
                a, b = (x + col) / 16, (z + len(rows) - row - 1) / 16
                n = len(verts)
                verts.extend([(a, y, b), (a + 1 / 16, y, b),
                              (a + 1 / 16, y, b + 1 / 16), (a, y, b + 1 / 16)])
                faces.append((n, n + 1, n + 2, n + 3))
        kit.mesh(verts, faces, kit.mat(COLORS[symbol]), name="swan-pixels")


def build(tile):
    bob = round(math.sin(2 * math.pi * tile.t))
    if tile.alt == 0:
        _stamp(["...rrrrrrrr...", "rr..........rr", "...rrrrrrrr..."], 1, 1, 0.2)
        _stamp([
            ".........DDD..",
            "........DWWDOO",
            "........DWSD..",
            "........DWD...",
            ".........DWD..",
            "..........DWD.",
            "D...DDDD..DWD.",
            "DWDDWWWWDDDWD.",
            ".DWWWWWSWWWSD.",
            "..DSSSSSSSSD..",
            "...DDDDDDDD...",
        ], 1, 3 + bob, -0.04)
    else:
        # Offset the pair vertically so both necks and wings stay readable.
        small = [
            ".....DDD.",
            "....DWDOO",
            "....DWD..",
            ".....DWD.",
            "D.DD.DWD.",
            "DWWWDDWD.",
            ".DWSSSD..",
            "..DDDD...",
        ]
        _stamp(["..rrrrr..", "rr.....rr", "..rrrrr.."], 6, 5, 0.2)
        _stamp(small, 6, 6 - bob, 0.05)
        _stamp(["..rrrrr..", "rr.....rr", "..rrrrr.."], 0, 1, 0.15)
        _stamp(small, 0, 2 + bob, -0.08, mirror=True)
