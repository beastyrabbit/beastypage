"""Airy birches with pale, black-marked stems and small lime leaf sprays."""

import math

import tilekit as kit
import woodkit as wood

DARK, LEAF, LIGHT, BARK, MARK = "#789d46", "#b1ca68", "#d8e7a3", "#e4e5cb", "#393b35"
PALETTE = kit.ramp(DARK, LEAF, LIGHT, BARK, MARK)
SHADE = "#57783d"
PALETTE += [SHADE]


def _draw(pixels):
    wood.draw_colors(pixels, 'birch')


def _stem(x, z, cx, height=11):
    if 1 <= z < height:
        dx = x - cx - (z - 1) * .08
        if abs(dx) < 1:
            return MARK if int(z) % 3 == 1 and dx > -.15 else BARK
        if 5 < z < 9 and abs(x - cx + (z - 4) * .65) < .48:
            return MARK
    return None


def _sprays(tile, x, z, cx, sway, color):
    for i, (dx, cz, rx, rz) in enumerate(((-1, 10, 2.6, 3.3), (1.3, 12, 2.8, 3),
                                           (2, 8.6, 2.5, 2.5))):
        rx += .5 if tile.shape == "single" else 0
        u = (x - cx - dx - sway - tile.alt * .25) / rx
        v = (z - cz) / rz
        if u * u + v * v < 1:
            color = DARK if u > .45 or v < -.7 else LEAF
            if (u + .20) ** 2 + (v - .25) ** 2 < .30:
                color = LIGHT
    return color


def _tree(tile, x, z):
    if not (1 <= x < 15 and 1 <= z < 15):
        return None
    # Row trees have two slim stems; the single has one complete tall birch.
    stems = (4, 10) if tile.shape == "row" else (7,)
    color = None
    for k, cx in enumerate(stems):
        c = _stem(x, z, cx, 12)
        if c is not None:
            color = c
        sway = .55 * math.sin(math.tau * tile.t + k * .7)
        color = _sprays(tile, x, z, cx, sway, color)
    return color


_outline = wood.outline


def _clumps(tile, x, z):
    return wood.clumps(tile, x, z, (DARK, LEAF, LIGHT), ((5, 8), (10, 11), (10, 4)), radii=(2.8, .7, .6))


def _grove_stems(tile, x, z):
    trunk = None
    for cx in (4.5, 11):
        dx = x - cx - .45 * math.sin(math.tau * z / 16)
        if (tile.s or z >= 1) and abs(dx) < .85:
            trunk = MARK if int(z) % 5 == 2 and dx > -.2 else BARK
        if not tile.s and 7 < z < 13 and abs(x - cx + (z - 7) * .55) < .5:
            trunk = MARK
    return trunk


def _opening(tile, x, z):
    for cx, cz, rx, rz in ((4.5, 7 + 1.5 * math.sin(tile.mask + tile.alt), 2, 5.2),
                            (11, 8 + 2 * math.cos(tile.mask * .7 + tile.alt), 1.7, 4)):
        if (tile.n or z < 8.5) and min(x, z, 16 - x, 16 - z) >= 1 and ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 < 1:
            return True
    return False


def _grove(tile, x, z):
    # Pale stems continue through the middle canopy, with matching endpoints
    # above and below each cell. Openings reveal bark and meadow together.
    trunk = _grove_stems(tile, x, z)
    if not _outline(tile, x, z):
        return trunk if not tile.s and z < 11 else None
    if not all(_outline(tile, x + dx, z + dz) for dx, dz in ((-1, 0), (1, 0), (0, 1))):
        return SHADE
    if _opening(tile, x, z):
        return trunk
    color = _clumps(tile, x, z)
    floor = wood.floor(x)
    if not tile.s and z < floor + 1:
        color = DARK
    return color


def build(tile):
    painter = _tree if tile.shape in ("single", "row") else _grove
    pixels = wood.sample(tile, painter)
    _draw(pixels)
