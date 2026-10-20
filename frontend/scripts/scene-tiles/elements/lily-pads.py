"""Notched floating pads with a pink or ivory water lily; all gaps are clear."""

import math

import tilekit as kit
import waterkit

PALETTE = kit.ramp("#43964c", "#f29ac4", "white", "#e6bd56") + [
    "#254f39", kit.BASE["waterLight"],
]
COLORS = {"D": "#254f39", "G": "#43964c", "L": PALETTE[2],
          "P": "#f29ac4", "p": PALETTE[3], "W": "white",
          "Y": "#e6bd56", "r": "waterLight"}


def _stamp(rows, x, z, y=0, mirror=False):
    waterkit.stamp(rows, x, z, COLORS, "lily-pixels", y, mirror)


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
