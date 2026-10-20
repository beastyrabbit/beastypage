"""Dark, tall pines with five drooping skirts and overlapping pine stands."""

import math

import tilekit as kit
import woodkit as wood

PALETTE = kit.ramp("#152e35", "#28514d", "#467465", "trunk")


def _skirt(x, h, center, width, low, high, spread, alt, color):
    u = abs(x - center) / (width * spread / 2)
    bottom = low + .09 * (1 - min(1, u))
    radius = max(0, (high - h) / (high - low))
    if bottom <= h <= high and u <= radius:
        color = 4
        if h < bottom + .065:
            color = 0
        elif x > center:
            color = 1
        if x < center and (radius - u) * width * spread / 2 < 1.3:
            color = 7
        if alt and .26 < u < .62 and h < bottom + .11:
            color = 1
    return color


def _tree(x, z, cx, base, height, width, phase, alt=0, trunk=True):
    h = (z - base) / height
    if not 0 <= h <= 1:
        return None
    center = cx + .42 * math.sin(phase) * h * h
    color = None
    if trunk and h < .82 and abs(x - center) < .78:
        color = 10 if x < center else 9
    # Four broad skirts leave enough pixels for hooked tips and a lit rim.
    for low, high, spread in ((.12, .52, 1), (.33, .72, .82),
                              (.53, .88, .61), (.73, 1, .36)):
        color = _skirt(x, h, center, width, low, high, spread, alt, color)
    if .92 <= h <= 1 and abs(x - center) < .55:
        color = 7 if x < center else 4
    return color


def _row(x, z, alt, phase, color):
    for cx in (-8, 8, 24):
        c = _tree(x, z, cx + .3 * alt, 1, 14 - .9 * alt,
                  13.5, phase, alt)
        if c is not None:
            color = c
    return color


def _stand_row(tile, alt, phase, dz, trees):
    open_top = dz < 0 or tile.n
    for repeat in (-1, 0, 1):
        if repeat and not tile.has(repeat, dz):
            continue
        trees.append((16 * dz + (10 if open_top else 1.2),
                      16 * repeat + 5.5 - .6 * alt, 14.3 - 1.3 * alt, 19,
                      phase + 1.1, False, 2))
        trees.append((16 * dz + (5 if open_top else 1),
                      16 * repeat + 12, 13.8 - .8 * alt, 18,
                      phase + .7, False, 1))
        trees.append((16 * dz + .3, 16 * repeat + 4.5 + .5 * alt,
                      12.5 + 1.2 * alt, 15.5, phase, not tile.s and dz == 0, 0))


def _stand(tile, alt, phase):
    trees = []
    for dz in (1, 0, -1):
        if not tile.has(0, dz):
            continue
        _stand_row(tile, alt, phase, dz, trees)
    return trees


def _distant_shade(color, depth):
    if color == 7:
        return 1 if depth == 2 else 4
    if color == 0:
        return 0
    return 1


def _interior_alt(tile, x, z):
    interior = ((not tile.w or x > 1) and (not tile.e or x < 15)
                and (not tile.s or z > 1) and (not tile.n or z < 15))
    alt = tile.alt if interior else 0
    return alt


def _paint_stand(tile, x, z, alt, phase, color):
    trees = _stand(tile, alt, phase)
    for base, cx, height, width, sway, trunk, depth in sorted(trees, reverse=True):
        c = _tree(x, z, cx, base, height, width, sway, alt, trunk)
        if c is not None:
            # Distant needles stay in shadow, so front trees read as whole
            # crowns instead of a repeated pattern of equally bright rims.
            if depth and c < 9:
                c = _distant_shade(c, depth)
            color = c
    return color


def _paint(tile, x, z):
    phase = math.tau * tile.t
    if tile.shape == "single":
        return _tree(x, z, 8 + .4 * tile.alt, 1, 14 - .3 * tile.alt,
                     13.5 - .4 * tile.alt,
                     phase, tile.alt)
    if (not tile.w and x < 1) or (not tile.e and x > 15):
        return None
    # Alternatives are interior-only, including on vertically connected stands.
    alt = _interior_alt(tile, x, z)
    color = None
    if tile.shape == "row":
        color = _row(x, z, alt, phase, color)
        return color
    # Paint higher, distant trees first. There is no rectangular backing:
    # overlapping skirts alone form the stand, including its broken skyline.
    color = _paint_stand(tile, x, z, alt, phase, color)
    return color


def build(tile):
    p = wood.sample(tile, _paint)
    wood.draw_indices(p, PALETTE, 'layered-pine')
