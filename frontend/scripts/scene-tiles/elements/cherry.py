"""Clouds of pink cherry blossom above dark forks and drifting loose petals."""

import math

import tilekit as kit
import woodkit as wood

DARK, BLOSSOM, LIGHT, BARK = "#b84d83", "#ed83b1", "#ffd2e1", "#47302f"
PALETTE = kit.ramp(DARK, BLOSSOM, LIGHT, BARK)


def _draw(pixels):
    wood.draw_colors(pixels, 'cherry')


def _trunk(x, z, cx):
    if 1 <= z < 9 and abs(x - cx + .16 * z) < .95:
        return BARK
    if 4 < z < 10 and abs(abs(x - cx) - (z - 3) * .8) < .65:
        return BARK
    return None


def _tree(tile, x, z):
    if not (1 <= x < 15 and 1 <= z < 15):
        return None
    color = _trunk(x, z, 8)
    sway = .50 * math.sin(math.tau * tile.t)
    for k, (cx, cz, rx, rz) in enumerate(((4, 9.3, 3, 3), (7, 12, 3.8, 3),
                                          (11.5, 10.2, 3.6, 3.4), (8.5, 8, 4, 2.6))):
        u = (x - cx - sway - tile.alt * .25) / rx
        v = (z - cz) / rz
        if u * u + v * v < 1:
            color = DARK
            if (u + .08) ** 2 + (v - .15) ** 2 < .7:
                color = BLOSSOM
            if (u + .28) ** 2 + (v - .38) ** 2 < .24:
                color = LIGHT
    return color


_outline = wood.outline


def _clumps(tile, x, z):
    return wood.clumps(tile, x, z, (DARK, BLOSSOM, LIGHT), ((5, 10), (10, 5), (10, 11)), phase_scale=.91)


def _grove(tile, x, z):
    trunk = _trunk(x, z * .68, 8 + tile.alt * 1.5) if not tile.s else None
    return wood.grove(tile, x, z, trunk, _clumps, DARK, 1.4)


def build(tile):
    painter = _tree if tile.shape in ("single", "row") else _grove
    pixels = wood.sample(tile, painter)
    # Petals fall through the clear space below the canopy, with staggered
    # phases so the four-frame wrap has a continuous supply of new blossom.
    if tile.shape in ("single", "row") or not tile.s:
        for k, cx in enumerate((3, 12)):
            phase = (tile.t + k * .5 + tile.alt * .25) % 1
            x = round(cx + .8 * math.sin(math.tau * phase))
            z = int(5 - phase * 4)
            if (x, z) not in pixels:
                pixels[x, z] = LIGHT if k == 0 else BLOSSOM
    _draw(pixels)
