"""Sloping rock shelves, broad lit facets and deep shadowed undercuts.

Rows have shallow strata, columns steeper faces, masses wide broken shelves.
Alternatives deform the interior planes while preserving shared borders.
"""

import math

import tilekit as kit

PALETTE = kit.ramp("rock", "rockDark", "rockLight", "grass", "grassLight", "dirt")


def build(tile):
    pixels = {}
    # One-cell-period strata continue diagonally through neighbouring cells.
    # Unlike individually outlined rocks, these planes have no vertical joints.
    bend = (0, 0, 0, 1, 1, 2, 2, 2, 1, 1, 0, 0, -1, -1, -1, 0)
    rough = (1, 1, 2, 2, 1, 1, 1, 2, 3, 2, 2, 1, 1, 2, 2, 1)
    for j in range(16):
        left = 0 if tile.w else rough[j]
        right = 16 if tile.e else 16 - rough[(j + 5) % 16]
        for i in range(16):
            if i < left or i >= right:
                continue
            if not tile.n and j == 15:
                continue
            if not tile.s and j == 0:
                continue
            # Keep the outer two pixels identical between alternatives.
            weight = (math.sin(math.pi * (i - 1) / 13) ** 2
                      * math.sin(math.pi * (j - 1) / 13) ** 2)
            warp = round((5 if tile.alt else -4) * weight) if 1 < i < 14 and 1 < j < 14 else 0
            slope = 2 if tile.shape == "column" else 1
            layers = 2 if tile.shape == "row" else 1
            band = (layers * j + slope * i + bend[i] + warp) % 16
            if band <= 1:
                color = "rockDark"
            elif band <= 5:
                color = "#575c68"
            elif band <= 9:
                color = "rock"
            elif band <= 13:
                color = "rockLight"
            else:
                color = "#777782"
            if not tile.w and i == left:
                color = "rockLight" if j % 7 < 4 else "rock"
            if not tile.e and i == right - 1:
                color = "rockDark"
            if not tile.s and j <= 2:
                color = "rockDark" if j < 2 or i % 7 < 3 else "rock"
            pixels[i, j] = color

    # A short fracture branches off a shelf instead of outlining every facet.
    crack = ([(5, 8), (5, 7), (6, 6), (6, 5)] if tile.alt == 0 else
             [(10, 11), (9, 10), (9, 9), (8, 8), (8, 7)])
    for i, j in crack:
        if (i, j) in pixels:
            pixels[i, j] = "rockDark"
    if not tile.n:
        for i in range(16):
            if (i, 14) not in pixels:
                continue
            pixels[i, 14] = "grassLight"
            pixels[i, 13] = "grass"
            pixels[i, 12] = "rockDark"
            if i % 8 in (1, 2, 3):
                pixels[i, 12] = "dirt" if i % 8 == 3 else "grass"
            if i % 8 == 2:
                pixels[i, 11] = "rockDark"
    _draw(pixels)


def _draw(pixels):
    batches = {}
    for (i, j), color in pixels.items():
        verts, faces = batches.setdefault(color, ([], []))
        a = len(verts)
        x, z = i / 16, j / 16
        verts.extend(((x, 0, z), (x + 1 / 16, 0, z),
                      (x + 1 / 16, 0, z + 1 / 16), (x, 0, z + 1 / 16)))
        faces.append((a, a + 1, a + 2, a + 3))
    for color, (verts, faces) in batches.items():
        kit.mesh(verts, faces, kit.mat(color), name="cliffs")
