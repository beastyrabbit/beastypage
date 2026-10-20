"""Full leafy clumps of nodding poppies, daisies and bluebells."""

import math

import tilekit as kit

PALETTE = kit.ramp("foliage", "grassLight", "red", "#507bce") + [
    kit.BASE["white"], kit.BASE["petal2"], "#542e38", "#a9c8f4",
]


def _poly(points, color, depth):
    obj = kit.prism([(x / 16, z / 16) for x, z in points], kit.mat(color), y0=depth, y1=depth + .02)
    # Overlapping cutout petals should keep their colour at this small scale.
    obj.visible_shadow = False


def build(tile):
    # Broad leaves fill the lower half, rather than isolated hairline stems.
    for x, h in ((3, 6), (6, 7), (10, 6), (13, 5)):
        _poly([(x - 1, 1), (x - 2, 3), (x - 2, h), (x, h - 2),
               (x + 1, h + 1), (x + 2, h), (x + 1, 1)], "foliage", .12)
        _poly([(x - 1, 2), (x - 1, h - 1), (x, h - 2), (x + 1, 2)],
              "grassLight", .08)

    blooms = ((3.5, 8), (7, 11), (11.5, 9.5), (8, 6))
    if tile.alt == 2:
        blooms = ((3.5, 9), (8, 11), (11.5, 8))
    for i, (x, z) in enumerate(blooms):
        sway = .65 * math.sin(math.tau * tile.t + i * .65)
        fx = x + sway
        _poly([(x - .6, 2), (x + .6, 2), (fx + .6, z), (fx - .6, z)],
              "foliage", -.02)
        _poly([(x, 3), (x - 2.5, 4), (x - 3, 6), (x - 1, 5)],
              "grassLight", -.06)
        depth = -.16 - i * .06
        if tile.alt == 0:
            # Four broad cupped petals, a shadowed lower lip and dark centre.
            _poly([(fx - 2.5, z - 1), (fx - 2.5, z + 1), (fx - 1, z + 2),
                   (fx + 1, z + 2), (fx + 2.5, z + 1), (fx + 2.5, z - 1),
                   (fx + 1, z - 2), (fx - 1, z - 2)], "red", depth)
            _poly([(fx - 2, z - 1), (fx + 2, z - 1), (fx + 1, z - 2),
                   (fx - 1, z - 2)], kit.shade(kit.BASE["red"], .72), depth - .02)
            _poly([(fx - 2, z), (fx - 2, z + 1), (fx, z + 2), (fx, z + 1)],
                  kit.shade(kit.BASE["red"], 1.22), depth - .03)
            centre = "#542e38"
        elif tile.alt == 1:
            _poly([(fx - 1, z - 2.5), (fx + 1, z - 2.5), (fx + 1, z - 1),
                   (fx + 2.5, z - 1), (fx + 2.5, z + 1), (fx + 1, z + 1),
                   (fx + 1, z + 2.5), (fx - 1, z + 2.5), (fx - 1, z + 1),
                   (fx - 2.5, z + 1), (fx - 2.5, z - 1), (fx - 1, z - 1)],
                  "white", depth)
            centre = "petal2"
        else:
            # Paired hanging bells with a pale opening and a bent stalk.
            for dx, drop in ((-.8, 0), (1.3, -3)):
                bx, bz = fx + dx, z + drop
                _poly([(fx - .4, z + 1.5), (fx + .5, z + 1.5),
                       (bx + .5, bz + .7), (bx - .5, bz + .7)], "foliage", depth)
                _poly([(bx - .7, bz + 1.3), (bx + .7, bz + 1.3),
                       (bx + 1.5, bz - 2), (bx - 1.5, bz - 2)],
                      "#507bce", depth - .02)
                _poly([(bx - 1.3, bz - 1), (bx - .3, bz - 1),
                       (bx - .3, bz + .7), (bx - 1, bz + .7)], "#a9c8f4", depth - .04)
                _poly([(bx - 1.5, bz - 2), (bx + 1.5, bz - 2),
                       (bx + 1.1, bz - 1), (bx - 1.1, bz - 1)],
                      kit.shade("#507bce", .72), depth - .05)
            continue
        _poly([(fx - .7, z - .7), (fx + .7, z - .7),
               (fx + .7, z + .7), (fx - .7, z + .7)], centre, depth - .05)
