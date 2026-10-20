"""Falling curtains: narrow columns, a small single fall, or merged masses.

Only exterior sides have rock. An open east/west side is uninterrupted
water, so adjoining falls become one curtain rather than separate pillars.
"""

import math

import tilekit as kit
import waterkit

PALETTE = kit.ramp("water", "waterLight", "waterDark", "rock", "rockDark") + [kit.BASE["foam"]]


def _curtain(tile, i, j):
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
    return color


def _banks(tile, i, j, left, right, color):
    # Both banks disappear when that side joins another waterfall.
    if (not tile.w and i == left) or (not tile.e and i == right - 1):
        color = "rockDark"
        if j % 7 in (3, 4):
            color = "rock"
    return color


def _ledge(tile, i, j, color):
    if tile.n:
        return color
    if j >= 13:
        color = _tongues(i, j)
    if j == 12 and i % 8 in (2, 3, 4):
        color = "foam" if i % 8 != 4 else "waterLight"
    return color


def _tongues(i, j):
    # Dark ledge remains visible behind separated pouring tongues.
    if j == 14 and i % 8 in (0, 7):
        return "rock"
    if j == 14 and i % 8 in (2, 3, 4):
        return "waterLight"
    if j == 13 and i % 8 in (1, 2, 3, 4, 5):
        return "foam"
    return "rockDark"


def _foot(tile, i, j, color):
    if not tile.s:
        # A continuous white foot with scallops that change on the loop.
        drift = round(math.sin(2 * math.pi * tile.t))
        crest = (4, 5, 6, 5, 4, 4, 5, 4)[(i + drift) % 8]
        if j <= crest:
            color = "foam" if j >= 2 else "waterLight"
            if j == 2 and (i + drift) % 8 in (0, 1, 6):
                color = "waterLight"
    return color


def build(tile):
    inset = {"single": 3, "column": 2, "mass": 1}[tile.shape]
    left = 0 if tile.w else inset
    right = 16 if tile.e else 16 - inset
    top = 16 if tile.n else 15
    bottom = 0 if tile.s else 1
    pixels = {}
    for j in range(bottom, top):
        for i in range(left, right):
            color = _curtain(tile, i, j)
            color = _banks(tile, i, j, left, right, color)
            color = _ledge(tile, i, j, color)
            color = _foot(tile, i, j, color)
            pixels[i, j] = color
    if not tile.s:
        _splash(tile, pixels, left, right)
    waterkit.draw_pixels(pixels, "waterfall")


def _splash(tile, pixels, left, right):
    # The splash spreads beyond narrow falls; merged falls have no banks
    # or gaps at their shared edge.
    for i in range(max(0, left - 2), min(16, right + 2)):
        pixels[i, 1] = "waterLight"
        pixels[i, 2] = "foam"
        if (i + round(2 * math.sin(2 * math.pi * tile.t))) % 8 in (1, 2, 5):
            pixels[i, 3] = "foam"
