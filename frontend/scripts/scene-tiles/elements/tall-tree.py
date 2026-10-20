"""One broad deciduous tree, with a continuous crown and a rooted foot."""

import math

import tilekit as kit
import woodkit as wood

PALETTE = kit.ramp("foliageDark", "foliage", "foliageLight", "trunk", "wood")


def _draw(pixels):
    wood.draw_colors(pixels, 'broadleaf')


def _fork(tile, pz, dx, radius, single, color):
    if not single and tile.n and tile.s:
        # Forks show through small gaps in the lower crown.
        branch = 3 + abs(dx) / radius * 9
        if abs(dx) < radius * .8 and abs((pz % 16) - branch) < 1:
            color = "wood" if dx < 0 else "trunk"
    return color


def _trunk(tile, pz, dx, radius, single):
    color = None
    # A four-pixel trunk only becomes fully exposed at the foot.
    width = 2 if tile.s else 2 + max(0, 4 - pz) * 1.1
    if 1 <= pz < (16 if tile.n else 10) and abs(dx) <= width:
        color = "wood" if -1.8 < dx < -.6 else "trunk"
    color = _fork(tile, pz, dx, radius, single, color)
    return color


def _bounds(tile, u, single):
    rounded = math.sqrt(max(0, 1 - u * u))
    if single:
        top = 9.7 + 5.6 * rounded
        bottom = 9.7 - 4.8 * rounded
    else:
        top = 9.5 + 5.7 * rounded if not tile.n else 17
        bottom = 10.7 - 3.6 * rounded if not tile.s else -1
    top += .35 * math.sin((u + .2) * math.tau * 2)
    return bottom, top


def _nearest_spray(u, pz):
    best = None
    for lx, lz, rx, rz in ((-.35, 9, .68, 5.7), (.42, 3, .63, 4.8),
                            (-.45, -1, .57, 4.3), (.48, 14, .55, 4.4)):
        a = (u - lx) / rx
        b = ((pz - lz + 8) % 16 - 8) / rz
        d = a * a + b * b
        if best is None or d < best[0]:
            best = d, a, b
    d, a, b = best
    return d, a, b


def _leaf(tile, pz, u, edge, bottom, top, single):
    # Overlapping sprays have unequal heights and widths, rather than
    # shading the whole crown in horizontal bands.
    d, a, b = _nearest_spray(u, pz)
    color = "foliage" if d < 1.15 else "foliageDark"
    if (a + .3) ** 2 + (b - .3) ** 2 < .36:
        color = "foliageLight"
    elif a - b > .85:
        color = "foliageDark"
    if abs(u) > edge - .12 or pz < bottom + 1 or pz > top - .65:
        color = "foliageDark"
    # A broad lit patch follows the rounded top, upper left of centre.
    if (not tile.n or single) and pz > 2:
        if ((u + .3) / .48) ** 2 + ((pz - 12) / 2.3) ** 2 < 1:
            color = "foliageLight"
        elif 3 < pz < 8 and u > .15:
            color = "foliageDark"
    return color


def _paint(tile, pz, dx, radius, rustle, single, color):
    # Motion and side scallops repeat at every vertical boundary.
    sway = rustle * math.sin(math.pi * pz / 16) ** 2
    u = (dx - sway) / radius
    edge = .91 + .08 * math.sin(math.tau * pz / 16 + (1 if u < 0 else 2.8))
    if abs(u) > edge:
        return color
    bottom, top = _bounds(tile, u, single)
    if not bottom <= pz <= top:
        return color

    # Keep the crown whole at joins, opening branch gaps inside cells.
    if tile.n and tile.s:
        gap_left = ((u + .34) / .34) ** 2 + ((pz - 6.3) / 2) ** 2 < 1
        gap_right = ((u - .38) / .30) ** 2 + ((pz - 7.5) / 1.8) ** 2 < 1
        if gap_left or gap_right:
            return color

    return _leaf(tile, pz, u, edge, bottom, top, single)


def _layout(tile):
    # The two halves of a two-wide column share their centre at the join.
    cx = 8
    if tile.w and not tile.e:
        cx = 0
    elif tile.e and not tile.w:
        cx = 16
    radius = 15 if tile.e or tile.w else 7.4
    single = tile.shape == "single" or not (tile.n or tile.s)
    rustle = .45 * math.sin(math.tau * tile.t)
    return cx, radius, single, rustle


def build(tile):
    cx, radius, single, rustle = _layout(tile)
    pixels = {}
    for z in range(16):
        for x in range(16):
            px, pz = x + .5, z + .5
            dx = px - cx
            color = _trunk(tile, pz, dx, radius, single)
            if color is not None:
                pixels[x, z] = color

            color = _paint(tile, pz, dx, radius, rustle, single, color)
            if color is not None:
                pixels[x, z] = color
    _draw(pixels)
