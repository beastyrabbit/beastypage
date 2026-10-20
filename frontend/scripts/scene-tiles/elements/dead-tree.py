"""A twisted silver snag; columns extend one continuous trunk with a hollow."""

import math

import tilekit as kit
import woodkit as wood

PALETTE = kit.ramp("rockDark", "rock", "rockLight", "#393c38")


_line = wood.line


def _trunk(p, north, south):
    for z in range(-1 if south else 1, 17 if north else 14):
        cx = round(7 + .8 * math.sin(math.tau * z / 16))
        for dx, color in ((-1, 0), (0, 7), (1, 4), (2, 0)):
            p[cx + dx, z] = color


def build(tile):
    p = {}
    column = tile.shape == "column"
    north, south = column and tile.n, column and tile.s
    # This periodic bend has the same width and position at both open ends.
    _trunk(p, north, south)
    branches = [((7, 5), (4, 8), (3, 11)),
                ((8, 8), (11, 10), (13, 13)),
                ((7, 11), (5, 13), (5, 15))]
    for a, b, c in branches:
        _line(p, a, b, 0, 2)
        _line(p, b, c, 0)
        _line(p, (a[0], a[1] + 1), b, 7)
    _line(p, (4, 8), (1, 9), 4)
    _line(p, (11, 10), (14, 10), 4)
    _line(p, (12, 12), (11, 14), 7)
    if not north:
        # A jagged broken crown with a pale exposed splinter.
        p[8, 14], p[7, 13], p[9, 13] = 7, 7, 0
    if not south:
        for a, b in (((7, 2), (4, 1)), ((8, 2), (11, 1))):
            _line(p, a, b, 0, 2)
        # Dark hollow framed by the bright left lip of the trunk.
        for z in (3, 4, 5):
            p[8, z] = 9
            p[7, z] = 4
        p[8, 6] = 0
    wood.draw_indices(p, PALETTE, 'silver-snag', clip=True)
