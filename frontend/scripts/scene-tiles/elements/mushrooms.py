"""A cluster of red, white-speckled toadstools or warm brown mushrooms."""

import tilekit as kit
import woodkit as wood

PALETTE = kit.ramp("red", "wood", "woodLight", "foliageDark") + [
    "#f5ecd7", "#b9a581", "#806249", kit.BASE["grassLight"],
]


def _poly(points, color, depth):
    wood.polygon(points, color, depth, .03)


def _cap_marks(tile, cx, cap, width, dome, depth):
    if tile.alt == 0:
        for dx, dz in ((-2.5, 1.8), (0, 3), (1.5, 1.7)) if width >= 3 else ((-.5, 1.6),):
            _poly([(cx + dx, cap + dz), (cx + dx + 1, cap + dz),
                   (cx + dx + 1, cap + dz + 1), (cx + dx, cap + dz + 1)],
                  "#f5ecd7", depth - .1)
    else:
        _poly([(cx - width + 1, cap + 1), (cx - 1, cap + width - 1),
               (cx + 1, cap + dome - 1), (cx, cap + 1)], "woodLight", depth - .1)


def _mushroom(tile, i, cx, base, width, height):
    cap = base + height - 2
    depth = -.1 * i
    stem = 1.5 if i == 0 else .8
    _poly([(cx - stem, base), (cx + stem, base), (cx + stem * .7, cap + 1),
           (cx - stem * .7, cap + 1)], "#b9a581", depth)
    _poly([(cx - stem, base + 1), (cx, base + 1), (cx, cap),
           (cx - stem * .7, cap)], "#f5ecd7", depth - .02)
    dome = 3.7 if i == 0 else 2.6
    _poly([(cx - width, cap), (cx + width, cap), (cx + width - 1, cap + 2),
           (cx + width * .45, cap + dome), (cx - width * .45, cap + dome),
           (cx - width + 1, cap + 2)], "red" if tile.alt == 0 else "wood", depth - .04)
    _poly([(cx - width, cap), (cx + width, cap), (cx + width - .5, cap + 1.2),
           (cx - width + .5, cap + 1.2)], "#806249", depth - .07)
    for dx in (-width + 1, -1, 1, width - 1):
        _poly([(cx + dx, cap), (cx + dx + 1, cap),
               (cx + dx + .5, cap + 1)], "#b9a581", depth - .09)
    _cap_marks(tile, cx, cap, width, dome, depth)


def build(tile):
    for i, (cx, base, width, height) in enumerate((
            (8, 2, 4.5, 10), (3.5, 1, 2.5, 6), (12.5, 1, 2.5, 5), (7, 1, 2, 4))):
        _mushroom(tile, i, cx, base, width, height)
    for x in (1, 13):
        _poly([(x, 1), (x - 1, 3), (x + 1, 2), (x + 2, 3),
               (x + 2, 1)], "foliageDark", -.5)
