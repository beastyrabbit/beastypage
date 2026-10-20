"""Mossy bark with a ringed sawn west end and a splintered east end."""

import tilekit as kit
import woodkit as wood

PALETTE = kit.ramp("trunk", "woodLight", "foliageDark", "foliageLight")


def _bark_color(x, z):
    c = 0 if z in (2, 8) else 1
    if z == 7:
        c = 2
    if z in (4, 6) and x % 8 in (0, 1, 2, 3, 4):
        c = 0
    if z == 3 and x % 8 in (3, 4, 5):
        c = 2
    # Repeat moss, bark grooves and knots over each open horizontal edge.
    if z >= 7 and x % 8 in (2, 3, 4, 5, 6):
        c = 7 if z == 7 else 10
    return c


def _bark(p, left, right):
    for z in range(2, 9):
        for x in range(left, right):
            c = _bark_color(x, z)
            p[x, z] = c
            if z == 8 and x % 8 in (3, 4):
                p[x, 9] = 10


def _ring_pixel(p, x, z):
    d = ((x - 3) / 2.5) ** 2 + ((z - 5) / 3.5) ** 2
    if d > 1:
        p.pop((x, z), None)
    else:
        p[x, z] = 0 if d > .72 else 4
        if .18 < d < .40:
            p[x, z] = 1


def _end_grain(p):
    # A wide end grain ellipse gives room for a dark ring and central split.
    for z in range(2, 9):
        for x in range(1, 6):
            _ring_pixel(p, x, z)
    p[3, 5], p[3, 4], p[4, 3] = 0, 0, 1


def build(tile):
    p = {}
    single = tile.shape == "single"
    west, east = not single and tile.w, not single and tile.e
    left, right = (0 if west else 1), (16 if east else 15)
    _bark(p, left, right)
    # A broken branch stub grows from the top of the bark, inside every cell.
    for x, z, c in ((9, 9, 0), (10, 9, 2), (10, 10, 0), (11, 10, 4)):
        p[x, z] = c
    if not east:
        for x, z in ((14, 2), (14, 8), (14, 6), (13, 5)):
            p.pop((x, z), None)
        for x, z in ((14, 7), (14, 4), (13, 3), (13, 6)):
            p[x, z] = 4
    if not west:
        _end_grain(p)
    wood.draw_indices(p, PALETTE, 'mossy-log')
