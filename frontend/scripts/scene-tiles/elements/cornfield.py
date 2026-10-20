"""Tall overlapping corn plants, arching leaves, husked cobs and gold tassels."""

import math

import tilekit as kit
from fieldkit import Picture, neighbours

PALETTE = kit.ramp("foliageDark", "foliage", "grassLight", "#dfc568", "#795431")
_MATERIALS = {}


def _stalk(p, tile, x, base, height, index, back):
    wind = .55 * math.sin(math.tau * (tile.t + (x + base) / 16))
    if 5.5 < x < 10.5 and 0 < base and base + height < 13:
        wind += tile.alt * .5
    top = base + height
    depth = -.25 + base * .025
    leaf = "foliage" if back else "grassLight"
    shade = "foliageDark" if back else "foliage"
    p.poly([(x - .4, base), (x + .45, base), (x + wind + .35, top),
            (x + wind - .3, top)], leaf, depth)
    # Folded blades rise from the stem, then arch down over other plants.
    for k, (side, level) in enumerate(((-1, .23), (1, .37), (-1, .58), (1, .77))):
        z = base + height * level
        neck = x + wind * level
        length = 3.9 if k < 2 else 3.25
        tip = neck + side * length
        p.poly([(neck, z - .4), (neck + side * 1.6, z + .85),
                (neck + side * 2.65, z + .9), (tip, z - 1.7),
                (neck + side * 2.1, z + .05), (neck + side * .8, z + .05)],
               shade, depth - .02)
        p.poly([(neck, z), (neck + side * 1.6, z + 1.35),
                (neck + side * 2.7, z + 1), (tip, z - 1.7),
                (neck + side * 2.25, z + .55), (neck + side * 1, z + .65)],
               leaf, depth - .03)
    if not back and index % 2 == 0:
        z = base + height * .53
        cx = x + .9 + wind * .5
        p.poly([(cx - .8, z - 1.4), (cx - .75, z + .8),
                (cx + .2, z + 2.1), (cx + .85, z + 1.5),
                (cx + .7, z), (cx, z - 1.4)], "#dfc568", depth - .06)
        p.poly([(cx - 1.2, z - 1.4), (cx - .8, z + 1.1),
                (cx + .15, z - .25), (cx + 1.2, z + .6),
                (cx + .3, z - 1.5)], "foliage", depth - .07)
    if back and index != 3:
        return
    tx = x + wind
    p.rect(tx - .3, top - .4, .6, 2.2, "#dfc568", depth - .08)
    for side, extra in ((-1, .15), (1, -.2)):
        p.poly([(tx, top - .3), (tx + side * 1.35, top + .65 + extra),
                (tx + side * 1.2, top + 1.55 + extra),
                (tx + side * .45, top + .45)], "#dfc568", depth - .08)


def _soil(p, tile):
    if not tile.s:
        # Soil only at the finished bottom, broken up by grass roots.
        p.poly([(0, 0), (16, 0), (16, .8), (13, 1.25), (10, .65),
                (6, 1.1), (3, .55), (0, 1)], "#795431", -.95)
        for i in range(8):
            x = i * 2 + .3
            p.poly([(x, .4), (x + .25, 2), (x + .8, .8)], "foliage", -.96)


def build(tile):
    p = Picture("cornfield", _MATERIALS)
    # No sky paint: the upper canopy is a silhouette against transparency.
    p.rect(-1, -1, 18, 11.4 if not tile.n else 18, "foliageDark", .9)
    for dx, dz in neighbours(tile):
        for i, (x, h) in enumerate(((.7, 8.1), (4.1, 8.7), (8, 7.9), (12.3, 8.5))):
            _stalk(p, tile, x + dx * 16, 3.1 + dz * 16, h, i, True)
        positions = ((2.2, -1.4, 14.2), (7.8, -2.5, 12.1), (13.4, -1.8, 12.9))
        if tile.shape == "single":
            positions = ((3.1, -.6, 13.3), (10.7, -1.7, 14.1))
        for i, (x, z, h) in enumerate(positions):
            _stalk(p, tile, x + dx * 16, z + dz * 16, h, i, False)
        if tile.shape == "mass":
            _stalk(p, tile, 5 + dx * 16, -7 + dz * 16, 12.7, 4, False)
    _soil(p, tile)
    p.finish()
