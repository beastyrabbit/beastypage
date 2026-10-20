"""Pointed red and orange maple crowns over sturdy forked trunks."""

import math

import tilekit as kit
import woodkit as wood

DARK, LEAF, LIGHT = "#8c302b", "#cd4932", "#ef853e"
BARK, BARK_LIGHT = kit.BASE["trunk"], kit.BASE["wood"]
PALETTE = kit.ramp(DARK, LEAF, LIGHT, "trunk", "wood")


def _draw(pixels):
    wood.draw_colors(pixels, 'maple')


def _trunk(x, z, cx):
    if 1 <= z < 10 and abs(x - cx) < 1.1 + max(0, 3 - z) * .35:
        return BARK_LIGHT if x < cx else BARK
    if 5 < z < 10 and abs(abs(x - cx) - (z - 4) * .65) < .7:
        return BARK
    return None


def _tree(tile, x, z):
    if not (1 <= x < 15 and 1 <= z < 15):
        return None
    color = _trunk(x, z, 8)
    sway = .5 * math.sin(math.tau * tile.t)
    # Angular overlapping fans make a taller, spikier crown than the oak.
    for k, (cx, cz, rx, rz) in enumerate(((7.5, 11.7, 4.8, 3.5), (4.6, 9, 3.6, 3.5),
                                          (11.5, 9.5, 3.8, 3.8), (8.5, 7, 4.3, 2.7))):
        u = (x - cx - sway - tile.alt * .22) / rx
        v = (z - cz) / rz
        if abs(u) + abs(v) < 1:
            color = DARK
            if abs(u + .08) + abs(v - .13) < .75:
                color = LEAF
            if abs(u + .23) + abs(v - .32) < .40:
                color = LIGHT
    return color


_outline = wood.outline


def _clumps(tile, x, z):
    return wood.clumps(tile, x, z, (DARK, LEAF, LIGHT), ((5, 10), (10, 5), (10, 11)), phase_scale=.57, pointed=True)


def _grove(tile, x, z):
    trunk = _trunk(x, z * .72, 7.5 + tile.alt * 2) if not tile.s else None
    return wood.grove(tile, x, z, trunk, _clumps, DARK, 1.5)


def build(tile):
    painter = _tree if tile.shape in ("single", "row") else _grove
    pixels = wood.sample(tile, painter)
    _draw(pixels)
