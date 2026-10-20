"""Notched floating pads with a pink or ivory water lily; all gaps are clear."""

import math

import tilekit as kit

PALETTE = kit.ramp("#43964c", "#f29ac4", "white", "#e6bd56") + [
    "#254f39", kit.BASE["waterLight"],
]
COLORS = {"D": "#254f39", "G": "#43964c", "L": PALETTE[2],
          "P": "#f29ac4", "p": PALETTE[3], "W": "white",
          "Y": "#e6bd56", "r": "waterLight"}


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
        kit.mesh(verts, faces, kit.mat(COLORS[symbol]), name="lily-pixels")


def build(tile):
    bob = round(math.sin(2 * math.pi * tile.t))
    _stamp(["..rrrrrr..", "rr......rr", "..rrrrrr.."], 0, 7, 0.3)
    _stamp(["..DDDDD..", ".DLLLGGD.", "DLLLGD...", "DGGGGGGD.", ".DDGGDD.."],
           1, 8 - bob, 0.12, mirror=bool(tile.alt))
    _stamp(["...rrrrrrrr...", "rr..........rr", "...rrrrrrrr..."], 1, 1, 0.25)
    _stamp([
        "...DDDDDDD...",
        ".DDLLLLGGGDD.",
        "DLLLLGGGGGGGD",
        "DLLGGGGGD....",
        "DGGGGGGGGGDD.",
        ".DDGGGGGGDD..",
        "...DDDDDD....",
    ], 2, 2 + bob, 0.04, mirror=bool(tile.alt))
    flower = ["...W...", ".P.W.P.", ".PWYWP.", "..PYP..", "...p..."]
    if tile.alt:
        flower = ["...W...", ".W.W.W.", ".WWYWW.", "..WYW..", "...P..."]
    _stamp(flower, 6 if tile.alt == 0 else 4, 7 + bob, -0.08)
