"""Falling curtains: narrow columns, a small single fall, or merged masses.

Only exterior sides have rock. An open east/west side is uninterrupted
water, so adjoining falls become one curtain rather than separate pillars.
"""

import math

import tilekit as kit

PALETTE = kit.ramp("water", "waterLight", "waterDark", "rock", "rockDark") + [kit.BASE["foam"]]


def build(tile):
    inset = {"single": 3, "column": 2, "mass": 1}[tile.shape]
    left = 0 if tile.w else inset
    right = 16 if tile.e else 16 - inset
    top = 16 if tile.n else 15
    bottom = 0 if tile.s else 1
    pixels = {}
    for j in range(bottom, top):
        for i in range(left, right):
            # Unequal sheets swell and narrow as they fall. Both axes repeat
            # once per tile, including moving foam that crosses an open side.
            phase = (j + round(16 * tile.t)) % 16
            sway = 1 if phase in (2, 3, 4, 5, 6) else 0
            sheet = (i - sway) % 16
            color = "waterLight" if sheet in (2, 3, 4, 5, 10, 11, 12) else "water"
            if sheet in (0, 8) and phase not in (5, 6, 7, 12):
                color = "waterDark"
            if sheet in (3, 4) and phase in (1, 2, 3, 4, 5):
                color = "foam"
            if sheet == 11 and phase in (8, 9, 10, 11, 12, 13):
                color = "foam"
            if sheet == 6 and phase in (11, 12, 13):
                color = "waterLight"
            if sheet in (13, 14) and phase in (3, 4, 5):
                color = "waterLight"
            # Both banks disappear when that side joins another waterfall.
            if (not tile.w and i == left) or (not tile.e and i == right - 1):
                color = "rockDark"
                if j % 7 in (3, 4):
                    color = "rock"
            if not tile.n and j >= 13:
                # Dark ledge remains visible behind separated pouring tongues.
                color = "rockDark"
                if j == 14 and i % 8 in (0, 7):
                    color = "rock"
                if j == 14 and i % 8 in (2, 3, 4):
                    color = "waterLight"
                if j == 13 and i % 8 in (1, 2, 3, 4, 5):
                    color = "foam"
            if not tile.n and j == 12 and i % 8 in (2, 3, 4):
                color = "foam" if i % 8 != 4 else "waterLight"
            if not tile.s:
                # A continuous white foot with scallops that change on the loop.
                drift = round(math.sin(2 * math.pi * tile.t))
                crest = (4, 5, 6, 5, 4, 4, 5, 4)[(i + drift) % 8]
                if j <= crest:
                    color = "foam" if j >= 2 else "waterLight"
                    if j == 2 and (i + drift) % 8 in (0, 1, 6):
                        color = "waterLight"
            pixels[i, j] = color
    if not tile.s:
        # The splash spreads beyond narrow falls; merged falls have no banks
        # or gaps at their shared edge.
        for i in range(max(0, left - 2), min(16, right + 2)):
            pixels[i, 1] = "waterLight"
            pixels[i, 2] = "foam"
            if (i + round(2 * math.sin(2 * math.pi * tile.t))) % 8 in (1, 2, 5):
                pixels[i, 3] = "foam"
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
        kit.mesh(verts, faces, kit.mat(color), name="waterfall")
