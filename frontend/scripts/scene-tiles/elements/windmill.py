"""White masonry tower with a rotating lattice rotor only on its top cell."""

import math

import tilekit as kit
from fieldkit import lit_box as _box, lit_poly as _poly

PALETTE = kit.ramp("paint", "rockLight", "trunk", "roof") + [
    kit.BASE["glow"], "#b9b8a2", kit.BASE["woodLight"], kit.BASE["sand"],
]


def _rotor(tile):
    # Four identical sails repeat after a quarter turn. Sampling that interval
    # avoids the identical frames that a full turn in four steps would produce.
    for sail in range(4):
        angle = math.pi / 2 * (sail + tile.t) + math.pi / 4
        cs, sn = math.cos(angle), math.sin(angle)

        def strip(r0, r1, u0, u1, color, front):
            _poly([(8 + r * cs - u * sn, 8 + r * sn + u * cs)
                   for r, u in ((r0, u0), (r1, u0), (r1, u1), (r0, u1))],
                  color, front)

        strip(0, 8.3, -0.6, 0.6, "trunk", -0.5)
        strip(2.6, 8.3, 1.7, 2.7, "trunk", -0.5)
        for r in (3, 5.4, 7.8):
            strip(r - 0.5, r + 0.5, -0.6, 2.7, "trunk", -0.52)
    _box(7, 7, 9, 9, "trunk", -0.57)
    _box(7, 8, 8, 9, "#b9b8a2", -0.59)


def _shaft(tile):
    # A twelve-pixel masonry shaft joins the column cells. Only the closed
    # base flares and the closed top tapers, so arbitrary column heights join.
    if tile.s and tile.n:
        points = [(2, -1), (14, -1), (14, 17), (2, 17)]
        face = [(3, -1), (12, -1), (12, 17), (3, 17)]
    else:
        if tile.n:
            points = [(1, 1), (15, 1), (14, 14), (14, 17), (2, 17), (2, 14)]
            face = [(2, 1), (13, 1), (12, 14), (12, 17), (3, 17), (3, 14)]
        elif tile.s:
            points = [(2, -1), (14, -1), (12, 12), (4, 12)]
            face = [(3, -1), (12, -1), (10.5, 12), (5, 12)]
        else:
            points = [(1, 1), (15, 1), (11.5, 12), (4.5, 12)]
            face = [(2, 1), (13, 1), (10, 12), (5.5, 12)]
    _poly(points, "rockLight", -0.29)
    _poly(face, "paint", -0.31)
    # Sparse mortar and exposed stones break up the whitewash without bands.
    for x, z in ((3, 3), (10, 4), (4, 11), (10, 14), (3, 15)):
        if tile.n or z < 10:
            _box(x, z, x + 2, z + 0.7, "#b9b8a2", -0.33)


def _windows(tile):
    compact = not tile.n and not tile.s
    glass = kit.glow("glow", 1.5) if tile.variant == "night" else kit.mat("trunk")
    if tile.n or tile.s:
        for x, z in ((6, 8), (9, 13)) if tile.n and tile.s else ((7, 8),):
            _box(x - 1, z - 1, x + 2, z + 3, "#b9b8a2", -0.35)
            _box(x, z, x + 1.5, z + 2, glass, -0.37)
    elif compact:
        _box(4, 6, 5.5, 8, glass, -0.37)
        _box(10.5, 6, 12, 8, glass, -0.37)


def build(tile):
    _shaft(tile)
    _windows(tile)
    if not tile.s:
        _box(1, 0, 15, 1, "rockLight", -0.34)
        _poly([(6, 1), (10, 1), (10, 5), (9, 6), (7, 6), (6, 5)], "trunk", -0.36)
        _box(7, 1, 8, 4, "roof", -0.38)
    if not tile.n:
        _poly([(4, 11), (12, 11), (11, 13), (8, 15), (5, 13)], "trunk", -0.38)
        _poly([(5, 12), (11, 12), (10, 13), (8, 14), (6, 13)], "roof", -0.4)
        _rotor(tile)
