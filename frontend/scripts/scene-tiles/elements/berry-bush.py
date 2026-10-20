"""Rounded woodland bushes carrying purple-blue or red berry clusters."""

import math

import tilekit as kit
import woodkit as wood

PALETTE = kit.ramp("foliageDark", "foliage", "#6552ad", "red", "trunk")


def _leaf_color(px, pz, lobes):
    c = 0
    for cx, cz, r in lobes:
        if (px - cx + .3) ** 2 + (pz - cz - .4) ** 2 < (r - 1.1) ** 2:
            c = 1
        if (px - cx + 1) ** 2 + (pz - cz - 1) ** 2 < (r - 2.3) ** 2:
            c = 4
    return c


def _inside(px, pz, lobes):
    for cx, cz, r in lobes:
        if (px - cx) ** 2 + (pz - cz) ** 2 < r * r:
            return True
    return False


def _leaves(p, sway):
    lobes = ((4.5, 6, 3.8), (8, 9, 4.4), (11.3, 6.2, 3.8))
    for z in range(2, 14):
        for x in range(1, 15):
            px = x + .5 - sway * max(0, (z - 2) / 12)
            pz = z + .5
            if not _inside(px, pz, lobes):
                continue
            c = _leaf_color(px, pz, lobes)
            p[x, z] = c


def build(tile):
    p = {(x, 1): 0 for x in range(4, 13)}
    p[7, 2], p[8, 2] = 12, 13
    sway = .65 * math.sin(math.tau * tile.t)
    _leaves(p, sway)
    berry = 9 if tile.alt else 6
    for k, (x, z) in enumerate(((4, 7), (7, 10), (11, 8), (8, 5), (12, 4))):
        dx = round(sway * z / 12)
        x += dx
        p[x, z], p[x + 1, z] = berry + 2, berry
        p[x, z - 1] = berry + 1
    wood.draw_indices(p, PALETTE, 'berry-shrub')
