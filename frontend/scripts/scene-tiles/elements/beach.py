"""Still sand flats, with wind ripples, shells and a darker wet south edge.

Alternatives change only inset shells and pebbles; open borders are identical.
"""

import tilekit as kit
import waterkit

PALETTE = kit.ramp("sand", "sandDark", "dirt") + [kit.BASE["foam"], kit.BASE["paint"]]


def _closed_edge(tile, i, j):
    return ((not tile.w and i == 0) or (not tile.e and i == 15)
            or (not tile.n and j == 15) or (not tile.s and j == 0))


def _sand(i, j):
    color = "sand"
    # Two stepped, cell-periodic dune ripples, continuous across joins.
    rise = 1 if i % 16 in range(4, 12) else 0
    if (j - rise) % 8 == 2 and i % 8 < 6:
        color = "sandDark"
    if (j - rise) % 8 == 3 and i % 8 in (1, 2, 3, 4):
        color = "#f4d9a4"
    return color


def _shore(tile, i, j, color):
    if not tile.s and j <= 3 + (i % 16 in range(5, 11)):
        color = "sandDark" if j >= 2 else "#ac895a"
    if (not tile.w and i == 1) or (not tile.e and i == 14):
        color = "sandDark"
    return color


def _shells(tile, pixels):
    shells = ((4, 9), (10, 5)) if tile.alt == 0 else ((8, 10), (4, 6))
    for x, z in shells:
        for dx, dz, color in ((0, 0, "sandDark"), (1, 0, "sandDark"),
                              (0, 1, "foam"), (1, 1, "paint")):
            if (x + dx, z + dz) in pixels:
                pixels[x + dx, z + dz] = color
    if tile.shape == "mass":
        x, z = (11, 11) if tile.alt == 0 else (11, 6)
        pixels[x, z] = "dirt"
        pixels[x + 1, z] = "sandDark"


def build(tile):
    pixels = {}
    for j in range(16):
        for i in range(16):
            if _closed_edge(tile, i, j):
                continue
            color = _sand(i, j)
            color = _shore(tile, i, j, color)
            pixels[i, j] = color
    _shells(tile, pixels)
    waterkit.draw_pixels(pixels, "beach")
