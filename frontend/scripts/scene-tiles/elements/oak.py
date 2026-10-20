"""Broad, knotted oaks; joined cells form a single scalloped leafy grove."""

import math

import tilekit as kit
import woodkit as wood

PALETTE = kit.ramp("foliageDark", "foliage", "foliageLight", "trunk", "wood")
DARK, LEAF, LIGHT = (kit.BASE[c] for c in ("foliageDark", "foliage", "foliageLight"))
BARK, BARK_LIGHT = kit.BASE["trunk"], kit.BASE["wood"]


def _draw(pixels):
    wood.draw_colors(pixels, 'oak')


def _trunk(x, z, cx, alt):
    bend = .65 * math.sin((z - 1) * .6 + alt)
    width = 1.25 + max(0, 3 - z) * .65
    if 1 <= z < 10 and abs(x - cx - bend) < width:
        return BARK_LIGHT if x < cx + bend - .3 else BARK
    if 4 < z < 9 and abs(abs(x - cx) - (z - 3) * .8) < .75:
        return BARK
    return None


def _tree(tile, x, z):
    if not (1 <= x < 15 and 1 <= z < 15):
        return None
    color = _trunk(x, z, 8, tile.alt)
    sway = .50 * math.sin(math.tau * tile.t)
    # Uneven overlapping lobes give the oak a low, heavy crown.
    for cx, cz, rx, rz in ((4.3, 9.2, 3.5, 3.6), (7.4, 11.5, 4.4, 3.6),
                            (11.8, 9.8, 3.3, 3.9), (8.4, 7.9, 4.7, 2.6)):
        u = (x - cx - sway - tile.alt * .22) / rx
        v = (z - cz) / rz
        if u * u + v * v < 1:
            color = DARK
            if (u + .10) ** 2 + (v - .14) ** 2 < .69:
                color = LEAF
            if (u + .28) ** 2 + (v - .32) ** 2 < .19:
                color = LIGHT
    return color


_outline = wood.outline


def _clumps(tile, x, z):
    return wood.clumps(tile, x, z, (DARK, LEAF, LIGHT), ((5, 5), (10, 10), (5, 11)))


def _grove(tile, x, z):
    trunk = _trunk(x, z * .72, 7.5 + tile.alt * 2, tile.alt) if not tile.s else None
    return wood.grove(tile, x, z, trunk, _clumps, DARK, 1.6, dark_sides=True)


def build(tile):
    painter = _tree if tile.shape in ("single", "row") else _grove
    pixels = wood.sample(tile, painter)
    _draw(pixels)
