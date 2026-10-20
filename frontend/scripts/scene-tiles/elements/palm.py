"""Curving ringed palm trunk with a crown of long, swaying fronds."""

import math

import tilekit as kit

PALETTE = kit.ramp("trunk", "wood", "woodLight", "foliageDark", "foliage", "foliageLight")


def _poly(points, color, depth=0):
    kit.prism([(x / 16, z / 16) for x, z in points], kit.mat(color), y0=depth, y1=depth + .03)


def _centre(z, crown=False):
    # A bend with matching centre and tangent on every column boundary.
    bend = 1.3 * (max(0, z) / 11) ** 2 if crown else 0
    return 8 + .45 * math.sin(math.tau * z / 16) + bend


def build(tile):
    single = tile.shape == "single" or not (tile.n or tile.s)
    crown = not tile.n or single
    top = 11 if crown else 17
    bottom = 1 if not tile.s else -1
    for z in range(bottom, top):
        a, b = _centre(z, crown), _centre(z + 1, crown)
        _poly([(a - 1.3, z), (a + 1.3, z), (b + 1.3, z + 1), (b - 1.3, z + 1)], "wood")
        _poly([(a - 1.3, z), (a - .3, z), (b - .3, z + 1), (b - 1.3, z + 1)], "woodLight", -.05)
        if z % 4 == 2:
            _poly([(a - 1.3, z), (a + 1.3, z), (b + 1.3, z + .8),
                   (b - 1.3, z + .8)], "trunk", -.08)
    if not tile.s:
        _poly([(5, 1), (7, 3), (9, 3), (11, 1)], "trunk", -.1)
    if tile.n and not single:
        return
    sway = .75 * math.sin(math.tau * tile.t)
    cx, cz = _centre(11, True), 11
    # Six separate pointed blades, with clear sky gaps between their tips.
    blades = [(-7.5, -5, -5, 2), (5.5, -5, 4, 2), (-7, 1, -4, 4),
              (5.5, 1, 3, 4), (-2.5, 4, -2, 5), (2.5, 4, 1, 5)]
    for i, (tx, tz, bx, bz) in enumerate(blades):
        tip = (cx + tx + sway, cz + tz)
        bend = (cx + bx + sway * .6, min(15.5, cz + bz))
        _poly([(cx, cz - 1), tip, bend, (cx, cz + 1)], "foliageDark", -.15 - i * .01)
        _poly([(cx, cz), (tip[0], tip[1] + .5), (bend[0], bend[1] - .5),
               (cx, cz + .6)], "foliage" if i < 4 else "foliageLight", -.25 - i * .01)
    _poly([(cx - 1, cz - 2), (cx + 1, cz - 2), (cx + 2, cz),
           (cx, cz + 1), (cx - 1, cz)], "foliageDark", -.4)
